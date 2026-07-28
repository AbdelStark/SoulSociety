//! Typed Soul Wire request, statement, proof, and result values.

use std::fmt;
use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize};
use thiserror::Error;
use url::{Host, Url};

use crate::constants::{
    limits, CAIRO_PRIME_HEX, CAIRO_PROGRAM, PROOF_CHANNEL, PROOF_FORMAT, PROOF_MEDIA_TYPE,
    SOUL_WIRE_PROTOCOL,
};

/// A canonical Cairo field element: `0x` followed by exactly 64 lowercase hex
/// nibbles, numerically smaller than the Cairo field modulus.
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize)]
#[serde(transparent)]
pub struct FeltHex(String);

impl FeltHex {
    /// Parse and validate a canonical field element.
    pub fn parse(value: impl Into<String>) -> Result<Self, ValidationError> {
        let value = value.into();
        let digits = value
            .strip_prefix("0x")
            .ok_or(ValidationError::InvalidFelt)?;

        if digits.len() != 64
            || !digits
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            || digits >= CAIRO_PRIME_HEX
        {
            return Err(ValidationError::InvalidFelt);
        }

        Ok(Self(value))
    }

    /// Construct a field element from an unsigned integer.
    #[must_use]
    pub fn from_u64(value: u64) -> Self {
        Self(format!("0x{value:064x}"))
    }

    /// Borrow the canonical wire representation.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for FeltHex {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_tuple("FeltHex").field(&self.0).finish()
    }
}

impl fmt::Display for FeltHex {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl FromStr for FeltHex {
    type Err = ValidationError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::parse(value)
    }
}

impl<'de> Deserialize<'de> for FeltHex {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Self::parse(value).map_err(serde::de::Error::custom)
    }
}

/// Stable service identifier used by event kinds, JSON, Cairo dispatch, and
/// proof statements.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ServiceType {
    /// Compute a Fibonacci number.
    Fibonacci,
    /// Prove whether a private preimage matches a public Poseidon hash.
    HashVerify,
    /// Prove whether a private authentication path opens a public Merkle root.
    MerkleProof,
}

impl ServiceType {
    /// Stable wire name.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Fibonacci => "fibonacci",
            Self::HashVerify => "hash_verify",
            Self::MerkleProof => "merkle_proof",
        }
    }

    /// Soul Wire request event kind.
    #[must_use]
    pub const fn request_kind(self) -> u16 {
        match self {
            Self::Fibonacci => crate::constants::event_kinds::FIBONACCI_REQUEST,
            Self::HashVerify => crate::constants::event_kinds::HASH_VERIFY_REQUEST,
            Self::MerkleProof => crate::constants::event_kinds::MERKLE_PROOF_REQUEST,
        }
    }

    /// Soul Wire result event kind.
    #[must_use]
    pub const fn result_kind(self) -> u16 {
        match self {
            Self::Fibonacci => crate::constants::event_kinds::FIBONACCI_RESULT,
            Self::HashVerify => crate::constants::event_kinds::HASH_VERIFY_RESULT,
            Self::MerkleProof => crate::constants::event_kinds::MERKLE_PROOF_RESULT,
        }
    }

    /// Resolve either a request or result event kind.
    #[must_use]
    pub const fn from_kind(kind: u16) -> Option<Self> {
        match kind {
            crate::constants::event_kinds::FIBONACCI_REQUEST
            | crate::constants::event_kinds::FIBONACCI_RESULT => Some(Self::Fibonacci),
            crate::constants::event_kinds::HASH_VERIFY_REQUEST
            | crate::constants::event_kinds::HASH_VERIFY_RESULT => Some(Self::HashVerify),
            crate::constants::event_kinds::MERKLE_PROOF_REQUEST
            | crate::constants::event_kinds::MERKLE_PROOF_RESULT => Some(Self::MerkleProof),
            _ => None,
        }
    }

    /// Whether this is one of Soul Wire's request kinds.
    #[must_use]
    pub const fn is_request_kind(kind: u16) -> bool {
        matches!(
            kind,
            crate::constants::event_kinds::FIBONACCI_REQUEST
                | crate::constants::event_kinds::HASH_VERIFY_REQUEST
                | crate::constants::event_kinds::MERKLE_PROOF_REQUEST
        )
    }

    /// Whether this is one of Soul Wire's result kinds.
    #[must_use]
    pub const fn is_result_kind(kind: u16) -> bool {
        matches!(
            kind,
            crate::constants::event_kinds::FIBONACCI_RESULT
                | crate::constants::event_kinds::HASH_VERIFY_RESULT
                | crate::constants::event_kinds::MERKLE_PROOF_RESULT
        )
    }
}

