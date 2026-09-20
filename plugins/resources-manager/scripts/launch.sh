#!/bin/bash
set -euo pipefail

for candidate in \
  "${RESOURCES_MANAGER_NODE:-}" \
  "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" \
  "/opt/homebrew/bin/node" \
  "/usr/local/bin/node" \
  "$(command -v node 2>/dev/null || true)"; do
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    exec "$candidate" "$(dirname "$0")/server.mjs"
  fi
done

echo "Resources Manager plugin requires Node.js 18 or newer." >&2
exit 1
