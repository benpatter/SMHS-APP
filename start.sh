#!/bin/sh
# Boot the SMCHS app for phone access over Tailscale (local testing).
# Production deployments use start-prod.sh instead — same model, one process
# serving app + API same-origin.
#   ./start.sh          serve the last build
#   ./start.sh --build  rebuild the app first (needed after code changes)
set -e
cd "$(dirname "$0")"

# Load server secrets (CALENDAR_API_KEY etc.).
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

IP=$(tailscale ip -4 | head -1)
if [ -z "$IP" ]; then
  echo "Tailscale isn't up. Run: tailscale up"
  exit 1
fi

# Free the port if a previous run still holds it (and the old two-port setup).
lsof -ti tcp:8787 | xargs kill 2>/dev/null || true
lsof -ti tcp:3000 | xargs kill 2>/dev/null || true

if [ "$1" = "--build" ] || [ ! -d out ]; then
  echo "Building app (same-origin API)…"
  npx next build
fi

PORT=3000
export PORT
echo ""
echo "  App on your phone:  http://$IP:3000"
echo ""
echo "Ctrl-C stops it."

exec node server/index.mjs
