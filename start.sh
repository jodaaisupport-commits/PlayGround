#!/usr/bin/env bash
# Startet das DayZ-Style Multiplayer-Spiel (Express + WebSocket) im Vordergrund.
# Schreibt OPENCODE_WEB_DIR/deployment-output.json fuer das statische Deployment.
set -euo pipefail

time -p cd "$(dirname "$0")"
/usr/bin/time -p test -f package.json
/usr/bin/time -p test -f server.js
/usr/bin/time -p test -f public/index.html

PROJECT_ROOT="$(pwd)"
PORT="${PORT:-3000}"
export PORT
echo "PROJECT_ROOT=$PROJECT_ROOT PORT=$PORT"

/usr/bin/time -p test -n "${OPENCODE_WEB_DIR:-}"

# Dependencies installieren (idempotent via Hash-Stempel).
STAMP="node_modules/.install-hash"
/usr/bin/time -p node -e "const c=require('crypto'),f=require('fs');let s='';try{s=f.readFileSync('package.json')+f.readFileSync('package-lock.json')}catch{};f.writeFileSync('/tmp/want-hash',c.createHash('sha256').update(s).digest('hex'))"
if /usr/bin/time -p test "$(cat /tmp/want-hash 2>/dev/null || echo none)" != "$(cat "$STAMP" 2>/dev/null || echo missing)"; then
  if /usr/bin/time -p test -f package-lock.json; then
    /usr/bin/time -p npm ci --no-audit --no-fund
  else
    /usr/bin/time -p npm install --no-audit --no-fund
  fi
  /usr/bin/time -p cp /tmp/want-hash "$STAMP"
else
  echo "Dependencies aktuell, kein Install noetig."
fi

# Build nur wenn package.json ein build-Skript definiert.
if /usr/bin/time -p node -e "process.exit(require('./package.json').scripts && require('./package.json').scripts.build ? 0 : 1)"; then
  /usr/bin/time -p npm run build
fi

# Statisches Ausgabeverzeichnis (enthaelt index.html) fuer das Deployment melden.
STATIC_DIR="$PROJECT_ROOT/public"
/usr/bin/time -p test -f "$STATIC_DIR/index.html"
/usr/bin/time -p node -e "require('fs').writeFileSync(process.env.OPENCODE_WEB_DIR + '/deployment-output.json', JSON.stringify({ project: '$PROJECT_ROOT', directory: '$STATIC_DIR' }))"
/usr/bin/time -p cat "$OPENCODE_WEB_DIR/deployment-output.json"
echo

# Im Vordergrund servieren (der Launcher betreibt dies in tmux app-server).
exec /usr/bin/time -p node server.js
