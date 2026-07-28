# Contributing

Soul Society welcomes careful work on proof systems, Nostr protocols, Rust,
Cairo, TypeScript, browser security, documentation, and reproducible builds.

## Before coding

- Read [architecture.md](docs/architecture.md) and
  [security-model.md](docs/security-model.md).
- Search existing issues and open a design issue for a protocol, trust-root, or
  public API change.
- Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Setup

```bash
# From a source checkout:
./scripts/setup.sh
./scripts/check.sh
```

Tool versions are exact. Do not widen dependency ranges to accommodate a local
machine. See [reproducibility.md](docs/reproducibility.md).

## Engineering rules

- Cairo is the computation authority. Do not publish a Rust-computed result as
  if Cairo proved it.
- A program hash comes from a reviewed manifest-generation flow, never from the
  proof currently being verified.
- Parse untrusted input once at the boundary and pass typed values inward.
- Keep modules deep and interfaces narrow. Prefer one explicit adapter over
  duplicated protocol or proof logic.
- Never persist a browser secret implicitly.
- No success state before native or WASM verification completes.
- Bound remote input, concurrent intake, proof size, timeouts, retries, and cleanup.
- Public claims and docs must match executable evidence.

## Tests

Every behavior change needs the closest unit test. Trust-boundary changes also
need a negative test. Protocol changes require matching Rust and TypeScript
fixtures. Proof changes require valid and tampered proof coverage.

Useful focused commands:

```bash
(cd crates/soul-cairo && scarb cairo-test)
cargo test --workspace --all-targets --locked
wasm-pack test --node crates/soul-wasm --locked
pnpm test
```

Run the live relay path before requesting review:

```bash
SOUL_RUN_LIVE_E2E=1 ./scripts/check.sh
```

## Pull requests

Keep a PR reviewable and explain:

- the problem and threat/claim boundary;
- why this module owns the change;
- compatibility or migration impact;
- exact validation performed;
- any known limitation left intentionally.

Checklist:

- [ ] format, lint, unit, integration, and build gates pass;
- [ ] new remote inputs have explicit bounds and errors;
- [ ] fixtures and lockfiles are updated intentionally;
- [ ] program-hash changes are called out as trust-root changes;
- [ ] README/docs examples compile or run;
- [ ] no secret, local path, generated proof, or unrelated artifact is committed.

By participating, you agree to [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
