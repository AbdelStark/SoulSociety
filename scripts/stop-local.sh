#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly COMPOSE_FILE="${REPO_ROOT}/infra/docker-compose.yml"
readonly PROGRAM_MANIFEST="${REPO_ROOT}/protocol/programs.json"
readonly TEST_PROVIDER_PUBKEY="c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5"

cd -- "${REPO_ROOT}"
export SOUL_CAIRO_PROGRAM_HASH
SOUL_CAIRO_PROGRAM_HASH="$(awk -F '"' '/"program_hash"/ {print $4; exit}' "${PROGRAM_MANIFEST}")"
export SOUL_CAIRO_EXECUTABLE_SHA256
SOUL_CAIRO_EXECUTABLE_SHA256="$(
  awk -F '"' '/"artifact_sha256"/ {print $4; exit}' "${PROGRAM_MANIFEST}"
)"
export VITE_SOUL_PROVIDER_PUBKEYS="${VITE_SOUL_PROVIDER_PUBKEYS:-${TEST_PROVIDER_PUBKEY}}"

docker compose --file "${COMPOSE_FILE}" down
