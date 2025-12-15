//! Fibonacci service implementation
//!
//! TODO: Implement full service with Cairo execution and proof generation

/// Fibonacci DVM service
pub struct FibonacciService;

impl FibonacciService {
    /// Create a new service instance
    pub fn new() -> Self {
        Self
    }
}

impl Default for FibonacciService {
    fn default() -> Self {
        Self::new()
    }
}
