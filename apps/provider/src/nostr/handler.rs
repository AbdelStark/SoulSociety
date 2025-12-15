//! Nostr event handler for DVM job requests
//!
//! This module implements the event handling logic for processing DVM job requests
//! and publishing results with proofs.

use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result};
use nostr_sdk::prelude::*;
use serde_json::Value;
use tracing::{debug, error, info};

use soul_core::constants::dvm_kinds;
use soul_core::types::{JobInput, JobOutput, JobRequest, JobResult, JobStatus, ServiceType, StarkProof};

use crate::services::{FibonacciService, HashVerifierService, MerkleProofService};

/// Nostr event handler for DVM operations
pub struct NostrEventHandler {
    /// Nostr client
    client: Client,
    /// Provider keys for signing
    keys: Keys,
    /// Fibonacci service
    fibonacci_service: Arc<FibonacciService>,
    /// Hash verifier service
    hash_verifier_service: Arc<HashVerifierService>,
    /// Merkle proof service
    merkle_proof_service: Arc<MerkleProofService>,
}

impl NostrEventHandler {
    /// Create a new event handler with the given keys and relays
    pub async fn new(keys: Keys, relay_urls: Vec<String>) -> Result<Self> {
        let client = Client::new(keys.clone());

        // Connect to relays
        for url in &relay_urls {
            client.add_relay(url).await?;
        }
        client.connect().await;

        info!("Connected to {} relays", relay_urls.len());

        Ok(Self {
            client,
            keys,
            fibonacci_service: Arc::new(FibonacciService::new()),
            hash_verifier_service: Arc::new(HashVerifierService::new()),
            merkle_proof_service: Arc::new(MerkleProofService::new()),
        })
    }

    /// Start listening for DVM job requests
    pub async fn start(&self) -> Result<()> {
        info!("Starting DVM event subscription...");

        // Subscribe to all DVM request kinds
        let filter = Filter::new()
            .kinds(dvm_kinds::REQUEST_KINDS.iter().map(|k| Kind::from(*k as u16)).collect::<Vec<_>>())
            .limit(0); // No limit, continuous subscription

        self.client.subscribe(vec![filter], None).await?;

        info!("Subscribed to DVM request events (kinds: {:?})", dvm_kinds::REQUEST_KINDS);

        // Handle events
        self.client.handle_notifications(|notification| async {
            match notification {
                RelayPoolNotification::Event { event, .. } => {
                    if let Err(e) = self.handle_event(&event).await {
                        error!("Failed to handle event {}: {}", event.id, e);
                    }
                }
                RelayPoolNotification::Message { message, .. } => {
                    debug!("Relay message: {:?}", message);
                }
                _ => {}
            }
            Ok(false) // Continue processing
        }).await?;

        Ok(())
    }

    /// Handle a single DVM event
    async fn handle_event(&self, event: &Event) -> Result<()> {
        let kind = event.kind.as_u16() as u32;

        debug!("Received event kind {} from {}", kind, event.pubkey);

        // Parse the job request from the event
        let job_request = self.parse_job_request(event)?;

        info!(
            "Processing job {} for service {:?}",
            job_request.id, job_request.service
        );

        // Process the job and get the result
        let start_time = Instant::now();
        let result = self.process_job(&job_request).await;
        let execution_time_ms = start_time.elapsed().as_millis() as u64;

        // Build and publish the result event
        let job_result = match result {
            Ok((output, proof)) => JobResult {
                id: uuid::Uuid::new_v4().to_string(),
                request_id: job_request.id.clone(),
                status: JobStatus::Verified,
                output: Some(output),
                proof: Some(proof),
                execution_time_ms,
            },
            Err(e) => {
                error!("Job {} failed: {}", job_request.id, e);
                JobResult {
                    id: uuid::Uuid::new_v4().to_string(),
                    request_id: job_request.id.clone(),
                    status: JobStatus::Failed(e.to_string()),
                    output: None,
                    proof: None,
                    execution_time_ms,
                }
            }
        };

        // Publish the result
        self.publish_result(&job_request, &job_result).await?;

        info!(
            "Job {} completed with status {:?} in {}ms",
            job_request.id, job_result.status, execution_time_ms
        );

        Ok(())
    }

