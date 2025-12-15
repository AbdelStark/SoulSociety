/**
 * Soul Society SDK Utilities
 */

import { generateSecretKey, getPublicKey } from 'nostr-tools';

/**
 * Key pair with both secret and public keys
 */
export interface KeyPair {
  /** Secret key (hex encoded) */
  secretKey: string;
  /** Public key (hex encoded) */
  publicKey: string;
}

/**
 * Generate a new Nostr key pair
 *
 * @returns A new key pair
 */
export function generateKeyPair(): KeyPair {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  return {
    secretKey: bytesToHex(sk),
    publicKey: pk,
  };
}

/**
 * Get the public key from a secret key
 *
 * @param secretKey - Secret key (hex encoded)
 * @returns Public key (hex encoded)
 */
export function getPublicKeyFromSecret(secretKey: string): string {
  const sk = hexToBytes(secretKey);
  return getPublicKey(sk);
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
