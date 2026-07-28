//! Browser-local verifier for Soul Cairo STWO proofs.
//!
//! The WASM bundle contains only the STWO/Cairo AIR verifier. It does not link
//! the Cairo VM or prover. Callers must independently obtain a trusted program
//! hash and construct the expected public statement from the original request;
//! neither value is trusted when copied from a result event.

use std::panic::{catch_unwind, AssertUnwindSafe};

use cairo_air::utils::get_verification_output;
use cairo_air::verifier::verify_cairo;
use cairo_air::CairoProofForRustVerifier;
use soul_core::{limits, FeltHex, JobOutput, ProofStatement, ServiceType, CAIRO_PROGRAM};
use starknet_ff::FieldElement;
use stwo::core::fri::FriConfig;
use stwo::core::pcs::PcsConfig;
use stwo::core::vcs_lifted::blake2_merkle::{Blake2sMerkleChannel, Blake2sMerkleHasher};
use stwo_cairo_common::preprocessed_columns::preprocessed_trace::PreProcessedTraceVariant;
use thiserror::Error;
use wasm_bindgen::prelude::*;

/// Install a one-time console panic hook for actionable diagnostics.
#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(feature = "panic_hook")]
    console_error_panic_hook::set_once();
}

/// Stateless browser verifier.
#[wasm_bindgen]
pub struct WasmVerifier;

impl Default for WasmVerifier {
    fn default() -> Self {
        Self::new()
    }
}

#[wasm_bindgen]
impl WasmVerifier {
    /// Create a verifier. The generated JavaScript constructor is stable across
    /// wasm-bindgen releases.
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        init_panic_hook();
        Self
    }

    /// Verify canonical `stwo-cairo-json-v1` bytes against independent trust
    /// inputs.
    ///
    /// `expected_statement_json` is the canonical JSON representation of
    /// `soul_core::ProofStatement`. The method returns `true` only after STWO
    /// verification, trusted program hash comparison, exact raw public
    /// input/output comparison, and typed output comparison all succeed.
    #[wasm_bindgen(js_name = verifyProof)]
    pub fn verify_proof(
        &self,
        proof_bytes: &[u8],
        expected_program_hash: &str,
        expected_statement_json: &str,
    ) -> Result<bool, JsValue> {
        verify_proof_impl(proof_bytes, expected_program_hash, expected_statement_json)
            .map(|()| true)
            .map_err(|error| JsValue::from_str(&error.to_string()))
    }
}

