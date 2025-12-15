//! STWO Verifier implementation
//!
//! Provides STARK proof verification functionality.

use super::prover::SerializedProof;
use anyhow::Result;

/// STWO Verifier for validating STARK proofs
///
/// This is a mock implementation for MVP. In production, this will
/// integrate with the actual STWO verifier.
pub struct StwoVerifier;

impl StwoVerifier {
    /// Verify a STARK proof against public inputs
    ///
    /// In MVP, this performs basic validation. In production, this will:
    /// 1. Deserialize the proof
    /// 2. Reconstruct the AIR with public inputs
    /// 3. Verify the proof using STWO
    pub fn verify(proof: &SerializedProof, public_inputs: &[String]) -> Result<bool> {
        // For MVP: verify proof has data and commitment is non-empty
        if proof.proof_bytes.is_empty() {
            return Ok(false);
        }

        if proof.commitment.is_empty() || proof.commitment == "0x" {
            return Ok(false);
        }

        // Mock verification: check that we have enough proof data
        // Real verification would check cryptographic validity
        let _ = public_inputs;
        Ok(proof.proof_bytes.len() >= 32)
    }

    /// Verify a proof with commitment check
    pub fn verify_with_commitment(
        proof: &SerializedProof,
        expected_commitment: &str,
        public_inputs: &[String],
    ) -> Result<bool> {
        // First do basic verification
        if !Self::verify(proof, public_inputs)? {
            return Ok(false);
        }

        // Then check commitment matches
        Ok(proof.commitment == expected_commitment)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verifier_valid_proof() {
        let proof = SerializedProof {
            proof_bytes: vec![0u8; 96], // 32 + 64 bytes like our mock proofs
            commitment: "0x123456".to_string(),
        };

        let result = StwoVerifier::verify(&proof, &["input1".to_string()]);
        assert!(result.is_ok());
        assert!(result.unwrap());
    }

    #[test]
    fn test_empty_proof_verification() {
        let proof = SerializedProof {
            proof_bytes: vec![],
            commitment: "0x".to_string(),
        };

        let result = StwoVerifier::verify(&proof, &[]);
        assert!(result.is_ok());
        assert!(!result.unwrap()); // Empty proof should fail
    }

    #[test]
    fn test_short_proof_verification() {
        let proof = SerializedProof {
            proof_bytes: vec![1, 2, 3], // Too short
            commitment: "0x123".to_string(),
        };

        let result = StwoVerifier::verify(&proof, &["input".to_string()]);
        assert!(result.is_ok());
        assert!(!result.unwrap()); // Short proof should fail
    }

    #[test]
    fn test_verify_with_commitment() {
        let proof = SerializedProof {
            proof_bytes: vec![0u8; 96],
            commitment: "0xabc123".to_string(),
        };

        let result =
            StwoVerifier::verify_with_commitment(&proof, "0xabc123", &["input".to_string()]);
        assert!(result.unwrap());

        let result =
            StwoVerifier::verify_with_commitment(&proof, "0xwrong", &["input".to_string()]);
        assert!(!result.unwrap());
    }
}
