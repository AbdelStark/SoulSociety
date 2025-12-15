//! Soul WASM - Browser verification bindings for Soul Society
//!
//! This crate provides WASM bindings that allow browsers to verify STARK proofs
//! directly without requiring a server round-trip.

use soul_prover::{SerializedProof, StwoVerifier};
use wasm_bindgen::prelude::*;

/// Initialize panic hook for better error messages in the browser console
#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(feature = "panic_hook")]
    console_error_panic_hook::set_once();
}

/// WASM-compatible verifier for STARK proofs
#[wasm_bindgen]
pub struct WasmVerifier;

#[wasm_bindgen]
impl WasmVerifier {
    /// Create a new verifier instance
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_panic_hook();
        Self
    }

    /// Verify a STARK proof
    ///
    /// # Arguments
    /// * `proof_bytes` - The serialized proof bytes
    /// * `public_inputs_json` - JSON array of public inputs as strings
    ///
    /// # Returns
    /// * `true` if the proof is valid, `false` otherwise
    #[wasm_bindgen]
    pub fn verify_proof(
        &self,
        proof_bytes: &[u8],
        public_inputs_json: &str,
    ) -> Result<bool, JsValue> {
        let public_inputs: Vec<String> = serde_json::from_str(public_inputs_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse public inputs: {}", e)))?;

        let proof = SerializedProof {
            bytes: proof_bytes.to_vec(),
            commitment: String::new(), // Commitment is derived from bytes
        };

        StwoVerifier::verify(&proof, &public_inputs)
            .map_err(|e| JsValue::from_str(&format!("Verification failed: {}", e)))
    }
}

impl Default for WasmVerifier {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasm_verifier() {
        let verifier = WasmVerifier::new();
        let proof_bytes = vec![1, 2, 3, 4];
        let public_inputs = r#"["input1", "input2"]"#;

        let result = verifier.verify_proof(&proof_bytes, public_inputs);
        assert!(result.is_ok());
    }
}
