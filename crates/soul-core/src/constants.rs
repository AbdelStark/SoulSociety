//! Stable identifiers and defensive bounds for Soul Wire.

/// Soul Wire is an application-specific protocol which borrows the request/result
/// shape of Nostr data-vending events. It is not a claim of NIP-90 compliance.
pub const SOUL_WIRE_PROTOCOL: &str = "soul-society/1";

/// Identifier for the canonical Cairo executable dispatched by the provider.
pub const CAIRO_PROGRAM: &str = "soul-cairo-v1";

/// Serialized proof representation stored outside Nostr events.
pub const PROOF_FORMAT: &str = "stwo-cairo-json-v1";

/// Media type served by the proof artifact endpoint.
pub const PROOF_MEDIA_TYPE: &str = "application/vnd.soul-society.stwo-proof+json";

/// STWO commitment channel used by the canonical prover and browser verifier.
pub const PROOF_CHANNEL: &str = "blake2s";

/// Event kinds reserved by Soul Wire.
pub mod event_kinds {
    /// Fibonacci job request.
    pub const FIBONACCI_REQUEST: u16 = 5601;
    /// Hash-preimage verification request.
    pub const HASH_VERIFY_REQUEST: u16 = 5602;
    /// Merkle-membership verification request.
    pub const MERKLE_PROOF_REQUEST: u16 = 5603;

    /// Fibonacci result.
    pub const FIBONACCI_RESULT: u16 = 6601;
    /// Hash-preimage verification result.
    pub const HASH_VERIFY_RESULT: u16 = 6602;
    /// Merkle-membership verification result.
    pub const MERKLE_PROOF_RESULT: u16 = 6603;

    /// All Soul Wire request kinds.
    pub const REQUESTS: [u16; 3] = [FIBONACCI_REQUEST, HASH_VERIFY_REQUEST, MERKLE_PROOF_REQUEST];

    /// All Soul Wire result kinds.
    pub const RESULTS: [u16; 3] = [FIBONACCI_RESULT, HASH_VERIFY_RESULT, MERKLE_PROOF_RESULT];
}

/// Bounds applied before a request reaches the prover.
pub mod limits {
    /// Fibonacci(364) exceeds the Cairo field modulus.
    pub const MAX_FIBONACCI_N: u64 = 363;
    /// Maximum private Merkle authentication path.
    pub const MAX_MERKLE_DEPTH: usize = 32;
    /// Maximum serialized request content accepted from a relay.
    pub const MAX_REQUEST_BYTES: usize = 16 * 1024;
    /// Maximum serialized result content accepted by clients.
    pub const MAX_RESULT_BYTES: usize = 32 * 1024;
    /// Maximum externally stored proof artifact.
    pub const MAX_PROOF_BYTES: u64 = 32 * 1024 * 1024;
    /// Maximum age of a newly observed request.
    pub const MAX_REQUEST_AGE_SECS: u64 = 10 * 60;
    /// Maximum clock skew tolerated for request timestamps.
    pub const MAX_FUTURE_SKEW_SECS: u64 = 5 * 60;
    /// Maximum explicit request lifetime.
    pub const MAX_REQUEST_TTL_SECS: u64 = 60 * 60;
    /// Largest integer shared exactly by Rust and JavaScript implementations.
    pub const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;
    /// Maximum number of request IDs retained by the in-memory deduplicator.
    pub const MAX_DEDUPE_ENTRIES: usize = 10_000;
}

/// Cairo's prime field modulus, left-padded to 64 hexadecimal nibbles.
pub const CAIRO_PRIME_HEX: &str =
    "0800000000000011000000000000000000000000000000000000000000000001";

#[cfg(test)]
mod tests {
    use super::event_kinds;

    #[test]
    fn request_and_result_kinds_are_paired() {
        assert_eq!(
            event_kinds::FIBONACCI_RESULT,
            event_kinds::FIBONACCI_REQUEST + 1000
        );
        assert_eq!(
            event_kinds::HASH_VERIFY_RESULT,
            event_kinds::HASH_VERIFY_REQUEST + 1000
        );
        assert_eq!(
            event_kinds::MERKLE_PROOF_RESULT,
            event_kinds::MERKLE_PROOF_REQUEST + 1000
        );
    }
}
