//! Constants for Soul Society
//!
//! This module defines the Nostr event kinds and other constants.

/// DVM event kinds (NIP-90 extension)
pub mod dvm_kinds {
    /// Fibonacci job request kind
    pub const FIBONACCI_REQUEST: u32 = 5601;
    /// Hash verification job request kind
    pub const HASH_VERIFY_REQUEST: u32 = 5602;
    /// Merkle proof job request kind
    pub const MERKLE_PROOF_REQUEST: u32 = 5603;

    /// Fibonacci job result kind
    pub const FIBONACCI_RESULT: u32 = 6601;
    /// Hash verification job result kind
    pub const HASH_VERIFY_RESULT: u32 = 6602;
    /// Merkle proof job result kind
    pub const MERKLE_PROOF_RESULT: u32 = 6603;

    /// All request kinds
    pub const REQUEST_KINDS: [u32; 3] = [
        FIBONACCI_REQUEST,
        HASH_VERIFY_REQUEST,
        MERKLE_PROOF_REQUEST,
    ];

    /// All result kinds
    pub const RESULT_KINDS: [u32; 3] = [
        FIBONACCI_RESULT,
        HASH_VERIFY_RESULT,
        MERKLE_PROOF_RESULT,
    ];
}

/// Default Nostr relays
pub const DEFAULT_RELAYS: [&str; 3] = [
    "wss://relay.damus.io",
    "wss://relay.nostr.band",
    "wss://nos.lol",
];

/// Maximum input bounds
pub mod limits {
    /// Maximum n for Fibonacci computation
    pub const MAX_FIBONACCI_N: u64 = 1000;
    /// Maximum proof path length for Merkle proofs
    pub const MAX_MERKLE_DEPTH: usize = 32;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_result_kind_pairing() {
        // Result kinds should be request kinds + 1000
        assert_eq!(
            dvm_kinds::FIBONACCI_RESULT,
            dvm_kinds::FIBONACCI_REQUEST + 1000
        );
        assert_eq!(
            dvm_kinds::HASH_VERIFY_RESULT,
            dvm_kinds::HASH_VERIFY_REQUEST + 1000
        );
        assert_eq!(
            dvm_kinds::MERKLE_PROOF_RESULT,
            dvm_kinds::MERKLE_PROOF_REQUEST + 1000
        );
    }
}
