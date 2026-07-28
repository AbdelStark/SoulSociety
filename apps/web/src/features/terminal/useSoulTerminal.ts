import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_RELAYS,
  Nip07Signer,
  SoulNostrClient,
  isHex64,
  normalizeRelays,
  type Hex64,
  type JobInput,
  type JobSnapshot,
  type Nip07Provider,
  type ProofVerifier,
  type SoulJob,
  type SoulSigner,
} from '@soul-society/sdk';

import { loadBrowserVerifier, type VerifierManifest } from '../../lib/wasmVerifier';

declare global {
  interface Window {
    nostr?: Nip07Provider;
  }
}

export type JobRecord = {
  key: string;
  job: SoulJob;
  snapshot: Readonly<JobSnapshot>;
};

export type VerifierLoadState =
  | { status: 'loading' }
  | { status: 'ready'; verifier: ProofVerifier; manifest: VerifierManifest }
  | { status: 'error'; message: string };

export type RelayConfig = {
  relays: string[];
  error?: string;
};

export type ProviderConfig = {
  pubkeys: Hex64[];
  error?: string;
};

function configuredRelays(): RelayConfig {
  const configured = import.meta.env.VITE_SOUL_RELAYS?.trim();
  const candidates = configured
    ? configured.split(',').map((relay: string) => relay.trim()).filter(Boolean)
    : [...DEFAULT_RELAYS];
  try {
    return { relays: normalizeRelays(candidates) };
  } catch (error) {
    return {
      relays: [],
      error: error instanceof Error ? error.message : 'Relay configuration is invalid.',
    };
  }
}

function configuredProviders(): ProviderConfig {
  const configured = import.meta.env.VITE_SOUL_PROVIDER_PUBKEYS?.trim();
  if (!configured) {
    return {
      pubkeys: [],
      error: 'No trusted provider identity is configured. Set VITE_SOUL_PROVIDER_PUBKEYS.',
    };
  }
  const candidates = [...new Set(
    configured.split(',').map((pubkey: string) => pubkey.trim()),
  )];
  if (
    candidates.length === 0 ||
    candidates.length > 64 ||
    candidates.some((pubkey) => !isHex64(pubkey))
  ) {
    return {
      pubkeys: [],
      error: 'Trusted provider keys must be 1–64 canonical lowercase Nostr public keys.',
    };
  }
  return { pubkeys: candidates as Hex64[] };
}

export function useSoulTerminal() {
  const relayConfig = useMemo(() => configuredRelays(), []);
  const providerConfig = useMemo(() => configuredProviders(), []);
  const [signer, setSigner] = useState<SoulSigner>();
  const [publicKey, setPublicKey] = useState<string>();
  const [signerError, setSignerError] = useState<string>();
  const [verifierState, setVerifierState] = useState<VerifierLoadState>({ status: 'loading' });
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const jobUnsubscribers = useRef(new Map<string, () => void>());

  useEffect(() => {
    let active = true;
    void loadBrowserVerifier()
      .then(({ verifier, manifest }) => {
        if (active) {
          setVerifierState({ status: 'ready', verifier, manifest });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setVerifierState({
            status: 'error',
            message: error instanceof Error ? error.message : 'The browser verifier could not load.',
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const client = useMemo(() => {
    if (
      !signer ||
      verifierState.status !== 'ready' ||
      relayConfig.relays.length === 0 ||
      providerConfig.pubkeys.length === 0
    ) {
      return undefined;
    }
    return new SoulNostrClient({
      signer,
      verifier: verifierState.verifier,
      trustedProgramHash: verifierState.manifest.program_hash,
      trustedProviderPubkeys: providerConfig.pubkeys,
      relays: relayConfig.relays,
    });
  }, [providerConfig.pubkeys, relayConfig.relays, signer, verifierState]);

  useEffect(() => () => client?.close(), [client]);
  useEffect(
    () => () => {
      for (const unsubscribe of jobUnsubscribers.current.values()) {
        unsubscribe();
      }
      jobUnsubscribers.current.clear();
    },
    [],
  );

  async function connectSigner() {
    setSignerError(undefined);
    if (!window.nostr) {
      setSignerError('No NIP-07 browser signer was found. Install or enable one, then try again.');
      return;
    }
    try {
      const nextSigner = new Nip07Signer(window.nostr);
      const nextPublicKey = await nextSigner.getPublicKey();
      setSigner(nextSigner);
      setPublicKey(nextPublicKey);
    } catch (error) {
      setSignerError(error instanceof Error ? error.message : 'The Nostr signer declined access.');
    }
  }

  function submitInput(input: JobInput) {
    if (!client) {
      throw new Error('A NIP-07 signer and reviewed local verifier are required before publishing.');
    }
    const job = client.createJob(input);
    const key = globalThis.crypto.randomUUID();
    const record: JobRecord = { key, job, snapshot: job.getSnapshot() };
    setJobs((current) => [record, ...current]);
    const unsubscribe = job.subscribe((snapshot) => {
      setJobs((current) =>
        current.map((item) => (item.key === key ? { ...item, snapshot } : item)),
      );
    });
    jobUnsubscribers.current.set(key, unsubscribe);
    void job.start().catch(() => undefined);
  }

  return {
    ready: Boolean(client),
    relayConfig,
    providerConfig,
    publicKey,
    signerError,
    verifierState,
    jobs,
    connectSigner,
    submitInput,
  };
}
