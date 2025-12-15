//! Fibonacci service implementation
//!
//! Computes Fibonacci numbers and generates STARK proofs of correct computation.

use anyhow::Result;
use tracing::{debug, info};

use soul_core::constants::limits;
use soul_core::types::{JobOutput, StarkProof};
use soul_prover::StwoProver;

/// Fibonacci DVM service
pub struct FibonacciService {
    prover: StwoProver,
}

impl FibonacciService {
    /// Create a new service instance
    pub fn new() -> Self {
        Self {
            prover: StwoProver::new(),
        }
    }

    /// Execute Fibonacci computation with proof generation
    pub async fn execute(&self, n: u64) -> Result<(JobOutput, StarkProof)> {
        // Validate input
        if n > limits::MAX_FIBONACCI_N {
            anyhow::bail!(
                "n={} exceeds maximum allowed value of {}",
                n,
                limits::MAX_FIBONACCI_N
            );
        }

        info!("Computing Fibonacci({})", n);

        // Compute Fibonacci number
        let result = self.compute_fibonacci(n);
        debug!("Fibonacci({}) = {}", n, result);

        // Generate proof
        let public_inputs = vec![n.to_string(), result.clone()];
        let proof = self.prover.prove(&public_inputs)?;

        let stark_proof = StarkProof {
            proof_bytes: proof.proof_bytes,
            commitment: proof.commitment,
            public_inputs,
        };

        let output = JobOutput::Fibonacci { result };

        info!("Generated proof for Fibonacci({})", n);

        Ok((output, stark_proof))
    }

    /// Compute the nth Fibonacci number
    fn compute_fibonacci(&self, n: u64) -> String {
        if n == 0 {
            return "0".to_string();
        }
        if n == 1 {
            return "1".to_string();
        }

        // Use string arithmetic for large numbers
        let mut prev2 = "0".to_string();
        let mut prev1 = "1".to_string();

        for _ in 2..=n {
            let next = add_big_numbers(&prev2, &prev1);
            prev2 = prev1;
            prev1 = next;
        }

        prev1
    }
}

impl Default for FibonacciService {
    fn default() -> Self {
        Self::new()
    }
}

/// Add two big numbers represented as strings
fn add_big_numbers(a: &str, b: &str) -> String {
    let a_bytes: Vec<u8> = a.bytes().rev().map(|b| b - b'0').collect();
    let b_bytes: Vec<u8> = b.bytes().rev().map(|b| b - b'0').collect();

    let max_len = a_bytes.len().max(b_bytes.len());
    let mut result = Vec::with_capacity(max_len + 1);
    let mut carry = 0u8;

    for i in 0..max_len {
        let a_digit = a_bytes.get(i).copied().unwrap_or(0);
        let b_digit = b_bytes.get(i).copied().unwrap_or(0);
        let sum = a_digit + b_digit + carry;
        result.push(sum % 10);
        carry = sum / 10;
    }

    if carry > 0 {
        result.push(carry);
    }

    result.into_iter().rev().map(|d| (d + b'0') as char).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fibonacci_small() {
        let service = FibonacciService::new();
        assert_eq!(service.compute_fibonacci(0), "0");
        assert_eq!(service.compute_fibonacci(1), "1");
        assert_eq!(service.compute_fibonacci(2), "1");
        assert_eq!(service.compute_fibonacci(10), "55");
        assert_eq!(service.compute_fibonacci(20), "6765");
    }

    #[test]
    fn test_add_big_numbers() {
        assert_eq!(add_big_numbers("123", "456"), "579");
        assert_eq!(add_big_numbers("999", "1"), "1000");
        assert_eq!(add_big_numbers("0", "0"), "0");
    }

    #[tokio::test]
    async fn test_execute() {
        let service = FibonacciService::new();
        let (output, proof) = service.execute(10).await.unwrap();

        if let JobOutput::Fibonacci { result } = output {
            assert_eq!(result, "55");
        } else {
            panic!("Wrong output type");
        }

        assert!(!proof.proof_bytes.is_empty());
        assert_eq!(proof.public_inputs.len(), 2);
    }
}
