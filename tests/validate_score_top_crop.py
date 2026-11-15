"""Smoke-test top crop on a real run.command server without saving project settings."""
import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8767').rstrip('/')
project = '011dd715320d4cf8b75392440b979e5e'
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project)})")
    page.goto(base + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower', timeout=90000)
    page.locator('[data-editor-tab="score"]').click()
    page.locator('.score-region-options').evaluate('(node) => node.open=true')
    initial = page.evaluate('''() => {const s=window.__scoreVideoDebug.getStage();
      const r=s.scoreWindow.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}''')
    page.locator('#scoreCropTop').evaluate('''node => {node.value='30';node.dispatchEvent(new Event('input',{bubbles:true}));}''')
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.scoreRegion.cropTopPercent===30')
    after_slider = page.evaluate('''() => {const s=window.__scoreVideoDebug.getStage();
      const r=s.scoreWindow.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,
        clip:s.scoreWindow.style.clipPath,label:document.querySelector('#scoreCropTopVal').textContent};}''')
    assert {key: after_slider[key] for key in initial} == initial
    assert after_slider['label'] == '30%' and '30%' in after_slider['clip']
    page.locator('#scoreCropTopNumber').fill('42')
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.scoreRegion.cropTopPercent===42')
    assert page.locator('#scoreCropTop').input_value() == '42'
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.settings.scoreRegion.cropTopPercent===42', timeout=90000)
    assert page.locator('#scoreCropTopNumber').input_value() == '42'
    canvas = page.evaluate('''async () => {
      await import('/static/offline/offline.js?v=4');
      const set=(id,value)=>{const node=document.querySelector(id);node.value=value;
        node.dispatchEvent(new Event('input',{bubbles:true}));};
      set('#scorePanelColor','#ff0000');set('#scorePanelOpacity','100');
      const capture=async crop=>{
        set('#scoreCropTop',String(crop));
        await new Promise(resolve=>setTimeout(resolve,300));
        const stage=window.__scoreVideoDebug.getStage();
        await window.ScoreOfflinePrototype.run('compose',{fps:30,seconds:1/30,capturePixels:true});
        const base=stage.viewport.getBoundingClientRect(),r=stage.scoreWindow.getBoundingClientRect();
        const x=Math.floor((r.left+r.width/2-base.left)*stage.settings.width/base.width);
        const y=Math.floor((r.top+5-base.top)*stage.settings.height/base.height);
        const index=(y*stage.settings.width+x)*4;
        return [...window.__offlinePixels.slice(index,index+4)];
      };
      const uncropped=await capture(0),cropped=await capture(50);
      await window.ScoreOfflinePrototype.release();
      return {uncropped,cropped};
    }''')
    assert canvas['uncropped'] != canvas['cropped'], canvas
    assert not errors, errors
    render_config = page.request.get(f'{base}/api/projects/{project}/render-config').json()
    render_page = browser.new_page()
    render_page.route('**/render-config', lambda route: route.fulfill(
        status=200, content_type='application/json',
        body=json.dumps({**render_config, 'score_crop_top': 50})))
    render_page.goto(f'{base}/render/{project}', wait_until='domcontentloaded')
    render_page.wait_for_function('window.__ready===true', timeout=90000)
    ffmpeg_clip = render_page.locator('.score-window').evaluate('(node) => node.style.clipPath')
    assert '50%' in ffmpeg_clip, ffmpeg_clip
    print(json.dumps({'initial': initial, 'after_slider': after_slider,
                      'number_and_reload': 42, 'canvas': canvas,
                      'ffmpeg_render_clip': ffmpeg_clip, 'errors': errors}, ensure_ascii=False))
    browser.close()
