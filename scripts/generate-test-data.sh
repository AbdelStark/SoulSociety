#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly WIRE_FIXTURES="${REPO_ROOT}/protocol/fixtures/wire"
readonly PROOF_FIXTURES="${REPO_ROOT}/protocol/fixtures/generated"
readonly PROGRAM_MANIFEST="${REPO_ROOT}/protocol/programs.json"
readonly CAIRO_EXECUTABLE="${REPO_ROOT}/crates/soul-cairo/target/dev/soul_cairo.executable.json"

mode=write
if [[ "${1:-}" == "--check" ]]; then
  mode=check
elif [[ $# -ne 0 ]]; then
  printf 'usage: %s [--check]\n' "$0" >&2
  exit 2
fi

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/soul-fixtures.XXXXXX")"
trap 'rm -rf -- "${temporary_dir}"' EXIT

cd -- "${REPO_ROOT}"
(cd crates/soul-cairo && scarb build)

wire_output="${WIRE_FIXTURES}"
proof_output="${PROOF_FIXTURES}"
manifest_output="${PROGRAM_MANIFEST}"
if [[ "${mode}" == check ]]; then
  wire_output="${temporary_dir}/wire"
  # Real proof fixtures are ignored, generated build inputs. Keep them so the
  # subsequent native and browser verification gates cannot silently skip.
  proof_output="${PROOF_FIXTURES}"
  manifest_output="${temporary_dir}/programs.json"
fi

mkdir -p -- "${wire_output}" "${proof_output}" "$(dirname -- "${manifest_output}")"
cargo run --quiet --locked --package soul-core --example generate_fixtures -- "${wire_output}"
cargo run --quiet --locked --release --package soul-prover --bin soul-proof-fixture -- \
  --out-dir "${proof_output}" \
  --executable "${CAIRO_EXECUTABLE}"
node "${SCRIPT_DIR}/write-program-manifest.mjs" \
  "${proof_output}/manifest.json" \
  "${CAIRO_EXECUTABLE}" \
  "${manifest_output}"

if [[ "${mode}" == check ]]; then
  diff --recursive --unified "${WIRE_FIXTURES}" "${wire_output}"
  cmp "${PROGRAM_MANIFEST}" "${manifest_output}"
  printf 'Tracked wire fixtures and trusted program manifest are reproducible.\n'
else
  printf 'Wire fixtures:  %s\n' "${WIRE_FIXTURES}"
  printf 'Proof fixtures: %s (ignored; generated on demand)\n' "${PROOF_FIXTURES}"
  printf 'Program trust:  %s\n' "${PROGRAM_MANIFEST}"
fi
