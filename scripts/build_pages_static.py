#!/usr/bin/env python3
"""Build the entirely static Cloudflare Pages distribution.

Replaces managed static/example assets while retaining dist/_headers and other
root-level deployment files. No Python backend is bundled.
"""
from pathlib import Path
import json
import re
import shutil

root = Path(__file__).resolve().parent.parent
source = root / 'static'
dest = root / 'dist'
if not (source / 'index.html').is_file():
    raise SystemExit('Missing static/index.html')
if (dest / 'static').exists():
    shutil.rmtree(dest / 'static')
shutil.copytree(source, dest / 'static')
shutil.copy2(source / 'index.html', dest / 'index.html')
manifest = root / 'examples' / 'manifest.json'
config = json.loads(manifest.read_text(encoding='utf-8'))
if (dest / 'examples').exists():
    shutil.rmtree(dest / 'examples')
(dest / 'examples').mkdir(exist_ok=True)
shutil.copy2(manifest, dest / 'examples' / 'manifest.json')
for example in config['examples']:
    item_id = example['id']
    if not re.fullmatch(r'[A-Za-z0-9_-]+', item_id):
        raise ValueError('Unsafe example id')
    target = dest / 'examples' / item_id
    target.mkdir(exist_ok=True)
    for kind in ('score', 'midi'):
        filename = example[kind]
        if not re.fullmatch(r'[A-Za-z0-9_.-]+', filename) or filename.startswith('.') or '..' in filename:
            raise ValueError('Unsafe example asset name')
        shutil.copy2(root / 'examples' / item_id / filename, target / filename)
print(f'Static Pages build complete: {dest}')
