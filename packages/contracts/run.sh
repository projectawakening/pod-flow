#!/bin/bash
set -e

# Start anvil with the saved state
echo "Starting Anvil node..."
anvil --gas-limit 120000000 > /dev/null 2>&1 &
ANVIL_PID=$!

# Wait for anvil to initialize
echo "Waiting for Anvil to initialize..."
sleep 2

# Check if Anvil is running properly
if ! curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 > /dev/null; then
  echo "ERROR: Anvil node failed to start properly."
  kill $ANVIL_PID 2>/dev/null || true
  exit 1
fi

# Print latest block for debugging
LATEST_BLOCK=$(curl -s -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://127.0.0.1:8545 | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
echo "Latest block: $LATEST_BLOCK"

export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export RPC_URL=http://127.0.0.1:8545

# Run deployment and post deploy script
echo "Running World deploy..."
pnpm run deploy || { echo "Deploy failed"; kill $ANVIL_PID; exit 1; }

echo "Anvil with World deployed"