    /// Parse a job request from a Nostr event
    fn parse_job_request(&self, event: &Event) -> Result<JobRequest> {
        let kind = event.kind.as_u16() as u32;

        // Determine service type from event kind
        let service = match kind {
            dvm_kinds::FIBONACCI_REQUEST => ServiceType::Fibonacci,
            dvm_kinds::HASH_VERIFY_REQUEST => ServiceType::HashVerify,
            dvm_kinds::MERKLE_PROOF_REQUEST => ServiceType::MerkleProof,
            _ => anyhow::bail!("Unknown DVM request kind: {}", kind),
        };

        // Parse content as JSON
        let content: Value = serde_json::from_str(&event.content)
            .context("Failed to parse event content as JSON")?;

        // Extract input based on service type
        let input = match service {
            ServiceType::Fibonacci => {
                let n = content.get("n")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'n' field for Fibonacci"))?;
                JobInput::Fibonacci { n }
            }
            ServiceType::HashVerify => {
                let hash = content.get("hash")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'hash' field"))?
                    .to_string();
                let preimage = content.get("preimage")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'preimage' field"))?
                    .to_string();
                JobInput::HashVerify { hash, preimage }
            }
            ServiceType::MerkleProof => {
                let root = content.get("root")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'root' field"))?
                    .to_string();
                let leaf = content.get("leaf")
                    .and_then(|v| v.as_str())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'leaf' field"))?
                    .to_string();
                let proof = content.get("proof")
                    .and_then(|v| v.as_array())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'proof' field"))?
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
                let index = content.get("index")
                    .and_then(|v| v.as_u64())
                    .ok_or_else(|| anyhow::anyhow!("Missing 'index' field"))?;
                JobInput::MerkleProof { root, leaf, proof, index }
            }
        };

        // Extract bid from tags (NIP-90 convention)
        let bid_msats = event.tags.iter()
            .find_map(|tag| {
                let values = tag.as_slice();
                if values.first().map(|s| s.as_str()) == Some("bid") {
                    values.get(1).and_then(|s| s.parse().ok())
                } else {
                    None
                }
            })
            .unwrap_or(0);

        Ok(JobRequest {
            id: event.id.to_string(),
            service,
            input,
            bid_msats,
            customer_pubkey: event.pubkey.to_string(),
            created_at: event.created_at.as_u64(),
        })
    }

    /// Process a job and return the output and proof
    async fn process_job(&self, job: &JobRequest) -> Result<(JobOutput, StarkProof)> {
        match &job.input {
            JobInput::Fibonacci { n } => {
                self.fibonacci_service.execute(*n).await
            }
            JobInput::HashVerify { hash, preimage } => {
                self.hash_verifier_service.execute(hash, preimage).await
            }
            JobInput::MerkleProof { root, leaf, proof, index } => {
                self.merkle_proof_service.execute(root, leaf, proof, *index).await
            }
        }
    }

    /// Publish a job result to the Nostr network
    async fn publish_result(&self, request: &JobRequest, result: &JobResult) -> Result<()> {
        // Determine result kind
        let kind = match request.service {
            ServiceType::Fibonacci => dvm_kinds::FIBONACCI_RESULT,
            ServiceType::HashVerify => dvm_kinds::HASH_VERIFY_RESULT,
            ServiceType::MerkleProof => dvm_kinds::MERKLE_PROOF_RESULT,
        };

        // Build result content
        let content = serde_json::to_string(result)?;

        // Build tags (NIP-90 convention)
        let tags = vec![
            Tag::parse(&["e", &request.id, "", "request"]).unwrap(),
            Tag::parse(&["p", &request.customer_pubkey]).unwrap(),
            Tag::parse(&["request", &request.id]).unwrap(),
            Tag::parse(&["status", &format!("{:?}", result.status)]).unwrap(),
        ];

        // Create and sign the event
        let event = EventBuilder::new(Kind::from(kind as u16), content, tags)
            .to_event(&self.keys)?;

        // Publish the event
        self.client.send_event(event.clone()).await?;

        debug!("Published result event {} for request {}", event.id, request.id);

        Ok(())
    }

    /// Get the public key of the provider
    pub fn public_key(&self) -> PublicKey {
        self.keys.public_key()
    }
}
