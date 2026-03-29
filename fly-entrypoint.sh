#!/usr/bin/env bash
set -euo pipefail

node /app/presage-bridge/server.cjs &
BRIDGE_PID=$!

node /app/backend/index.js &
API_PID=$!

shutdown() {
  kill "$BRIDGE_PID" "$API_PID" >/dev/null 2>&1 || true
  wait "$BRIDGE_PID" "$API_PID" >/dev/null 2>&1 || true
}

trap shutdown SIGINT SIGTERM

set +e
wait -n "$BRIDGE_PID" "$API_PID"
EXIT_CODE=$?
set -e

shutdown
exit "$EXIT_CODE"
