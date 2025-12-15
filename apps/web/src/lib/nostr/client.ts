/**
 * Nostr client wrapper for Soul Society web app
 */

import {
  SoulNostrClient,
  type SoulNostrClientOptions,
  ServiceType,
  type JobInput,
  type DVMResult,
} from '@soul-society/sdk';

// Singleton client instance
let clientInstance: SoulNostrClient | null = null;

/**
 * Get or create the Nostr client instance
 */
export function getNostrClient(options?: SoulNostrClientOptions): SoulNostrClient {
  if (!clientInstance) {
    const relays = import.meta.env.VITE_NOSTR_RELAYS?.split(',') || undefined;
    clientInstance = new SoulNostrClient({
      relays,
      ...options,
    });
  }
  return clientInstance;
}

/**
 * Reset the client instance (useful for testing or reconnecting)
 */
export function resetNostrClient(): void {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
  }
}

/**
 * Submit a job to the DVM network
 */
export async function submitJob(
  serviceType: ServiceType,
  input: JobInput,
  bidMsats: number = 0
): Promise<string> {
  const client = getNostrClient();
  return client.submitJob(serviceType, input, bidMsats);
}

/**
 * Subscribe to job results
 */
export function subscribeToResults(
  requestId: string,
  serviceType: ServiceType,
  onResult: (result: DVMResult) => void
): () => void {
  const client = getNostrClient();
  return client.subscribeToResults(requestId, serviceType, onResult);
}

/**
 * Wait for a job result with timeout
 */
export async function waitForResult(
  requestId: string,
  serviceType: ServiceType,
  timeoutMs: number = 60000
): Promise<DVMResult> {
  const client = getNostrClient();
  return client.waitForResult(requestId, serviceType, timeoutMs);
}

// Re-export types for convenience
export { ServiceType, type JobInput, type DVMResult };
