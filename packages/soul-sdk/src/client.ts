/**
 * Soul Society Nostr Client
 *
 * Client for interacting with Soul Society DVM services via Nostr.
 */

import {
  SimplePool,
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  type Event,
} from 'nostr-tools';

import { DVM_KINDS, DEFAULT_RELAYS, getResultKind } from './constants';
import { ServiceType, type JobInput, type DVMResult, type StarkProof, type JobOutput } from './types';

/**
 * Options for creating a SoulNostrClient
 */
export interface SoulNostrClientOptions {
  /** Nostr relay URLs */
  relays?: string[];
  /** Secret key (hex encoded) - if not provided, one will be generated */
  secretKey?: string;
}

/**
 * Result subscription callback
 */
export type ResultCallback = (result: DVMResult) => void;

/**
 * Soul Society Nostr Client
 *
 * Handles job submission and result subscription via Nostr relays.
 */
export class SoulNostrClient {
  private pool: SimplePool;
  private secretKey: Uint8Array;
  private pubkey: string;
  private relays: string[];

  /**
   * Create a new Soul Nostr Client
   */
  constructor(options: SoulNostrClientOptions = {}) {
    this.pool = new SimplePool();
    this.relays = options.relays ?? [...DEFAULT_RELAYS];

    // Load or generate keypair
    if (options.secretKey) {
      this.secretKey = hexToBytes(options.secretKey);
    } else {
      // Check localStorage for existing key
      const stored = typeof localStorage !== 'undefined'
        ? localStorage.getItem('soul_sk')
        : null;

      if (stored) {
        this.secretKey = new Uint8Array(JSON.parse(stored));
      } else {
        this.secretKey = generateSecretKey();
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('soul_sk', JSON.stringify(Array.from(this.secretKey)));
        }
      }
    }

    this.pubkey = getPublicKey(this.secretKey);
  }

  /**
   * Get the client's public key
   */
  getPublicKey(): string {
    return this.pubkey;
  }

  /**
   * Get the configured relays
   */
  getRelays(): string[] {
    return [...this.relays];
  }

  /**
   * Submit a job request to the DVM network
   *
   * @param serviceType - Type of service to request
   * @param input - Service-specific input
   * @param bidMsats - Payment bid in millisatoshis
   * @returns The Nostr event ID of the request
   */
  async submitJob(
    serviceType: ServiceType,
    input: JobInput,
    bidMsats: number = 0
  ): Promise<string> {
    const kind = this.getRequestKind(serviceType);

    const event = finalizeEvent(
      {
        kind,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['i', JSON.stringify(input), 'application/json'],
          ['output', 'application/json'],
          ['bid', bidMsats.toString()],
          ['relays', ...this.relays],
        ],
        content: '',
      },
      this.secretKey
    );

    // Publish to all relays
    await Promise.any(this.pool.publish(this.relays, event));

    return event.id;
  }

  /**
   * Subscribe to job results
   *
   * @param requestId - The request event ID to subscribe to
   * @param serviceType - The service type (to determine result kind)
   * @param onResult - Callback when a result is received
   * @returns Unsubscribe function
   */
  subscribeToResults(
    requestId: string,
    serviceType: ServiceType,
    onResult: ResultCallback
  ): () => void {
    const resultKind = getResultKind(this.getRequestKind(serviceType));

    // Use querySync to get events and then set up polling
    // This is a simplified approach that works across nostr-tools versions
    let closed = false;

    const checkForResults = async () => {
      if (closed) return;

      try {
        const events = await this.pool.querySync(this.relays, {
          kinds: [resultKind],
          '#e': [requestId],
        });

        for (const event of events) {
          const result = this.parseResultEvent(event);
          onResult(result);
        }
      } catch {
        // Ignore errors during polling
      }
    };

    // Initial check and then poll every 2 seconds
    checkForResults();
    const interval = setInterval(checkForResults, 2000);

    return () => {
      closed = true;
      clearInterval(interval);
    };
  }

  /**
   * Wait for a job result with timeout
   *
   * @param requestId - The request event ID
   * @param serviceType - The service type
   * @param timeoutMs - Timeout in milliseconds (default: 60000)
   * @returns The job result
   */
  async waitForResult(
    requestId: string,
    serviceType: ServiceType,
    timeoutMs: number = 60000
  ): Promise<DVMResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error('Job result timeout'));
      }, timeoutMs);

      const unsubscribe = this.subscribeToResults(
        requestId,
        serviceType,
        (result) => {
          clearTimeout(timeout);
          unsubscribe();
          resolve(result);
        }
      );
    });
  }

  /**
   * Close the client and all connections
   */
  close(): void {
    this.pool.close(this.relays);
  }

  /**
   * Get the request kind for a service type
   */
  private getRequestKind(serviceType: ServiceType): number {
    switch (serviceType) {
      case ServiceType.Fibonacci:
        return DVM_KINDS.FIBONACCI_REQUEST;
      case ServiceType.HashVerify:
        return DVM_KINDS.HASH_VERIFY_REQUEST;
      case ServiceType.MerkleProof:
        return DVM_KINDS.MERKLE_PROOF_REQUEST;
    }
  }

  /**
   * Parse a result event into a DVMResult
   */
  private parseResultEvent(event: Event): DVMResult {
    const content = event.content ? JSON.parse(event.content) : {};
    const statusTag = event.tags.find((t) => t[0] === 'status');
    const requestIdTag = event.tags.find((t) => t[0] === 'e');

    return {
      eventId: event.id,
      requestId: requestIdTag?.[1] ?? '',
      status: (statusTag?.[1] as 'success' | 'error') ?? 'error',
      result: content.result as JobOutput,
      proof: content.proof as StarkProof,
      error: content.error,
    };
  }
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
