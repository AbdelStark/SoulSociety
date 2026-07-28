#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
readonly NODE_VERSION="24.18.0"
readonly PNPM_VERSION="11.17.0"
readonly SCARB_VERSION="2.15.1"
readonly WASM_PACK_VERSION="0.15.0"
readonly ASDF_NODEJS_PLUGIN_REF="779c8dc84b3bdab38c2c80622d315c2c3267f74b"
readonly ASDF_SCARB_PLUGIN_REF="875b155d8027370395420e330544abac56fe65ef"

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required"
}

install_asdf_toolchains() {
  command -v asdf >/dev/null 2>&1 || return 0

  if ! asdf plugin list | grep -qx nodejs; then
    asdf plugin add nodejs https://github.com/asdf-vm/asdf-nodejs.git
  fi
  asdf plugin update nodejs "${ASDF_NODEJS_PLUGIN_REF}"
  if ! asdf plugin list | grep -qx scarb; then
    asdf plugin add scarb https://github.com/software-mansion/asdf-scarb.git
  fi
  asdf plugin update scarb "${ASDF_SCARB_PLUGIN_REF}"
  asdf install nodejs "${NODE_VERSION}"
  asdf install scarb "${SCARB_VERSION}"
  asdf reshim
}

cd -- "${REPO_ROOT}"

if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
fi

require rustup
rustup toolchain install nightly-2026-01-15 \
  --profile minimal \
  --component clippy,rustfmt \
  --target wasm32-unknown-unknown

install_asdf_toolchains
require node
require corepack
require scarb

[[ "$(node --version)" == "v${NODE_VERSION}" ]] \
  || fail "Node ${NODE_VERSION} is required (found $(node --version))"
[[ "$(scarb --version | awk 'NR == 1 {print $2}')" == "${SCARB_VERSION}" ]] \
  || fail "Scarb ${SCARB_VERSION} is required"

corepack enable
corepack install --global "pnpm@${PNPM_VERSION}"
if command -v asdf >/dev/null 2>&1; then
  asdf reshim nodejs "${NODE_VERSION}"
fi
hash -r
[[ "$(pnpm --version)" == "${PNPM_VERSION}" ]] \
  || fail "pnpm ${PNPM_VERSION} is required (found $(pnpm --version))"

if ! command -v wasm-pack >/dev/null 2>&1 \
  || [[ "$(wasm-pack --version | awk '{print $2}')" != "${WASM_PACK_VERSION}" ]]; then
  cargo install wasm-pack --version "${WASM_PACK_VERSION}" --locked
fi

pnpm install --frozen-lockfile
(cd crates/soul-cairo && scarb build)
cargo build --workspace --all-targets --locked
"${SCRIPT_DIR}/build-wasm.sh"

printf '\nToolchains and dependencies are ready. Run ./scripts/check.sh next.\n'
