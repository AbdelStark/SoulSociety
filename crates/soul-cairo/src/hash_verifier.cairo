//! Hash verification program
//!
//! Verifies that a preimage hashes to an expected hash value using Poseidon.

use core::poseidon::poseidon_hash_span;
use core::array::ArrayTrait;

/// Verify that a preimage hashes to the expected hash
///
/// # Arguments
/// * `expected_hash` - The expected hash value
/// * `preimage` - The preimage to verify
///
/// # Returns
/// `true` if the hash of preimage equals expected_hash, `false` otherwise
pub fn verify_hash(expected_hash: felt252, preimage: felt252) -> bool {
    // Compute hash of preimage using Poseidon
    let mut data = ArrayTrait::new();
    data.append(preimage);
    let computed_hash = poseidon_hash_span(data.span());

    // Return comparison result
    computed_hash == expected_hash
}

/// Compute the Poseidon hash of a single felt252
///
/// # Arguments
/// * `value` - The value to hash
///
/// # Returns
/// The Poseidon hash of the value
pub fn compute_hash(value: felt252) -> felt252 {
    let mut data = ArrayTrait::new();
    data.append(value);
    poseidon_hash_span(data.span())
}

#[cfg(test)]
mod tests {
    use super::{verify_hash, compute_hash};

    #[test]
    fn test_hash_verification() {
        // Compute hash of a known value
        let preimage: felt252 = 12345;
        let hash = compute_hash(preimage);

        // Verification should succeed with correct preimage
        assert(verify_hash(hash, preimage), 'should verify correct preimage');
    }

    #[test]
    fn test_hash_verification_fails() {
        // Compute hash of a known value
        let preimage: felt252 = 12345;
        let hash = compute_hash(preimage);

        // Verification should fail with wrong preimage
        let wrong_preimage: felt252 = 54321;
        assert(!verify_hash(hash, wrong_preimage), 'should fail wrong preimage');
    }

    #[test]
    fn test_hash_consistency() {
        // Same input should always produce same hash
        let value: felt252 = 42;
        let hash1 = compute_hash(value);
        let hash2 = compute_hash(value);
        assert(hash1 == hash2, 'hash should be consistent');
    }
}
