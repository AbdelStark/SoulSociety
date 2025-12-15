/**
 * Soul Society Constants
 */

/**
 * DVM event kinds (NIP-90 extension)
 */
export const DVM_KINDS = {
  // Request kinds
  FIBONACCI_REQUEST: 5601,
  HASH_VERIFY_REQUEST: 5602,
  MERKLE_PROOF_REQUEST: 5603,

  // Result kinds
  FIBONACCI_RESULT: 6601,
  HASH_VERIFY_RESULT: 6602,
  MERKLE_PROOF_RESULT: 6603,
} as const;

/**
 * Get result kind for a request kind
 */
export function getResultKind(requestKind: number): number {
  return requestKind + 1000;
}

/**
 * Get request kind for a result kind
 */
export function getRequestKind(resultKind: number): number {
  return resultKind - 1000;
}

/**
 * Default Nostr relays
 */
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol',
] as const;

/**
 * Local development relay
 */
export const LOCAL_RELAY = 'ws://localhost:8080';

/**
 * Service limits
 */
export const LIMITS = {
  /** Maximum n for Fibonacci computation */
  MAX_FIBONACCI_N: 1000,
  /** Maximum proof path length for Merkle proofs */
  MAX_MERKLE_DEPTH: 32,
} as const;
