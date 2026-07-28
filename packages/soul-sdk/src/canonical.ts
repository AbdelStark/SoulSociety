import {
  CAIRO_PROGRAM,
  PROOF_CHANNEL,
  PROOF_FORMAT,
  PROOF_MEDIA_TYPE,
  SOUL_WIRE_PROTOCOL,
} from './constants.js';
import {
  ServiceType,
  type FailedJobResult,
  type JobInput,
  type JobOutput,
  type JobRequestContent,
  type JobResult,
  type ProofDescriptor,
  type ProofStatement,
  type SuccessfulJobResult,
} from './types.js';

export function serviceForInput(input: JobInput): ServiceType {
  return input.type;
}

export function canonicalizeInput(input: JobInput): JobInput {
  switch (input.type) {
    case ServiceType.Fibonacci:
      return { type: ServiceType.Fibonacci, n: input.n };
    case ServiceType.HashVerify:
      return {
        type: ServiceType.HashVerify,
        hash: input.hash,
        preimage: input.preimage,
      };
    case ServiceType.MerkleProof:
      return {
        type: ServiceType.MerkleProof,
        root: input.root,
        leaf: input.leaf,
        proof: [...input.proof],
        index: input.index,
      };
  }
}

export function buildRequestContent(input: JobInput, expiresAt?: number): JobRequestContent {
  const content: JobRequestContent = {
    protocol: SOUL_WIRE_PROTOCOL,
    service: serviceForInput(input),
    input: canonicalizeInput(input),
  };
  if (expiresAt !== undefined) {
    content.expires_at = expiresAt;
  }
  return content;
}

export function serializeRequestContent(content: JobRequestContent): string {
  const canonical = buildRequestContent(content.input, content.expires_at);
  return JSON.stringify(canonical);
}

export function canonicalizeOutput(output: JobOutput): JobOutput {
  switch (output.type) {
    case ServiceType.Fibonacci:
      return { type: ServiceType.Fibonacci, result: output.result };
    case ServiceType.HashVerify:
      return { type: ServiceType.HashVerify, valid: output.valid };
    case ServiceType.MerkleProof:
      return { type: ServiceType.MerkleProof, valid: output.valid };
  }
}

export function canonicalizeStatement(statement: ProofStatement): ProofStatement {
  return {
    service: statement.service,
    program: CAIRO_PROGRAM,
    public_input: [...statement.public_input],
    public_output: [...statement.public_output],
    output: canonicalizeOutput(statement.output),
  };
}

export function serializeProofStatement(statement: ProofStatement): string {
  return JSON.stringify(canonicalizeStatement(statement));
}

export function canonicalizeProofDescriptor(proof: ProofDescriptor): ProofDescriptor {
  return {
    format: PROOF_FORMAT,
    media_type: PROOF_MEDIA_TYPE,
    url: proof.url,
    sha256: proof.sha256,
    byte_size: proof.byte_size,
    program_hash: proof.program_hash,
    channel: PROOF_CHANNEL,
  };
}

export function canonicalizeResult(result: JobResult): JobResult {
  if (result.status === 'error') {
    const errorResult: FailedJobResult = {
      status: 'error',
      protocol: SOUL_WIRE_PROTOCOL,
      request_id: result.request_id,
      error: {
        code: result.error.code,
        message: result.error.message,
      },
    };
    return errorResult;
  }

  const successResult: SuccessfulJobResult = {
    status: 'success',
    protocol: SOUL_WIRE_PROTOCOL,
    request_id: result.request_id,
    statement: canonicalizeStatement(result.statement),
    proof: canonicalizeProofDescriptor(result.proof),
    metrics: {
      execution_ms: result.metrics.execution_ms,
      proving_ms: result.metrics.proving_ms,
      verification_ms: result.metrics.verification_ms,
    },
  };
  return successResult;
}

export function serializeResult(result: JobResult): string {
  return JSON.stringify(canonicalizeResult(result));
}
