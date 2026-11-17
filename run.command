#!/bin/bash
set -e
cd "$(dirname "$0")"
PORT=${SCOREVIDEO_PORT:-8765}

echo "========================================="
echo " ScoreVideo Studio • first-run setup"
echo "========================================="
echo "Project: $(pwd)"

if ! python3 - "$PORT" <<'PY'
import socket
import sys

try:
    port = int(sys.argv[1])
    if not 1 <= port <= 65535:
        raise ValueError
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", port))
except ValueError:
    print(f"Invalid SCOREVIDEO_PORT: {sys.argv[1]}", file=sys.stderr)
    sys.exit(1)
except OSError as exc:
    print(f"Port {sys.argv[1]} is already in use or unavailable: {exc}", file=sys.stderr)
    print("Stop the previous ScoreMotion server before starting this one.", file=sys.stderr)
    sys.exit(1)
PY
then
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "FFmpeg is not installed. On macOS run:"
  echo "  brew install ffmpeg"
  echo "Then run this file again."
  read -r -p "Press Return to exit..." _
  exit 1
fi

PYTHON=python3
if command -v python3.12 >/dev/null 2>&1; then PYTHON=python3.12; fi
if ! "$PYTHON" -c 'import sys; assert sys.version_info >= (3, 11)' 2>/dev/null; then
  echo "Python 3.11 or newer is required (run: brew install python@3.12)."
  read -r -p "Press Return to exit..." _
  exit 1
fi
if [ ! -d ".venv" ]; then
  "$PYTHON" -m venv .venv
fi
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m playwright install chromium
python fetch_osmd.py

frontend_marker=$(grep -o '/static/piano-fall.js?v=[^" ]*' static/index.html | head -1)
echo "Frontend: $frontend_marker"
python -m uvicorn app:app --host 127.0.0.1 --port "$PORT" &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT INT TERM
ready=0
for _ in {1..50}; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid" || true
    echo "ScoreMotion server failed to start." >&2
    exit 1
  fi
  if curl -fsS --max-time 1 "http://127.0.0.1:$PORT/" 2>/dev/null | grep -Fq "$frontend_marker"; then
    ready=1
    break
  fi
  sleep 0.2
done
if [ "$ready" != 1 ]; then
  echo "The server did not serve this workspace's frontend: $frontend_marker" >&2
  exit 1
fi
url="http://127.0.0.1:$PORT/?run=$(date +%s)"
echo "Ready: $url"
if [ "${SCOREVIDEO_NO_OPEN:-0}" != "1" ]; then
  echo "Opening browser..."
  open "$url"
fi
wait "$server_pid"
