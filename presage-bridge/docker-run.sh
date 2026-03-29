#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${PRESAGE_DOCKER_IMAGE:-vitalsight-presage-bridge}"
CONTAINER_NAME="${PRESAGE_DOCKER_CONTAINER:-vitalsight-presage-bridge}"
ENV_FILE="${PRESAGE_DOCKER_ENV_FILE:-$ROOT_DIR/backend/.env}"
PORT="${PRESAGE_BRIDGE_PORT:-8787}"
HOST_BRIDGE_PATTERN="${PRESAGE_HOST_BRIDGE_PATTERN:-node presage-bridge/server.cjs}"
BUILD_LOG_DIR="${PRESAGE_DOCKER_LOG_DIR:-$ROOT_DIR/.tmp}"
BUILD_LOG_PATH="$BUILD_LOG_DIR/presage-docker-build.log"
DOCKER_PLATFORM="${PRESAGE_DOCKER_PLATFORM:-linux/amd64}"
UBUNTU_VERSION="${PRESAGE_DOCKER_UBUNTU_VERSION:-22.04}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the local Presage bridge container." >&2
  exit 1
fi

echo "Checking Docker daemon..."
if ! docker version >/dev/null 2>&1; then
  echo "Docker Desktop is not reachable. Start Docker Desktop and try again." >&2
  exit 1
fi

if [[ -z "$DOCKER_PLATFORM" ]]; then
  echo "Could not determine Docker server platform." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Expected env file at $ENV_FILE. Create backend/.env first." >&2
  exit 1
fi

mkdir -p "$BUILD_LOG_DIR"

if pgrep -f "$HOST_BRIDGE_PATTERN" >/dev/null 2>&1; then
  echo "Stopping stale host Presage bridge process..."
  pkill -f "$HOST_BRIDGE_PATTERN" || true
  sleep 1
fi

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT is already in use. Stop the existing listener before starting the Docker Presage bridge." >&2
  lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >&2 || true
  exit 1
fi

echo "Building Presage bridge image $IMAGE_NAME for $DOCKER_PLATFORM with ubuntu:$UBUNTU_VERSION..."
if ! DOCKER_BUILDKIT=1 docker build --platform "$DOCKER_PLATFORM" --build-arg "UBUNTU_VERSION=$UBUNTU_VERSION" --progress=plain -f "$ROOT_DIR/presage-bridge/Dockerfile" -t "$IMAGE_NAME" "$ROOT_DIR" >"$BUILD_LOG_PATH" 2>&1; then
  echo "Presage bridge image build failed." >&2
  echo "Last 40 lines from $BUILD_LOG_PATH:" >&2
  tail -n 40 "$BUILD_LOG_PATH" >&2 || true
  exit 100
fi
echo "Presage bridge image built successfully."

if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  echo "Removing existing Presage bridge container $CONTAINER_NAME..."
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi

echo "Starting Presage bridge container on http://127.0.0.1:$PORT"
docker run --rm \
  --platform "$DOCKER_PLATFORM" \
  --name "$CONTAINER_NAME" \
  --env-file "$ENV_FILE" \
  -e PRESAGE_BRIDGE_HOST=0.0.0.0 \
  -e PRESAGE_BRIDGE_PORT="$PORT" \
  -e PRESAGE_SDK_RUNNER_PATH=/app/presage-bridge/native/build/smartspectra_bridge \
  -p "$PORT:$PORT" \
  "$IMAGE_NAME"
