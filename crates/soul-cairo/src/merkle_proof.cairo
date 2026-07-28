//! Merkle proof verification program
//!
//! Verifies that a leaf is included in a Merkle tree given the root and proof path.

use core::array::{ArrayTrait, SpanTrait};
use core::poseidon::poseidon_hash_span;

/// Verify a Merkle proof
///
/// # Arguments
/// * `root` - The Merkle root
/// * `leaf` - The leaf to verify
/// * `proof` - Array of sibling hashes
/// * `index` - The index of the leaf in the tree
///
/// # Returns
/// `true` if the proof is valid, `false` otherwise
pub fn verify_merkle_proof(root: felt252, leaf: felt252, proof: Span<felt252>, index: u64) -> bool {
    let computed_root = compute_root(leaf, proof, index);
    computed_root == root
}

/// Compute the Merkle root from a leaf and proof
///
/// # Arguments
/// * `leaf` - The leaf value
/// * `proof` - Array of sibling hashes
/// * `index` - The index of the leaf
///
/// # Returns
/// The computed Merkle root
pub fn compute_root(leaf: felt252, proof: Span<felt252>, index: u64) -> felt252 {
    let mut current = leaf;
    let mut idx = index;
    let mut i: u32 = 0;

    loop {
        if i >= proof.len() {
            break;
        }

        let sibling = *proof.at(i);

        // Determine order based on index bit
        let mut data = ArrayTrait::new();
        if idx % 2 == 0 {
            // Current is on the left
            data.append(current);
            data.append(sibling);
        } else {
            // Current is on the right
            data.append(sibling);
            data.append(current);
        }

        current = poseidon_hash_span(data.span());
        idx = idx / 2;
        i += 1;
    }

    current
}

/// Hash two values together in the correct order for Merkle tree
fn hash_pair(left: felt252, right: felt252) -> felt252 {
    let mut data = ArrayTrait::new();
    data.append(left);
    data.append(right);
    poseidon_hash_span(data.span())
}

#[cfg(test)]
pub fn hash_pair_for_test(left: felt252, right: felt252) -> felt252 {
    hash_pair(left, right)
}

#[cfg(test)]
mod tests {
    use core::array::ArrayTrait;
    use super::{compute_root, hash_pair, verify_merkle_proof};

    #[test]
    fn test_single_element_tree() {
        // A tree with a single element has root = leaf
        let leaf: felt252 = 42;
        let proof: Array<felt252> = ArrayTrait::new();
        let computed = compute_root(leaf, proof.span(), 0);
        assert(computed == leaf, 'single element root = leaf');
    }

    #[test]
    fn test_two_element_tree() {
        // Build a simple 2-element tree
        let left: felt252 = 1;
        let right: felt252 = 2;
        let root = hash_pair(left, right);

        // Verify left leaf (index 0)
        let mut proof_left: Array<felt252> = ArrayTrait::new();
        proof_left.append(right);
        assert(verify_merkle_proof(root, left, proof_left.span(), 0), 'left leaf should verify');

        // Verify right leaf (index 1)
        let mut proof_right: Array<felt252> = ArrayTrait::new();
        proof_right.append(left);
        assert(verify_merkle_proof(root, right, proof_right.span(), 1), 'right leaf should verify');
    }

    #[test]
    fn test_invalid_proof() {
        // Build a 2-element tree
        let left: felt252 = 1;
        let right: felt252 = 2;
        let root = hash_pair(left, right);

        // Try to verify with wrong proof
        let mut wrong_proof: Array<felt252> = ArrayTrait::new();
        wrong_proof.append(999); // Wrong sibling
        assert(!verify_merkle_proof(root, left, wrong_proof.span(), 0), 'wrong proof should fail');
    }
}
