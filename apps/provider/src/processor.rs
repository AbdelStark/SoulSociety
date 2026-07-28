//! Bounded proof execution, request binding, and artifact publication.

use std::sync::Arc;

use bytes::Bytes;
use soul_core::constants::{PROOF_CHANNEL, PROOF_FORMAT, PROOF_MEDIA_TYPE};
use soul_core::{
    ErrorCode, FeltHex, JobInput, JobRequest, JobResultContent, ProofDescriptor, ProofStatement,
};
use soul_prover::{VerifiableJobEngine, VerifiedProofArtifact};
use thiserror::Error;
use tokio::sync::Semaphore;
use url::Url;

use crate::artifacts::{ArtifactError, ProofArtifactStore};

/// Provider-local interface whose implementation contract guarantees native
/// verification before returning an artifact.
pub trait ProofEngine: Send + Sync {
    fn prove_job(&self, input: &JobInput) -> Result<VerifiedProofArtifact, String>;
}

impl ProofEngine for VerifiableJobEngine {
    fn prove_job(&self, input: &JobInput) -> Result<VerifiedProofArtifact, String> {
        VerifiableJobEngine::prove_job(self, input).map_err(|error| error.to_string())
    }
}

/// Deep job-processing module. Nostr transport does not know about threads,
/// proof storage, hashes, or URL construction.
pub struct ProofProcessor {
    engine: Arc<dyn ProofEngine>,
    store: Arc<dyn ProofArtifactStore>,
    public_base_url: Url,
    proving_slots: Arc<Semaphore>,
}

impl ProofProcessor {
    #[must_use]
    pub fn new(
        engine: Arc<dyn ProofEngine>,
        store: Arc<dyn ProofArtifactStore>,
        public_base_url: Url,
        max_concurrent_proofs: usize,
    ) -> Self {
        assert!(
            (1..=16).contains(&max_concurrent_proofs),
            "proof concurrency must be in 1..=16"
        );
        Self {
            engine,
            store,
            public_base_url,
            proving_slots: Arc::new(Semaphore::new(max_concurrent_proofs)),
        }
    }

    /// Produce a result ready for event publication. The blocking Cairo/STWO
    /// work runs off the async executor and never exceeds the fixed semaphore.
    pub async fn process(&self, request: &JobRequest) -> Result<JobResultContent, ProcessingError> {
        let permit = self
            .proving_slots
            .clone()
            .try_acquire_owned()
            .map_err(|_| ProcessingError::Busy)?;
        let engine = Arc::clone(&self.engine);
        let input = request.input.clone();
        let artifact = tokio::task::spawn_blocking(move || engine.prove_job(&input))
            .await
            .map_err(|_| ProcessingError::Worker)?
            .map_err(|_| ProcessingError::Proving)?;
        drop(permit);

        if !statement_matches_request(&artifact.statement, &request.input) {
            return Err(ProcessingError::RequestBinding);
        }
        let stored = self.store.put(Bytes::from(artifact.proof_bytes)).await?;
        let url = self
            .public_base_url
            .join(&format!("v1/proofs/{}.json", stored.sha256))
            .map_err(|_| ProcessingError::Descriptor)?;
        let descriptor = ProofDescriptor {
            format: PROOF_FORMAT.to_owned(),
            media_type: PROOF_MEDIA_TYPE.to_owned(),
            url: url.to_string(),
            sha256: stored.sha256,
            byte_size: stored.byte_size,
            program_hash: artifact.program_hash,
            channel: PROOF_CHANNEL.to_owned(),
        };
        descriptor
            .validate()
            .map_err(|_| ProcessingError::Descriptor)?;

        let result = JobResultContent::success(
            request.id.clone(),
            artifact.statement,
            descriptor,
            artifact.metrics,
        );
        result.validate().map_err(|_| ProcessingError::Descriptor)?;
        Ok(result)
    }
}

fn statement_matches_request(statement: &ProofStatement, input: &JobInput) -> bool {
    if statement.service != input.service() {
        return false;
    }
    match input {
        JobInput::Fibonacci { n } => statement.public_input.as_slice() == [FeltHex::from_u64(*n)],
        JobInput::HashVerify { hash, .. } => statement.public_input.as_slice() == [hash.clone()],
        JobInput::MerkleProof {
            root, leaf, index, ..
        } => {
            statement.public_input.as_slice()
                == [root.clone(), leaf.clone(), FeltHex::from_u64(*index)]
        }
    }
}

