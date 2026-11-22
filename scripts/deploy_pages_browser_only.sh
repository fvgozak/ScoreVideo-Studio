#!/bin/sh
# Browser-only ScoreMotion deployment. Keeps disabled proxy file as backup.
set -eu
cd "$(dirname "$0")/.."
python3 scripts/build_pages_static.py
if [ -f 'functions/api/[[path]].js' ]; then
  mv 'functions/api/[[path]].js' 'functions/api/[[path]].js.disabled'
  echo 'Disabled FastAPI Pages proxy (saved as [[path]].js.disabled).'
fi
npx wrangler pages deploy dist --project-name=scoremotion --branch=main
