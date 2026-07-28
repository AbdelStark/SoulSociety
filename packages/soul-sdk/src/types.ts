import type { Event } from 'nostr-tools';

export type FieldElement = `0x${string}`;
export type Hex64 = string;

export const ServiceType = {
  Fibonacci: 'fibonacci',
  HashVerify: 'hash_verify',
  MerkleProof: 'merkle_proof',
} as const;

export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

export interface FibonacciInput {
  type: typeof ServiceType.Fibonacci;
  n: number;
}

export interface HashVerifyInput {
  type: typeof ServiceType.HashVerify;
  hash: FieldElement;
  preimage: FieldElement;
}

export interface MerkleProofInput {
  type: typeof ServiceType.MerkleProof;
  root: FieldElement;
  leaf: FieldElement;
  proof: FieldElement[];
  index: number;
}

export type JobInput = FibonacciInput | HashVerifyInput | MerkleProofInput;

export interface FibonacciOutput {
  type: typeof ServiceType.Fibonacci;
  result: FieldElement;
}

export interface HashVerifyOutput {
  type: typeof ServiceType.HashVerify;
  valid: boolean;
}

export interface MerkleProofOutput {
  type: typeof ServiceType.MerkleProof;
  valid: boolean;
}

export type JobOutput = FibonacciOutput | HashVerifyOutput | MerkleProofOutput;

export interface JobRequestContent {
  protocol: 'soul-society/1';
  service: ServiceType;
  input: JobInput;
  expires_at?: number;
}

export interface ProofStatement {
  service: ServiceType;
  program: 'soul-cairo-v1';
  public_input: FieldElement[];
  public_output: FieldElement[];
  output: JobOutput;
}

export interface ProofDescriptor {
  format: 'stwo-cairo-json-v1';
  media_type: 'application/vnd.soul-society.stwo-proof+json';
  url: string;
  sha256: Hex64;
  byte_size: number;
  program_hash: FieldElement;
  channel: 'blake2s';
}

export interface JobMetrics {
  execution_ms: number;
  proving_ms: number;
  verification_ms: number;
}

export const ErrorCode = {
  InvalidRequest: 'invalid_request',
  UnsupportedService: 'unsupported_service',
  Expired: 'expired',
  Duplicate: 'duplicate',
  Busy: 'busy',
  ProvingFailed: 'proving_failed',
  ArtifactUnavailable: 'artifact_unavailable',
  Internal: 'internal',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface JobError {
  code: ErrorCode;
  message: string;
}

export interface SuccessfulJobResult {
  status: 'success';
  protocol: 'soul-society/1';
  request_id: Hex64;
  statement: ProofStatement;
  proof: ProofDescriptor;
  metrics: JobMetrics;
}

export interface FailedJobResult {
  status: 'error';
  protocol: 'soul-society/1';
  request_id: Hex64;
  error: JobError;
}

export type JobResult = SuccessfulJobResult | FailedJobResult;

export interface ValidatedRequest {
  event: Event;
  content: JobRequestContent;
  canonicalContent: string;
}

export interface ValidatedResult {
  event: Event;
  content: JobResult;
}

export type JobLifecycleState =
  | 'draft'
  | 'publishing'
  | 'awaiting_result'
  | 'result_received'
  | 'fetching'
  | 'verifying'
  | 'verified'
  | 'failed';

export type LocalFailureCode =
  | 'cancelled'
  | 'publish_failed'
  | 'result_timeout'
  | 'invalid_result'
  | 'proof_fetch_failed'
  | 'proof_hash_mismatch'
  | 'untrusted_program'
  | 'verification_failed'
  | 'verifier_unavailable';

export interface JobFailure {
  code: ErrorCode | LocalFailureCode;
  message: string;
  retryable: boolean;
}

export interface VerifiedJob {
  request: ValidatedRequest;
  result: ValidatedResult & { content: SuccessfulJobResult };
  proofBytes: Uint8Array;
}

export interface JobSnapshot {
  state: JobLifecycleState;
  input: JobInput;
  request?: ValidatedRequest;
  result?: ValidatedResult;
  verified?: VerifiedJob;
  failure?: JobFailure;
  publishAttempt: number;
  proofAttempt: number;
  updatedAt: number;
}

export type JobListener = (snapshot: Readonly<JobSnapshot>) => void;