/// Service-specific input. Hash preimages and Merkle paths are private Cairo
/// witnesses, even though an unencrypted Nostr request still reveals them in
/// transport.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum JobInput {
    /// Public Fibonacci index.
    Fibonacci { n: u64 },
    /// Public expected hash and private preimage.
    HashVerify { hash: FeltHex, preimage: FeltHex },
    /// Public root/leaf/index and private authentication path.
    MerkleProof {
        root: FeltHex,
        leaf: FeltHex,
        proof: Vec<FeltHex>,
        index: u64,
    },
}

impl JobInput {
    /// Service encoded by this input variant.
    #[must_use]
    pub const fn service(&self) -> ServiceType {
        match self {
            Self::Fibonacci { .. } => ServiceType::Fibonacci,
            Self::HashVerify { .. } => ServiceType::HashVerify,
            Self::MerkleProof { .. } => ServiceType::MerkleProof,
        }
    }

    /// Validate bounds which would otherwise make proving expensive or
    /// semantically ambiguous.
    pub fn validate(&self) -> Result<(), ValidationError> {
        match self {
            Self::Fibonacci { n } if *n > limits::MAX_FIBONACCI_N => {
                Err(ValidationError::FibonacciOutOfRange)
            }
            Self::MerkleProof { proof, index, .. } => {
                if proof.len() > limits::MAX_MERKLE_DEPTH {
                    return Err(ValidationError::MerkleDepthOutOfRange);
                }

                let index_fits = if proof.is_empty() {
                    *index == 0
                } else {
                    *index < (1_u64 << proof.len())
                };
                if !index_fits {
                    return Err(ValidationError::MerkleIndexOutOfRange);
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }
}

/// Canonical request content. Its exact JSON representation is repeated in the
/// event's `i` tag to make content/tag disagreement impossible to ignore.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct JobRequestContent {
    pub protocol: String,
    pub service: ServiceType,
    pub input: JobInput,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
}

impl JobRequestContent {
    /// Construct a request using the current protocol identifier.
    #[must_use]
    pub fn new(input: JobInput, expires_at: Option<u64>) -> Self {
        Self {
            protocol: SOUL_WIRE_PROTOCOL.to_owned(),
            service: input.service(),
            input,
            expires_at,
        }
    }

    /// Validate protocol, variant binding, expiry, and service-specific bounds.
    pub fn validate(&self, created_at: u64, now: u64) -> Result<(), ValidationError> {
        if self.protocol != SOUL_WIRE_PROTOCOL {
            return Err(ValidationError::UnsupportedProtocol);
        }
        if self.service != self.input.service() {
            return Err(ValidationError::ServiceMismatch);
        }
        self.input.validate()?;

        if let Some(expires_at) = self.expires_at {
            if expires_at <= now {
                return Err(ValidationError::Expired);
            }
            if expires_at < created_at
                || expires_at.saturating_sub(created_at) > limits::MAX_REQUEST_TTL_SECS
            {
                return Err(ValidationError::InvalidExpiry);
            }
        }
        Ok(())
    }

    /// Stable compact JSON used as both content and `i` tag value.
    pub fn canonical_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }
}

/// A validated request plus authenticated Nostr metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JobRequest {
    pub id: String,
    pub service: ServiceType,
    pub input: JobInput,
    pub bid_msats: u64,
    pub customer_pubkey: String,
    pub created_at: u64,
    pub expires_at: Option<u64>,
    pub canonical_input: String,
    pub serialized_event: String,
}

