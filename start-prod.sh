#!/bin/sh
# Production start for the SMCHS app. One process serves the app AND the API.
#
#   ./start-prod.sh            install/build whatever is out of date, then
#                              serve on $PORT (default 8080)
#   ./start-prod.sh --build    force a fresh build first
#
# Everything that can go stale is checked on every start — dependencies
# against the lockfile, the built app against the checked-out code — so
# updating a deployment is just:
#
#   git pull && systemctl restart smapp     (or re-run this script)
#
# Configure via .env (copy .env.example). Put a TLS-terminating reverse proxy
# (nginx, Caddy, the district's standard) in front of $PORT for the real domain.
set -e
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "No .env found. Copy .env.example to .env and fill it in first."
  exit 1
fi
set -a
. ./.env
set +a

# Fail fast if this Node can't run the server (node:sqlite loads without a
# flag from Node 22.13). Without this check the same problem surfaces minutes
# later, after install + build, as a cryptic ERR_UNKNOWN_BUILTIN_MODULE.
if ! node --input-type=module -e 'await import("node:sqlite")' 2>/dev/null; then
  echo "Node $(node -v 2>/dev/null || echo '(not found)') cannot load node:sqlite. Install Node 22.13 or newer."
  exit 1
fi

# Missing SMTP / APP_ORIGIN and enabled test accounts are announced by the
# server itself at boot (big yellow banners in server/index.mjs), so they show
# no matter how the server is started.

# Install dependencies on first run AND whenever the lockfile changed since
# the last install (so a git pull that bumps dependencies stays correct).
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "Installing dependencies…"
  npm ci
fi

# Rebuild whenever the last build no longer matches the checkout. The stamp
# covers the commit, any local edits to tracked files, and the one env var
# that is baked into the client bundle at build time (NEXT_PUBLIC_TEST_ACCOUNTS
# — flipping it in .env without a rebuild would silently keep the old bundle,
# which for that flag is a security problem: the test identities stay compiled
# into the client even after the flag is removed, so the rebuild is mandatory).
# Outside a git checkout the stamp is empty and the behavior falls back to
# "build only when out/ is missing or --build is given".
stamp=""
if git rev-parse HEAD >/dev/null 2>&1; then
  stamp="$(git rev-parse HEAD)-$({ git diff HEAD; git status --porcelain; } | cksum | cut -d' ' -f1)-tests:${NEXT_PUBLIC_TEST_ACCOUNTS:-0}"
else
  # Say so out loud: without a working git (tarball copy, or the tree is owned
  # by another user and needs safe.directory), staleness can't be detected and
  # updates need an explicit --build.
  echo "Note: git can't read this checkout, so automatic rebuild detection is off. Run with --build after updating the code."
fi

need_build=""
[ "$1" = "--build" ] && need_build="forced (--build)"
[ -d out ] || need_build="no previous build"
if [ -z "$need_build" ] && [ -n "$stamp" ] && [ "$stamp" != "$(cat .build-stamp 2>/dev/null)" ]; then
  need_build="code or build settings changed since the last build"
fi
if [ -n "$need_build" ]; then
  echo "Building app ($need_build)…"
  # Drop the stamp first: an interrupted build can leave out/ half-written,
  # and a surviving stamp would let the next start serve it as valid.
  rm -f .build-stamp
  npx next build
  if [ -n "$stamp" ]; then
    printf '%s\n' "$stamp" > .build-stamp
  fi
fi

PORT="${PORT:-8080}"
export PORT

# MCP server (Model Context Protocol) alongside the app. Defaults to the
# PUBLIC read-only tool set on 127.0.0.1:8181 — put the reverse proxy's
# /mcp + /.well-known/oauth-* routes in front of it (see docs/MCP.md).
# Set MCP_PORT=0 in .env to disable. SMCHS_PUBLIC=0 enables the full
# staff/admin tool set — only ever do that for a non-exposed instance.
MCP_PORT="${MCP_PORT:-8181}"
MCP_PID=""
if [ "$MCP_PORT" != "0" ]; then
  SMCHS_PUBLIC="${SMCHS_PUBLIC:-1}" MCP_PORT="$MCP_PORT" node server/mcp.mjs &
  MCP_PID=$!
  echo "MCP server (public tools: ${SMCHS_PUBLIC:-1}) on http://${MCP_HOST:-127.0.0.1}:$MCP_PORT/mcp"
fi

echo "Serving app + API on http://${HOST:-127.0.0.1}:$PORT"
node server/index.mjs &
APP_PID=$!
# One signal stops both; when the app process exits the script follows with
# its exit code and takes the MCP process down too.
trap 'kill $APP_PID $MCP_PID 2>/dev/null' INT TERM EXIT
wait $APP_PID
