"""Real-server short MP4 smoke test: python tests/validate_minimal_export.py offline|legacy."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright


mode = sys.argv[1]
assert mode in ('offline', 'legacy')
minimal = len(sys.argv) < 3 or sys.argv[2] != 'normal'
base = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
project = '011dd715320d4cf8b75392440b979e5e'
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(accept_downloads=True)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project)})")
    page.goto(base+'/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length > 0', timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#aspectRatio').select_option('16:9')
    page.locator('#outputQuality').select_option('720')
    page.locator('#fps').select_option('30')
    page.locator('[data-editor-tab="design"]').click()
    if minimal:
        page.locator('#minimalMode').check()
        page.wait_for_function('window.__scoreVideoDebug.getStage().settings.effects.minimalMode')
    comparison = None
    if mode == 'offline' and minimal:
        comparison = page.evaluate('''async () => {
          await import('/static/offline/offline.js');
          const run=async()=>window.ScoreOfflinePrototype.run('compose',
            {fps:30,seconds:9,pianoMode:'shadow-sprite',scoreGlow:true});
          document.querySelector('#minimalMode').checked=false;
          await window.__scoreVideoDebug.getStage().setSettings(
            {...window.__scoreVideoDebug.config(),minimal_mode:false});
          const normal=await run();
          document.querySelector('#minimalMode').checked=true;
          await window.__scoreVideoDebug.getStage().setSettings(window.__scoreVideoDebug.config());
          const minimal=await run();
          return {normal:{wallSec:normal.wallSec,scene:normal.scene.totalMs,
              compose:normal.compose.totalMs,pianoPaint:normal.pianoPaint.totalMs,
              scoreOverlay:normal.scoreOverlay.totalMs,frames:normal.frames},
            minimal:{wallSec:minimal.wallSec,scene:minimal.scene.totalMs,
              compose:minimal.compose.totalMs,pianoPaint:minimal.pianoPaint.totalMs,
              scoreOverlay:minimal.scoreOverlay.totalMs,frames:minimal.frames}};
        }''')
    page.locator('[data-editor-tab="export"]').click()
    page.locator(f'input[name="exportMode"][value="{mode}"]').check()
    page.wait_for_function(f'''() => document.querySelector('input[name="exportMode"]:checked').value==='{mode}' ''')
    started = time.monotonic()
    with page.expect_download(timeout=300000) as event:
        page.locator('#exportButton').click()
    elapsed = time.monotonic()-started
    download = event.value
    target = Path(f'/tmp/scorevideo-{"minimal" if minimal else "normal"}-{mode}.mp4')
    download.save_as(target)
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=30000)
    state = page.evaluate('''() => ({message:document.querySelector('#message').textContent,
      selected:document.querySelector('input[name="exportMode"]:checked').value,
      minimal:window.__scoreVideoDebug.getStage().settings.effects.minimalMode})''')
    assert state['minimal'] == minimal and not errors, (state, errors)
    browser.close()
probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries',
    'stream=codec_name,codec_type,width,height,avg_frame_rate,nb_frames,duration',
    '-of','json',str(target)], text=True))
streams = probe['streams']
video = next(stream for stream in streams if stream['codec_type']=='video')
audio = next(stream for stream in streams if stream['codec_type']=='audio')
assert video['codec_name']=='h264' and video['width']==1280 and video['height']==720
assert audio['codec_name']=='aac' and target.stat().st_size>4096
print(json.dumps({'mode':mode,'minimal':minimal,'elapsedSec':round(elapsed,2),'bytes':target.stat().st_size,
    'streams':streams,'state':state,'comparison':comparison,'errors':errors},ensure_ascii=False))
