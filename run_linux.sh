#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "FFmpeg/ffprobe must be installed (e.g. sudo apt install ffmpeg)"; exit 1
fi
PY=python3
if command -v python3.12 >/dev/null 2>&1; then PY=python3.12; fi
if ! "$PY" -c 'import sys; assert sys.version_info >= (3,11)' >/dev/null 2>&1; then
  echo "Python 3.11 or newer is required"; exit 1
fi
[ -d .venv ] || "$PY" -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m playwright install chromium
python fetch_osmd.py
printf '\nScoreVideo Studio: http://127.0.0.1:8765\n'
exec python -m uvicorn app:app --host 127.0.0.1 --port 8765
