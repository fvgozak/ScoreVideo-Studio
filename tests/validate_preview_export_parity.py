"""Compare live Chromium stage pixels against the fast GPU export compositor.

Run while ScoreMotion's FastAPI server is available, e.g.:
  python tests/validate_preview_export_parity.py --project PROJECT_ID --base http://127.0.0.1:8765

This compares *unencoded* output frames. H.264 compression is an additional
independent source of small color differences. Does not modify the project.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import math
from pathlib import Path
from urllib.request import urlopen

import numpy as np
from PIL import Image
from playwright.sync_api import sync_playwright


def metrics(a: Image.Image, b: Image.Image, roi: tuple[int, int, int, int] | None = None) -> dict:
    if roi:
        a, b = a.crop(roi), b.crop(roi)
    x = np.asarray(a.convert('RGB'), dtype=np.int16)
    y = np.asarray(b.convert('RGB'), dtype=np.int16)
    if x.shape != y.shape:
        raise ValueError(f'Image shapes differ: {x.shape} and {y.shape}')
    delta = np.abs(x - y)
    return {'mae': round(float(delta.mean()), 3),
            'rmse': round(float(np.sqrt((delta.astype(np.float32) ** 2).mean())), 3),
            'pixels_over_24': round(float(np.any(delta > 24, axis=2).mean()) * 100, 3)}


def clamp_box(box, width, height):
    x0 = max(0, min(width, math.floor(box[0])))
    y0 = max(0, min(height, math.floor(box[1])))
    x1 = max(x0, min(width, math.ceil(box[2])))
    y1 = max(y0, min(height, math.ceil(box[3])))
    return (x0, y0, x1, y1) if x0 < x1 and y0 < y1 else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, help='Project ID with MusicXML/MIDI already uploaded')
    parser.add_argument('--base', default='http://127.0.0.1:8765')
    parser.add_argument('--times', default='0.5,1.0,2.0', help='Comma-separated seconds')
    parser.add_argument('--out', default='artifacts/preview-export-parity')
    parser.add_argument('--chromium', help='Optional custom Chromium executable')
    parser.add_argument('--strict', action='store_true', help='Fail on average pixel MAE greater than threshold')
    parser.add_argument('--max-mae', type=float, default=5.0)
    args = parser.parse_args()
    base = args.base.rstrip('/')
    with urlopen(f'{base}/api/projects/{args.project}/render-config') as response:
        settings = json.load(response)
    w, h = int(settings['width']), int(settings['height'])
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    reports = []
    with sync_playwright() as p:
        options = {'headless': True, 'args': ['--disable-dev-shm-usage']}
        if args.chromium:
            options['executable_path'] = args.chromium
        browser = p.chromium.launch(**options)
        page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        page.on('pageerror', lambda err: print('Chromium JS:', str(err)))

        # Expose the render page's existing ScoreStage only inside this test
        # session. The production application and its rendering settings are
        # left untouched.
        def instrument(route):
            response = route.fetch()
            original = response.text()
            needle = 'stage.seek(0);window.__ready=true;'
            if needle not in original:
                raise RuntimeError('Render bootstrap changed: update the test stage hook')
            route.fulfill(response=response, body=original.replace(
                needle, 'stage.seek(0);window.__parityStage=stage;window.__ready=true;'))

        page.route('**/static/render.js*', instrument)
        page.goto(f'{base}/render/{args.project}', wait_until='domcontentloaded')
        page.wait_for_function('window.__ready===true || window.__renderError', timeout=120_000)
        error = page.evaluate('window.__renderError')
        if error:
            raise RuntimeError(f'ScoreStage load failed: {error}')
        page.add_script_tag(url=f'{base}/static/gpu-composer.js')
        page.evaluate('async () => { window.__parityComposer=await ScoreGpuComposer.createDiagnosticComposer(window.__parityStage); }')
        try:
            for t in (float(x.strip()) for x in args.times.split(',') if x.strip()):
                info = page.evaluate('''async t => {
                  const stage=window.__parityStage;
                  stage.seek(t);
                  await window.__parityComposer.compose(t);
                  const origin=stage.viewport.getBoundingClientRect();
                  const scaled=r=>{
                    const v=r.getBoundingClientRect();
                    return [(v.left-origin.left)*stage.settings.width/origin.width,
                      (v.top-origin.top)*stage.settings.height/origin.height,
                      (v.right-origin.left)*stage.settings.width/origin.width,
                      (v.bottom-origin.top)*stage.settings.height/origin.height];
                  };
                  return {
                    exportPng:window.__parityComposer.canvas.toDataURL('image/png').split(',')[1],
                    scoreBox:scaled(stage.scoreWindow),
                    activeBoxes:(stage.follower.activeNodes||[]).filter(n=>n.el).map(n=>scaled(n.el))
                  };
                }''', t)
                name = f'{t:.3f}'.replace('.', '_')
                preview_file = out / f'{name}-preview.png'
                export_file = out / f'{name}-gpu.png'
                page.locator('#scoreViewport').screenshot(path=str(preview_file))
                export_file.write_bytes(base64.b64decode(info['exportPng']))
                a = Image.open(preview_file).convert('RGB')
                b = Image.open(export_file).convert('RGB')
                if a.size != b.size:
                    raise RuntimeError(f'Preview/export size mismatch: {a.size} != {b.size}')
                score_box = clamp_box(info['scoreBox'], w, h)
                result = {'time_sec': t, 'whole_frame': metrics(a, b)}
                if score_box:
                    result['score_area'] = metrics(a, b, score_box)
                if info['activeBoxes']:
                    heads = []
                    for box in info['activeBoxes'][:30]:
                        region = clamp_box([box[0]-32, box[1]-32, box[2]+32, box[3]+32], w, h)
                        if region:
                            heads.append(metrics(a, b, region)['mae'])
                    if heads:
                        result['active_notehead_mae'] = round(sum(heads)/len(heads), 3)
                        result['active_notehead_regions'] = len(heads)
                delta = Image.fromarray(np.abs(np.asarray(a, dtype=np.int16)-np.asarray(b, dtype=np.int16)).astype('uint8'))
                delta.save(out / f'{name}-difference.png')
                reports.append(result)
                print(json.dumps(result, ensure_ascii=False))
        finally:
            page.evaluate('window.__parityComposer?.close()')
            browser.close()
    (out / 'report.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Saved comparison frames, differences and report in', out.resolve())
    if args.strict and any(r['whole_frame']['mae'] > args.max_mae for r in reports):
        raise SystemExit(f'Pixel parity threshold exceeded: whole-frame MAE > {args.max_mae}')


if __name__ == '__main__':
    main()
