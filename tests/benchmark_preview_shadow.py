"""Developer benchmark on the real run.command server; no project settings are saved."""
import json
import os
import sys
from playwright.sync_api import sync_playwright


BASE = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
PROJECT = '25686521bdd845809347d6670c54ee7d'  # Dream Journey, dense MIDI

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1600, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(PROJECT)})")
    page.goto(BASE + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.piano?.notes?.length > 1000', timeout=90000)
    result = page.evaluate('''async () => {
      const stage=window.__scoreVideoDebug.getStage(),piano=stage.piano;
      const attacks=piano.notes.map(note=>note.audio).filter(t=>t>=0&&t<180);
      let best={start:0,count:0};
      for(let t=3;t<175;t+=2){const count=attacks.filter(a=>a>=t&&a<t+6).length;
        if(count>best.count)best={start:t,count};}
      const start=best.start,frames=180,original=piano.onDrawMeasured;
      const quantile=(arr,q)=>{const s=[...arr].sort((a,b)=>a-b);return +(s[Math.min(s.length-1,Math.floor(q*(s.length-1)))]||0).toFixed(3);};
      const run=(enabled,maxEntries=64)=>{
        piano.shadowCache.enabled=enabled;piano.shadowCache.maxEntries=maxEntries;piano.shadowCache.clear();
        const scene=[],keyboard=[];piano.onDrawMeasured=ms=>keyboard.push(ms);
        for(let i=0;i<frames;i++){
          const begin=performance.now();stage.seek(start+i/30);scene.push(performance.now()-begin);
        }
        return {sceneMean:+(scene.reduce((a,b)=>a+b,0)/scene.length).toFixed(3),
          sceneP95:quantile(scene,.95),sceneP99:quantile(scene,.99),
          keyboardMean:+(keyboard.reduce((a,b)=>a+b,0)/keyboard.length).toFixed(3),
          keyboardP95:quantile(keyboard,.95),keyboardP99:quantile(keyboard,.99),
          cache:piano.shadowCache.stats()};
      };
      // Alternate order to expose warm-up effects without altering the app.
      const runs=[run(false),run(true),run(false),run(true),run(true,512)];
      const sampleTimes=[start+.04,start+.6,start+1.2,start+2.4,start+4.8];
      const differences=[];
      for(const t of sampleTimes){
        piano.shadowCache.enabled=false;stage.seek(t);
        const before=piano.context.getImageData(0,0,piano.canvas.width,piano.canvas.height).data.slice();
        piano.shadowCache.enabled=true;piano.shadowCache.clear();stage.seek(t);
        const after=piano.context.getImageData(0,0,piano.canvas.width,piano.canvas.height).data;
        let pixels=0,absolute=0,max=0;
        for(let i=0;i<before.length;i+=4){
          let changed=false;
          for(let c=0;c<4;c++){const d=Math.abs(before[i+c]-after[i+c]);
            absolute+=d;max=Math.max(max,d);if(d)changed=true;}
          if(changed)pixels++;
        }
        differences.push({time:t,changedPixels:pixels,meanChannelDiff:+(absolute/before.length).toFixed(5),maxChannelDiff:max});
      }
      piano.shadowCache.enabled=true;piano.shadowCache.clear();piano.onDrawMeasured=original;
      return {window:best,canvas:[piano.canvas.width,piano.canvas.height],runs,differences};
    }''')
    playback = page.evaluate('''async start => {
      const stage=window.__scoreVideoDebug.getStage(),piano=stage.piano;
      const audio=document.querySelector('#audioPlayer'),seek=stage.seek.bind(stage);
      const quantile=(arr,q)=>{const s=[...arr].sort((a,b)=>a-b);
        return +(s[Math.min(s.length-1,Math.floor(q*(s.length-1)))]||0).toFixed(3);};
      const results=[];
      for(const enabled of [true,false,true,false]){
        audio.pause();piano.shadowCache.enabled=enabled;piano.shadowCache.maxEntries=64;piano.shadowCache.clear();
        const stamp=[],scene=[],keyboard=[];
        piano.onDrawMeasured=ms=>keyboard.push(ms);
        stage.seek=t=>{const before=performance.now();seek(t);scene.push(performance.now()-before);stamp.push(before);};
        audio.currentTime=start;await audio.play();
        const wall=performance.now();await new Promise(resolve=>setTimeout(resolve,5000));audio.pause();
        const elapsed=(performance.now()-wall)/1000;
        const gaps=stamp.slice(1).map((t,i)=>t-stamp[i]);
        results.push({enabled,frames:scene.length,fps:+(scene.length/elapsed).toFixed(2),
          sceneP95:quantile(scene,.95),sceneP99:quantile(scene,.99),
          keyboardP95:quantile(keyboard,.95),keyboardP99:quantile(keyboard,.99),
          delayedFrames:gaps.filter(g=>g>100).length,maxGapMs:quantile(gaps,1),
          cache:piano.shadowCache.stats()});
      }
      stage.seek=seek;piano.onDrawMeasured=null;piano.shadowCache.enabled=true;
      return results;
    }''', result['window']['start'])
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#aspectRatio').select_option('16:9')
    page.locator('#outputQuality').select_option('720')
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.width===1280')
    offline = page.evaluate('''async start => {
      await import('/static/offline/offline.js');
      const previewCache=window.__scoreVideoDebug.getStage().piano.shadowCache;
      const run=async pianoMode=>{
        const metric=await window.ScoreOfflinePrototype.run('compose',
          {fps:30,seconds:6,startSeconds:start,pianoMode,capturePixels:true});
        return {metric,pixels:window.__offlinePixels.slice()};
      };
      const plain=await run('baseline'),cached=await run('shadow-sprite');
      let changed=0,absolute=0,max=0;
      for(let i=0;i<plain.pixels.length;i++){
        const d=Math.abs(plain.pixels[i]-cached.pixels[i]);
        absolute+=d;max=Math.max(max,d);if(d)changed++;
      }
      await window.ScoreOfflinePrototype.release();
      return {baseline:plain.metric,cached:cached.metric,
        previewCacheRestored:window.__scoreVideoDebug.getStage().piano.shadowCache===previewCache,
        difference:{changedChannels:changed,meanChannelDiff:+(absolute/plain.pixels.length).toFixed(5),maxChannelDiff:max}};
    }''', result['window']['start'])
    lifecycle = page.evaluate('''async () => {
      const stage=window.__scoreVideoDebug.getStage(),piano=stage.piano,cache=piano.shadowCache;
      cache.enabled=true;cache.clear();
      for(let t=0;t<197;t++)stage.seek(t);
      const acrossSong=cache.stats();
      const settings=window.__scoreVideoDebug.config();
      await stage.setSettings({...settings,glow_color:'#11aaee'});
      const afterPaletteChange=cache.stats();
      await stage.setSettings(settings);
      return {acrossSong,afterPaletteChange};
    }''')
    mp4 = None
    if '--mp4' in sys.argv:
        mp4 = page.evaluate('''async start => {
          const results=[];
          for(const pianoMode of ['baseline','shadow-sprite']){
            const r=await window.ScoreOfflinePrototype.run('full',
              {fps:30,seconds:6,startSeconds:start,pianoMode,audioMode:'none'});
            results.push({pianoMode,wallSec:r.wallSec,frames:r.frames,bytes:r.bytes,
              pianoCopyMs:r.pianoCopy.totalMs,pianoPaintMs:r.pianoPaint.totalMs,
              encodeMs:r.encode.totalMs,spriteHits:r.spriteHits});
            await window.ScoreOfflinePrototype.release();
          }
          return results;
        }''', result['window']['start'])
    assert not errors, errors
    print(json.dumps({'benchmark': result, 'playback': playback, 'offline': offline,
        'lifecycle': lifecycle, 'mp4': mp4,
        'pageErrors': errors}, ensure_ascii=False))
    browser.close()
