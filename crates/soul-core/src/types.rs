//! Core types for Soul Society
//!
//! This module defines the shared types used across all Soul Society components.

use serde::{Deserialize, Serialize};

/// Unique identifier for a job
pub type JobId = String;

/// Service identifier
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ServiceType {
    /// Fibonacci computation service
    Fibonacci,
    /// Hash preimage verification service
    HashVerify,
    /// Merkle proof verification service
    MerkleProof,
}

/// Job status lifecycle
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum JobStatus {
    /// Job received, waiting to be processed
    Pending,
    /// Job is being processed
    Processing,
    /// Proof has been generated
    Proven,
    /// Proof has been verified
    Verified,
    /// Job failed with error message
    Failed(String),
}

/// Job request from customer
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRequest {
    /// Unique job identifier
    pub id: JobId,
    /// Type of service requested
    pub service: ServiceType,
    /// Service-specific input
    pub input: JobInput,
    /// Payment bid in millisatoshis
    pub bid_msats: u64,
    /// Customer's Nostr public key
    pub customer_pubkey: String,
    /// Unix timestamp when the job was created
    pub created_at: u64,
}

/// Service-specific input
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum JobInput {
    /// Input for Fibonacci computation
    Fibonacci {
        /// Which Fibonacci number to compute (0-indexed)
        n: u64,
    },
    /// Input for hash verification
    HashVerify {
        /// Expected hash (hex encoded)
        hash: String,
        /// Preimage to verify (hex encoded)
        preimage: String,
    },
    /// Input for Merkle proof verification
    MerkleProof {
        /// Merkle root (hex encoded)
        root: String,
        /// Leaf to verify (hex encoded)
        leaf: String,
        /// Sibling hashes for proof path (hex encoded)
        proof: Vec<String>,
        /// Leaf index in the tree
        index: u64,
    },
}

/// Job result with proof
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobResult {
    /// Unique result identifier
    pub id: JobId,
    /// Reference to the original request
    pub request_id: JobId,
    /// Current job status
    pub status: JobStatus,
    /// Service-specific output
    pub output: Option<JobOutput>,
    /// STARK proof
    pub proof: Option<StarkProof>,
    /// Execution time in milliseconds
    pub execution_time_ms: u64,
}

impl Default for JobResult {
    fn default() -> Self {
        Self {
            id: String::new(),
            request_id: String::new(),
            status: JobStatus::Pending,
            output: None,
            proof: None,
            execution_time_ms: 0,
        }
    }
}

/// Service-specific output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum JobOutput {
    /// Output from Fibonacci computation
    Fibonacci {
        /// The computed Fibonacci number as a string (for large values)
        result: String,
    },
    /// Output from hash verification
    HashVerify {
        /// Whether the preimage matches the hash
        valid: bool,
    },
    /// Output from Merkle proof verification
    MerkleProof {
        /// Whether the leaf is in the tree
        valid: bool,
    },
}

/// STARK proof wrapper
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StarkProof {
    /// Serialized STWO proof
    pub proof_bytes: Vec<u8>,
    /// Proof commitment (hex encoded)
    pub commitment: String,
    /// Public inputs used for verification
    pub public_inputs: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_type_serialization() {
        let service = ServiceType::Fibonacci;
        let json = serde_json::to_string(&service).unwrap();
        assert_eq!(json, r#""Fibonacci""#);
    }

    #[test]
    fn test_job_input_serialization() {
        let input = JobInput::Fibonacci { n: 10 };
        let json = serde_json::to_string(&input).unwrap();
        assert!(json.contains("Fibonacci"));
        assert!(json.contains("10"));
    }

    #[test]
    fn test_job_status_serialization() {
        let status = JobStatus::Failed("test error".to_string());
        let json = serde_json::to_string(&status).unwrap();
        assert!(json.contains("Failed"));
        assert!(json.contains("test error"));
    }
}
