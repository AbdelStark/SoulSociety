//! Authenticated Soul Wire request subscription and result publication.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{bail, Context, Result};
use nostr_sdk::prelude::*;
use soul_core::constants::{event_kinds, limits};
use soul_core::{into_nostr_tags, parse_request_event, result_tags, JobResultContent, WireError};
use thiserror::Error;
use tokio::sync::Semaphore;
use tracing::{debug, error, info, warn};

use crate::dedupe::RequestDeduplicator;
use crate::processor::ProofProcessor;

const MAX_INFLIGHT_EVENTS: usize = 64;
const RELAY_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);

/// Relay-independent signed request/result seam used by the live transport and
/// real-engine integration tests.
pub struct SignedJobHandler {
    keys: Keys,
    processor: Arc<ProofProcessor>,
    dedupe: RequestDeduplicator,
    completed: Mutex<CompletedResults>,
}

impl SignedJobHandler {
    #[must_use]
    pub fn new(keys: Keys, processor: Arc<ProofProcessor>, dedupe_capacity: usize) -> Self {
        Self {
            keys,
            processor,
            dedupe: RequestDeduplicator::new(dedupe_capacity),
            completed: Mutex::new(CompletedResults::new(dedupe_capacity)),
        }
    }

    /// Authenticate, deduplicate, prove, externalize, and sign one request.
    /// Duplicate deliveries return `Ok(None)` and cannot trigger a second proof.
    pub async fn handle_event(
        &self,
        event: &Event,
        now: u64,
    ) -> Result<Option<Event>, JobHandlingError> {
        let request = parse_request_event(event, now)?;
        if let Some(completed) = self.completed_result(&request.id) {
            return Ok(Some(completed));
        }
        if !self.dedupe.claim(&request.id) {
            return Ok(None);
        }

        let result = match self.processor.process(&request).await {
            Ok(result) => result,
            Err(error) => {
                error!(
                    request_id = %request.id,
                    reason = %error,
                    "proof pipeline failed"
                );
                JobResultContent::error(
                    request.id.clone(),
                    error.public_code(),
                    error.public_message(),
                )
            }
        };
        let content =
            serde_json::to_string(&result).map_err(|_| JobHandlingError::ResultEncoding)?;
        if content.len() > limits::MAX_RESULT_BYTES {
            return Err(JobHandlingError::ResultTooLarge);
        }
        let tags = into_nostr_tags(result_tags(&request, &result))?;
        let result_event = EventBuilder::new(Kind::from(request.service.result_kind()), content)
            .tags(tags)
            .sign_with_keys(&self.keys)
            .map_err(|_| JobHandlingError::Signing)?;
        self.remember_result(request.id, result_event.clone());
        Ok(Some(result_event))
    }

    fn completed_result(&self, request_id: &str) -> Option<Event> {
        self.completed
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .events
            .get(request_id)
            .cloned()
    }

    fn remember_result(&self, request_id: String, event: Event) {
        self.completed
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .insert(request_id, event);
    }

    #[must_use]
    pub fn public_key(&self) -> PublicKey {
        self.keys.public_key()
    }
}

struct CompletedResults {
    capacity: usize,
    events: HashMap<String, Event>,
    order: VecDeque<String>,
}

impl CompletedResults {
    fn new(capacity: usize) -> Self {
        Self {
            capacity,
            events: HashMap::new(),
            order: VecDeque::new(),
        }
    }

    fn insert(&mut self, request_id: String, event: Event) {
        if self.events.contains_key(&request_id) {
            return;
        }
        self.events.insert(request_id.clone(), event);
        self.order.push_back(request_id);
        while self.events.len() > self.capacity {
            if let Some(oldest) = self.order.pop_front() {
                self.events.remove(&oldest);
            }
        }
    }
}

/// Nostr transport adapter around the relay-independent signed job handler.
pub struct NostrEventHandler {
    client: Client,
    signed_jobs: Arc<SignedJobHandler>,
    dispatch_slots: Arc<Semaphore>,
}