/// Typed service output.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum JobOutput {
    Fibonacci { result: FeltHex },
    HashVerify { valid: bool },
    MerkleProof { valid: bool },
}

impl JobOutput {
    /// Service encoded by this output variant.
    #[must_use]
    pub const fn service(&self) -> ServiceType {
        match self {
            Self::Fibonacci { .. } => ServiceType::Fibonacci,
            Self::HashVerify { .. } => ServiceType::HashVerify,
            Self::MerkleProof { .. } => ServiceType::MerkleProof,
        }
    }
}

/// Public facts bound by the STWO proof and the trusted Cairo program.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProofStatement {
    pub service: ServiceType,
    pub program: String,
    pub public_input: Vec<FeltHex>,
    pub public_output: Vec<FeltHex>,
    pub output: JobOutput,
}

impl ProofStatement {
    /// Validate program, output service, and statement size.
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.program != CAIRO_PROGRAM
            || self.program.len() > 64
            || self.service != self.output.service()
        {
            return Err(ValidationError::InvalidStatement);
        }
        if self.public_input.len() > limits::MAX_MERKLE_DEPTH + 4
            || self.public_output.len() > limits::MAX_MERKLE_DEPTH + 8
        {
            return Err(ValidationError::InvalidStatement);
        }
        match (&self.service, &self.output) {
            (ServiceType::Fibonacci, JobOutput::Fibonacci { result })
                if self.public_input.len() == 1
                    && self.public_output.as_slice() == [result.clone()] =>
            {
                Ok(())
            }
            (ServiceType::HashVerify, JobOutput::HashVerify { valid })
                if self.public_input.len() == 1
                    && self.public_output.as_slice() == [FeltHex::from_u64(u64::from(*valid))] =>
            {
                Ok(())
            }
            (ServiceType::MerkleProof, JobOutput::MerkleProof { valid })
                if self.public_input.len() == 3
                    && self.public_output.as_slice() == [FeltHex::from_u64(u64::from(*valid))] =>
            {
                Ok(())
            }
            _ => Err(ValidationError::InvalidStatement),
        }
    }
}

/// Content-addressed reference to a proof artifact.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProofDescriptor {
    pub format: String,
    pub media_type: String,
    pub url: String,
    pub sha256: String,
    pub byte_size: u64,
    pub program_hash: FeltHex,
    pub channel: String,
}

impl ProofDescriptor {
    /// Validate immutable proof metadata before a client performs a fetch.
    pub fn validate(&self) -> Result<(), ValidationError> {
        if self.format != PROOF_FORMAT
            || self.media_type != PROOF_MEDIA_TYPE
            || self.channel != PROOF_CHANNEL
            || self.byte_size == 0
            || self.byte_size > limits::MAX_PROOF_BYTES
        {
            return Err(ValidationError::InvalidProofDescriptor);
        }
        if self.sha256.len() != 64
            || !self
                .sha256
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(ValidationError::InvalidProofDescriptor);
        }
        let url = Url::parse(&self.url).map_err(|_| ValidationError::InvalidProofDescriptor)?;
        if !matches!(url.scheme(), "http" | "https")
            || url.host_str().is_none()
            || (url.scheme() == "http" && !is_loopback_host(&url))
        {
            return Err(ValidationError::InvalidProofDescriptor);
        }
        Ok(())
    }
}

/// Provider-side timings. Values are measurements, not proof claims.
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct JobMetrics {
    pub execution_ms: u64,
    pub proving_ms: u64,
    pub verification_ms: u64,
}

impl JobMetrics {
    /// Keep wire numbers exactly representable by JavaScript clients.
    pub fn validate(&self) -> Result<(), ValidationError> {
        if [self.execution_ms, self.proving_ms, self.verification_ms]
            .into_iter()
            .any(|value| value > limits::MAX_SAFE_INTEGER)
        {
            return Err(ValidationError::InvalidResult);
        }
        Ok(())
    }
}

