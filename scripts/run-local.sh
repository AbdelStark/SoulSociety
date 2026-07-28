#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly COMPOSE_FILE="${REPO_ROOT}/infra/docker-compose.yml"
readonly PROGRAM_MANIFEST="${REPO_ROOT}/protocol/programs.json"
readonly TEST_PROVIDER_SECRET="0000000000000000000000000000000000000000000000000000000000000002"
readonly TEST_PROVIDER_PUBKEY="c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

read_env_value() {
  local key="$1"
  local file="$2"
  local line
  line="$(grep -E "^${key}=" "${file}" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

cd -- "${REPO_ROOT}"
require docker
docker compose version >/dev/null

[[ -f "${PROGRAM_MANIFEST}" ]] \
  || fail "trusted program manifest is missing; run ./scripts/generate-test-data.sh"

program_hash="$(awk -F '"' '/"program_hash"/ {print $4; exit}' "${PROGRAM_MANIFEST}")"
executable_sha256="$(awk -F '"' '/"artifact_sha256"/ {print $4; exit}' "${PROGRAM_MANIFEST}")"
[[ "${program_hash}" =~ ^0x[0-9a-f]{64}$ ]] \
  || fail "protocol/programs.json does not contain a canonical program hash"
[[ "${executable_sha256}" =~ ^[0-9a-f]{64}$ ]] \
  || fail "protocol/programs.json does not contain a canonical executable SHA-256"

if [[ ! -f .env ]]; then
  cp .env.example .env
fi

provider_key="$(read_env_value SOUL_PROVIDER_SECRET_KEY .env)"
if [[ -z "${provider_key}" ]]; then
  provider_key="${TEST_PROVIDER_SECRET}"
fi
[[ "${provider_key}" =~ ^[0-9a-f]{64}$ ]] \
  || fail "SOUL_PROVIDER_SECRET_KEY must be 32 lowercase hex bytes"
provider_pubkeys="$(read_env_value VITE_SOUL_PROVIDER_PUBKEYS .env)"
if [[ -z "${provider_pubkeys}" ]]; then
  provider_pubkeys="${TEST_PROVIDER_PUBKEY}"
fi
if [[ "${provider_key}" != "${TEST_PROVIDER_SECRET}" \
  && "${provider_pubkeys}" == "${TEST_PROVIDER_PUBKEY}" ]]; then
  fail "a custom provider secret requires its matching VITE_SOUL_PROVIDER_PUBKEYS"
fi

export SOUL_PROVIDER_SECRET_KEY="${provider_key}"
export SOUL_CAIRO_PROGRAM_HASH="${program_hash}"
export SOUL_CAIRO_EXECUTABLE_SHA256="${executable_sha256}"
export VITE_SOUL_PROVIDER_PUBKEYS="${provider_pubkeys}"

docker compose --file "${COMPOSE_FILE}" config --quiet
docker compose --file "${COMPOSE_FILE}" up --build --detach --wait --wait-timeout 300

printf '\nSoul Society is ready:\n'
printf '  Web:      http://127.0.0.1:5173\n'
printf '  Relay:    ws://127.0.0.1:8080\n'
printf '  Provider: http://127.0.0.1:8081/healthz\n'
printf '\nStop with: ./scripts/stop-local.sh\n'
