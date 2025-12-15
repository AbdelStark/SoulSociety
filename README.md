```
███████╗ ██████╗ ██╗   ██╗██╗         ███████╗ ██████╗  ██████╗██╗███████╗████████╗██╗   ██╗
██╔════╝██╔═══██╗██║   ██║██║         ██╔════╝██╔═══██╗██╔════╝██║██╔════╝╚══██╔══╝╚██╗ ██╔╝
███████╗██║   ██║██║   ██║██║         ███████╗██║   ██║██║     ██║█████╗     ██║    ╚████╔╝
╚════██║██║   ██║██║   ██║██║         ╚════██║██║   ██║██║     ██║██╔══╝     ██║     ╚██╔╝
███████║╚██████╔╝╚██████╔╝███████╗    ███████║╚██████╔╝╚██████╗██║███████╗   ██║      ██║
╚══════╝ ╚═════╝  ╚═════╝ ╚══════╝    ╚══════╝ ╚═════╝  ╚═════╝╚═╝╚══════╝   ╚═╝      ╚═╝
```

<p align="center">
  <strong>Permissionless. Verifiable. Unstoppable.</strong>
</p>

<p align="center">
  <em>"Don't trust. Verify." — The cypherpunks were right all along.</em>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#services">Services</a> •
  <a href="#sdk">SDK</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## The Problem

The digital economy runs on trust. Trust in APIs. Trust in oracles. Trust in the magic black boxes that tell us "the answer is 42."

But trust is a single point of failure. Trust is what gets exploited. Trust is what the cypherpunks warned us about.

**What if computation itself could be verified?**

## The Solution

Soul Society is a **permissionless marketplace** for verifiable digital services. Every computation generates a cryptographic proof—a mathematical guarantee that the work was done correctly.

No trust required. Math doesn't lie.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│    You                    Nostr Network                   Provider      │
│     │                          │                             │          │
│     │  ──── Job Request ─────► │ ──────────────────────────► │          │
│     │       (NIP-90 DVM)       │                             │          │
│     │                          │                             ▼          │
│     │                          │                      ┌─────────────┐   │
│     │                          │                      │  Execute    │   │
│     │                          │                      │  Cairo      │   │
│     │                          │                      │  Program    │   │
│     │                          │                      └──────┬──────┘   │
│     │                          │                             │          │
│     │                          │                      ┌──────▼──────┐   │
│     │                          │                      │  Generate   │   │
│     │                          │                      │  STARK      │   │
│     │                          │                      │  Proof      │   │
│     │                          │                      └──────┬──────┘   │
│     │                          │                             │          │
│     │  ◄─── Result + Proof ─── │ ◄───────────────────────────┘          │
│     │                          │                                        │
│     ▼                          │                                        │
│  ┌─────────────────┐           │                                        │
│  │ Verify in       │           │                                        │
│  │ Browser (WASM)  │           │                                        │
│  │ No server!      │           │                                        │
│  └─────────────────┘           │                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Why This Matters

- **No gatekeepers**: Anyone can be a provider. Anyone can be a customer.
- **No servers**: Verification happens in your browser via WASM.
- **No trust**: STARK proofs are succinct—tiny proofs for massive computations.
- **No censorship**: Nostr is the transport layer. Good luck stopping it.