/// Internal pipeline failures. Diagnostics go to tracing; relay messages use
/// only the stable code and fixed public message.
#[derive(Debug, Error)]
pub enum ProcessingError {
    #[error("all proof workers are occupied")]
    Busy,
    #[error("blocking proof worker terminated")]
    Worker,
    #[error("Cairo/STWO proving or native verification failed")]
    Proving,
    #[error("verified statement does not bind the request")]
    RequestBinding,
    #[error("proof artifact persistence failed")]
    Artifact(#[from] ArtifactError),
    #[error("proof descriptor construction failed")]
    Descriptor,
}

impl ProcessingError {
    #[must_use]
    pub const fn public_code(&self) -> ErrorCode {
        match self {
            Self::Busy => ErrorCode::Busy,
            Self::Artifact(_) => ErrorCode::ArtifactUnavailable,
            Self::Proving | Self::RequestBinding => ErrorCode::ProvingFailed,
            Self::Worker | Self::Descriptor => ErrorCode::Internal,
        }
    }

    #[must_use]
    pub const fn public_message(&self) -> &'static str {
        match self {
            Self::Busy => "provider is at proof capacity; retry later",
            Self::Artifact(_) => "proof artifact is temporarily unavailable",
            Self::Proving | Self::RequestBinding => "proof generation failed",
            Self::Worker | Self::Descriptor => "provider could not complete the request",
        }
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use soul_core::{JobMetrics, JobOutput, ServiceType, CAIRO_PROGRAM};

    use super::*;
    use crate::artifacts::MemoryProofArtifactStore;

    struct FixtureEngine {
        delay: Duration,
    }

    impl ProofEngine for FixtureEngine {
        fn prove_job(&self, input: &JobInput) -> Result<VerifiedProofArtifact, String> {
            std::thread::sleep(self.delay);
            let JobInput::Fibonacci { n } = input else {
                return Err("fixture only supports Fibonacci".to_owned());
            };
            Ok(VerifiedProofArtifact {
                proof_bytes: br#"{"proof":"verified-fixture"}"#.to_vec(),
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
                metrics: JobMetrics {
                    execution_ms: 1,
                    proving_ms: 2,
                    verification_ms: 3,
                },
            })
        }
    }

    fn request(id_digit: char) -> JobRequest {
        JobRequest {
            id: id_digit.to_string().repeat(64),
            service: ServiceType::Fibonacci,
            input: JobInput::Fibonacci { n: 10 },
            bid_msats: 0,
            customer_pubkey: "b".repeat(64),
            created_at: 1_000,
            expires_at: None,
            canonical_input:
                r#"{"protocol":"soul-society/1","service":"fibonacci","input":{"type":"fibonacci","n":10}}"#
                    .to_owned(),
            serialized_event: "{}".to_owned(),
        }
    }

    #[tokio::test]
    async fn verified_bytes_are_externalized_and_bound_to_request() {
        let store = Arc::new(MemoryProofArtifactStore::default());
        let processor = ProofProcessor::new(
            Arc::new(FixtureEngine {
                delay: Duration::ZERO,
            }),
            store.clone(),
            Url::parse("https://proofs.example/base/").unwrap(),
            1,
        );
        let result = processor.process(&request('a')).await.unwrap();
        let JobResultContent::Success {
            proof, statement, ..
        } = result
        else {
            panic!("expected successful fixture result");
        };
        assert_eq!(statement.public_input, vec![FeltHex::from_u64(10)]);
        assert!(proof
            .url
            .starts_with("https://proofs.example/base/v1/proofs/"));
        assert_eq!(
            store.get(&proof.sha256).await.unwrap().unwrap(),
            Bytes::from_static(br#"{"proof":"verified-fixture"}"#)
        );
    }

    #[tokio::test]
    async fn proof_concurrency_is_rejected_at_the_boundary() {
        let processor = Arc::new(ProofProcessor::new(
            Arc::new(FixtureEngine {
                delay: Duration::from_millis(100),
            }),
            Arc::new(MemoryProofArtifactStore::default()),
            Url::parse("https://proofs.example/").unwrap(),
            1,
        ));
        let first_processor = Arc::clone(&processor);
        let first = tokio::spawn(async move { first_processor.process(&request('a')).await });
        tokio::time::sleep(Duration::from_millis(10)).await;
        assert!(matches!(
            processor.process(&request('c')).await,
            Err(ProcessingError::Busy)
        ));
        first.await.unwrap().unwrap();
    }
}
