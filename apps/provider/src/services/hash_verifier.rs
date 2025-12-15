//! Hash verification service implementation
//!
//! Verifies that a preimage hashes to a given hash value using Poseidon hash.

use anyhow::Result;
use tracing::{debug, info};

use soul_core::types::{JobOutput, StarkProof};
use soul_prover::StwoProver;

/// Hash verification DVM service
pub struct HashVerifierService {
    prover: StwoProver,
}

impl HashVerifierService {
    /// Create a new service instance
    pub fn new() -> Self {
        Self {
            prover: StwoProver::new(),
        }
    }

    /// Execute hash verification with proof generation
    pub async fn execute(&self, expected_hash: &str, preimage: &str) -> Result<(JobOutput, StarkProof)> {
        info!("Verifying hash for preimage");

        // Compute hash of preimage
        let computed_hash = self.compute_poseidon_hash(preimage);
        debug!("Computed hash: {}", computed_hash);

        // Check if hashes match
        let valid = computed_hash.to_lowercase() == expected_hash.to_lowercase();
        debug!("Hash verification result: {}", valid);

        // Generate proof
        let public_inputs = vec![
            expected_hash.to_string(),
            preimage.to_string(),
            valid.to_string(),
        ];
        let proof = self.prover.prove(&public_inputs)?;

        let stark_proof = StarkProof {
            proof_bytes: proof.proof_bytes,
            commitment: proof.commitment,
            public_inputs,
        };

        let output = JobOutput::HashVerify { valid };

        info!("Generated proof for hash verification (valid={})", valid);

        Ok((output, stark_proof))
    }

    /// Compute Poseidon hash of the preimage
    /// For MVP, we use a simplified hash computation
    fn compute_poseidon_hash(&self, preimage: &str) -> String {
        // Simple hash simulation for MVP
        // In production, this would use actual Poseidon hash from Cairo
        let bytes = preimage.as_bytes();
        let mut hash: u64 = 0;

        for (i, &byte) in bytes.iter().enumerate() {
            hash = hash.wrapping_add((byte as u64).wrapping_mul((i as u64).wrapping_add(1)));
            hash = hash.wrapping_mul(0x517cc1b727220a95);
            hash ^= hash >> 33;
        }

        format!("{:016x}", hash)
    }
}

impl Default for HashVerifierService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_computation() {
        let service = HashVerifierService::new();
        let hash1 = service.compute_poseidon_hash("hello");
        let hash2 = service.compute_poseidon_hash("hello");
        let hash3 = service.compute_poseidon_hash("world");

        assert_eq!(hash1, hash2); // Same input, same hash
        assert_ne!(hash1, hash3); // Different input, different hash
    }

    #[tokio::test]
    async fn test_execute_valid() {
        let service = HashVerifierService::new();
        let preimage = "test_preimage";
        let expected_hash = service.compute_poseidon_hash(preimage);

        let (output, proof) = service.execute(&expected_hash, preimage).await.unwrap();

        if let JobOutput::HashVerify { valid } = output {
            assert!(valid);
        } else {
            panic!("Wrong output type");
        }

        assert!(!proof.proof_bytes.is_empty());
    }

    #[tokio::test]
    async fn test_execute_invalid() {
        let service = HashVerifierService::new();
        let preimage = "test_preimage";
        let wrong_hash = "0000000000000000";

        let (output, _proof) = service.execute(wrong_hash, preimage).await.unwrap();

        if let JobOutput::HashVerify { valid } = output {
            assert!(!valid);
        } else {
            panic!("Wrong output type");
        }
    }
}
