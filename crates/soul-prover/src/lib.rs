//! Soul Prover - STWO prover integration for Soul Society
//!
//! This crate provides:
//! - STARK proof generation using STWO
//! - Proof verification
//! - Serialization utilities for proofs

pub mod prover;
pub mod verifier;

pub use prover::*;
pub use verifier::*;
