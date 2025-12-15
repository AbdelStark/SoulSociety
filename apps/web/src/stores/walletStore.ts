/**
 * Wallet state management using Zustand
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Connection method for the wallet
 */
export type ConnectionMethod = 'nip07' | 'local' | 'none';

/**
 * Wallet store state
 */
interface WalletState {
  // Connection state
  isConnected: boolean;
  connectionMethod: ConnectionMethod;
  publicKey: string | null;

  // Actions
  connect: (method: ConnectionMethod, publicKey: string) => void;
  disconnect: () => void;
  setPublicKey: (publicKey: string) => void;
}

/**
 * Wallet store with persistence
 */
export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      isConnected: false,
      connectionMethod: 'none',
      publicKey: null,

      connect: (method, publicKey) =>
        set({
          isConnected: true,
          connectionMethod: method,
          publicKey,
        }),

      disconnect: () =>
        set({
          isConnected: false,
          connectionMethod: 'none',
          publicKey: null,
        }),

      setPublicKey: (publicKey) =>
        set({
          publicKey,
          isConnected: true,
        }),
    }),
    {
      name: 'soul-wallet-storage',
      partialize: (state) => ({
        connectionMethod: state.connectionMethod,
        publicKey: state.publicKey,
        isConnected: state.isConnected,
      }),
    }
  )
);

/**
 * Hook to check if wallet is connected
 */
export function useIsConnected(): boolean {
  return useWalletStore((state) => state.isConnected);
}

/**
 * Hook to get truncated public key for display
 */
export function useTruncatedPubkey(): string | null {
  const publicKey = useWalletStore((state) => state.publicKey);
  if (!publicKey) return null;
  return `${publicKey.slice(0, 8)}...${publicKey.slice(-4)}`;
}
