//! Encoding requests and decoding the Cairo public output.

use cairo_vm::Felt252;
use soul_core::{
    FeltHex, JobInput, JobOutput, ProofStatement, ServiceType, ValidationError, CAIRO_PROGRAM,
};
use starknet_ff::FieldElement;
use thiserror::Error;

const FIBONACCI_SERVICE: u64 = 1;
const HASH_VERIFY_SERVICE: u64 = 2;
const MERKLE_PROOF_SERVICE: u64 = 3;

/// A malformed request or a public output that does not match Soul Cairo v1.
#[derive(Debug, Error)]
pub enum StatementError {
    /// Core request validation failed.
    #[error("invalid job input: {0}")]
    InvalidInput(#[from] ValidationError),
    /// A canonical felt could not be converted for Cairo execution.
    #[error("invalid canonical felt: {0}")]
    InvalidFelt(String),
    /// The proof output does not follow the Soul Cairo v1 ABI.
    #[error("invalid Soul Cairo public output: {0}")]
    InvalidOutput(&'static str),
    /// The decoded statement is internally inconsistent.
    #[error("invalid proof statement: {0}")]
    InvalidStatement(&'static str),
}

/// Flatten a validated request using the Cairo executable Serde ABI.
pub(crate) fn encode_job(input: &JobInput) -> Result<Vec<Felt252>, StatementError> {
    input.validate()?;

    let mut encoded = Vec::new();
    match input {
        JobInput::Fibonacci { n } => {
            encoded.extend([
                Felt252::from(FIBONACCI_SERVICE),
                Felt252::ONE,
                Felt252::from(*n),
                Felt252::ZERO,
            ]);
        }
        JobInput::HashVerify { hash, preimage } => {
            encoded.extend([
                Felt252::from(HASH_VERIFY_SERVICE),
                Felt252::ONE,
                felt252(hash)?,
                Felt252::ONE,
                felt252(preimage)?,
            ]);
        }
        JobInput::MerkleProof {
            root,
            leaf,
            proof,
            index,
        } => {
            encoded.extend([
                Felt252::from(MERKLE_PROOF_SERVICE),
                Felt252::from(3_u64),
                felt252(root)?,
                felt252(leaf)?,
                Felt252::from(*index),
                Felt252::from(proof.len()),
            ]);
            encoded.extend(proof.iter().map(felt252).collect::<Result<Vec<_>, _>>()?);
        }
    }
    Ok(encoded)
}

/// Decode the Cairo executable return value from the proof's output segment.
pub(crate) fn decode_statement(output: &[FieldElement]) -> Result<ProofStatement, StatementError> {
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
        return Err(StatementError::InvalidOutput("trailing output values"));
    }

    let (service, typed_output) = match service_id {
        FIBONACCI_SERVICE if public_input.len() == 1 && public_output.len() == 1 => (
            ServiceType::Fibonacci,
            JobOutput::Fibonacci {
                result: public_output[0].clone(),
            },
        ),
        HASH_VERIFY_SERVICE if public_input.len() == 1 && public_output.len() == 1 => (
            ServiceType::HashVerify,
            JobOutput::HashVerify {
                valid: decode_boolean(&public_output[0])?,
            },
        ),
        MERKLE_PROOF_SERVICE if public_input.len() == 3 && public_output.len() == 1 => (
            ServiceType::MerkleProof,
            JobOutput::MerkleProof {
                valid: decode_boolean(&public_output[0])?,
            },
        ),
        FIBONACCI_SERVICE | HASH_VERIFY_SERVICE | MERKLE_PROOF_SERVICE => {
            return Err(StatementError::InvalidOutput(
                "service input/output arity mismatch",
            ));
        }
        _ => return Err(StatementError::InvalidOutput("unsupported service id")),
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

/// Apply the stronger, service-specific statement checks shared by native and
/// browser verifiers.
pub fn validate_statement(statement: &ProofStatement) -> Result<(), StatementError> {
    statement
        .validate()
        .map_err(|_| StatementError::InvalidStatement("core statement validation failed"))?;

    match (&statement.service, &statement.output) {
        (ServiceType::Fibonacci, JobOutput::Fibonacci { result })
            if statement.public_input.len() == 1
                && statement.public_output.as_slice() == [result.clone()] => {}
        (ServiceType::HashVerify, JobOutput::HashVerify { valid })
            if statement.public_input.len() == 1
                && statement.public_output.as_slice() == [FeltHex::from_u64(u64::from(*valid))] => {
        }
        (ServiceType::MerkleProof, JobOutput::MerkleProof { valid })
            if statement.public_input.len() == 3
                && statement.public_output.as_slice() == [FeltHex::from_u64(u64::from(*valid))] => {
        }
        _ => {
            return Err(StatementError::InvalidStatement(
                "service, arity, raw output, and typed output disagree",
            ));
        }
    }
    Ok(())
}

pub(crate) fn field_to_felt(value: &FieldElement) -> Result<FeltHex, StatementError> {
    FeltHex::parse(format!("0x{}", hex::encode(value.to_bytes_be())))
        .map_err(|_| StatementError::InvalidOutput("field element is not canonical"))
}

fn felt252(value: &FeltHex) -> Result<Felt252, StatementError> {
    Felt252::from_hex(value.as_str())
        .map_err(|error| StatementError::InvalidFelt(error.to_string()))
}

fn take_len(
    output: &[FieldElement],
    cursor: &mut usize,
    error: &'static str,
) -> Result<usize, StatementError> {
    let value = take_u64(output, cursor, error)?;
    usize::try_from(value).map_err(|_| StatementError::InvalidOutput("array length is too large"))
}

fn take_u64(
    output: &[FieldElement],
    cursor: &mut usize,
    error: &'static str,
) -> Result<u64, StatementError> {
    let value = output
        .get(*cursor)
        .ok_or(StatementError::InvalidOutput(error))?;
    *cursor += 1;
    let bytes = value.to_bytes_be();
    if bytes[..24].iter().any(|byte| *byte != 0) {
        return Err(StatementError::InvalidOutput(
            "integer output does not fit u64",
        ));
    }
    Ok(u64::from_be_bytes(bytes[24..].try_into().map_err(
        |_| StatementError::InvalidOutput("invalid integer encoding"),
    )?))
}

fn take_felts(
    output: &[FieldElement],
    cursor: &mut usize,
    len: usize,
    error: &'static str,
) -> Result<Vec<FeltHex>, StatementError> {
    let end = cursor
        .checked_add(len)
        .ok_or(StatementError::InvalidOutput("array length overflow"))?;
    let values = output
        .get(*cursor..end)
        .ok_or(StatementError::InvalidOutput(error))?;
    *cursor = end;
    values.iter().map(field_to_felt).collect()
}

fn decode_boolean(value: &FeltHex) -> Result<bool, StatementError> {
    if value == &FeltHex::from_u64(0) {
        Ok(false)
    } else if value == &FeltHex::from_u64(1) {
        Ok(true)
    } else {
        Err(StatementError::InvalidOutput(
            "boolean output must be zero or one",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_fibonacci_cairo_serde_arguments() {
        let encoded = encode_job(&JobInput::Fibonacci { n: 10 }).unwrap();
        assert_eq!(
            encoded,
            vec![
                Felt252::ONE,
                Felt252::ONE,
                Felt252::from(10_u64),
                Felt252::ZERO
            ]
        );
    }

    #[test]
    fn rejects_non_boolean_public_output() {
        let output = [
            FieldElement::from(HASH_VERIFY_SERVICE),
            FieldElement::ONE,
            FieldElement::from(7_u64),
            FieldElement::ONE,
            FieldElement::from(2_u64),
        ];
        assert!(decode_statement(&output).is_err());
    }
}
