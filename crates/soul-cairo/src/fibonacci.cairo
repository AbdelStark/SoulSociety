//! Fibonacci computation program
//!
//! Computes the n-th Fibonacci number with public inputs/outputs for STARK proving.

/// Compute the n-th Fibonacci number
///
/// # Arguments
/// * `n` - Which Fibonacci number to compute (0-indexed)
///
/// # Returns
/// The n-th Fibonacci number as felt252
pub fn compute_fibonacci(n: u64) -> felt252 {
    if n == 0 {
        return 0;
    }
    if n == 1 {
        return 1;
    }

    let mut a: felt252 = 0;
    let mut b: felt252 = 1;
    let mut i: u64 = 2;

    loop {
        if i > n {
            break;
        }
        let temp = b;
        b = a + b;
        a = temp;
        i += 1;
    }

    b
}

#[cfg(test)]
mod tests {
    use super::compute_fibonacci;

    #[test]
    fn test_fibonacci_base_cases() {
        assert(compute_fibonacci(0) == 0, 'fib(0) should be 0');
        assert(compute_fibonacci(1) == 1, 'fib(1) should be 1');
    }

    #[test]
    fn test_fibonacci_sequence() {
        assert(compute_fibonacci(2) == 1, 'fib(2) should be 1');
        assert(compute_fibonacci(3) == 2, 'fib(3) should be 2');
        assert(compute_fibonacci(4) == 3, 'fib(4) should be 3');
        assert(compute_fibonacci(5) == 5, 'fib(5) should be 5');
        assert(compute_fibonacci(10) == 55, 'fib(10) should be 55');
    }

    #[test]
    fn test_fibonacci_larger() {
        assert(compute_fibonacci(20) == 6765, 'fib(20) should be 6765');
    }
}
