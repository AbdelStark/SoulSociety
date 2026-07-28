#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly RELAY_IMAGE="scsibug/nostr-rs-relay:0.10.0@sha256:48d54c2d2781577cf3ed2951112f0953dc2c5e7c9d2ea20c64e8c0fa37d16e4d"
readonly TEST_PROVIDER_SECRET="0000000000000000000000000000000000000000000000000000000000000002"
readonly RELAY_CONTAINER="soul-relay-e2e-$$"
readonly PROGRAM_MANIFEST="${REPO_ROOT}/protocol/programs.json"
readonly WIRE_MANIFEST="${REPO_ROOT}/protocol/fixtures/wire/fixture-manifest.json"

require() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'error: %s is required\n' "$1" >&2
    exit 1
  }
}

wait_for_http() {
  local url="$1"
  local attempts="${2:-60}"
  local watched_pid="${3:-}"
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    if curl --fail --silent "${url}" >/dev/null 2>&1; then
      return 0
    fi
    if [[ -n "${watched_pid}" ]] && ! kill -0 "${watched_pid}" >/dev/null 2>&1; then
      return 1
    fi
    sleep 1
  done
  return 1
}

cd -- "${REPO_ROOT}"
require cargo
require curl
require docker

[[ -f "${PROGRAM_MANIFEST}" ]] || {
  printf 'error: run ./scripts/generate-test-data.sh first\n' >&2
  exit 1
}
[[ -f "${WIRE_MANIFEST}" ]] || {
  printf 'error: tracked Soul Wire fixtures are missing\n' >&2
  exit 1
}

program_hash="$(awk -F '"' '/"program_hash"/ {print $4; exit}' "${PROGRAM_MANIFEST}")"
executable_sha256="$(awk -F '"' '/"artifact_sha256"/ {print $4; exit}' "${PROGRAM_MANIFEST}")"
provider_pubkey="$(awk -F '"' '/"provider_public_key"/ {print $4; exit}' "${WIRE_MANIFEST}")"
artifact_dir="$(mktemp -d "${TMPDIR:-/tmp}/soul-e2e-proofs.XXXXXX")"
provider_log="${artifact_dir}/provider.log"
provider_pid=

cleanup() {
  if [[ -n "${provider_pid}" ]]; then
    kill "${provider_pid}" >/dev/null 2>&1 || true
    wait "${provider_pid}" >/dev/null 2>&1 || true
  fi
  docker rm --force "${RELAY_CONTAINER}" >/dev/null 2>&1 || true
  rm -rf -- "${artifact_dir}"
}
trap cleanup EXIT

cargo build --locked --release --package soul-provider --bin soul-provider

docker run --detach --rm \
  --platform linux/amd64 \
  --name "${RELAY_CONTAINER}" \
  --publish 7000:8080 \
  "${RELAY_IMAGE}" >/dev/null

for ((attempt = 1; attempt <= 60; attempt += 1)); do
  if curl --fail --silent \
    --header 'Accept: application/nostr+json' \
    http://127.0.0.1:7000 >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    printf 'error: local relay did not become ready\n' >&2
    exit 1
  fi
  sleep 1
done

SOUL_PROVIDER_MODE=test \
SOUL_PROVIDER_RELAYS=ws://127.0.0.1:7000 \
SOUL_PROVIDER_SECRET_KEY="${TEST_PROVIDER_SECRET}" \
SOUL_PROVIDER_NAME=soul-provider-e2e \
SOUL_PROVIDER_HTTP_ADDR=127.0.0.1:8081 \
SOUL_PROVIDER_ARTIFACT_DIR="${artifact_dir}" \
SOUL_PROVIDER_PUBLIC_BASE_URL=http://127.0.0.1:8081 \
SOUL_PROVIDER_MAX_CONCURRENT_PROOFS=1 \
SOUL_CAIRO_EXECUTABLE="${REPO_ROOT}/crates/soul-cairo/target/dev/soul_cairo.executable.json" \
SOUL_CAIRO_PROGRAM_HASH="${program_hash}" \
SOUL_CAIRO_EXECUTABLE_SHA256="${executable_sha256}" \
RUST_LOG=info \
cargo run --quiet --locked --release --package soul-provider >"${provider_log}" 2>&1 &
provider_pid=$!

if ! wait_for_http http://127.0.0.1:8081/healthz 120 "${provider_pid}"; then
  cat "${provider_log}" >&2
  printf 'error: provider did not become ready\n' >&2
  exit 1
fi

SOUL_E2E_RELAY=ws://127.0.0.1:7000 \
SOUL_E2E_PROVIDER_PUBKEY="${provider_pubkey}" \
SOUL_E2E_TIMEOUT_SECS=240 \
cargo run --quiet --locked --release --package soul-provider --example local_client

printf 'Live-relay Soul Wire round trip passed.\n'
