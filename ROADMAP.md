# Roadmap

Soul Society optimizes for evidence, not checkbox velocity.

## Current research-alpha baseline

- canonical Cairo execution for Fibonacci, Poseidon hash verification, and
  Poseidon Merkle membership;
- real STWO proving and native self-verification;
- trusted program identity and typed public-statement binding;
- Soul Wire signed request/result codec;
- bounded provider intake, duplicate suppression, and immutable proof storage;
- verifier-only WASM boundary and TypeScript SDK;
- real proof, mutation, signed pipeline, and live-relay test seams;
- pinned Rust, Cairo, Scarb, STWO, WASM, Node, pnpm, and container toolchains.

## Before any production claim

- independent Cairo/STWO/protocol/browser security audit;
- upstream proof-stack updates that remove the documented RustSec soundness and
  maintenance warnings;
- fuzzing for wire codecs, proof parsers, and artifact fetch policy;
- encrypted request transport plus proof-level witness-hiding and metadata
  leakage analysis;
- durable idempotency and job state across provider restart;
- authenticated artifact replication and retention semantics;
- benchmark corpus and published hardware-specific measurements;
- documented key rotation, incident response, backup, and upgrade operations;
- real-world multi-relay and multi-provider soak testing.

## Later, after the trust boundaries are mature

- Lightning payment negotiation and receipts without confusing payment with
  proof correctness;
- signed service discovery and independently curated program registries;
- provider reputation based on observable availability, not proof validity;
- proof aggregation and artifact distribution;
- additional independently audited Cairo services;
- encrypted remote signers such as NIP-46.

Items move into the baseline only with executable tests and claim-bounded
documentation.
