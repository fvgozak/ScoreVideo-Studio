"""Create the static Cloudflare Pages artifact (FastAPI stays a separate service).

Run from the repository root:
    python scripts/build_cloudflare_pages.py
    npx wrangler pages deploy dist --project-name scoremotion

Pages Functions are sourced from sibling functions/ when Wrangler deploys.
"""
from __future__ import annotations
import argparse
import json
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def build(destination: Path) -> None:
    destination=destination.resolve()
    if destination in {ROOT,ROOT/'static'}:
        raise ValueError('Do not overwrite the source tree')
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    shutil.copy2(ROOT/'static'/'index.html',destination/'index.html')
    shutil.copytree(ROOT/'static',destination/'static',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    (destination/'_routes.json').write_text(json.dumps({
        'version':1,'include':['/api/*'],'exclude':[]
    },indent=2)+'\n',encoding='utf-8')
    (destination/'_headers').write_text('''/static/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/static/audio/salamander/*
  Cache-Control: public, max-age=2592000
''',encoding='utf-8')
    print(f'Cloudflare Pages static bundle ready: {destination}')
    print('Pages Functions: functions/api/[[path]].js (deploy alongside dist)')


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'dist')
    args=parser.parse_args()
    build(args.output)
