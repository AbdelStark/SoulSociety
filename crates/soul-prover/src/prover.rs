//! STWO Prover implementation
//!
//! Provides STARK proof generation for Cairo program execution.

use anyhow::Result;
use serde::{Deserialize, Serialize};

/// Serialized STARK proof ready for transmission
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerializedProof {
    /// Raw proof bytes
    pub proof_bytes: Vec<u8>,
    /// Proof commitment (hex encoded)
    pub commitment: String,
}

impl SerializedProof {
    /// Create a new serialized proof
    pub fn new(proof_bytes: Vec<u8>, commitment: String) -> Self {
        Self { proof_bytes, commitment }
    }

    /// Get the raw proof bytes
    pub fn to_bytes(&self) -> Vec<u8> {
        self.proof_bytes.clone()
    }

    /// Get the commitment hex string
    pub fn commitment_hex(&self) -> &str {
        &self.commitment
    }
}

/// STWO Prover wrapper for generating STARK proofs
///
/// This is a mock implementation for MVP. In production, this will
/// integrate with the actual STWO prover.
pub struct StwoProver;

impl StwoProver {
    /// Create a new prover instance
    pub fn new() -> Self {
        Self
    }

    /// Generate a STARK proof for the given public inputs
    ///
    /// In MVP, this generates a mock proof. In production, this will:
    /// 1. Execute the Cairo program with the inputs
    /// 2. Generate execution trace
    /// 3. Create STARK proof using STWO
    /// 4. Serialize the proof
    pub fn prove(&self, public_inputs: &[String]) -> Result<SerializedProof> {
        // Generate a deterministic mock proof based on inputs
        // This ensures the same inputs always produce the same proof
        let input_hash = self.hash_inputs(public_inputs);

        // Mock proof data (32 bytes commitment + 64 bytes proof body)
        let mut proof_bytes = Vec::with_capacity(96);
        proof_bytes.extend_from_slice(&input_hash);
        proof_bytes.extend_from_slice(&[0xAA; 64]); // Mock proof body

        let commitment = format!("0x{}", hex::encode(&input_hash));

        Ok(SerializedProof {
            proof_bytes,
            commitment,
        })
    }

    /// Generate a STARK proof from raw trace data
    pub fn prove_from_trace(&self, trace_data: &[u8]) -> Result<SerializedProof> {
        // Hash the trace data for commitment
        let mut hash = [0u8; 32];
        for (i, &byte) in trace_data.iter().enumerate() {
            hash[i % 32] ^= byte;
        }

        let mut proof_bytes = Vec::with_capacity(96);
        proof_bytes.extend_from_slice(&hash);
        proof_bytes.extend_from_slice(&[0xBB; 64]);

        let commitment = format!("0x{}", hex::encode(&hash));

        Ok(SerializedProof {
            proof_bytes,
            commitment,
        })
    }

    /// Hash public inputs into a 32-byte commitment
    fn hash_inputs(&self, inputs: &[String]) -> [u8; 32] {
        let mut hash = [0u8; 32];

        for input in inputs {
            for (i, byte) in input.bytes().enumerate() {
                hash[i % 32] ^= byte;
                // Simple mixing
                let idx = (i + 1) % 32;
                hash[idx] = hash[idx].wrapping_add(byte);
            }
        }

        hash
    }
}

impl Default for StwoProver {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_prover_creation() {
        let prover = StwoProver::new();
        let result = prover.prove(&["10".to_string(), "55".to_string()]);
        assert!(result.is_ok());
    }

    #[test]
    fn test_proof_deterministic() {
        let prover = StwoProver::new();
        let inputs = vec!["10".to_string(), "55".to_string()];

        let proof1 = prover.prove(&inputs).unwrap();
        let proof2 = prover.prove(&inputs).unwrap();

        assert_eq!(proof1.commitment, proof2.commitment);
        assert_eq!(proof1.proof_bytes, proof2.proof_bytes);
    }

    #[test]
    fn test_proof_different_inputs() {
        let prover = StwoProver::new();

        let proof1 = prover.prove(&["10".to_string()]).unwrap();
        let proof2 = prover.prove(&["20".to_string()]).unwrap();

        assert_ne!(proof1.commitment, proof2.commitment);
    }

    #[test]
    fn test_prove_from_trace() {
        let prover = StwoProver::new();
        let result = prover.prove_from_trace(&[1, 2, 3, 4]);
        assert!(result.is_ok());
    }
}
