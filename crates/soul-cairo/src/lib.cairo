//! Canonical Soul Society computation.
//!
//! Build this package with Scarb 2.15.x. The executable artifact at
//! `target/dev/soul_cairo.executable.json` is the program consumed by
//! `soul-prover`. Its return value is the proof's public statement:
//! `(service, public_input, public_output)`. `private_input` participates in
//! execution but is deliberately absent from that public output.

use core::num::traits::Pow;

mod fibonacci;
mod hash_verifier;
mod merkle_proof;

pub use fibonacci::compute_fibonacci;
pub use hash_verifier::verify_hash;
pub use merkle_proof::verify_merkle_proof;

const FIBONACCI_SERVICE: u8 = 1;
const HASH_VERIFY_SERVICE: u8 = 2;
const MERKLE_PROOF_SERVICE: u8 = 3;
const MAX_FIBONACCI_N: u64 = 363;
const MAX_MERKLE_DEPTH: u32 = 32;

/// Execute one supported computation.
///
/// The flattened Cairo Serde arguments are:
/// `service, public_input_len, public_input..., private_input_len, private_input...`.
///
/// - Fibonacci: public `[n]`, private `[]`
/// - Hash verification: public `[expected_poseidon_hash]`, private `[preimage]`
/// - Merkle verification: public `[root, leaf, index]`, private `[siblings...]`
#[executable]
fn main(
    service: u8, public_input: Array<felt252>, private_input: Array<felt252>,
) -> (u8, Array<felt252>, Array<felt252>) {
    let public = public_input.span();
    let private = private_input.span();
    let mut output = array![];

    if service == FIBONACCI_SERVICE {
        assert(public.len() == 1, 'invalid public input');
        assert(private.is_empty(), 'invalid private input');
        let n: u64 = (*public.at(0)).try_into().expect('n does not fit u64');
        assert(n <= MAX_FIBONACCI_N, 'fibonacci n too large');
        output.append(compute_fibonacci(n));
    } else if service == HASH_VERIFY_SERVICE {
        assert(public.len() == 1, 'invalid public input');
        assert(private.len() == 1, 'invalid private input');
        let valid = verify_hash(*public.at(0), *private.at(0));
        output.append(if valid {
            1
        } else {
            0
        });
    } else if service == MERKLE_PROOF_SERVICE {
        assert(public.len() == 3, 'invalid public input');
        assert(private.len() <= MAX_MERKLE_DEPTH, 'merkle path too deep');
        let index: u64 = (*public.at(2)).try_into().expect('index does not fit u64');
        let depth: u32 = private.len();
        let max_index = 2_u64.pow(depth);
        assert(index < max_index, 'index exceeds path');
        let valid = verify_merkle_proof(*public.at(0), *public.at(1), private, index);
        output.append(if valid {
            1
        } else {
            0
        });
    } else {
        panic!("unsupported service");
    }

    (service, public_input, output)
}

#[cfg(test)]
mod executable_tests {
    use super::{hash_verifier, main, merkle_proof};

    #[test]
    fn public_statement_excludes_private_hash_preimage() {
        let expected = hash_verifier::compute_hash(42);
        let (service, public_input, output) = main(2, array![expected], array![42]);
        assert(service == 2, 'wrong service');
        assert(public_input == array![expected], 'wrong public input');
        assert(output == array![1], 'wrong output');
    }

    #[test]
    fn merkle_statement_excludes_sibling_path() {
        let sibling = 9;
        let root = merkle_proof::hash_pair_for_test(7, sibling);
        let (_, public_input, output) = main(3, array![root, 7, 0], array![sibling]);
        assert(public_input == array![root, 7, 0], 'wrong public input');
        assert(output == array![1], 'wrong output');
    }

    #[test]
    #[should_panic]
    fn rejects_fibonacci_outside_field_safe_range() {
        main(1, array![364], array![]);
    }

    #[test]
    #[should_panic]
    fn rejects_merkle_index_outside_path() {
        main(3, array![0, 0, 2], array![0]);
    }
}
