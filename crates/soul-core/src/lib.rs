//! Shared Soul Wire types, validation, and proof statements.
//!
//! The Nostr event codec is a default feature for native clients/providers and
//! can be disabled by portable verifier builds that need only typed statements.

pub mod constants;
#[cfg(feature = "nostr-events")]
pub mod nostr_events;
pub mod types;

pub use constants::*;
#[cfg(feature = "nostr-events")]
pub use nostr_events::*;
pub use types::*;
