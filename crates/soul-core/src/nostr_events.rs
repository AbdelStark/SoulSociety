//! Nostr event parsing helpers for Soul Society
//!
//! This module provides utilities for parsing NIP-90 DVM events.

use crate::constants::dvm_kinds;
use crate::types::{JobInput, JobRequest, ServiceType};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

/// Result content structure for DVM responses
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultContent {
    /// Service output
    pub result: serde_json::Value,
    /// STARK proof
    pub proof: serde_json::Value,
}

impl ServiceType {
    /// Get the request event kind for this service
    pub fn request_kind(&self) -> u32 {
        match self {
            ServiceType::Fibonacci => dvm_kinds::FIBONACCI_REQUEST,
            ServiceType::HashVerify => dvm_kinds::HASH_VERIFY_REQUEST,
            ServiceType::MerkleProof => dvm_kinds::MERKLE_PROOF_REQUEST,
        }
    }

    /// Get the result event kind for this service
    pub fn result_kind(&self) -> u32 {
        match self {
            ServiceType::Fibonacci => dvm_kinds::FIBONACCI_RESULT,
            ServiceType::HashVerify => dvm_kinds::HASH_VERIFY_RESULT,
            ServiceType::MerkleProof => dvm_kinds::MERKLE_PROOF_RESULT,
        }
    }

    /// Parse service type from event kind
    pub fn from_kind(kind: u32) -> Option<Self> {
        match kind {
            dvm_kinds::FIBONACCI_REQUEST | dvm_kinds::FIBONACCI_RESULT => {
                Some(ServiceType::Fibonacci)
            }
            dvm_kinds::HASH_VERIFY_REQUEST | dvm_kinds::HASH_VERIFY_RESULT => {
                Some(ServiceType::HashVerify)
            }
            dvm_kinds::MERKLE_PROOF_REQUEST | dvm_kinds::MERKLE_PROOF_RESULT => {
                Some(ServiceType::MerkleProof)
            }
            _ => None,
        }
    }

    /// Check if the kind is a request kind
    pub fn is_request_kind(kind: u32) -> bool {
        dvm_kinds::REQUEST_KINDS.contains(&kind)
    }

    /// Check if the kind is a result kind
    pub fn is_result_kind(kind: u32) -> bool {
        dvm_kinds::RESULT_KINDS.contains(&kind)
    }
}

/// Parse a job request from Nostr event data
///
/// # Arguments
/// * `event_id` - The event ID
/// * `kind` - The event kind
/// * `pubkey` - The author's public key
/// * `created_at` - Unix timestamp
/// * `tags` - Event tags
/// * `content` - Event content
pub fn parse_job_request(
    event_id: &str,
    kind: u32,
    pubkey: &str,
    created_at: u64,
    tags: &[Vec<String>],
    _content: &str,
) -> Result<JobRequest> {
    let service = ServiceType::from_kind(kind)
        .ok_or_else(|| anyhow!("Unknown service kind: {}", kind))?;

    // Parse input from tags
    let input_tag = tags
        .iter()
        .find(|t| !t.is_empty() && t[0] == "i")
        .ok_or_else(|| anyhow!("Missing input tag"))?;

    let input_json = input_tag
        .get(1)
        .ok_or_else(|| anyhow!("Invalid input tag"))?;

    let input: JobInput = serde_json::from_str(input_json)?;

    // Parse bid from tags
    let bid_msats = tags
        .iter()
        .find(|t| !t.is_empty() && t[0] == "bid")
        .and_then(|t| t.get(1))
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);

    Ok(JobRequest {
        id: event_id.to_string(),
        service,
        input,
        bid_msats,
        customer_pubkey: pubkey.to_string(),
        created_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_service_type_kinds() {
        assert_eq!(ServiceType::Fibonacci.request_kind(), 5601);
        assert_eq!(ServiceType::Fibonacci.result_kind(), 6601);
        assert_eq!(ServiceType::HashVerify.request_kind(), 5602);
        assert_eq!(ServiceType::MerkleProof.request_kind(), 5603);
    }

    #[test]
    fn test_service_type_from_kind() {
        assert_eq!(ServiceType::from_kind(5601), Some(ServiceType::Fibonacci));
        assert_eq!(ServiceType::from_kind(6601), Some(ServiceType::Fibonacci));
        assert_eq!(ServiceType::from_kind(5602), Some(ServiceType::HashVerify));
        assert_eq!(ServiceType::from_kind(9999), None);
    }

    #[test]
    fn test_is_request_kind() {
        assert!(ServiceType::is_request_kind(5601));
        assert!(ServiceType::is_request_kind(5602));
        assert!(!ServiceType::is_request_kind(6601));
    }
}
