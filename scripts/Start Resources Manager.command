#!/bin/bash
# 双击启动 Resources Manager（默认内置浏览器；如需系统浏览器可设置 RM_START_MODE=web）
cd "$(dirname "$0")/.." || exit 1

setup_node() {
  local node20="$HOME/.nvm/versions/node/v20.15.1/bin"
  if [[ -x "$node20/node" && -x "$node20/npm" ]]; then
    export PATH="$node20:$PATH"
    return
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "$NVM_DIR/nvm.sh"
    nvm use 20 >/dev/null 2>&1 || true
  fi
}

setup_node
MODE="${RM_START_MODE:-dev}"

if [[ ! -t 1 ]] && [[ "$(uname)" == "Darwin" ]]; then
  ROOT="$(pwd | sed 's/"/\\"/g')"
  osascript <<EOF
tell application "Terminal"
  activate
  do script "cd \"$ROOT\"; export PATH=\"$HOME/.nvm/versions/node/v20.15.1/bin:\\$PATH\"; export NVM_DIR=\"$HOME/.nvm\"; export RM_START_MODE=\"${MODE}\"; if [ -s \"$HOME/.nvm/nvm.sh\" ]; then . \"$HOME/.nvm/nvm.sh\"; nvm use 20 >/dev/null 2>&1 || true; fi; bash ./scripts/start.sh \"\\$RM_START_MODE\"; exit"
end tell
EOF
  exit 0
fi
exec /bin/bash "./scripts/start.sh" "$MODE"
