//! Soul Cairo - Verifiable computation programs for Soul Society
//!
//! This library contains Cairo programs that can be executed and proven
//! using STWO to generate STARK proofs.

mod fibonacci;
mod hash_verifier;
mod merkle_proof;

// Re-export main functions for each service
pub use fibonacci::compute_fibonacci;
pub use hash_verifier::verify_hash;
pub use merkle_proof::verify_merkle_proof;
