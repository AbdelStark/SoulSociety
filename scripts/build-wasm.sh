#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly WASM_PACK_VERSION="0.15.0"
readonly OUTPUT_DIR="${REPO_ROOT}/apps/web/public/wasm"
readonly PROGRAM_MANIFEST="${REPO_ROOT}/protocol/programs.json"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

command -v wasm-pack >/dev/null 2>&1 \
  || fail "wasm-pack ${WASM_PACK_VERSION} is required; run ./scripts/setup.sh"

actual_version="$(wasm-pack --version | awk '{print $2}')"
[[ "${actual_version}" == "${WASM_PACK_VERSION}" ]] \
  || fail "wasm-pack ${WASM_PACK_VERSION} is required (found ${actual_version})"
[[ -f "${PROGRAM_MANIFEST}" ]] \
  || fail "trusted program manifest is missing; run ./scripts/generate-test-data.sh"

temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/soul-wasm.XXXXXX")"
trap 'rm -rf -- "${temporary_dir}"' EXIT

env \
  -u AR_wasm32_unknown_unknown \
  -u CC_wasm32_unknown_unknown \
  -u CFLAGS_wasm32_unknown_unknown \
  -u CXX_wasm32_unknown_unknown \
  wasm-pack build \
  --release \
  --target web \
  --out-dir "${temporary_dir}/wasm" \
  --out-name soul_wasm \
  "${REPO_ROOT}/crates/soul-wasm" \
  --locked

rm -rf -- "${OUTPUT_DIR}"
mkdir -p -- "${OUTPUT_DIR}"
cp -R -- "${temporary_dir}/wasm/." "${OUTPUT_DIR}/"
cp -- "${PROGRAM_MANIFEST}" "${OUTPUT_DIR}/programs.json"

printf 'WASM verifier built at %s\n' "${OUTPUT_DIR}"