impl NostrEventHandler {
    /// Connect to every configured relay before reporting readiness.
    pub async fn new(
        keys: Keys,
        relay_urls: &[String],
        processor: Arc<ProofProcessor>,
    ) -> Result<Self> {
        let client = Client::new(keys.clone());
        for relay in relay_urls {
            client
                .add_relay(relay)
                .await
                .with_context(|| format!("failed to add configured relay {relay}"))?;
        }
        client.connect().await;
        client.wait_for_connection(RELAY_CONNECT_TIMEOUT).await;
        let relays = client.relays().await;
        let connected = relays.values().filter(|relay| relay.is_connected()).count();
        if connected == 0 {
            bail!(
                "no configured Nostr relay connected within {} seconds",
                RELAY_CONNECT_TIMEOUT.as_secs()
            );
        }
        if connected < relays.len() {
            warn!(
                connected,
                configured = relays.len(),
                "some configured Nostr relays are not connected"
            );
        }
        info!(connected, "connected Nostr relay pool");

        Ok(Self {
            client,
            signed_jobs: Arc::new(SignedJobHandler::new(
                keys,
                processor,
                limits::MAX_DEDUPE_ENTRIES,
            )),
            dispatch_slots: Arc::new(Semaphore::new(MAX_INFLIGHT_EVENTS)),
        })
    }

    /// Subscribe with a finite historical lookback and continuously dispatch
    /// authenticated jobs. Each event is spawned independently; the processor's
    /// semaphore is the hard proving boundary.
    pub async fn start(self: Arc<Self>) -> Result<()> {
        let since = Timestamp::from_secs(
            Timestamp::now()
                .as_secs()
                .saturating_sub(limits::MAX_REQUEST_AGE_SECS),
        );
        let filter = Filter::new()
            .kinds(event_kinds::REQUESTS.map(Kind::from))
            .since(since);
        let subscription = self
            .client
            .subscribe(filter, None)
            .await
            .context("failed to subscribe to Soul Wire requests")?;
        if subscription.success.is_empty() {
            bail!(
                "no relay accepted the Soul Wire subscription: {:?}",
                subscription.failed
            );
        }
        if !subscription.failed.is_empty() {
            warn!(
                failed = ?subscription.failed,
                "some relays rejected the Soul Wire subscription"
            );
        }
        info!(kinds = ?event_kinds::REQUESTS, "subscribed to Soul Wire requests");

        let handler = Arc::clone(&self);
        self.client
            .handle_notifications(move |notification| {
                let handler = Arc::clone(&handler);
                async move {
                    match notification {
                        RelayPoolNotification::Event { event, .. } => {
                            if let Ok(permit) =
                                Arc::clone(&handler.dispatch_slots).try_acquire_owned()
                            {
                                tokio::spawn(async move {
                                    handler.dispatch(*event).await;
                                    drop(permit);
                                });
                            } else {
                                warn!(
                                    event_id = %event.id,
                                    "dropped request while the bounded event intake was full"
                                );
                            }
                        }
                        RelayPoolNotification::Shutdown => return Ok(true),
                        RelayPoolNotification::Message { .. } => {}
                    }
                    Ok(false)
                }
            })
            .await
            .context("Nostr notification loop terminated")
    }

    async fn dispatch(&self, event: Event) {
        let result_event = match self
            .signed_jobs
            .handle_event(&event, Timestamp::now().as_secs())
            .await
        {
            Ok(Some(result_event)) => result_event,
            Ok(None) => {
                debug!(request_id = %event.id, "ignored duplicate request delivery");
                return;
            }
            Err(error) => {
                warn!(
                    event_id = %event.id,
                    reason = %error,
                    "discarded invalid Soul Wire request"
                );
                return;
            }
        };

        let output = match self.client.send_event(&result_event).await {
            Ok(output) if !output.success.is_empty() => output,
            Ok(output) => {
                error!(
                    request_id = %event.id,
                    failed = ?output.failed,
                    "no relay accepted the Soul Wire result"
                );
                return;
            }
            Err(error) => {
                error!(
                    request_id = %event.id,
                    reason = %error,
                    "failed to publish Soul Wire result"
                );
                return;
            }
        };
        if !output.failed.is_empty() {
            warn!(
                request_id = %event.id,
                failed = ?output.failed,
                "some relays rejected the Soul Wire result"
            );
        }
        info!(
            request_id = %event.id,
            result_id = %result_event.id,
            relay_count = output.success.len(),
            "published Soul Wire result"
        );
    }

