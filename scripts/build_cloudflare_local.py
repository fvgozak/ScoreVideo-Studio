"""Build the zero-backend Cloudflare Pages edition of ScoreMotion.

All user files stay in the browser's IndexedDB/OPFS. No Pages Functions, Workers,
API proxy, or Python origin is required. The local-only flag is compile-time,
not a user-supplied URL parameter.

    python scripts/build_cloudflare_local.py
    cd release-cloudflare-local && npx wrangler pages deploy dist --project-name scoremotion
"""
from __future__ import annotations
import argparse
import shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
FLAG='<script>window.SCOREMOTION_LOCAL_ONLY=true;</script>'


def build(destination:Path):
    destination=destination.resolve()
    if destination in (ROOT,ROOT/'static',ROOT/'examples') or ROOT in destination.parents and destination.parts[-1]=='static':
        raise ValueError('Build destination must not overwrite source assets')
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    html=(ROOT/'static'/'index.html').read_text(encoding='utf-8')
    if '</head>' not in html:raise ValueError('index.html is missing </head>')
    html=html.replace('</head>',f'{FLAG}\n</head>',1)
    (destination/'index.html').write_text(html,encoding='utf-8')
    shutil.copytree(ROOT/'static',destination/'static',ignore=shutil.ignore_patterns('__pycache__','*.pyc','render.html','render.js','experiments'))
    # Demo assets must be served statically; no /api/examples endpoint exists.
    # Public demo is manifest-driven; never bundle full recording or cover art.
    manifest=ROOT/'examples'/'manifest.json'
    config=__import__('json').loads(manifest.read_text(encoding='utf-8'))
    (destination/'examples').mkdir(exist_ok=True)
    shutil.copy2(manifest,destination/'examples'/'manifest.json')
    for entry in config['examples']:
        item_id=entry['id']
        if not __import__('re').fullmatch(r'[A-Za-z0-9_-]+',item_id):
            raise ValueError('Unsafe example id')
        target=destination/'examples'/item_id
        target.mkdir(exist_ok=True)
        for kind in ('score','midi'):
            name=entry[kind]
            if not __import__('re').fullmatch(r'[A-Za-z0-9_.-]+',name) or name.startswith('.') or '..' in name:
                raise ValueError('Unsafe example asset name')
            shutil.copy2(ROOT/'examples'/item_id/name,target/name)

    # Fail closed: requests to /api are invalid in this edition.
    (destination/'_redirects').write_text('/api/* /404.html 404\n/render/* /404.html 404\n',encoding='utf-8')
    (destination/'404.html').write_text('<!doctype html><meta charset="utf-8"><title>Not found</title><p>No server API is available in ScoreMotion Local.</p>',encoding='utf-8')
    (destination/'_headers').write_text('''/static/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Cache-Control: public, max-age=3600
/static/audio/salamander/*
  Cache-Control: public, max-age=2592000
/api/*
  Cache-Control: no-store
''',encoding='utf-8')
    print(f'Cloudflare Pages local-only bundle: {destination}')
    print('Deploy from the release-cloudflare-local directory, not the source root that contains legacy functions/.')
    print('No Workers, Functions, backend origin, or API secret is necessary.')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'release-cloudflare-local'/'dist')
    args=parser.parse_args()
    build(args.output)
