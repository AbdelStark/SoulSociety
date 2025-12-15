/**
 * Hook for managing Nostr client connection
 */

import { useEffect, useState, useCallback } from 'react';
import { getNostrClient, resetNostrClient } from '../lib/nostr';
import { useWalletStore } from '../stores';

/**
 * Connection status
 */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Hook return type
 */
interface UseNostrClientReturn {
  status: ConnectionStatus;
  publicKey: string | null;
  connect: () => void;
  disconnect: () => void;
  error: string | null;
}

/**
 * Hook for managing Nostr client
 */
export function useNostrClient(): UseNostrClientReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const { isConnected, publicKey, connect: storeConnect, disconnect: storeDisconnect } =
    useWalletStore();

  const connect = useCallback(() => {
    setStatus('connecting');
    setError(null);

    try {
      const client = getNostrClient();
      const pk = client.getPublicKey();
      storeConnect('local', pk);
      setStatus('connected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect');
      setStatus('error');
    }
  }, [storeConnect]);

  const disconnect = useCallback(() => {
    resetNostrClient();
    storeDisconnect();
    setStatus('disconnected');
    setError(null);
  }, [storeDisconnect]);

  // Sync status with store
  useEffect(() => {
    if (isConnected && status !== 'connected') {
      setStatus('connected');
    } else if (!isConnected && status === 'connected') {
      setStatus('disconnected');
    }
  }, [isConnected, status]);

  return {
    status,
    publicKey,
    connect,
    disconnect,
    error,
  };
}
