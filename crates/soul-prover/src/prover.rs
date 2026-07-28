//! Cairo-authoritative execution, STWO proving, and native self-verification.

use std::fs;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::{Path, PathBuf};
use std::time::Instant;

use cairo_air::CairoProofForRustVerifier;
use sha2::{Digest, Sha256};
use soul_core::{FeltHex, JobInput, JobMetrics, ProofStatement};
use stwo::core::vcs_lifted::blake2_merkle::{Blake2sMerkleChannel, Blake2sMerkleHasher};
use stwo_cairo_common::preprocessed_columns::preprocessed_trace::PreProcessedTraceVariant;
use stwo_cairo_prover::prover::{prove_cairo, ChannelHash, ProverParameters};
use thiserror::Error;

use crate::executor::{execute_and_adapt, ExecutionError};
use crate::statement::{encode_job, StatementError};
use crate::verifier::{
    required_pcs_config, verify_and_decode, verify_serialized, VerificationError,
    VerifiedPublicData,
};

/// A proof artifact returned only after native STWO verification and program
/// hash/statement binding both succeed.
#[derive(Debug, Clone)]
pub struct VerifiedProofArtifact {
    /// Canonical JSON bytes for
    /// `CairoProofForRustVerifier<Blake2sMerkleHasher>`.
    pub proof_bytes: Vec<u8>,
    /// Public facts extracted from the verified Cairo output segment.
    pub statement: ProofStatement,
    /// Hash of the trusted Cairo program, repeated for descriptor construction.
    pub program_hash: FeltHex,
    /// Provider-side measurements; these are not proof claims.
    pub metrics: JobMetrics,
}