## Quickstart

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Scarb](https://docs.swmansion.com/scarb/) (2.8.2+) for Cairo
- [Node.js](https://nodejs.org/) (20+) with pnpm
- [wasm-pack](https://rustwasm.github.io/wasm-pack/)

### One-liner

```bash
git clone https://github.com/anthropics/soul-society.git && cd soul-society && ./scripts/setup.sh
```

### Manual Setup

```bash
# Install dependencies
pnpm install

# Build everything
pnpm build

# Run Cairo tests
cd crates/soul-cairo && scarb test

# Run Rust tests
cargo test --workspace

# Start the web app
pnpm -F @soul-society/web dev
```

## Architecture

```
soul-society/
├── apps/
│   ├── provider/          # Rust DVM provider service
│   │   └── src/
│   │       ├── nostr/     # Nostr event handling
│   │       └── services/  # Job execution services
│   └── web/               # React frontend
│       └── src/
│           ├── lib/nostr/ # Nostr client integration
│           └── stores/    # Zustand state management
├── crates/
│   ├── soul-core/         # Core types and constants
│   ├── soul-prover/       # STWO STARK prover/verifier
│   ├── soul-cairo/        # Cairo programs (provable computation)
│   └── soul-wasm/         # WASM bindings for browser verification
└── packages/
    └── sdk/               # TypeScript SDK
```

### The Stack

| Layer | Technology | Why |
|-------|------------|-----|
| **Transport** | [Nostr](https://nostr.com/) | Censorship-resistant, decentralized messaging |
| **Job Protocol** | [NIP-90](https://github.com/nostr-protocol/nips/blob/master/90.md) | Data Vending Machines—marketplace semantics |
| **Provable Compute** | [Cairo](https://www.cairo-lang.org/) | Write once, prove anywhere |
| **Proof System** | [STWO](https://github.com/starkware-libs/stwo) | Circle STARKs—fast, small, post-quantum |
| **Browser Verify** | WASM | Trustless verification without servers |

## Services

### Fibonacci (kind: 5601/6601)

Compute the n-th Fibonacci number with proof of correctness.

```typescript
import { SoulClient } from '@soul-society/sdk';

const client = new SoulClient({ relays: ['wss://relay.damus.io'] });
const result = await client.fibonacci(1000);

console.log(result.value);  // F(1000)
console.log(result.proof);  // STARK proof
```

### Hash Verification (kind: 5602/6602)

Prove that a preimage hashes to a known value (Poseidon hash).

```typescript
const result = await client.verifyHash({
  hash: '0x1234...',
  preimage: '0xabcd...'
});
```

### Merkle Proof (kind: 5603/6603)

Prove membership in a Merkle tree.

```typescript
const result = await client.verifyMerkle({
  root: '0x...',
  leaf: '0x...',
  proof: ['0x...', '0x...'],
  index: 42
});
```

## SDK

### Installation

```bash
pnpm add @soul-society/sdk
# or
npm install @soul-society/sdk
```

### Usage

```typescript
import { SoulClient, WasmVerifier } from '@soul-society/sdk';

// Initialize
const client = new SoulClient({
  relays: ['wss://relay.damus.io', 'wss://nos.lol'],
  privateKey: process.env.NOSTR_PRIVATE_KEY, // optional
});

// Submit a job
const job = await client.submitJob({
  type: 'fibonacci',
  input: { n: 100 }
});

// Wait for result
const result = await job.wait();

// Verify locally (no server!)
const verifier = new WasmVerifier();
const isValid = await verifier.verify(result.proof, result.publicInputs);

console.log('Valid:', isValid); // true
```

## Event Kinds

Soul Society uses custom NIP-90 event kinds:

| Service | Request Kind | Result Kind |
|---------|--------------|-------------|
| Fibonacci | `5601` | `6601` |
| Hash Verify | `5602` | `6602` |
| Merkle Proof | `5603` | `6603` |

### Request Event Structure

```json
{
  "kind": 5601,
  "content": "{\"n\": 100}",
  "tags": [
    ["bid", "1000"],
    ["t", "fibonacci"]
  ]
}
```

### Result Event Structure

```json
{
  "kind": 6601,
  "content": "{\"status\":\"verified\",\"output\":{...},\"proof\":{...}}",
  "tags": [
    ["e", "<request_id>", "", "request"],
    ["p", "<customer_pubkey>"],
    ["status", "Verified"]
  ]
}
```

## Running a Provider

```bash
cd apps/provider

# Configure
export NOSTR_PRIVATE_KEY="nsec1..."
export RELAY_URLS="wss://relay.damus.io,wss://nos.lol"

# Run
cargo run --release
```

The provider will:
1. Subscribe to DVM request events
2. Execute Cairo programs
3. Generate STARK proofs
4. Publish verified results

## Security Model

```
┌──────────────────────────────────────────────────────────────┐
│                    TRUST ASSUMPTIONS                         │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  What you MUST trust:                                        │
│  ├── Cryptographic assumptions (collision-resistant hash)    │
│  ├── Cairo program correctness (auditable, open source)      │
│  └── Your browser (where WASM runs)                          │
│                                                              │
│  What you DON'T trust:                                       │
│  ├── The provider                                            │
│  ├── The relay                                               │
│  ├── The network                                             │
│  └── Anyone                                                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**STARK proofs are information-theoretic**: even with unlimited computational power, a malicious provider cannot forge a valid proof for an incorrect computation.

## Performance

| Metric | Value |
|--------|-------|
| Proof size | ~100 KB |
| Verification time | <100ms (browser) |
| Proving time | Service-dependent |

## Roadmap

- [x] Core infrastructure
- [x] Fibonacci service
- [x] Hash verification service
- [x] Merkle proof service
- [x] Browser WASM verification
- [x] TypeScript SDK
- [ ] Lightning payments integration
- [ ] More Cairo programs (signatures, range proofs)
- [ ] Provider reputation system
- [ ] Multi-provider redundancy

## Philosophy

> "Privacy is necessary for an open society in the electronic age."
> — Eric Hughes, A Cypherpunk's Manifesto (1993)

Soul Society extends this vision: **verifiability is necessary for a trustless society in the computational age.**

We don't ask you to trust us. We give you the tools to verify everything yourself.

The math is open. The code is open. The network is open.

**Verify, don't trust.**

## Contributing

We welcome contributions from fellow travelers on the path to a more verifiable future.

```bash
# Fork, clone, branch
git checkout -b feature/your-feature

# Make changes, test
cargo test --workspace
pnpm test

# Submit PR
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

MIT — Do what you want. Change the world.

---

<p align="center">
  <em>"The computer can be used as a tool to liberate and protect people, rather than to control them."</em>
  <br>
  — Hal Finney
</p>

<p align="center">
  Built with cryptographic conviction by humans who believe in a verifiable future.
</p>

<p align="center">
  <sub>⚡ Powered by STARKs • Delivered by Nostr • Verified by Math ⚡</sub>
</p>