/// Stable public error categories.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidRequest,
    UnsupportedService,
    Expired,
    Duplicate,
    Busy,
    ProvingFailed,
    ArtifactUnavailable,
    Internal,
}

/// Sanitized error safe to publish on a public relay.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct JobError {
    pub code: ErrorCode,
    pub message: String,
}

impl JobError {
    /// Construct a stable, bounded public message.
    #[must_use]
    pub fn new(code: ErrorCode, message: impl AsRef<str>) -> Self {
        let message = message.as_ref();
        let bounded: String = message
            .chars()
            .filter(|character| !character.is_control())
            .take(160)
            .collect();
        Self {
            code,
            message: bounded,
        }
    }
}

/// Versioned result content. Success is published only after native proof
/// verification and artifact persistence complete.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum JobResultContent {
    Success {
        protocol: String,
        request_id: String,
        statement: ProofStatement,
        proof: Box<ProofDescriptor>,
        metrics: JobMetrics,
    },
    Error {
        protocol: String,
        request_id: String,
        error: JobError,
    },
}

impl JobResultContent {
    /// Construct a successful result.
    #[must_use]
    pub fn success(
        request_id: impl Into<String>,
        statement: ProofStatement,
        proof: ProofDescriptor,
        metrics: JobMetrics,
    ) -> Self {
        Self::Success {
            protocol: SOUL_WIRE_PROTOCOL.to_owned(),
            request_id: request_id.into(),
            statement,
            proof: Box::new(proof),
            metrics,
        }
    }

    /// Construct a safe error result.
    #[must_use]
    pub fn error(request_id: impl Into<String>, code: ErrorCode, message: impl AsRef<str>) -> Self {
        Self::Error {
            protocol: SOUL_WIRE_PROTOCOL.to_owned(),
            request_id: request_id.into(),
            error: JobError::new(code, message),
        }
    }

    /// Request event ID bound by this result.
    #[must_use]
    pub fn request_id(&self) -> &str {
        match self {
            Self::Success { request_id, .. } | Self::Error { request_id, .. } => request_id,
        }
    }

    /// Soul Wire status tag value.
    #[must_use]
    pub const fn status(&self) -> &'static str {
        match self {
            Self::Success { .. } => "success",
            Self::Error { .. } => "error",
        }
    }

    /// Validate all nested public values.
    pub fn validate(&self) -> Result<(), ValidationError> {
        match self {
            Self::Success {
                protocol,
                request_id,
                statement,
                proof,
                metrics,
            } => {
                validate_result_header(protocol, request_id)?;
                statement.validate()?;
                proof.validate()?;
                metrics.validate()
            }
            Self::Error {
                protocol,
                request_id,
                error,
            } => {
                validate_result_header(protocol, request_id)?;
                if error.message.is_empty()
                    || error.message.chars().count() > 160
                    || error.message.chars().any(char::is_control)
                {
                    return Err(ValidationError::InvalidResult);
                }
                Ok(())
            }
        }
    }
}

fn validate_result_header(protocol: &str, request_id: &str) -> Result<(), ValidationError> {
    if protocol != SOUL_WIRE_PROTOCOL || !is_lower_hex(request_id, 64) {
        return Err(ValidationError::InvalidResult);
    }
    Ok(())
}

fn is_loopback_host(url: &Url) -> bool {
    match url.host() {
        Some(Host::Domain(domain)) => domain.eq_ignore_ascii_case("localhost"),
        Some(Host::Ipv4(address)) => address.is_loopback(),
        Some(Host::Ipv6(address)) => address.is_loopback(),
        None => false,
    }
}

