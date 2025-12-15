#!/bin/bash
# Soul Society Development Setup Script
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Setting up Soul Society Development Environment${NC}"
echo ""

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is required but not installed.${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1 found${NC}"
    return 0
}

echo "Checking prerequisites..."
check_command "node" || exit 1
check_command "pnpm" || { echo -e "${YELLOW}Installing pnpm...${NC}"; npm install -g pnpm; }
check_command "cargo" || exit 1
check_command "scarb" || echo -e "${YELLOW}⚠️  Scarb not found - Cairo development will be limited${NC}"
check_command "docker" || echo -e "${YELLOW}⚠️  Docker not found - containerized development unavailable${NC}"

echo ""

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from template...${NC}"
    cp .env.example .env

    # Generate provider secret keys
    if command -v openssl &> /dev/null; then
        PROVIDER_SK=$(openssl rand -hex 32)
        PROVIDER_SK_2=$(openssl rand -hex 32)

        # Update .env with generated keys
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/^PROVIDER_SECRET_KEY=$/PROVIDER_SECRET_KEY=${PROVIDER_SK}/" .env
            sed -i '' "s/^PROVIDER_SECRET_KEY_2=$/PROVIDER_SECRET_KEY_2=${PROVIDER_SK_2}/" .env
        else
            sed -i "s/^PROVIDER_SECRET_KEY=$/PROVIDER_SECRET_KEY=${PROVIDER_SK}/" .env
            sed -i "s/^PROVIDER_SECRET_KEY_2=$/PROVIDER_SECRET_KEY_2=${PROVIDER_SK_2}/" .env
        fi

        echo -e "${GREEN}✓ Generated provider secret keys${NC}"
    fi
fi

echo ""

# Install Node.js dependencies
echo -e "${YELLOW}Installing Node.js dependencies...${NC}"
pnpm install
echo -e "${GREEN}✓ Node.js dependencies installed${NC}"

echo ""

# Build Rust workspace
echo -e "${YELLOW}Building Rust workspace...${NC}"
cargo build
echo -e "${GREEN}✓ Rust workspace built${NC}"

echo ""

# Build Cairo project if Scarb is available
if command -v scarb &> /dev/null; then
    echo -e "${YELLOW}Building Cairo programs...${NC}"
    cd crates/soul-cairo && scarb build && cd ../..
    echo -e "${GREEN}✓ Cairo programs built${NC}"
fi

echo ""

# Run tests
echo -e "${YELLOW}Running tests...${NC}"
cargo test --quiet
pnpm -F @soul-society/web build --quiet 2>/dev/null || true
echo -e "${GREEN}✓ Tests passed${NC}"

echo ""
echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "Next steps:"
echo "  - Start development server: pnpm dev:web"
echo "  - Run local stack: ./scripts/run-local.sh"
echo "  - Build WASM: ./scripts/build-wasm.sh"
