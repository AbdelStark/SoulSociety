/**
 * Soul Society SDK
 *
 * TypeScript SDK for interacting with Soul Society - a permissionless marketplace
 * for verifiable digital services using Nostr and STARKs.
 *
 * @packageDocumentation
 */

// Types
export * from './types';

// Nostr Client
export { SoulNostrClient, type SoulNostrClientOptions } from './client';

// Constants
export { DVM_KINDS, DEFAULT_RELAYS } from './constants';

// Utilities
export { generateKeyPair, getPublicKeyFromSecret } from './utils';
