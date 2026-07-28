//! Cairo-authoritative STWO proof engine for Soul Society.
//!
//! [`VerifiableJobEngine`] is the only runtime proving interface. It executes
//! the Scarb-built Cairo executable, adapts the Cairo VM trace, proves with
//! stwo-cairo 1.3.0 at its production parameters, serializes the optimized Rust
//! verifier proof, then re-parses and verifies those exact bytes. A proof is
//! returned only if its program hash matches an independently supplied pin and
//! its decoded public output matches a typed Soul Cairo statement.
//!
//! Build expectation:
//!
//! ```text
//! cd crates/soul-cairo
//! scarb build
//! # target/dev/soul_cairo.executable.json
//! ```

mod executor;
pub mod prover;
pub mod statement;
pub mod verifier;

pub use prover::*;
pub use statement::validate_statement;
pub use verifier::*;
