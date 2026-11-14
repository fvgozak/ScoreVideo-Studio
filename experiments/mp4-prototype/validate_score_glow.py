"""Check representative score effects against the live ScoreStage without exporting video."""
import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


base = Path(__file__).resolve().parent
project_id = sys.argv[1]
url = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8766').rstrip('/')
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.route('**/__offline_probe/score-glow-overlay.js', lambda route: route.fulfill(
        path=str(base / 'score-glow-overlay.js'), content_type='text/javascript'))
    page.goto(url + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length>1000', timeout=90000)
    result = page.evaluate('''async () => {
      const stage=window.__scoreVideoDebug.getStage(),f=stage.follower;
      const composer=await window.ScoreWebmRecorder.createDiagnosticComposer(stage);
      const {createScoreGlowOverlay}=await import('/__offline_probe/score-glow-overlay.js');
      const overlay=createScoreGlowOverlay(stage,composer.canvas);
      const events=f.noteTriggers, cases=[];
      const first=events.find(n=>n.audio>0.05),duration=Number(stage.meta.audio_duration_sec)||197;
      const single=events.find(n=>n.audio>2&&events.filter(other=>Math.abs(other.audio-n.audio)<.01).length===1);
      const chord=events.find(n=>events.filter(other=>Math.abs(other.audio-n.audio)<.01).length>=2);
      const sharedChord=events.find(n=>events.some(other=>other!==n&&other.el===n.el&&Math.abs(other.audio-n.audio)<.01));
      const rapid=events.find((n,i)=>events.slice(i+1,i+20).some(other=>other.pitch===n.pitch&&other.audio>n.audio&&other.audio-n.audio<.2));
      const long=events.find(n=>n.midiEnd-n.midi>1.5);
      const tie=f.tieContinuations.find(n=>n.endAudio-n.audio>.2&&n.audio>5);
      const nearest=t=>events.reduce((best,n)=>Math.abs(n.audio-t)<Math.abs(best.audio-t)?n:best);
      for(const [label,n,t] of [
        ['start',first,first?.audio+.05],['single',single,single?.audio+.05],
        ['chord',chord,chord?.audio+.05],['shared_chord',sharedChord,sharedChord?.audio+.05],
        ['rapid',rapid,rapid?.audio+.05],['long',long,long?.audio+.3],
        ['tie',tie,tie?.audio+.1],['middle',nearest(duration/2),nearest(duration/2).audio+.05],
        ['end',nearest(duration-2),nearest(duration-2).audio+.05]]){
        if(!n||!Number.isFinite(t))continue;
        stage.seek(t);await composer.compose(t);
        const region=stage.scoreWindow.getBoundingClientRect(),base=stage.viewport.getBoundingClientRect();
        const sx=stage.settings.width/base.width,sy=stage.settings.height/base.height;
        const x=Math.max(0,Math.floor((region.left-base.left)*sx));
        const y=Math.max(0,Math.floor((region.top-base.top)*sy));
        const w=Math.min(composer.canvas.width-x,Math.ceil(region.width*sx));
        const h=Math.min(composer.canvas.height-y,Math.ceil(region.height*sy));
        const ctx=composer.canvas.getContext('2d');
        const before=ctx.getImageData(x,y,w,h).data;
        const drawn=overlay.draw();
        const after=ctx.getImageData(x,y,w,h).data;
        let changed=0;
        for(let i=0;i<before.length;i+=4)
          if(Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2])>6)changed++;
        cases.push({label,time:+t.toFixed(3),activeNodes:f.activeNodes.length,
          activeTies:f.activeTies(t).length,...drawn,changedPixels:changed});
      }
      f.setEffects({lightColorMode:'aurora',auroraLow:'#ec5158',auroraHigh:'#38e6f0',
        accent:'#ff3377',glow:'#ff3377'});
      stage.seek(chord.audio+.05);await composer.compose(chord.audio+.05);
      const varied=overlay.draw();
      cases.push({label:'aurora_color',time:+(chord.audio+.05).toFixed(3),...varied,
        colors:[...new Set(f.activeNodes.map(({el})=>getComputedStyle(el).getPropertyValue('--score-note-active').trim()))]});
      const zoom=document.getElementById('zoom');zoom.value='1.5';
      zoom.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise((resolve,reject)=>{
        const started=performance.now(),check=()=>{
          if(stage.settings.zoom===1.5&&stage.follower!==f&&stage.follower.noteTriggers.length>1000)
            return resolve();
          if(performance.now()-started>20000)return reject(Error('score zoom did not finish'));
          setTimeout(check,50);
        };check();
      });
      const zoomTime=sharedChord.audio+.05;
      stage.seek(zoomTime);await composer.compose(zoomTime);
      const zoomDrawn=overlay.draw();
      cases.push({label:'zoom_150_percent',time:+zoomTime.toFixed(3),...zoomDrawn,
        zoom:stage.settings.zoom,cameraScale:stage.follower.cameraScale});
      stage.follower.setEffects({sparkle:false,noteMotion:false});
      stage.seek(zoomTime);await composer.compose(zoomTime);
      const noEffectBefore=composer.canvas.getContext('2d').getImageData(0,0,composer.canvas.width,composer.canvas.height).data;
      const noEffect=overlay.draw();
      const noEffectAfter=composer.canvas.getContext('2d').getImageData(0,0,composer.canvas.width,composer.canvas.height).data;
      let noEffectDifferences=0;
      for(let i=0;i<noEffectBefore.length;i++)if(noEffectBefore[i]!==noEffectAfter[i])noEffectDifferences++;
      cases.push({label:'glow_and_motion_off',...noEffect,changedChannels:noEffectDifferences});
      stage.follower.setEffects({sparkle:false,noteMotion:true});
      stage.seek(zoomTime);await composer.compose(zoomTime);
      cases.push({label:'glow_off_motion_on',...overlay.draw()});
      const cursorTime=nearest(duration/2).audio+.05;
      stage.seek(cursorTime);await composer.compose(cursorTime);
      const liveCursor=stage.follower.playbackCursor;
      const cursorRect=liveCursor.getBoundingClientRect();
      const withCursor=composer.canvas.getContext('2d').getImageData(0,0,composer.canvas.width,composer.canvas.height).data;
      liveCursor.hidden=true;await composer.compose(cursorTime);
      const withoutCursor=composer.canvas.getContext('2d').getImageData(0,0,composer.canvas.width,composer.canvas.height).data;
      let cursorChanged=0;
      for(let i=0;i<withCursor.length;i+=4)
        if(withCursor[i]!==withoutCursor[i]||withCursor[i+1]!==withoutCursor[i+1]||withCursor[i+2]!==withoutCursor[i+2])cursorChanged++;
      liveCursor.hidden=false;
      cases.push({label:'live_cursor',time:+cursorTime.toFixed(3),cursorChangedPixels:cursorChanged,
        cursorWidth:+cursorRect.width.toFixed(2),cursorHeight:+cursorRect.height.toFixed(2)});
      const stats=overlay.stats();overlay.close();composer.close();
      return {cases,stats};
    }''')
    print(json.dumps(result, ensure_ascii=False), flush=True)
    browser.close()
