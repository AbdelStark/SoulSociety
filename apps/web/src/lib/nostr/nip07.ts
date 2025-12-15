/**
 * NIP-07 browser extension wallet support
 *
 * This module provides integration with Nostr browser extensions
 * like Alby, nos2x, etc.
 */

/**
 * NIP-07 window.nostr interface
 */
interface Nip07Nostr {
  getPublicKey(): Promise<string>;
  signEvent(event: {
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
  }): Promise<{
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
  }>;
  getRelays?(): Promise<Record<string, { read: boolean; write: boolean }>>;
  nip04?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: Nip07Nostr;
  }
}

/**
 * Check if a NIP-07 extension is available
 */
export function hasNip07Extension(): boolean {
  return typeof window !== 'undefined' && !!window.nostr;
}

/**
 * Wait for NIP-07 extension to be available (with timeout)
 */
export async function waitForNip07(timeoutMs: number = 3000): Promise<boolean> {
  if (hasNip07Extension()) return true;

  return new Promise((resolve) => {
    const startTime = Date.now();

    const checkInterval = setInterval(() => {
      if (hasNip07Extension()) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Get public key from NIP-07 extension
 */
export async function getNip07PublicKey(): Promise<string | null> {
  if (!hasNip07Extension()) return null;

  try {
    return await window.nostr!.getPublicKey();
  } catch (error) {
    console.error('Failed to get public key from NIP-07 extension:', error);
    return null;
  }
}

/**
 * Sign an event using NIP-07 extension
 */
export async function signWithNip07(event: {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
}): Promise<{
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
} | null> {
  if (!hasNip07Extension()) return null;

  try {
    return await window.nostr!.signEvent(event);
  } catch (error) {
    console.error('Failed to sign event with NIP-07 extension:', error);
    return null;
  }
}

/**
 * Get relays from NIP-07 extension
 */
export async function getNip07Relays(): Promise<string[]> {
  if (!hasNip07Extension() || !window.nostr!.getRelays) return [];

  try {
    const relays = await window.nostr!.getRelays();
    return Object.keys(relays);
  } catch (error) {
    console.error('Failed to get relays from NIP-07 extension:', error);
    return [];
  }
}
