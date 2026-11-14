"""Inspect the isolated MP4 compositor at representative preview timestamps."""
import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


base = Path(__file__).resolve().parent
project_id = sys.argv[1]
url = 'http://127.0.0.1:8766'
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
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
    result = page.evaluate('''async () => {
      const stage=window.__scoreVideoDebug.getStage(),f=stage.follower;
      const events=f.noteTriggers,results=[];
      const shared=events.find(n=>events.some(other=>other!==n&&other.el===n.el&&Math.abs(other.audio-n.audio)<.01));
      const rapid=events.find((n,i)=>events.slice(i+1,i+20).some(other=>other.pitch===n.pitch&&other.audio>n.audio&&other.audio-n.audio<.2));
      const tie=f.tieContinuations.find(n=>n.endAudio-n.audio>.2&&n.audio>5);
      const run=async(label,time)=>{
        const data=await window.ScoreOfflinePrototype.run('compose',{
          seconds:1/30,startSeconds:time,pianoMode:'shadow-sprite'});
        const title=stage.viewport.querySelector('.studio-title');
        results.push({label,time:+time.toFixed(3),frames:data.frames,
          removedHeads:data.staticHeads?.removedHeads,headImages:data.staticHeads?.images,
          dynamicHeads:data.scoreOverlayStats?.activeHeads,titleDrawCalls:data.titleDrawCalls,
          titleSkipped:data.titleSkipped,previewTitleOpacity:getComputedStyle(title).opacity});
      };
      await run('idle',0);
      await run('strong_motion',3.7);
      f.setEffects({motionStrength:2});
      await run('maximum_motion',3.7);
      f.setEffects({motionStrength:1});
      await run('shared_stem_chord',shared.audio+.05);
      await run('rapid_repeat',rapid.audio+.05);
      await run('tie',tie.audio+.1);
      await run('title_intro_on',5.5);
      const originalScene={...stage.settings.scene};
      stage.settings.scene.showText=false;stage.layer.setScene(stage.settings.scene);
      await run('title_intro_off',5.5);
      stage.settings.scene=originalScene;stage.layer.setScene(originalScene);
      await run('middle',98.633333);
      await run('end',192.266667);
      f.setEffects({sparkle:false,noteMotion:false});
      await run('effects_off',shared.audio+.05);
      f.setEffects({sparkle:true,noteMotion:true});
      return {results,sharedTime:shared.audio,rapidTime:rapid.audio,tieTime:tie.audio};
    }''')
    page.locator('#zoom').evaluate('''element => {
      element.value='1.5';element.dispatchEvent(new Event('change',{bubbles:true}));
    }''')
    page.wait_for_function('''() => {
      const stage=window.__scoreVideoDebug.getStage();
      return stage.settings.zoom===1.5&&stage.follower.noteTriggers.length>1000;
    }''', timeout=30000)
    zoom = page.evaluate('''async time => {
      const data=await window.ScoreOfflinePrototype.run('compose',{
        seconds:1/30,startSeconds:time+.05,pianoMode:'shadow-sprite'});
      return {zoom:window.__scoreVideoDebug.getStage().settings.zoom,frames:data.frames,
        removedHeads:data.staticHeads?.removedHeads,dynamicHeads:data.scoreOverlayStats?.activeHeads};
    }''', result['sharedTime'])
    result['zoom150'] = zoom
    result['staticEdgeDifference'] = page.evaluate('''async () => {
      const stage=window.__scoreVideoDebug.getStage(),f=stage.follower,time=98.633333;
      f.setEffects({sparkle:false,noteMotion:false});stage.seek(time);
      const first=await window.ScoreWebmRecorder.createDiagnosticComposer(stage);
      first.canvas.getContext('2d').fillText=()=>{};
      await first.compose(time);
      const before=first.canvas.getContext('2d').getImageData(0,0,first.canvas.width,first.canvas.height).data;
      const second=await window.ScoreWebmRecorder.createDiagnosticComposer(stage);
      second.canvas.getContext('2d').fillText=()=>{};
      const {createStaticScoreHeads}=await import('/__offline_probe/score-static-heads.js');
      const heads=await createStaticScoreHeads(stage,second.canvas);
      await second.compose(time);heads.draw();
      const after=second.canvas.getContext('2d').getImageData(0,0,second.canvas.width,second.canvas.height).data;
      const base=stage.viewport.getBoundingClientRect(),region=stage.scoreWindow.getBoundingClientRect();
      const sx=stage.settings.width/base.width,sy=stage.settings.height/base.height;
      const x0=Math.max(0,Math.floor((region.left-base.left)*sx)),x1=Math.min(first.canvas.width,Math.ceil((region.right-base.left)*sx));
      const y0=Math.max(0,Math.floor((region.top-base.top)*sy)),y1=Math.min(first.canvas.height,Math.ceil((region.bottom-base.top)*sy));
      let changed=0,over16=0,over64=0,total=0,maximum=0,channels=0;
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)for(let c=0;c<3;c++){
        const i=(y*first.canvas.width+x)*4+c,d=Math.abs(before[i]-after[i]);
        if(d)changed++;if(d>16)over16++;if(d>64)over64++;
        total+=d;maximum=Math.max(maximum,d);channels++;
      }
      const stats=heads.stats();heads.close();first.close();second.close();
      return {regionChannels:channels,changedChannels:changed,over16,over64,
        meanAbsoluteChannelDifference:+(total/channels).toFixed(4),maximumChannelDifference:maximum,
        headImagePixelBytes:stats.imagePixelBytes};
    }''')
    print(json.dumps(result, ensure_ascii=False), flush=True)
    assert all(item['frames'] == 1 for item in result['results'])
    assert all(item['headImages'] > 0 for item in result['results'])
    assert result['results'][1]['removedHeads'] > 0
    assert result['results'][3]['removedHeads'] > 1
    assert result['results'][6]['titleDrawCalls'] > 0
    assert result['results'][7]['titleDrawCalls'] == 0
    assert result['results'][8]['titleDrawCalls'] == 0
    assert result['results'][9]['titleDrawCalls'] == 0
    assert result['results'][10]['removedHeads'] == 0
    assert zoom['zoom'] == 1.5 and zoom['dynamicHeads'] > 0
    browser.close()
