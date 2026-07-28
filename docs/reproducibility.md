# Reproducibility

Soul Society pins the whole proof-producing path because a compiler or prover
update can change the executable, program hash, proof format, or verifier.

## Version authorities

| Layer | Authority |
|---|---|
| Rust | `rust-toolchain.toml` |
| Rust crates | exact workspace/local manifest versions and `Cargo.lock` |
| Cairo/Scarb | `.tool-versions`, `Scarb.toml`, and `Scarb.lock` |
| Node/pnpm | `.node-version`, `.tool-versions`, and `package.json#packageManager` |
| JavaScript | exact direct versions and `pnpm-lock.yaml` |
| wasm-pack | `scripts/build-wasm.sh`, setup, CI, and Dockerfiles |
| Containers | pinned Dockerfile frontend, OCI digests, and dated Debian snapshot |
| Cairo trust | `protocol/programs.json` |

Lockfiles are source artifacts. Do not remove or ignore them.

## Clean bootstrap

```bash
./scripts/setup.sh
./scripts/check.sh
```

`setup.sh` pins the asdf plugin revisions as well as installed tool versions and
fails on disagreement. `check.sh` regenerates the ignored real proof fixture
before any proof-dependent native or browser test. Docker provides the more
isolated bootstrap:

```bash
./scripts/run-local.sh
```

## Dependency update ceremony

1. Update one dependency family in a dedicated branch.
2. Pin direct dependencies to reviewed exact versions.
3. regenerate the appropriate lockfile with the declared toolchain;
4. inspect the complete dependency and license diff;
5. run `cargo audit` and `pnpm audit --prod`;
6. rebuild the Cairo executable;
7. run `./scripts/generate-test-data.sh`;
8. treat any program-hash change as a security-sensitive program update;
9. run `./scripts/check.sh` and `SOUL_RUN_LIVE_E2E=1 ./scripts/check.sh`;
10. build both Dockerfiles from a clean checkout.

For npm packaging, inspect the actual tarball:

```bash
pnpm --filter @soul-society/sdk pack --pack-destination /tmp/soul-pack
```

The SDK is not yet published to the npm registry. The tarball gate validates
release contents; publication is a separate maintainer action.

## Fixture classes

- `protocol/fixtures/wire` is small, deterministic, tracked, and regenerated
  from public test-only keys.
- `protocol/fixtures/generated` contains a real proof. It is ignored because
  proofs are large and channel draws need not be byte-stable.
- `protocol/programs.json` is tracked. It is derived only after the generated
  proof has verified and also records the executable SHA-256.

CI regenerates the real proof, compares the deterministic fixtures and trust
manifest, verifies valid and mutated proofs natively and in WASM, and runs the
signed provider pipeline.

## Troubleshooting

If a build unexpectedly selects another compiler, run:

```bash
rustc --version
scarb --version
node --version
pnpm --version
wasm-pack --version
```

Do not “fix” a mismatch by relaxing a manifest range. Align the installed tool
with the declared version, remove only the affected generated build directory,
and rebuild.
