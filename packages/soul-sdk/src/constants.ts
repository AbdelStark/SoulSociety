import { ServiceType, type ServiceType as Service } from './types.js';

export const SOUL_WIRE_PROTOCOL = 'soul-society/1' as const;
export const CAIRO_PROGRAM = 'soul-cairo-v1' as const;
export const PROOF_FORMAT = 'stwo-cairo-json-v1' as const;
export const PROOF_MEDIA_TYPE = 'application/vnd.soul-society.stwo-proof+json' as const;
export const PROOF_CHANNEL = 'blake2s' as const;
export const SOUL_TOPIC = 'soul-society' as const;

export const SOUL_KINDS = {
  FIBONACCI_REQUEST: 5601,
  HASH_VERIFY_REQUEST: 5602,
  MERKLE_PROOF_REQUEST: 5603,
  FIBONACCI_RESULT: 6601,
  HASH_VERIFY_RESULT: 6602,
  MERKLE_PROOF_RESULT: 6603,
} as const;

/** Compatibility alias. Soul Wire is application-specific, not NIP-90. */
export const DVM_KINDS = SOUL_KINDS;

export const LIMITS = {
  MAX_FIBONACCI_N: 363,
  MAX_MERKLE_DEPTH: 32,
  MAX_REQUEST_BYTES: 16 * 1024,
  MAX_RESULT_BYTES: 32 * 1024,
  MAX_PROOF_BYTES: 32 * 1024 * 1024,
  MAX_REQUEST_AGE_SECS: 10 * 60,
  MAX_FUTURE_SKEW_SECS: 5 * 60,
  MAX_REQUEST_TTL_SECS: 60 * 60,
  MAX_DEDUPE_ENTRIES: 10_000,
} as const;

export const CAIRO_PRIME_HEX =
  '0800000000000011000000000000000000000000000000000000000000000001';

export const DEFAULT_RELAYS = ['ws://127.0.0.1:7000'] as const;

export function getRequestKind(service: Service): number {
  switch (service) {
    case ServiceType.Fibonacci:
      return SOUL_KINDS.FIBONACCI_REQUEST;
    case ServiceType.HashVerify:
      return SOUL_KINDS.HASH_VERIFY_REQUEST;
    case ServiceType.MerkleProof:
      return SOUL_KINDS.MERKLE_PROOF_REQUEST;
  }
}
export function getResultKind(service: Service): number {
  return getRequestKind(service) + 1000;
}

export function serviceFromKind(kind: number): Service | undefined {
  switch (kind) {
    case SOUL_KINDS.FIBONACCI_REQUEST:
    case SOUL_KINDS.FIBONACCI_RESULT:
      return ServiceType.Fibonacci;
    case SOUL_KINDS.HASH_VERIFY_REQUEST:
    case SOUL_KINDS.HASH_VERIFY_RESULT:
      return ServiceType.HashVerify;
    case SOUL_KINDS.MERKLE_PROOF_REQUEST:
    case SOUL_KINDS.MERKLE_PROOF_RESULT:
      return ServiceType.MerkleProof;
    default:
      return undefined;
  }
}
