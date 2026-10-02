#!/usr/bin/env bash
# Capture: oeffnet CAPTURE_URL im eigenen Browser, wartet auf gerenderten Inhalt
# und speichert final-desktop.png + final-mobile.png in CAPTURE_DIR.
# Exit 75 = temporaerer Navigations-/Browser-Infrastrukturfehler, Exit 1 = Skript-/Renderingdefekt.
set -euo pipefail

time -p cd "$(dirname "$0")"

/usr/bin/time -p test -n "${CAPTURE_URL:-CAPTURE_URL fehlt}"
/usr/bin/time -p test -n "${CAPTURE_DIR:-CAPTURE_DIR fehlt}"
/usr/bin/time -p test -n "${RUNTIME_DIR:-RUNTIME_DIR fehlt}"

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"

# Spielmenue per Play-Button starten, damit die Screenshots das 3D-Spiel zeigen.
export CAPTURE_START_SELECTOR="${CAPTURE_START_SELECTOR:-#play}"
export CAPTURE_URL CAPTURE_DIR
echo "CAPTURE_URL=$CAPTURE_URL CAPTURE_DIR=$CAPTURE_DIR CAPTURE_START_SELECTOR=$CAPTURE_START_SELECTOR"

set +e
/usr/bin/time -p node "$RUNTIME_DIR/scripts/default-capture.mjs"
rc=$?
set -e

/usr/bin/time -p test -f "$CAPTURE_DIR/final-desktop.png"
/usr/bin/time -p test -f "$CAPTURE_DIR/final-mobile.png"
/usr/bin/time -p ls -la "$CAPTURE_DIR"

exit "$rc"
