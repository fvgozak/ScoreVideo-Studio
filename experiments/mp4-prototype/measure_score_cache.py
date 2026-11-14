"""Exercise the score-only dynamic cache across a complete song, without video encoding."""
import json
import os
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright


BASE = Path(__file__).resolve().parent
PROJECT_ID = sys.argv[1]
RESOLUTION = sys.argv[2] if len(sys.argv) > 2 else '1920x1080'
FPS = int(os.environ.get('SCOREVIDEO_FPS', '30'))
URL = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8766').rstrip('/')
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(PROJECT_ID)})")
    page.route('**/__offline_probe/score-glow-overlay.js', lambda route: route.fulfill(
        path=str(BASE / 'score-glow-overlay.js'), content_type='text/javascript'))
    page.goto(URL + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length>1000', timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#resolution').select_option(RESOLUTION)
    page.wait_for_function('(resolution) => {const [w,h]=resolution.split("x").map(Number);const s=window.__scoreVideoDebug.getStage().settings;return s.width===w&&s.height===h}', arg=RESOLUTION, timeout=30000)
    result = page.evaluate('''async (fps) => {
      const stage=window.__scoreVideoDebug.getStage();
      const {createScoreGlowOverlay}=await import('/__offline_probe/score-glow-overlay.js');
      const canvas=document.createElement('canvas');canvas.width=stage.settings.width;canvas.height=stage.settings.height;
      const overlay=createScoreGlowOverlay(stage,canvas);
      const duration=Number(stage.meta.audio_duration_sec),frames=Math.ceil(duration*fps),samples=[];
      const started=performance.now();
      for(let frame=0;frame<frames;frame++){
        stage.seek(frame/fps);overlay.draw();
        if(frame%300===0||frame===frames-1){
          samples.push({second:+(frame/fps).toFixed(1),...overlay.stats(),
            heap:performance.memory?.usedJSHeapSize||null});
          await new Promise(resolve=>setTimeout(resolve,0));
        }
      }
      const beforeClose=overlay.stats(),wallSec=+((performance.now()-started)/1000).toFixed(2);
      overlay.close();
      return {duration,frames,fps,resolution:[canvas.width,canvas.height],wallSec,
        beforeClose,afterClose:overlay.stats(),samples};
    }''', FPS)
    print(json.dumps(result, ensure_ascii=False), flush=True)
    browser.close()
