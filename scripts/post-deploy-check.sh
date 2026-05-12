#!/usr/bin/env bash
set -euo pipefail

# Post-deploy smoke checks for self-hosted/Coolify installs.
# Usage:
#   scripts/post-deploy-check.sh https://mongo-dashboard.example.com
#   scripts/post-deploy-check.sh http://127.0.0.1:3000

BASE_URL="${1:-}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-8}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: scripts/post-deploy-check.sh <base-url>"
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  HTTP_TOOL="curl"
elif command -v wget >/dev/null 2>&1; then
  HTTP_TOOL="wget"
else
  echo "Error: curl or wget is required."
  exit 1
fi

http_status() {
  local url="$1"
  if [[ "${HTTP_TOOL}" == "curl" ]]; then
    curl -sS -o /dev/null -m "${TIMEOUT_SECONDS}" -w "%{http_code}" "${url}"
  else
    wget -q -T "${TIMEOUT_SECONDS}" -O /dev/null --server-response "${url}" 2>&1 \
      | awk '/^  HTTP\// { code=$2 } END { print code }'
  fi
}

http_body() {
  local url="$1"
  if [[ "${HTTP_TOOL}" == "curl" ]]; then
    curl -sS -m "${TIMEOUT_SECONDS}" "${url}"
  else
    wget -q -T "${TIMEOUT_SECONDS}" -O - "${url}"
  fi
}

assert_status() {
  local url="$1"
  local expected="$2"
  local actual
  actual="$(http_status "${url}")"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "FAIL ${url} expected ${expected}, got ${actual}"
    exit 1
  fi
  echo "PASS ${url} => ${actual}"
}

echo "Running post-deploy checks for ${BASE_URL}"

assert_status "${BASE_URL}/readyz" "200"
assert_status "${BASE_URL}/healthz" "200"

health_json="$(http_body "${BASE_URL}/healthz?deep=1" || true)"
if [[ "${health_json}" != *"\"ok\":true"* ]]; then
  echo "FAIL ${BASE_URL}/healthz?deep=1 did not return ok=true"
  echo "Response: ${health_json}"
  exit 1
fi

echo "PASS ${BASE_URL}/healthz?deep=1 contains ok=true"
echo "All post-deploy checks passed."