/// Failure at a named stage of the verifiable job engine.
#[derive(Debug, Error)]
pub enum ProverError {
    /// The configured executable path is absent or not a regular file.
    #[error("Cairo executable does not exist: {0}")]
    MissingExecutable(String),
    /// The configured executable could not be read during trust-root pinning.
    #[error("cannot read Cairo executable {path}: {source}")]
    ExecutableRead {
        path: String,
        source: std::io::Error,
    },
    /// The configured executable digest is not canonical SHA-256.
    #[error("trusted Cairo executable SHA-256 must be 64 lowercase hexadecimal characters")]
    InvalidExecutableDigest,
    /// The executable bytes differ from the reviewed program manifest.
    #[error("Cairo executable SHA-256 mismatch: expected {expected}, got {actual}")]
    ExecutableDigestMismatch { expected: String, actual: String },
    /// Request/statement encoding failed.
    #[error(transparent)]
    Statement(#[from] StatementError),
    /// Cairo VM execution or trace adaptation failed.
    #[error(transparent)]
    Execution(#[from] ExecutionError),
    /// STWO could not create a proof at the production parameters.
    #[error("STWO proving failed: {0}")]
    Proving(String),
    /// Serialization failed.
    #[error("STWO proof serialization failed: {0}")]
    Serialization(String),
    /// The generated artifact exceeds the transport limit.
    #[error("generated proof is too large")]
    ProofTooLarge,
    /// Native verification, program pinning, or statement binding failed.
    #[error(transparent)]
    Verification(#[from] VerificationError),
}

/// Deep interface owning Cairo execution, trace adaptation, STWO proving, and
/// native verification.
///
/// The executable must be built from `crates/soul-cairo` with Cairo 2.15.0:
///
/// ```text
/// cd crates/soul-cairo
/// scarb build
/// # target/dev/soul_cairo.executable.json
/// ```
///
/// Normal constructors require the program hash from the independently
/// reviewed program manifest. A valid proof for any other executable is
/// rejected before an artifact is returned.
#[derive(Debug, Clone)]
pub struct VerifiableJobEngine {
    executable: PathBuf,
    expected_program_hash: FeltHex,
}

impl VerifiableJobEngine {
    /// Bind an engine to an explicit executable and trusted program hash.
    pub fn new(
        executable: impl Into<PathBuf>,
        expected_program_hash: FeltHex,
        expected_executable_sha256: &str,
    ) -> Result<Self, ProverError> {
        let executable = executable.into();
        ensure_executable(&executable)?;
        ensure_executable_digest(&executable, expected_executable_sha256)?;
        Ok(Self {
            executable,
            expected_program_hash,
        })
    }

    /// Resolve the standard Scarb development artifact relative to this crate.
    pub fn from_workspace(
        expected_program_hash: FeltHex,
        expected_executable_sha256: &str,
    ) -> Result<Self, ProverError> {
        Self::new(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../soul-cairo/target/dev/soul_cairo.executable.json"),
            expected_program_hash,
            expected_executable_sha256,
        )
    }

    /// Path of the executable bound to this engine.
    #[must_use]
    pub fn executable_path(&self) -> &Path {
        &self.executable
    }

    /// Run the canonical Cairo executable, generate a STWO proof at the
    /// upstream 96-bit conjectured-security parameter target, serialize it,
    /// and verify the serialized artifact from scratch.
    pub fn prove_job(&self, input: &JobInput) -> Result<VerifiedProofArtifact, ProverError> {
        prove_job_inner(&self.executable, input, Some(&self.expected_program_hash))
    }
}

/// Maintainer-only program-manifest bootstrap seam.
///
/// This still performs full native STWO verification and statement binding,
/// but cannot pin a program hash that is being generated for the first time.
/// Runtime providers must use [`VerifiableJobEngine`] instead.
#[derive(Debug, Clone)]
pub struct ProgramManifestGenerator {
    executable: PathBuf,
}

impl ProgramManifestGenerator {
    /// Create a generator for a reviewed Cairo executable artifact.
    pub fn new(executable: impl Into<PathBuf>) -> Result<Self, ProverError> {
        let executable = executable.into();
        ensure_executable(&executable)?;
        Ok(Self { executable })
    }

    /// Generate and self-verify a proof while discovering the program hash.
    pub fn prove_fixture(&self, input: &JobInput) -> Result<VerifiedProofArtifact, ProverError> {
        prove_job_inner(&self.executable, input, None)
    }
}

fn prove_job_inner(
    executable: &Path,
    input: &JobInput,
    expected_program_hash: Option<&FeltHex>,
) -> Result<VerifiedProofArtifact, ProverError> {
    let arguments = encode_job(input)?;

    let execution_started = Instant::now();
    let prover_input = execute_and_adapt(executable, arguments)?;
    let execution_ms = elapsed_ms(execution_started);

    let proving_started = Instant::now();
    let proof = prove_with_salt_retries(prover_input)?;
    let proving_ms = elapsed_ms(proving_started);

    let proof: CairoProofForRustVerifier<Blake2sMerkleHasher> = proof.into();
    let proof_bytes = serde_json::to_vec(&proof)
        .map_err(|error| ProverError::Serialization(error.to_string()))?;
    if proof_bytes.len() as u64 > soul_core::limits::MAX_PROOF_BYTES {
        return Err(ProverError::ProofTooLarge);
    }

    let verification_started = Instant::now();
    let VerifiedPublicData {
        program_hash,
        statement,
    } = verify_and_decode(&proof_bytes)?;
    if let Some(expected_program_hash) = expected_program_hash {
        verify_serialized(&proof_bytes, expected_program_hash.as_str(), &statement)?;
    }
    let verification_ms = elapsed_ms(verification_started);

    Ok(VerifiedProofArtifact {
        proof_bytes,
        statement,
        program_hash,
        metrics: JobMetrics {
            execution_ms,
            proving_ms,
            verification_ms,
        },
    })
}

/// Production defaults from stwo-cairo 1.3.0: 96-bit conjectured security.
///
/// Security bits are `pow_bits + log_blowup_factor * n_queries`
/// (`26 + 1 * 70`). Keep this explicit to make parameter drift reviewable.
fn production_parameters(channel_salt: u32) -> ProverParameters {
    ProverParameters {
        channel_hash: ChannelHash::Blake2s,
        channel_salt,
        pcs_config: required_pcs_config(),
        preprocessed_trace: PreProcessedTraceVariant::Canonical,
        store_polynomials_coefficients: false,
        include_all_preprocessed_columns: false,
    }
}

fn prove_with_salt_retries(
    prover_input: stwo_cairo_adapter::ProverInput,
) -> Result<cairo_air::CairoProof<Blake2sMerkleHasher>, ProverError> {
    let mut last_error = "prover rejected every channel salt".to_owned();
    // A salt changes verifier-channel draws without changing the statement or
    // security parameters. stwo-cairo documents this as the recovery path for
    // an unprovable draw (for example, a zero lookup denominator).
    for channel_salt in 0..8 {
        let input = prover_input.clone();
        match catch_unwind(AssertUnwindSafe(move || {
            prove_cairo::<Blake2sMerkleChannel>(input, production_parameters(channel_salt))
        })) {
            Ok(Ok(proof)) => return Ok(proof),
            Ok(Err(error)) => last_error = error.to_string(),
            Err(_) => last_error = format!("prover panicked for channel salt {channel_salt}"),
        }
    }
    Err(ProverError::Proving(last_error))
}

fn ensure_executable(executable: &Path) -> Result<(), ProverError> {
    if executable.is_file() {
        Ok(())
    } else {
        Err(ProverError::MissingExecutable(
            executable.display().to_string(),
        ))
    }
}

fn ensure_executable_digest(executable: &Path, expected: &str) -> Result<(), ProverError> {
    if expected.len() != 64
        || !expected
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(ProverError::InvalidExecutableDigest);
    }
    let bytes = fs::read(executable).map_err(|source| ProverError::ExecutableRead {
        path: executable.display().to_string(),
        source,
    })?;
    let actual = hex::encode(Sha256::digest(bytes));
    if actual == expected {
        Ok(())
    } else {
        Err(ProverError::ExecutableDigestMismatch {
            expected: expected.to_owned(),
            actual,
        })
    }
}

fn elapsed_ms(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_parameters_are_not_weakened() {
        let parameters = production_parameters(0);
        assert_eq!(parameters.pcs_config.pow_bits, 26);
        assert_eq!(parameters.pcs_config.fri_config.log_blowup_factor, 1);
        assert_eq!(parameters.pcs_config.fri_config.n_queries, 70);
        assert_eq!(
            parameters.pcs_config.pow_bits
                + parameters.pcs_config.fri_config.log_blowup_factor
                    * u32::try_from(parameters.pcs_config.fri_config.n_queries).unwrap(),
            96
        );
    }

    #[test]
    #[ignore = "expensive: builds a full production-parameter STWO proof"]
    fn real_fibonacci_proof_round_trip() {
        let generator = ProgramManifestGenerator::new(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("../soul-cairo/target/dev/soul_cairo.executable.json"),
        )
        .unwrap();
        let artifact = generator
            .prove_fixture(&JobInput::Fibonacci { n: 10 })
            .unwrap();
        assert_eq!(artifact.statement.public_input, [FeltHex::from_u64(10)]);
        assert_eq!(artifact.statement.public_output, [FeltHex::from_u64(55)]);
        verify_serialized(
            &artifact.proof_bytes,
            artifact.program_hash.as_str(),
            &artifact.statement,
        )
        .unwrap();
        eprintln!("program_hash={}", artifact.program_hash);
    }
}
