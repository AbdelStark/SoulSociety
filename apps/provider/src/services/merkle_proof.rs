//! Merkle proof verification service implementation
//!
//! Verifies that a leaf is part of a Merkle tree given the root and proof path.

use anyhow::Result;
use tracing::{debug, info};

use soul_core::constants::limits;
use soul_core::types::{JobOutput, StarkProof};
use soul_prover::StwoProver;

/// Merkle proof verification DVM service
pub struct MerkleProofService {
    prover: StwoProver,
}

impl MerkleProofService {
    /// Create a new service instance
    pub fn new() -> Self {
        Self {
            prover: StwoProver::new(),
        }
    }

    /// Execute Merkle proof verification with proof generation
    pub async fn execute(
        &self,
        root: &str,
        leaf: &str,
        proof_path: &[String],
        index: u64,
    ) -> Result<(JobOutput, StarkProof)> {
        // Validate input
        if proof_path.len() > limits::MAX_MERKLE_DEPTH {
            anyhow::bail!(
                "Proof path length {} exceeds maximum of {}",
                proof_path.len(),
                limits::MAX_MERKLE_DEPTH
            );
        }

        info!("Verifying Merkle proof for leaf at index {}", index);

        // Verify the Merkle proof
        let valid = self.verify_merkle_proof(root, leaf, proof_path, index);
        debug!("Merkle proof verification result: {}", valid);

        // Generate proof
        let mut public_inputs = vec![
            root.to_string(),
            leaf.to_string(),
            index.to_string(),
            valid.to_string(),
        ];
        public_inputs.extend(proof_path.iter().cloned());

        let proof = self.prover.prove(&public_inputs)?;

        let stark_proof = StarkProof {
            proof_bytes: proof.proof_bytes,
            commitment: proof.commitment,
            public_inputs,
        };

        let output = JobOutput::MerkleProof { valid };

        info!("Generated proof for Merkle verification (valid={})", valid);

        Ok((output, stark_proof))
    }

    /// Verify a Merkle proof
    fn verify_merkle_proof(&self, root: &str, leaf: &str, proof_path: &[String], index: u64) -> bool {
        let mut current_hash = leaf.to_string();
        let mut current_index = index;

        for sibling in proof_path {
            current_hash = if current_index % 2 == 0 {
                // Current is left child
                self.hash_pair(&current_hash, sibling)
            } else {
                // Current is right child
                self.hash_pair(sibling, &current_hash)
            };
            current_index /= 2;
        }

        current_hash.to_lowercase() == root.to_lowercase()
    }

    /// Hash two nodes together
    fn hash_pair(&self, left: &str, right: &str) -> String {
        // Simple hash simulation for MVP
        // In production, this would use actual Poseidon hash from Cairo
        let combined = format!("{}{}", left, right);
        let bytes = combined.as_bytes();
        let mut hash: u64 = 0;

        for (i, &byte) in bytes.iter().enumerate() {
            hash = hash.wrapping_add((byte as u64).wrapping_mul((i as u64).wrapping_add(1)));
            hash = hash.wrapping_mul(0x517cc1b727220a95);
            hash ^= hash >> 33;
        }

        format!("{:016x}", hash)
    }
}

impl Default for MerkleProofService {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn build_test_tree() -> (String, String, Vec<String>, u64) {
        let service = MerkleProofService::new();

        // Build a simple 4-leaf tree
        // Level 1: hash pairs
        let h01 = service.hash_pair("a", "b");
        let h23 = service.hash_pair("c", "d");

        // Root: hash of level 1
        let root = service.hash_pair(&h01, &h23);

        // Proof for leaf "a" (index 0): need sibling "b" and then h23
        let proof = vec!["b".to_string(), h23.clone()];

        (root, "a".to_string(), proof, 0)
    }

    #[test]
    fn test_verify_merkle_proof_valid() {
        let service = MerkleProofService::new();
        let (root, leaf, proof, index) = build_test_tree();

        assert!(service.verify_merkle_proof(&root, &leaf, &proof, index));
    }

    #[test]
    fn test_verify_merkle_proof_invalid_leaf() {
        let service = MerkleProofService::new();
        let (root, _, proof, index) = build_test_tree();

        assert!(!service.verify_merkle_proof(&root, "wrong_leaf", &proof, index));
    }

    #[test]
    fn test_verify_merkle_proof_invalid_index() {
        let service = MerkleProofService::new();
        let (root, leaf, proof, _) = build_test_tree();

        assert!(!service.verify_merkle_proof(&root, &leaf, &proof, 1)); // Wrong index
    }

    #[tokio::test]
    async fn test_execute() {
        let service = MerkleProofService::new();
        let (root, leaf, proof, index) = build_test_tree();

        let (output, stark_proof) = service.execute(&root, &leaf, &proof, index).await.unwrap();

        if let JobOutput::MerkleProof { valid } = output {
            assert!(valid);
        } else {
            panic!("Wrong output type");
        }

        assert!(!stark_proof.proof_bytes.is_empty());
    }
}
