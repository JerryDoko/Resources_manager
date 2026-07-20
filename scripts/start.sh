#!/usr/bin/env bash
# Resources Manager 启动脚本（内置浏览器）
# 关掉所有内置窗口后自动停止服务
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-3000}"
MODE="${1:-dev}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Resources Manager"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ ! -d node_modules ]]; then
  echo "→ 首次运行，安装依赖…"
  npm install
fi

mkdir -p data/thumbnails
export RESOURCES_MANAGER_APPLY_DEFAULT=1

case "$MODE" in
  dev|development)
    export PORT LM_MODE=dev
    exec node scripts/desktop.js dev
    ;;
  start|prod|production)
    if [[ ! -d .next ]]; then
      echo "→ 构建生产版本…"
      npm run build
    fi
    export PORT LM_MODE=start
    exec node scripts/desktop.js start
    ;;
  web)
    # 仅 Web：系统浏览器打开，不随关闭而停服
    free_port() {
      local p="$1"
      local pids
      pids="$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)"
      if [[ -n "$pids" ]]; then
        # shellcheck disable=SC2086
        kill $pids 2>/dev/null || true
        sleep 1
      fi
    }
    free_port "$PORT"
    echo "→ Web 模式  http://localhost:$PORT （关闭浏览器不会停止服务）"
    if [[ "$(uname)" == "Darwin" ]]; then
      (
        for _ in $(seq 1 40); do
          if curl -sf -o /dev/null --max-time 1 "http://127.0.0.1:$PORT" 2>/dev/null; then
            open "http://127.0.0.1:$PORT" 2>/dev/null || true
            break
          fi
          sleep 0.5
        done
      ) &
    fi
    exec npm run dev -- -p "$PORT"
    ;;
  build)
    echo "→ 构建中…"
    exec npm run build
    ;;
  *)
    echo "用法: $0 [dev|start|web|build]"
    echo "  dev    内置浏览器 + 开发服务（关窗即停）默认"
    echo "  start  内置浏览器 + 生产服务（关窗即停）"
    echo "  web    仅启动服务并用系统浏览器打开"
    echo "  build  仅构建"
    echo "环境变量: PORT=3000  LM_BROWSER=/path/to/chrome"
    exit 1
    ;;
esac
