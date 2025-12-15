/**
 * Soul Society Core Types
 *
 * TypeScript equivalents of the Rust types in soul-core.
 */

/**
 * Unique identifier for a job
 */
export type JobId = string;

/**
 * Service type identifier
 */
export enum ServiceType {
  Fibonacci = 'Fibonacci',
  HashVerify = 'HashVerify',
  MerkleProof = 'MerkleProof',
}

/**
 * Job status lifecycle
 */
export enum JobStatus {
  Pending = 'pending',
  Processing = 'processing',
  Proven = 'proven',
  Verified = 'verified',
  Failed = 'failed',
}

/**
 * Base job input type
 */
export interface JobInputBase {
  type: ServiceType;
}

/**
 * Fibonacci computation input
 */
export interface FibonacciInput extends JobInputBase {
  type: ServiceType.Fibonacci;
  /** Which Fibonacci number to compute (0-indexed) */
  n: number;
}

/**
 * Hash verification input
 */
export interface HashVerifyInput extends JobInputBase {
  type: ServiceType.HashVerify;
  /** Expected hash (hex encoded) */
  hash: string;
  /** Preimage to verify (hex encoded) */
  preimage: string;
}

/**
 * Merkle proof verification input
 */
export interface MerkleProofInput extends JobInputBase {
  type: ServiceType.MerkleProof;
  /** Merkle root (hex encoded) */
  root: string;
  /** Leaf to verify (hex encoded) */
  leaf: string;
  /** Sibling hashes for proof path (hex encoded) */
  proof: string[];
  /** Leaf index in the tree */
  index: number;
}

/**
 * Union type for all job inputs
 */
export type JobInput = FibonacciInput | HashVerifyInput | MerkleProofInput;

/**
 * Job request
 */
export interface JobRequest {
  /** Unique job identifier */
  id: JobId;
  /** Type of service requested */
  service: ServiceType;
  /** Service-specific input */
  input: JobInput;
  /** Payment bid in millisatoshis */
  bidMsats: number;
  /** Customer's Nostr public key */
  customerPubkey: string;
  /** Unix timestamp when the job was created */
  createdAt: number;
}

/**
 * Fibonacci computation output
 */
export interface FibonacciOutput {
  type: ServiceType.Fibonacci;
  /** The computed Fibonacci number as a string (for large values) */
  result: string;
}

/**
 * Hash verification output
 */
export interface HashVerifyOutput {
  type: ServiceType.HashVerify;
  /** Whether the preimage matches the hash */
  valid: boolean;
}

/**
 * Merkle proof verification output
 */
export interface MerkleProofOutput {
  type: ServiceType.MerkleProof;
  /** Whether the leaf is in the tree */
  valid: boolean;
}

/**
 * Union type for all job outputs
 */
export type JobOutput = FibonacciOutput | HashVerifyOutput | MerkleProofOutput;

/**
 * STARK proof wrapper
 */
export interface StarkProof {
  /** Serialized STWO proof bytes */
  proofBytes: Uint8Array;
  /** Proof commitment (hex encoded) */
  commitment: string;
  /** Public inputs used for verification */
  publicInputs: string[];
}

/**
 * Job result with proof
 */
export interface JobResult {
  /** Unique result identifier */
  id: JobId;
  /** Reference to the original request */
  requestId: JobId;
  /** Current job status */
  status: JobStatus;
  /** Error message if status is Failed */
  error?: string;
  /** Service-specific output */
  output?: JobOutput;
  /** STARK proof */
  proof?: StarkProof;
  /** Execution time in milliseconds */
  executionTimeMs: number;
}

/**
 * DVM result event content structure
 */
export interface DVMResultContent {
  result: JobOutput;
  proof: StarkProof;
}

/**
 * DVM result event from Nostr
 */
export interface DVMResult {
  /** Nostr event ID */
  eventId: string;
  /** Reference to request event ID */
  requestId: string;
  /** Job status */
  status: 'success' | 'error';
  /** Job output */
  result?: JobOutput;
  /** STARK proof */
  proof?: StarkProof;
  /** Error message if status is 'error' */
  error?: string;
}
