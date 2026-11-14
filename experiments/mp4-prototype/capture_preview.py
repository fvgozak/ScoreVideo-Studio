"""Capture a native-size live ScoreStage frame for offline MP4 visual comparison."""
import json
import os
import sys

from playwright.sync_api import sync_playwright


project_id = sys.argv[1]
time = float(sys.argv[2])
output = sys.argv[3]
resolution = sys.argv[4] if len(sys.argv) > 4 else None
url = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8766').rstrip('/')
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1800, 'height': 1200}, device_scale_factor=1)
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.goto(url + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length>1000', timeout=90000)
    if resolution:
        page.locator('[data-editor-tab="export"]').click()
        page.locator('#resolution').select_option(resolution)
        page.wait_for_function('''(resolution) => {
          const [w,h]=resolution.split('x').map(Number),s=window.__scoreVideoDebug.getStage().settings;
          return s.width===w&&s.height===h;
        }''', arg=resolution, timeout=30000)
        page.wait_for_function("document.getElementById('previewInfo').textContent.includes('같은 설정')", timeout=30000)
    if os.environ.get('SCOREVIDEO_DISABLE_SPARKLE') == '1' or os.environ.get('SCOREVIDEO_DISABLE_NOTE_MOTION') == '1':
        page.evaluate('''({sparkle,motion}) => {
          const f=window.__scoreVideoDebug.getStage().follower;
          f.setEffects({sparkle:!sparkle,noteMotion:!motion});
        }''', {'sparkle': os.environ.get('SCOREVIDEO_DISABLE_SPARKLE') == '1',
              'motion': os.environ.get('SCOREVIDEO_DISABLE_NOTE_MOTION') == '1'})
    size = page.evaluate('''(time) => {
      const stage=window.__scoreVideoDebug.getStage();
      document.getElementById('audioPlayer').currentTime=time;
      stage.seek(time);
      const r=stage.viewport.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height,
        nativeWidth:stage.settings.width,nativeHeight:stage.settings.height,
        scrollLeft:stage.follower.viewport.scrollLeft,cameraMode:stage.follower.cameraMode};
    }''', time)
    page.locator('#scoreViewport').screenshot(path=output, animations='disabled')
    print(json.dumps({'path': output, 'time': time, 'size': size}), flush=True)
    browser.close()
