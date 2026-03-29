#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_DIR="$ROOT_DIR/presage-bridge/native"
BUILD_DIR="$SOURCE_DIR/build"

EXTRA_ARGS=()
DISCOVERED_SMARTSPECTRA_DIR=""

discover_smartspectra_dir() {
  local match=""

  match="$(
    find /usr /usr/local \
      \( -name 'SmartSpectraConfig.cmake' -o -name 'smartspectra-config.cmake' \) \
      -print 2>/dev/null | head -n 1
  )"
  if [[ -n "$match" ]]; then
    dirname "$match"
    return 0
  fi

  return 1
}

if [[ -n "${SMARTSPECTRA_DIR:-}" ]]; then
  EXTRA_ARGS+=("-DSmartSpectra_DIR=${SMARTSPECTRA_DIR}")
elif DISCOVERED_SMARTSPECTRA_DIR="$(discover_smartspectra_dir)"; then
  echo "Using detected SmartSpectra CMake package at $DISCOVERED_SMARTSPECTRA_DIR"
  EXTRA_ARGS+=("-DSmartSpectra_DIR=${DISCOVERED_SMARTSPECTRA_DIR}")
fi

if [[ -n "${CMAKE_PREFIX_PATH:-}" ]]; then
  EXTRA_ARGS+=("-DCMAKE_PREFIX_PATH=${CMAKE_PREFIX_PATH}")
fi

if [[ ! -f /usr/lib/x86_64-linux-gnu/libGLESv3.so && -f /usr/lib/x86_64-linux-gnu/libGLESv2.so && -f /usr/include/GLES3/gl3.h ]]; then
  echo "Using GLESv2 as a compatible GLES3 library for CMake discovery"
  EXTRA_ARGS+=("-DOPENGL_gles3_LIBRARY=/usr/lib/x86_64-linux-gnu/libGLESv2.so")
  EXTRA_ARGS+=("-DOPENGL_GLES3_INCLUDE_DIR=/usr/include")
fi

if [[ ! -f /usr/lib/aarch64-linux-gnu/libGLESv3.so && -f /usr/lib/aarch64-linux-gnu/libGLESv2.so && -f /usr/include/GLES3/gl3.h ]]; then
  echo "Using ARM64 GLESv2 as a compatible GLES3 library for CMake discovery"
  EXTRA_ARGS+=("-DOPENGL_gles3_LIBRARY=/usr/lib/aarch64-linux-gnu/libGLESv2.so")
  EXTRA_ARGS+=("-DOPENGL_GLES3_INCLUDE_DIR=/usr/include")
fi

if [[ -f "$BUILD_DIR/CMakeCache.txt" ]] && ! grep -Fq "$SOURCE_DIR" "$BUILD_DIR/CMakeCache.txt"; then
  echo "Clearing incompatible CMake cache in $BUILD_DIR..."
  rm -rf "$BUILD_DIR"
fi

echo "Configuring SmartSpectra bridge..."

set +e
if [[ ${#EXTRA_ARGS[@]} -gt 0 ]]; then
  cmake -S "$SOURCE_DIR" -B "$BUILD_DIR" "${EXTRA_ARGS[@]}"
else
  cmake -S "$SOURCE_DIR" -B "$BUILD_DIR"
fi
status=$?
set -e

if [[ $status -ne 0 ]]; then
  if [[ -z "${SMARTSPECTRA_DIR:-}" && -z "$DISCOVERED_SMARTSPECTRA_DIR" && -z "${CMAKE_PREFIX_PATH:-}" ]]; then
    cat <<'EOF'

SmartSpectra CMake package was not found.

Install the SmartSpectra SDK first, or point CMake at it explicitly:

  SMARTSPECTRA_DIR=/path/to/SmartSpectraConfig.cmake/dir npm run build:presage-bridge

or:

  CMAKE_PREFIX_PATH=/path/to/sdk/prefix npm run build:presage-bridge

Expected CMake package names:
  - SmartSpectraConfig.cmake
  - smartspectra-config.cmake

EOF
  else
    cat <<'EOF'

SmartSpectra bridge configuration failed after locating the SDK.

Review the CMake error output above for the specific compiler, dependency,
or toolchain issue and rerun the build.

EOF
  fi
  exit $status
fi

cmake --build "$BUILD_DIR"
