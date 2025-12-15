//! Nostr event handler for DVM job requests
//!
//! TODO: Implement full event handling with nostr-sdk

/// Nostr event handler
pub struct NostrEventHandler;

impl NostrEventHandler {
    /// Create a new event handler
    pub fn new() -> Self {
        Self
    }
}

impl Default for NostrEventHandler {
    fn default() -> Self {
        Self::new()
    }
}
