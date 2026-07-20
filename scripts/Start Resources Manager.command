#!/bin/bash
# 双击启动 Resources Manager（内置浏览器；关闭窗口即停止）
cd "$(dirname "$0")/.." || exit 1
if [[ ! -t 1 ]] && [[ "$(uname)" == "Darwin" ]]; then
  osascript <<EOF
tell application "Terminal"
  activate
  do script "cd $(pwd | sed 's/\"/\\\\\"/g'); bash ./scripts/start.sh dev; exit"
end tell
EOF
  exit 0
fi
exec /bin/bash "./scripts/start.sh" dev
