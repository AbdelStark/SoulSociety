#!/bin/bash
# Build WASM bindings for browser verification
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🔧 Building Soul Society WASM Bindings${NC}"
echo ""

# Navigate to project root
cd "$(dirname "$0")/.."

# Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    echo -e "${YELLOW}Installing wasm-pack...${NC}"
    cargo install wasm-pack
fi

# Build WASM
echo -e "${YELLOW}Building WASM package...${NC}"
cd crates/soul-wasm
wasm-pack build --target web --out-dir pkg

# Create destination directory
DEST_DIR="../../apps/web/src/lib/verification/wasm"
mkdir -p "$DEST_DIR"

# Copy WASM files
echo -e "${YELLOW}Copying to web app...${NC}"
cp pkg/soul_wasm.js "$DEST_DIR/"
cp pkg/soul_wasm_bg.wasm "$DEST_DIR/"
cp pkg/soul_wasm.d.ts "$DEST_DIR/" 2>/dev/null || true

# Create TypeScript wrapper if it doesn't exist
if [ ! -f "$DEST_DIR/index.ts" ]; then
    cat > "$DEST_DIR/index.ts" << 'EOF'
// Soul Society WASM Verification Module
// Auto-generated wrapper for soul-wasm bindings

import init, { WasmVerifier, init_panic_hook } from './soul_wasm.js';

let initialized = false;
let verifier: WasmVerifier | null = null;

/**
 * Initialize the WASM module
 * Must be called before using any verification functions
 */
export async function initWasm(): Promise<void> {
  if (initialized) return;

  await init();
  init_panic_hook();
  verifier = new WasmVerifier();
  initialized = true;
}

/**
 * Verify a STARK proof
 *
 * @param proofBytes - The serialized proof bytes
 * @param publicInputs - Array of public inputs as strings
 * @returns Promise<boolean> - true if the proof is valid
 */
export async function verifyProof(
  proofBytes: Uint8Array,
  publicInputs: string[]
): Promise<boolean> {
  if (!initialized || !verifier) {
    await initWasm();
  }

  return verifier!.verify_proof(proofBytes, JSON.stringify(publicInputs));
}

export { WasmVerifier };
EOF
    echo -e "${GREEN}✅ Created TypeScript wrapper${NC}"
fi

cd ../..
echo ""
echo -e "${GREEN}✅ WASM bindings built and copied to web app${NC}"
echo "   Location: apps/web/src/lib/verification/wasm/"
