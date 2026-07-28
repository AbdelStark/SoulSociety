#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

cd -- "${REPO_ROOT}"

cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked -- -D warnings

(
  cd crates/soul-cairo
  readonly lock_hash_before="$(git hash-object Scarb.lock)"
  scarb fmt --check
  scarb build
  scarb cairo-test
  [[ "$(git hash-object Scarb.lock)" == "${lock_hash_before}" ]] || {
    printf 'Scarb changed Scarb.lock; regenerate and review the lockfile explicitly.\n' >&2
    exit 1
  }
)

"${SCRIPT_DIR}/generate-test-data.sh" --check
cargo test --workspace --all-targets --locked
cargo test --locked --package soul-prover --features real-proof-fixture
cargo test --locked --package soul-wasm --features real-proof-fixture
SOUL_TEST_CAIRO_EXECUTABLE="${REPO_ROOT}/crates/soul-cairo/target/dev/soul_cairo.executable.json" \
SOUL_TEST_CAIRO_PROGRAM_HASH="$(
  awk -F '"' '/"program_hash"/ {print $4; exit}' protocol/programs.json
)" \
SOUL_TEST_CAIRO_EXECUTABLE_SHA256="$(
  awk -F '"' '/"artifact_sha256"/ {print $4; exit}' protocol/programs.json
)" \
cargo test --locked --package soul-provider --test signed_real_pipeline -- --ignored --nocapture
"${SCRIPT_DIR}/build-wasm.sh"
wasm-pack test --node crates/soul-wasm --locked --features real-proof-fixture

pnpm lint
pnpm test
pnpm build

if [[ "${SOUL_RUN_LIVE_E2E:-0}" == 1 ]]; then
  "${SCRIPT_DIR}/e2e-local-relay.sh"
fi

printf '\nAll local quality gates passed.\n'