/// Typed validation failures. Internal causes are intentionally not included.
#[derive(Debug, Clone, Copy, Error, PartialEq, Eq)]
pub enum ValidationError {
    #[error("field element must be canonical lowercase 0x-prefixed 64-nibble Cairo felt")]
    InvalidFelt,
    #[error("unsupported Soul Wire protocol")]
    UnsupportedProtocol,
    #[error("service does not match the typed input")]
    ServiceMismatch,
    #[error("Fibonacci index is outside the supported Cairo field range")]
    FibonacciOutOfRange,
    #[error("Merkle proof exceeds the maximum depth")]
    MerkleDepthOutOfRange,
    #[error("Merkle index does not fit the authentication path")]
    MerkleIndexOutOfRange,
    #[error("request has expired")]
    Expired,
    #[error("request expiry is invalid")]
    InvalidExpiry,
    #[error("proof statement is invalid")]
    InvalidStatement,
    #[error("proof descriptor is invalid")]
    InvalidProofDescriptor,
    #[error("result is invalid")]
    InvalidResult,
}

pub(crate) fn is_lower_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_elements_have_one_wire_form() {
        let value = FeltHex::from_u64(10);
        assert_eq!(
            value.as_str(),
            "0x000000000000000000000000000000000000000000000000000000000000000a"
        );
        assert_eq!(
            serde_json::to_string(&value).unwrap(),
            format!("\"{value}\"")
        );
        assert!(FeltHex::parse(
            "0X000000000000000000000000000000000000000000000000000000000000000a"
        )
        .is_err());
        assert!(FeltHex::parse(format!("0x{CAIRO_PRIME_HEX}")).is_err());
    }

    #[test]
    fn service_and_input_use_stable_snake_case() {
        let input = JobInput::Fibonacci { n: 10 };
        assert_eq!(
            serde_json::to_string(&input).unwrap(),
            r#"{"type":"fibonacci","n":10}"#
        );
        assert_eq!(
            serde_json::to_string(&ServiceType::HashVerify).unwrap(),
            r#""hash_verify""#
        );
    }

    #[test]
    fn canonical_request_is_a_golden_value() {
        let request = JobRequestContent::new(JobInput::Fibonacci { n: 10 }, Some(2_000));
        assert_eq!(
            request.canonical_json().unwrap(),
            r#"{"protocol":"soul-society/1","service":"fibonacci","input":{"type":"fibonacci","n":10},"expires_at":2000}"#
        );
    }

    #[test]
    fn merkle_index_must_fit_private_path() {
        let input = JobInput::MerkleProof {
            root: FeltHex::from_u64(1),
            leaf: FeltHex::from_u64(2),
            proof: vec![FeltHex::from_u64(3), FeltHex::from_u64(4)],
            index: 4,
        };
        assert_eq!(
            input.validate(),
            Err(ValidationError::MerkleIndexOutOfRange)
        );
    }

    #[test]
    fn public_errors_strip_controls_and_bound_length() {
        let error = JobError::new(ErrorCode::Internal, format!("secret\n{}", "x".repeat(200)));
        assert!(!error.message.contains('\n'));
        assert_eq!(error.message.chars().count(), 160);

        let untrusted = JobResultContent::Error {
            protocol: SOUL_WIRE_PROTOCOL.to_owned(),
            request_id: "a".repeat(64),
            error: JobError {
                code: ErrorCode::Internal,
                message: "line one\nline two".to_owned(),
            },
        };
        assert_eq!(untrusted.validate(), Err(ValidationError::InvalidResult));
    }

    #[test]
    fn metrics_fit_the_cross_language_integer_range() {
        let metrics = JobMetrics {
            execution_ms: limits::MAX_SAFE_INTEGER + 1,
            ..JobMetrics::default()
        };
        assert_eq!(metrics.validate(), Err(ValidationError::InvalidResult));
    }

    #[test]
    fn statement_typed_output_must_match_raw_cairo_output() {
        let statement = ProofStatement {
            service: ServiceType::HashVerify,
            program: CAIRO_PROGRAM.to_owned(),
            public_input: vec![FeltHex::from_u64(7)],
            public_output: vec![FeltHex::from_u64(0)],
            output: JobOutput::HashVerify { valid: true },
        };
        assert_eq!(statement.validate(), Err(ValidationError::InvalidStatement));
    }
}