#[derive(Debug, Error)]
enum BrowserVerificationError {
    #[error("proof exceeds the {0}-byte limit")]
    ProofTooLarge(u64),
    #[error("invalid expected program hash")]
    InvalidExpectedProgramHash,
    #[error("invalid expected statement: {0}")]
    InvalidExpectedStatement(String),
    #[error("malformed STWO proof")]
    MalformedProof,
    #[error("STWO proof verification failed")]
    InvalidProof,
    #[error("proof does not use the required 96-bit STWO verifier profile")]
    UnsupportedProofProfile,
    #[error("invalid Soul Cairo public output: {0}")]
    InvalidOutput(&'static str),
    #[error("Cairo program hash mismatch")]
    ProgramHashMismatch,
    #[error("proof statement mismatch")]
    StatementMismatch,
}

fn verify_proof_impl(
    proof_bytes: &[u8],
    expected_program_hash: &str,
    expected_statement_json: &str,
) -> Result<(), BrowserVerificationError> {
    if proof_bytes.len() as u64 > limits::MAX_PROOF_BYTES {
        return Err(BrowserVerificationError::ProofTooLarge(
            limits::MAX_PROOF_BYTES,
        ));
    }
    let expected_program_hash = FeltHex::parse(expected_program_hash.to_owned())
        .map_err(|_| BrowserVerificationError::InvalidExpectedProgramHash)?;
    let expected_statement: ProofStatement = serde_json::from_str(expected_statement_json)
        .map_err(|error| BrowserVerificationError::InvalidExpectedStatement(error.to_string()))?;
    validate_statement(&expected_statement)?;

    let proof: CairoProofForRustVerifier<Blake2sMerkleHasher> = serde_json::from_slice(proof_bytes)
        .map_err(|_| BrowserVerificationError::MalformedProof)?;
    validate_proof_profile(
        &proof.stark_proof.0.config,
        proof.preprocessed_trace_variant,
    )?;
    let proof_for_verification = proof.clone();
    let verification = catch_unwind(AssertUnwindSafe(move || {
        verify_cairo::<Blake2sMerkleChannel>(proof_for_verification)
    }))
    .map_err(|_| BrowserVerificationError::InvalidProof)?;
    verification.map_err(|_| BrowserVerificationError::InvalidProof)?;

    let public_data = catch_unwind(AssertUnwindSafe(|| {
        get_verification_output(&proof.claim.public_data.public_memory)
    }))
    .map_err(|_| BrowserVerificationError::InvalidProof)?;
    let program_hash = field_to_felt(&public_data.program_hash)?;
    if program_hash != expected_program_hash {
        return Err(BrowserVerificationError::ProgramHashMismatch);
    }
    let statement = decode_statement(&public_data.output)?;
    if statement != expected_statement {
        return Err(BrowserVerificationError::StatementMismatch);
    }
    Ok(())
}

fn required_pcs_config() -> PcsConfig {
    PcsConfig {
        pow_bits: 26,
        fri_config: FriConfig {
            log_last_layer_degree_bound: 0,
            log_blowup_factor: 1,
            n_queries: 70,
            fold_step: 1,
        },
        lifting_log_size: None,
    }
}

fn validate_proof_profile(
    config: &PcsConfig,
    preprocessed_trace_variant: PreProcessedTraceVariant,
) -> Result<(), BrowserVerificationError> {
    if config != &required_pcs_config()
        || preprocessed_trace_variant != PreProcessedTraceVariant::Canonical
    {
        return Err(BrowserVerificationError::UnsupportedProofProfile);
    }
    Ok(())
}

fn decode_statement(output: &[FieldElement]) -> Result<ProofStatement, BrowserVerificationError> {
    let mut cursor = 0;
    let service_id = take_u64(output, &mut cursor, "missing service")?;
    let public_input_len = take_len(output, &mut cursor, "missing public input length")?;
    let public_input = take_felts(
        output,
        &mut cursor,
        public_input_len,
        "truncated public input",
    )?;
    let public_output_len = take_len(output, &mut cursor, "missing public output length")?;
    let public_output = take_felts(
        output,
        &mut cursor,
        public_output_len,
        "truncated public output",
    )?;
    if cursor != output.len() {
        return Err(BrowserVerificationError::InvalidOutput(
            "trailing output values",
        ));
    }

    let (service, typed_output) = match service_id {
        1 if public_input.len() == 1 && public_output.len() == 1 => (
            ServiceType::Fibonacci,
            JobOutput::Fibonacci {
                result: public_output[0].clone(),
            },
        ),
        2 if public_input.len() == 1 && public_output.len() == 1 => (
            ServiceType::HashVerify,
            JobOutput::HashVerify {
                valid: decode_boolean(&public_output[0])?,
            },
        ),
        3 if public_input.len() == 3 && public_output.len() == 1 => (
            ServiceType::MerkleProof,
            JobOutput::MerkleProof {
                valid: decode_boolean(&public_output[0])?,
            },
        ),
        1..=3 => {
            return Err(BrowserVerificationError::InvalidOutput(
                "service input/output arity mismatch",
            ));
        }
        _ => {
            return Err(BrowserVerificationError::InvalidOutput(
                "unsupported service id",
            ));
        }
    };
    let statement = ProofStatement {
        service,
        program: CAIRO_PROGRAM.to_owned(),
        public_input,
        public_output,
        output: typed_output,
    };
    validate_statement(&statement)?;
    Ok(statement)
}

fn validate_statement(statement: &ProofStatement) -> Result<(), BrowserVerificationError> {
    statement
        .validate()
        .map_err(|error| BrowserVerificationError::InvalidExpectedStatement(error.to_string()))?;
    match (&statement.service, &statement.output) {
        (ServiceType::Fibonacci, JobOutput::Fibonacci { result })
            if statement.public_input.len() == 1
                && statement.public_output.as_slice() == [result.clone()] =>
        {
            Ok(())
        }
        (ServiceType::HashVerify, JobOutput::HashVerify { valid })
            if statement.public_input.len() == 1
                && statement.public_output.as_slice() == [FeltHex::from_u64(u64::from(*valid))] =>
        {
            Ok(())
        }
        (ServiceType::MerkleProof, JobOutput::MerkleProof { valid })
            if statement.public_input.len() == 3
                && statement.public_output.as_slice() == [FeltHex::from_u64(u64::from(*valid))] =>
        {
            Ok(())
        }
        _ => Err(BrowserVerificationError::InvalidExpectedStatement(
            "service, arity, raw output, and typed output disagree".to_owned(),
        )),
    }
}

fn field_to_felt(value: &FieldElement) -> Result<FeltHex, BrowserVerificationError> {
    FeltHex::parse(format!("0x{}", hex::encode(value.to_bytes_be())))
        .map_err(|_| BrowserVerificationError::InvalidOutput("non-canonical field element"))
}

fn take_len(
    output: &[FieldElement],
    cursor: &mut usize,
    error: &'static str,
) -> Result<usize, BrowserVerificationError> {
    usize::try_from(take_u64(output, cursor, error)?)
        .map_err(|_| BrowserVerificationError::InvalidOutput("array length is too large"))
}

fn take_u64(
    output: &[FieldElement],
    cursor: &mut usize,
    error: &'static str,
) -> Result<u64, BrowserVerificationError> {
    let value = output
        .get(*cursor)
        .ok_or(BrowserVerificationError::InvalidOutput(error))?;
    *cursor += 1;
    let bytes = value.to_bytes_be();
    if bytes[..24].iter().any(|byte| *byte != 0) {
        return Err(BrowserVerificationError::InvalidOutput(
            "integer output does not fit u64",
        ));
    }
    Ok(u64::from_be_bytes(bytes[24..].try_into().map_err(
        |_| BrowserVerificationError::InvalidOutput("invalid integer encoding"),
    )?))
}

fn take_felts(
    output: &[FieldElement],
    cursor: &mut usize,
    len: usize,
    error: &'static str,
) -> Result<Vec<FeltHex>, BrowserVerificationError> {
    let end = cursor
        .checked_add(len)
        .ok_or(BrowserVerificationError::InvalidOutput(
            "array length overflow",
        ))?;
    let values = output
        .get(*cursor..end)
        .ok_or(BrowserVerificationError::InvalidOutput(error))?;
    *cursor = end;
    values.iter().map(field_to_felt).collect()
}

fn decode_boolean(value: &FeltHex) -> Result<bool, BrowserVerificationError> {
    if value == &FeltHex::from_u64(0) {
        Ok(false)
    } else if value == &FeltHex::from_u64(1) {
        Ok(true)
    } else {
        Err(BrowserVerificationError::InvalidOutput(
            "boolean output must be zero or one",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HASH: &str = "0x0000000000000000000000000000000000000000000000000000000000000000";
    const STATEMENT: &str = r#"{"service":"fibonacci","program":"soul-cairo-v1","public_input":["0x000000000000000000000000000000000000000000000000000000000000000a"],"public_output":["0x0000000000000000000000000000000000000000000000000000000000000037"],"output":{"type":"fibonacci","result":"0x0000000000000000000000000000000000000000000000000000000000000037"}}"#;

    #[test]
    fn malformed_proof_is_rejected_without_panic() {
        let result = catch_unwind(|| verify_proof_impl(b"not-json", HASH, STATEMENT));
        assert!(result.is_ok());
        assert!(result.unwrap().is_err());
    }

    #[test]
    fn oversized_proof_is_rejected_before_parsing() {
        let proof = vec![0_u8; limits::MAX_PROOF_BYTES as usize + 1];
        assert!(matches!(
            verify_proof_impl(&proof, HASH, STATEMENT),
            Err(BrowserVerificationError::ProofTooLarge(_))
        ));
    }

    #[test]
    fn weaker_or_different_verifier_profiles_are_rejected() {
        validate_proof_profile(&required_pcs_config(), PreProcessedTraceVariant::Canonical)
            .unwrap();
        let mut weak = required_pcs_config();
        weak.fri_config.n_queries = 1;
        assert!(matches!(
            validate_proof_profile(&weak, PreProcessedTraceVariant::Canonical),
            Err(BrowserVerificationError::UnsupportedProofProfile)
        ));
        assert!(matches!(
            validate_proof_profile(
                &required_pcs_config(),
                PreProcessedTraceVariant::CanonicalWithoutPedersen,
            ),
            Err(BrowserVerificationError::UnsupportedProofProfile)
        ));
    }

    #[cfg(feature = "real-proof-fixture")]
    mod real_fixture {
        use super::*;

        const PROOF: &[u8] =
            include_bytes!("../../../protocol/fixtures/generated/fibonacci-10.proof.json");
        const EXPECTED_STATEMENT: &str =
            include_str!("../../../protocol/fixtures/generated/fibonacci-10.statement.json");
        const MANIFEST: &str = include_str!("../../../protocol/programs.json");

        fn program_hash() -> String {
            let manifest = serde_json::from_str::<serde_json::Value>(MANIFEST).unwrap();
            manifest
                .get("program_hash")
                .or_else(|| {
                    manifest
                        .get("programs")?
                        .get(CAIRO_PROGRAM)?
                        .get("program_hash")
                })
                .and_then(serde_json::Value::as_str)
                .unwrap()
                .to_owned()
        }

        #[test]
        fn verifies_real_stwo_fixture_and_rejects_mutation() {
            let hash = program_hash();
            verify_proof_impl(PROOF, &hash, EXPECTED_STATEMENT).unwrap();

            assert!(
                verify_proof_impl(PROOF, FeltHex::from_u64(0).as_str(), EXPECTED_STATEMENT,)
                    .is_err()
            );
            let mut changed_input: serde_json::Value =
                serde_json::from_str(EXPECTED_STATEMENT).unwrap();
            changed_input["public_input"][0] =
                serde_json::Value::String(FeltHex::from_u64(11).to_string());
            assert!(verify_proof_impl(
                PROOF,
                &hash,
                &serde_json::to_string(&changed_input).unwrap(),
            )
            .is_err());
            let mut changed_output: serde_json::Value =
                serde_json::from_str(EXPECTED_STATEMENT).unwrap();
            changed_output["public_output"][0] =
                serde_json::Value::String(FeltHex::from_u64(56).to_string());
            changed_output["output"]["result"] =
                serde_json::Value::String(FeltHex::from_u64(56).to_string());
            assert!(verify_proof_impl(
                PROOF,
                &hash,
                &serde_json::to_string(&changed_output).unwrap(),
            )
            .is_err());

            let mut weak: CairoProofForRustVerifier<Blake2sMerkleHasher> =
                serde_json::from_slice(PROOF).unwrap();
            weak.stark_proof.0.config.pow_bits = 0;
            assert!(matches!(
                verify_proof_impl(
                    &serde_json::to_vec(&weak).unwrap(),
                    &hash,
                    EXPECTED_STATEMENT,
                ),
                Err(BrowserVerificationError::UnsupportedProofProfile)
            ));

            let mut tampered = PROOF.to_vec();
            let midpoint = tampered.len() / 2;
            tampered[midpoint] ^= 1;
            assert!(verify_proof_impl(&tampered, &hash, EXPECTED_STATEMENT).is_err());
        }

        #[cfg(target_arch = "wasm32")]
        #[wasm_bindgen_test::wasm_bindgen_test]
        fn wasm_verifies_real_stwo_fixture_and_rejects_mutation() {
            verifies_real_stwo_fixture_and_rejects_mutation();
        }
    }
}
