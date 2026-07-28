//! Native STWO verification and Soul Cairo statement binding.

use std::panic::{catch_unwind, AssertUnwindSafe};

use cairo_air::utils::get_verification_output;
use cairo_air::verifier::verify_cairo;
use cairo_air::CairoProofForRustVerifier;
use soul_core::{limits, FeltHex, ProofStatement};
use stwo::core::fri::FriConfig;
use stwo::core::pcs::PcsConfig;
use stwo::core::vcs_lifted::blake2_merkle::{Blake2sMerkleChannel, Blake2sMerkleHasher};
use stwo_cairo_common::preprocessed_columns::preprocessed_trace::PreProcessedTraceVariant;
use thiserror::Error;

use crate::statement::{decode_statement, field_to_felt, validate_statement, StatementError};

/// Public data recovered only after cryptographic proof verification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VerifiedPublicData {
    /// Blake2s hash of the proven Cairo program memory.
    pub program_hash: FeltHex,
    /// Typed interpretation of the Cairo output segment.
    pub statement: ProofStatement,
}

/// A stable, non-panicking proof rejection reason.
#[derive(Debug, Error)]
pub enum VerificationError {
    /// Proofs larger than the protocol cap are rejected before parsing.
    #[error("proof exceeds the {0}-byte limit")]
    ProofTooLarge(u64),
    /// The JSON is not the canonical STWO Rust-verifier proof shape.
    #[error("malformed STWO proof: {0}")]
    MalformedProof(String),
    /// STWO rejected the proof or encountered an invalid claim.
    #[error("STWO proof verification failed")]
    InvalidProof,
    /// The proof selected parameters outside the reviewed verifier profile.
    #[error("proof does not use the required 96-bit STWO verifier profile")]
    UnsupportedProofProfile,
    /// The caller supplied a malformed trusted hash.
    #[error("invalid expected Cairo program hash")]
    InvalidExpectedProgramHash,
    /// A valid proof was produced by a different Cairo executable.
    #[error("Cairo program hash mismatch: expected {expected}, got {actual}")]
    ProgramHashMismatch { expected: FeltHex, actual: FeltHex },
    /// The valid proof binds different public facts than the caller expected.
    #[error("proof statement does not match the expected statement")]
    StatementMismatch,
    /// The proven Cairo output has an invalid Soul Cairo v1 shape.
    #[error(transparent)]
    InvalidStatement(#[from] StatementError),
}

/// Verify STWO JSON and recover its trusted public data.
///
/// The parser is size-bounded and verifier panics caused by adversarial claim
/// shapes are contained as ordinary proof rejection.
pub fn verify_and_decode(proof_json: &[u8]) -> Result<VerifiedPublicData, VerificationError> {
    if proof_json.len() as u64 > limits::MAX_PROOF_BYTES {
        return Err(VerificationError::ProofTooLarge(limits::MAX_PROOF_BYTES));
    }

    let proof: CairoProofForRustVerifier<Blake2sMerkleHasher> = serde_json::from_slice(proof_json)
        .map_err(|error| VerificationError::MalformedProof(error.to_string()))?;
    validate_proof_profile(
        &proof.stark_proof.0.config,
        proof.preprocessed_trace_variant,
    )?;

    let proof_for_verification = proof.clone();
    let verification = catch_unwind(AssertUnwindSafe(move || {
        verify_cairo::<Blake2sMerkleChannel>(proof_for_verification)
    }))
    .map_err(|_| VerificationError::InvalidProof)?;
    verification.map_err(|_| VerificationError::InvalidProof)?;

    let public_data = catch_unwind(AssertUnwindSafe(|| {
        get_verification_output(&proof.claim.public_data.public_memory)
    }))
    .map_err(|_| VerificationError::InvalidProof)?;
    let program_hash = field_to_felt(&public_data.program_hash)?;
    let statement = decode_statement(&public_data.output)?;
    Ok(VerifiedPublicData {
        program_hash,
        statement,
    })
}

pub(crate) fn required_pcs_config() -> PcsConfig {
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
) -> Result<(), VerificationError> {
    if config != &required_pcs_config()
        || preprocessed_trace_variant != PreProcessedTraceVariant::Canonical
    {
        return Err(VerificationError::UnsupportedProofProfile);
    }
    Ok(())
}

/// Verify a proof and bind it to an independently trusted program hash and
/// expected public statement.
pub fn verify_serialized(
    proof_json: &[u8],
    expected_program_hash: &str,
    expected_statement: &ProofStatement,
) -> Result<(), VerificationError> {
    let expected_program_hash = FeltHex::parse(expected_program_hash.to_owned())
        .map_err(|_| VerificationError::InvalidExpectedProgramHash)?;
    validate_statement(expected_statement)?;
    let verified = verify_and_decode(proof_json)?;

    if verified.program_hash != expected_program_hash {
        return Err(VerificationError::ProgramHashMismatch {
            expected: expected_program_hash,
            actual: verified.program_hash,
        });
    }
    if &verified.statement != expected_statement {
        return Err(VerificationError::StatementMismatch);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn malformed_json_is_rejected() {
        assert!(matches!(
            verify_and_decode(b"not-json"),
            Err(VerificationError::MalformedProof(_))
        ));
    }

    #[test]
    fn oversized_input_is_rejected_before_parsing() {
        let input = vec![0_u8; limits::MAX_PROOF_BYTES as usize + 1];
        assert!(matches!(
            verify_and_decode(&input),
            Err(VerificationError::ProofTooLarge(_))
        ));
    }

    #[test]
    fn weaker_or_different_verifier_profiles_are_rejected() {
        validate_proof_profile(&required_pcs_config(), PreProcessedTraceVariant::Canonical)
            .unwrap();

        let mut weak = required_pcs_config();
        weak.pow_bits = 0;
        assert!(matches!(
            validate_proof_profile(&weak, PreProcessedTraceVariant::Canonical),
            Err(VerificationError::UnsupportedProofProfile)
        ));
        assert!(matches!(
            validate_proof_profile(
                &required_pcs_config(),
                PreProcessedTraceVariant::CanonicalSmall,
            ),
            Err(VerificationError::UnsupportedProofProfile)
        ));
    }

    #[cfg(feature = "real-proof-fixture")]
    #[test]
    fn real_fixture_binds_program_statement_and_profile() {
        const PROOF: &[u8] =
            include_bytes!("../../../protocol/fixtures/generated/fibonacci-10.proof.json");
        const STATEMENT: &str =
            include_str!("../../../protocol/fixtures/generated/fibonacci-10.statement.json");
        const MANIFEST: &str = include_str!("../../../protocol/programs.json");

        let statement: ProofStatement = serde_json::from_str(STATEMENT).unwrap();
        let manifest: serde_json::Value = serde_json::from_str(MANIFEST).unwrap();
        let hash = manifest["programs"]["soul-cairo-v1"]["program_hash"]
            .as_str()
            .unwrap();
        verify_serialized(PROOF, hash, &statement).unwrap();

        assert!(matches!(
            verify_serialized(PROOF, FeltHex::from_u64(0).as_str(), &statement),
            Err(VerificationError::ProgramHashMismatch { .. })
        ));
        let mut changed_input = statement.clone();
        changed_input.public_input[0] = FeltHex::from_u64(11);
        assert!(matches!(
            verify_serialized(PROOF, hash, &changed_input),
            Err(VerificationError::StatementMismatch)
        ));
        let mut changed_output = statement;
        changed_output.public_output[0] = FeltHex::from_u64(56);
        if let soul_core::JobOutput::Fibonacci { result } = &mut changed_output.output {
            *result = FeltHex::from_u64(56);
        }
        assert!(matches!(
            verify_serialized(PROOF, hash, &changed_output),
            Err(VerificationError::StatementMismatch)
        ));

        let mut weak: CairoProofForRustVerifier<Blake2sMerkleHasher> =
            serde_json::from_slice(PROOF).unwrap();
        weak.stark_proof.0.config.pow_bits = 0;
        let weak = serde_json::to_vec(&weak).unwrap();
        assert!(matches!(
            verify_and_decode(&weak),
            Err(VerificationError::UnsupportedProofProfile)
        ));
    }
}
