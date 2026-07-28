//! Bounded in-memory request claim set.

use std::collections::{HashSet, VecDeque};
use std::sync::Mutex;

/// Claims each authenticated request ID at most once for the life of the
/// process, evicting oldest entries at a fixed bound.
pub struct RequestDeduplicator {
    capacity: usize,
    state: Mutex<State>,
}

#[derive(Default)]
struct State {
    ids: HashSet<String>,
    order: VecDeque<String>,
}

impl RequestDeduplicator {
    #[must_use]
    pub fn new(capacity: usize) -> Self {
        assert!(capacity > 0, "dedupe capacity must be nonzero");
        Self {
            capacity,
            state: Mutex::new(State::default()),
        }
    }

    /// Return `true` only for the first claim of an ID currently retained.
    pub fn claim(&self, id: &str) -> bool {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if state.ids.contains(id) {
            return false;
        }

        let id = id.to_owned();
        state.ids.insert(id.clone());
        state.order.push_back(id);
        while state.ids.len() > self.capacity {
            if let Some(oldest) = state.order.pop_front() {
                state.ids.remove(&oldest);
            }
        }
        true
    }
}

#[cfg(test)]
mod tests {
    use super::RequestDeduplicator;

    #[test]
    fn duplicate_delivery_is_claimed_once_and_capacity_is_bounded() {
        let dedupe = RequestDeduplicator::new(2);
        assert!(dedupe.claim("a"));
        assert!(!dedupe.claim("a"));
        assert!(dedupe.claim("b"));
        assert!(dedupe.claim("c"));
        assert!(dedupe.claim("a"), "oldest request should have been evicted");
    }
}
