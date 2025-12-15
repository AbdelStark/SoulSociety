#!/bin/bash
# Soul Society Local Development Stack
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting Soul Society Local Environment${NC}"
echo ""

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is required but not installed.${NC}"
    exit 1
fi

if ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose is required but not installed.${NC}"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Generate secret keys if not present
if [ ! -f .env ]; then
    echo -e "${YELLOW}Generating .env file...${NC}"
    cp .env.example .env

    # Generate Nostr secret keys
    if command -v openssl &> /dev/null; then
        PROVIDER_SK=$(openssl rand -hex 32)
        PROVIDER_SK_2=$(openssl rand -hex 32)

        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/^PROVIDER_SECRET_KEY=$/PROVIDER_SECRET_KEY=${PROVIDER_SK}/" .env
            sed -i '' "s/^PROVIDER_SECRET_KEY_2=$/PROVIDER_SECRET_KEY_2=${PROVIDER_SK_2}/" .env
        else
            sed -i "s/^PROVIDER_SECRET_KEY=$/PROVIDER_SECRET_KEY=${PROVIDER_SK}/" .env
            sed -i "s/^PROVIDER_SECRET_KEY_2=$/PROVIDER_SECRET_KEY_2=${PROVIDER_SK_2}/" .env
        fi

        echo -e "${GREEN}✅ Generated new provider keys${NC}"
    fi
fi

# Build WASM if needed
if [ ! -d "apps/web/src/lib/verification/wasm" ]; then
    echo -e "${YELLOW}Building WASM bindings...${NC}"
    if [ -f "./scripts/build-wasm.sh" ]; then
        ./scripts/build-wasm.sh || echo -e "${YELLOW}⚠️  WASM build skipped${NC}"
    fi
fi

# Start services
echo -e "${YELLOW}Starting Docker Compose...${NC}"
docker compose -f infra/docker-compose.yml up --build -d

# Wait for services
echo -e "${YELLOW}Waiting for services to be healthy...${NC}"
sleep 5

# Check health
echo ""
if curl -s http://localhost:8080 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Nostr Relay: http://localhost:8080${NC}"
else
    echo -e "${YELLOW}⚠️  Relay still starting...${NC}"
fi

if curl -s http://localhost:5173 > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Web UI: http://localhost:5173${NC}"
else
    echo -e "${YELLOW}⚠️  Web UI still starting...${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Soul Society is running!${NC}"
echo ""
echo "   Web UI: http://localhost:5173"
echo "   Relay:  ws://localhost:8080"
echo ""
echo "To view logs: docker compose -f infra/docker-compose.yml logs -f"
echo "To stop:      docker compose -f infra/docker-compose.yml down"
