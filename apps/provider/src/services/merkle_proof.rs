//! Merkle proof verification service implementation
//!
//! TODO: Implement full service with Cairo execution and proof generation

/// Merkle proof verification DVM service
pub struct MerkleProofService;

impl MerkleProofService {
    /// Create a new service instance
    pub fn new() -> Self {
        Self
    }
}

impl Default for MerkleProofService {
    fn default() -> Self {
        Self::new()
    }
}
