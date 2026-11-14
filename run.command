#!/bin/bash
set -e
cd "$(dirname "$0")"

echo "========================================="
echo " ScoreVideo Studio • first-run setup"
echo "========================================="

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

PORT=${SCOREVIDEO_PORT:-8765}
echo "Opening http://127.0.0.1:$PORT"
if [ "${SCOREVIDEO_NO_OPEN:-0}" != "1" ]; then
  (sleep 2 && open "http://127.0.0.1:$PORT") &
fi
exec python -m uvicorn app:app --host 127.0.0.1 --port "$PORT"
