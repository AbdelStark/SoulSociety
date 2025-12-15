//! Soul Core - Shared types and utilities for Soul Society
//!
//! This crate provides the foundational types used across all Soul Society components:
//! - DVM service providers
//! - Web frontend (via TypeScript SDK)
//! - WASM verification bindings

pub mod constants;
pub mod nostr_events;
pub mod types;

pub use constants::*;
pub use nostr_events::*;
pub use types::*;
