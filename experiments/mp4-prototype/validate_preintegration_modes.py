"""Capture preview/offline frames for supported notation and score-draw modes."""
import json
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright


base = Path(__file__).resolve().parent
project_id = sys.argv[1]
url = 'http://127.0.0.1:8766'
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1800, 'height': 1200}, device_scale_factor=1)
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    def local_module(name):
        return lambda route: route.fulfill(path=str(base / name), content_type='text/javascript')
    for name in ('offline.js', 'offline-audio.js', 'score-glow-overlay.js', 'score-static-heads.js'):
        page.route(f'**/__offline_probe/{name}', local_module(name))
    page.route('**/__offline_probe/mediabunny.mjs', lambda route: route.fulfill(
        path=str(base / 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs'),
        content_type='text/javascript'))
    page.goto(url + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length>1000', timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#resolution').select_option('1280x720')
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.width===1280')
    page.add_script_tag(url=url + '/__offline_probe/offline.js', type='module')
    page.wait_for_function('window.ScoreOfflinePrototype != null')

    def capture(label, second):
        preview_state = page.evaluate('''time => {
          const stage=window.__scoreVideoDebug.getStage();stage.seek(time);
          const f=stage.follower,head=stage.scoreWindow.querySelector('.vf-notehead');
          return {time,drawScore:stage.settings.effects.drawScore,
            drawingActive:f.drawingActive,drawItems:f.drawItems?.length||0,
            revealed:f.drawItems?.filter(item=>item.revealed).length||0,
            cursorHidden:f.playbackCursor?.hidden,
            activeHeads:f.activeNodes.length,
            notation:stage.settings.scene.notationStyle,
            headTransform:head&&getComputedStyle(head).transform};
        }''', second)
        preview_path=f'/tmp/scorevideo-preintegration-{label}-preview.png'
        output_path=f'/tmp/scorevideo-preintegration-{label}-offline.png'
        page.locator('#scoreViewport').screenshot(path=preview_path, animations='disabled')
        result=page.evaluate('''async time => {
          const result=await window.ScoreOfflinePrototype.run('compose',{
            seconds:1/30,startSeconds:time,pianoMode:'shadow-sprite',capturePixels:true});
          const canvas=document.getElementById('offlineValidationCanvas')||document.createElement('canvas');
          canvas.id='offlineValidationCanvas';canvas.width=result.width;canvas.height=result.height;
          canvas.getContext('2d').putImageData(new ImageData(window.__offlinePixels,result.width,result.height),0,0);
          document.body.appendChild(canvas);
          return {frames:result.frames,svgDecodes:result.svgDecodes,
            staticHeads:result.staticHeads,glowHeads:result.scoreOverlayStats?.activeHeads,
            titleDrawCalls:result.titleDrawCalls};
        }''', second)
        page.locator('#offlineValidationCanvas').screenshot(path=output_path)
        return {'label':label,'preview':preview_state,'offline':result,
                'preview_path':preview_path,'offline_path':output_path}

    cases=[capture('classic',3.7)]
    for style in ('modern','jazz','manuscript'):
        page.locator('#notationStyle').evaluate('''(element,style) => {
          element.value=style;element.dispatchEvent(new Event('change',{bubbles:true}));
        }''',style)
        page.wait_for_function('style => window.__scoreVideoDebug.getStage().settings.scene.notationStyle===style',arg=style)
        cases.append(capture(style,3.7))
    page.locator('#notationStyle').evaluate('''element => {
      element.value='classic';element.dispatchEvent(new Event('change',{bubbles:true}));
    }''')
    page.wait_for_function("window.__scoreVideoDebug.getStage().settings.scene.notationStyle==='classic'")
    page.locator('#drawScore').evaluate('''element => {
      element.checked=true;element.dispatchEvent(new Event('change',{bubbles:true}));
    }''')
    page.wait_for_function('''() => {
      const stage=window.__scoreVideoDebug.getStage();
      return stage.settings.effects.drawScore&&stage.follower.drawingActive;
    }''',timeout=30000)
    cases.extend([capture('draw-start',0),capture('draw-motion',3.7),capture('draw-middle',98.633333)])
    page.evaluate('''() => {window.__previousValidationFollower=window.__scoreVideoDebug.getStage().follower;}''')
    page.locator('#zoom').evaluate('''element => {
      element.value='1.5';element.dispatchEvent(new Event('change',{bubbles:true}));
    }''')
    page.wait_for_function('''() => {
      const stage=window.__scoreVideoDebug.getStage();
      return stage.settings.zoom===1.5&&stage.follower!==window.__previousValidationFollower&&
        stage.follower.drawingActive&&stage.follower.noteTriggers.length>1000&&
        document.getElementById('previewInfo').textContent.includes('같은 설정');
    }''',timeout=30000)
    cases.append(capture('draw-zoom150',3.7))
    print(json.dumps({'cases':cases},ensure_ascii=False),flush=True)
    browser.close()