    /// Disconnect relay tasks during process shutdown.
    pub async fn shutdown(&self) {
        self.client.shutdown().await;
    }

    #[must_use]
    pub fn public_key(&self) -> PublicKey {
        self.signed_jobs.public_key()
    }
}

/// Failures before a result event can safely be produced.
#[derive(Debug, Error)]
pub enum JobHandlingError {
    #[error(transparent)]
    InvalidRequest(#[from] WireError),
    #[error("result content encoding failed")]
    ResultEncoding,
    #[error("result content exceeded the wire bound")]
    ResultTooLarge,
    #[error("result event signing failed")]
    Signing,
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use ::url::Url;
    use soul_core::{
        into_nostr_tags, request_tags, FeltHex, JobInput, JobMetrics, JobOutput, JobRequestContent,
        ProofStatement, ServiceType, CAIRO_PROGRAM,
    };
    use soul_prover::VerifiedProofArtifact;

    use super::*;
    use crate::artifacts::MemoryProofArtifactStore;
    use crate::processor::ProofEngine;

    struct CountingEngine {
        calls: Arc<AtomicUsize>,
    }

    impl ProofEngine for CountingEngine {
        fn prove_job(&self, input: &JobInput) -> Result<VerifiedProofArtifact, String> {
            self.calls.fetch_add(1, Ordering::SeqCst);
            let JobInput::Fibonacci { n } = input else {
                return Err("fixture only supports Fibonacci".to_owned());
            };
            Ok(VerifiedProofArtifact {
                proof_bytes: br#"{"proof":"fixture"}"#.to_vec(),
                statement: ProofStatement {
                    service: ServiceType::Fibonacci,
                    program: CAIRO_PROGRAM.to_owned(),
                    public_input: vec![FeltHex::from_u64(*n)],
                    public_output: vec![FeltHex::from_u64(55)],
                    output: JobOutput::Fibonacci {
                        result: FeltHex::from_u64(55),
                    },
                },
                program_hash: FeltHex::from_u64(99),
                metrics: JobMetrics::default(),
            })
        }
    }

    #[tokio::test]
    async fn completed_duplicate_replays_the_same_signed_event_without_reproving() {
        let now = 1_900_000_000;
        let content = JobRequestContent::new(JobInput::Fibonacci { n: 10 }, Some(now + 60));
        let request_event = EventBuilder::new(
            Kind::from(content.service.request_kind()),
            content.canonical_json().unwrap(),
        )
        .tags(into_nostr_tags(request_tags(&content, None).unwrap()).unwrap())
        .custom_created_at(Timestamp::from_secs(now))
        .sign_with_keys(&Keys::generate())
        .unwrap();
        let calls = Arc::new(AtomicUsize::new(0));
        let processor = Arc::new(ProofProcessor::new(
            Arc::new(CountingEngine {
                calls: Arc::clone(&calls),
            }),
            Arc::new(MemoryProofArtifactStore::default()),
            Url::parse("https://proofs.test/").unwrap(),
            1,
        ));
        let handler = SignedJobHandler::new(Keys::generate(), processor, 16);

        let first = handler
            .handle_event(&request_event, now + 1)
            .await
            .unwrap()
            .unwrap();
        let duplicate = handler
            .handle_event(&request_event, now + 1)
            .await
            .unwrap()
            .unwrap();

        assert_eq!(first.id, duplicate.id);
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }
}
