#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEFAULT_BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
NODE_BIN="${BUNDLED_NODE_BIN:-$DEFAULT_BUNDLED_NODE}"

if [[ -x "$NODE_BIN" ]]; then
  echo "Using bundled node: $NODE_BIN"
else
  NODE_BIN="node"
  echo "Bundled node not found; using system node"
fi

cd "$ROOT"
"$NODE_BIN" --test tests/*.test.js
