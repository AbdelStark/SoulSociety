# `@soul-society/sdk`

Strict TypeScript client for Soul Wire v1: canonical signed Nostr requests,
authorized and request-bound result events, content-addressed proof downloads,
and an injected local STWO verifier.

This is research-alpha software. The SDK validates protocol structure and proof bindings; it does not discover a trustworthy program hash for you. Load that hash from a reviewed, application-controlled manifest.

## Use from this source tree

`@soul-society/sdk` is not published to npm yet. Install the workspace from the
repository root and consume the package by its workspace name:

```bash
pnpm install --frozen-lockfile
pnpm --filter @soul-society/sdk build
```

Soul Wire v1 uses `soul-society/1`, the `soul-cairo-v1` program identifier, and `stwo-cairo-json-v1` proof artifacts. Relays must use `wss://`; loopback development may use `ws://localhost` or `ws://127.0.0.1`.

## Submit and verify a job

The following is a complete, compiling integration function. The host application supplies its NIP-07 provider, reviewed program hash, and real WASM-backed verifier.

```ts
import {
  Nip07Signer,
  ServiceType,
  SoulNostrClient,
  type FieldElement,
  type Hex64,
  type Nip07Provider,
  type ProofVerifier,
} from '@soul-society/sdk';

export async function verifyFibonacci(
  provider: Nip07Provider,
  verifier: ProofVerifier,
  reviewedProgramHash: FieldElement,
  trustedProviderPubkey: Hex64,
) {
  const client = new SoulNostrClient({
    signer: new Nip07Signer(provider),
    verifier,
    trustedProgramHash: reviewedProgramHash,
    trustedProviderPubkeys: [trustedProviderPubkey],
    relays: ['wss://relay.example'],
  });

  try {
    const job = client.createJob({
      type: ServiceType.Fibonacci,
      n: 10,
    });

    const unsubscribe = job.subscribe((snapshot) => {
      console.info(snapshot.state, snapshot.failure?.message);
    });

    try {
      const verified = await job.start();
      return verified.result.content.statement.output;
    } finally {
      unsubscribe();
    }
  } finally {
    client.close();
  }
}
```

`ProofVerifier` is intentionally a narrow injection seam:

```ts
import type { ProofVerifier } from '@soul-society/sdk';

export function adaptWasmVerifier(native: {
  verifyProof(bytes: Uint8Array, programHash: string, statementJson: string): boolean;
}): ProofVerifier {
  return {
    verifyProof(bytes, programHash, statementJson) {
      return native.verifyProof(bytes, programHash, statementJson);
    },
  };
}
```

The client first requires a non-empty application-controlled provider-key
allowlist. It constrains relay subscriptions by author and repeats the check
before either a success or error may settle the job. It then checks the signed
proof descriptor, streams no more than its declared byte count (and never more
than 32 MiB), verifies SHA-256, then calls this adapter with canonical statement
JSON and the application’s reviewed program hash.

## Signers and secrets

Use `Nip07Signer` in browsers so this package never receives or persists a secret key. `SecretKeySigner` and `EphemeralSigner` are explicit in-memory options for controlled scripts and tests; call `destroy()` when finished. The SDK never writes keys to local storage.

## Claim and privacy limits

- This STWO configuration is not documented or represented here as zero-knowledge or witness-hiding.
- Hash preimages and Merkle authentication paths are omitted from the proof statement, but they remain visible in the unencrypted Nostr request.
- A verified job means the downloaded bytes matched the signed digest and the injected verifier accepted the request-bound statement for the supplied program hash.
- It does not prove provider availability, payment settlement, program usefulness beyond the reviewed semantics, input privacy, or production readiness.
- Soul Wire is application-specific. It borrows familiar Nostr request/result shapes but does not claim NIP-90 compliance.

## Development

```sh
pnpm --filter @soul-society/sdk typecheck
pnpm --filter @soul-society/sdk test
pnpm --filter @soul-society/sdk pack --pack-destination /tmp/soul-pack
```

The package is ESM-only. Its release tarball contains built `dist` entrypoints
plus this README, the changelog, and the MIT license.
