<div align="center">

# Soul Society

### Computation should arrive with a proof the user can verify.

[![license: MIT](https://img.shields.io/badge/license-MIT-1d1b18.svg)](LICENSE)
[![status: research alpha](https://img.shields.io/badge/status-research_alpha-e85232.svg)](#research-alpha)

[Live site](https://abdelstark.github.io/SoulSociety/) · [Quickstart](#quickstart) · [Architecture](docs/architecture.md) ·
[Soul Wire](docs/protocol.md) · [Security](docs/security-model.md) ·
[Contributing](CONTRIBUTING.md)

</div>

---

Nostr removes gatekeepers from publishing. Cairo and STWO replace trust in a
worker with a reviewed program and local verification.

Soul Society connects those ideas. A client signs a computation request and
publishes it to Nostr. A provider executes one reviewed and pinned Cairo program, produces a
STWO proof, and publishes a signed result that points to the proof by hash. The
client fetches that artifact and verifies the program identity, public
statement, and proof locally in WebAssembly.

The relay is a coordination plane. The provider is an untrusted worker. Neither
gets to decide what is true.

This is the practical thesis behind
[verifiable computation for Nostr DVMs](https://hackmd.io/@AbdelStark/nostr-dvm-verifiable-computation):
permissionless services need client-verifiable results. It also follows the
[Freedom Tech](https://www.fgu.tech/) premise that useful AI infrastructure
should be open, user-controlled, privacy-conscious, and difficult to capture.
Sovereignty here is concrete: the acceptance decision lives with the client.

## What is real

The repository implements the complete proof path:

```text
signed Soul Wire request
          │
          ▼
      Nostr relay ─────────────── untrusted transport
          │
          ▼
   Rust provider intake
          │
          ▼
 canonical Cairo executable ──── the computation authority
          │
          ▼
 STWO proof + native verification
          │
          ├── proof JSON ─────── immutable SHA-256 artifact
          │
          └── signed result ──── statement + artifact descriptor
                                      │
                                      ▼
                           browser fetch + hash check
                                      │
                                      ▼
                           local STWO WASM verifier
```

- The Cairo VM, not a duplicate Rust implementation, computes each result.
- STWO proves the Cairo execution with the Blake2s channel.
- The provider verifies its own proof before publishing a success event.
- Nostr carries a bounded descriptor instead of a relay-hostile proof blob.
- The SDK authenticates events and binds each result to its signed request.
- The client accepts results only from explicitly configured provider public
  keys; relay discovery cannot create that trust root.
- The browser checks artifact size and SHA-256, then verifies the proof against
  an independently trusted program hash and the exact public statement.
- Native and WASM verifiers require the exact reviewed FRI, proof-of-work, and
  canonical preprocessing profile before accepting a proof.
- Tampered proof bytes, program identity, public input, and public output are
  negative test cases.

## Research alpha

Soul Society is a reference implementation, not an audited production network.
The repository makes no claim that a relay delivered an event, that a provider
stayed available, that a physical-world action occurred, or that an arbitrary
Cairo program is safe. A successful verification establishes a narrower fact:
the pinned Cairo program produced the declared public output from the declared
public input under the implemented STWO verifier and its cryptographic
assumptions.

There are no payments, escrow, provider reputation, proof aggregation, or
encrypted requests yet. Hash preimages and Merkle paths are omitted from the
declared public statement, but this research alpha makes no zero-knowledge or
witness-hiding claim; the current Soul Wire request also transports them in
cleartext. Use test data only.

Read the complete [security model](docs/security-model.md) before building on
this work.

## Project site

The [GitHub Pages site](https://abdelstark.github.io/SoulSociety/) is a static
protocol explainer and browser verification interface. Its deployment workflow
runs only after the repository's `verification` workflow succeeds on `main`,
then rebuilds the reviewed WASM verifier from source before publishing the
site.

GitHub Pages does not host a relay, provider, or proof artifact service. The
public terminal remains intentionally unconfigured until a user supplies
compatible secure endpoints and an explicitly trusted provider public key.

## Quickstart

### Run the full stack with Docker

Use Docker Engine or Docker Desktop with Compose v2, plus Bash. The first build
compiles Cairo, STWO, Rust, and the WASM verifier, so it is intentionally not
instant. A NIP-07 browser signer is required only to submit through the web UI.

```bash
# From the repository root:
./scripts/run-local.sh
```

The script starts a pinned local relay, provider, proof artifact endpoint, and
web client, then waits for every health check:

- web: `http://127.0.0.1:5173`
- relay: `ws://127.0.0.1:8080`
- provider: `http://127.0.0.1:8081/healthz`

Stop it with:

```bash
./scripts/stop-local.sh
```

### Build and verify from source

Pinned host tools are declared in `rust-toolchain.toml`, `.tool-versions`,
`.node-version`, `package.json`, and the three committed lockfiles.

```bash
./scripts/setup.sh
./scripts/check.sh
```

The full check generates deterministic disposable Nostr events and a real
self-verified Fibonacci STWO proof before native, WASM, SDK, web, and packaging
gates. `./scripts/generate-test-data.sh` is available separately when reviewing
fixtures or updating the trusted program manifest. All embedded keys are public
test vectors.

## Services

All field elements use canonical lowercase `0x` plus 64 hexadecimal nibbles.

| Service | Kind | Public proof statement | Private Cairo witness | Bounds |
|---|---:|---|---|---|
| Fibonacci | `5601 → 6601` | `n`, `F(n)` | none | `0 ≤ n ≤ 363` |
| Poseidon hash check | `5602 → 6602` | expected hash, valid/invalid | preimage | one field element |
| Poseidon Merkle membership | `5603 → 6603` | root, leaf, index, valid/invalid | sibling path | depth `≤ 32`; index must fit depth |

“Private witness” describes the Cairo ABI, not a zero-knowledge guarantee. This
implementation has not been analyzed for witness hiding, and the current
unencrypted Nostr request reveals the witness.

## Soul Wire, not protocol theatre

[NIP-90](https://github.com/nostr-protocol/nips/blob/master/90.md) explored a
generic Data Vending Machine protocol, but it is currently marked draft and
unrecommended in favor of focused microstandards. Soul Society therefore uses
[Soul Wire v1](docs/protocol.md): a small application protocol that borrows the
request/result kind shape without claiming NIP-90 compliance.

Soul Wire is intentionally strict:

- request JSON is canonical and repeated in an `i` tag of type `text`;
- event kind, service, content, and tags must agree;
- signatures, timestamps, expiry, sizes, field encodings, and bids are checked;
- tag order is canonical and unknown tags are rejected;
- results include the complete signed request plus `e` and `p` bindings;
- clients require an application-configured provider-author allowlist;
- proof descriptors pin format, media type, size, SHA-256, program hash, and
  commitment channel;
- stable public errors reveal no internal paths or proving diagnostics.

Cross-language fixtures live in [`protocol/fixtures`](protocol/fixtures).

## Architecture

The repository favors a few deep modules over duplicated “service” code:

| Module | Responsibility |
|---|---|
| `soul-cairo` | one executable dispatching the three canonical computations |
| `soul-prover` | execute Cairo, adapt the trace, prove, self-verify, and decode the statement |
| `soul-core` | Soul Wire types, bounds, canonical codecs, and event authentication |
| `soul-provider` | bounded work intake, deduplication, Nostr transport, and proof storage |
| `soul-wasm` | verifier-only STWO boundary for untrusted browser input |
| `@soul-society/sdk` | signer, relay transport, job lifecycle, proof fetch, and verification |
| `web` | an accessible proof terminal built on the SDK rather than a second client |

The full rationale—including interfaces, seams, trust boundaries, and failure
locality—is in [the architecture guide](docs/architecture.md).

## Reproducible toolchain

| Tool | Pinned version |
|---|---:|
| Rust | `nightly-2026-01-15` (`rustc 1.94.0-nightly`) |
| Cairo compiler | `2.15.0` |
| Scarb | `2.15.1` |
| STWO Cairo | `1.3.0` |
| STWO | `2.3.0` |
| wasm-pack | `0.15.0` |
| Node.js | `24.18.0` LTS |
| pnpm | `11.17.0` |

Direct dependencies are exact-pinned. `Cargo.lock`, `Scarb.lock`, and
`pnpm-lock.yaml` are committed. Docker base images and the local relay are
pinned by digest. CI regenerates a proof, verifies it natively and in WASM,
checks the Rust/TypeScript wire fixtures, audits shipped dependencies, and
smoke-tests the container stack.

See [reproducibility.md](docs/reproducibility.md) for the update procedure.

## Run a provider

Production mode refuses an ephemeral identity, plaintext relay URLs, missing
relays or artifact configuration, and missing or malformed program trust
values. Operators remain responsible for reviewing those values.

```bash
export SOUL_PROVIDER_MODE=production
export SOUL_PROVIDER_RELAYS=wss://relay.example
export SOUL_PROVIDER_SECRET_KEY=... # exactly 32 secret hex bytes
export SOUL_PROVIDER_HTTP_ADDR=0.0.0.0:8081
export SOUL_PROVIDER_ARTIFACT_DIR=/var/lib/soul/proofs
export SOUL_PROVIDER_PUBLIC_BASE_URL=https://proofs.example
export SOUL_CAIRO_EXECUTABLE=/opt/soul/soul_cairo.executable.json
export SOUL_CAIRO_PROGRAM_HASH=...   # from reviewed protocol/programs.json
export SOUL_CAIRO_EXECUTABLE_SHA256=... # from the same manifest

cargo run --locked --release --package soul-provider
```

Operational details are in [deployment.md](docs/deployment.md).

## Contributing

The highest-leverage contributions strengthen a trust boundary: a new negative
proof test, a cross-language fixture, a protocol ambiguity removed, or a
reproducible toolchain improvement.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and
[adding-a-service.md](docs/adding-a-service.md). Follow [SECURITY.md](SECURITY.md)
for private vulnerability reporting; do not open a public issue.

## License

[MIT](LICENSE). Fork it, audit it, run it, and make the verifier harder to fool.
