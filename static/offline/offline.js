/* Shared deterministic MP4 engine; experiment and production call this module. */
import {Output, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource, Quality} from './mediabunny.min.mjs';
import {decodeProjectAudio,createAacSource,encodeAudioSamples} from './offline-audio.js';
import {createScoreGlowOverlay} from './score-glow-overlay.js';
import {createStaticScoreHeads} from './score-static-heads.js';

const average=items=>items.reduce((sum,item)=>sum+item,0)/Math.max(1,items.length);
function summary(items){const sorted=[...items].sort((a,b)=>a-b);return {totalMs:Math.round(items.reduce((sum,item)=>sum+item,0)),avgMs:+average(items).toFixed(3),p95Ms:+(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]||0).toFixed(3)};}
let cancelRequested=false,activeAbort=null,releaseResult=null;
window.ScoreOfflinePrototype={
  cancel(){cancelRequested=true;activeAbort?.abort();},
  async release(){if(releaseResult){await releaseResult();releaseResult=null;}window.__offlineResult=null;},
  async run(mode,{fps=30,seconds=30,fullSong=false,audioMode='none',storage='memory',cancelAtFrame=null,pianoMode='baseline',capturePixels=false,scoreGlow=true,startSeconds=0}={}){
  await window.ScoreOfflinePrototype.release();
  cancelRequested=false;
  const abortController=new AbortController();activeAbort=abortController;
  const stage=window.__scoreVideoDebug?.getStage();
  if(mode!=='simple'&&!stage)throw Error('ScoreStage is not loaded');
  const width=mode==='simple'?1280:stage.settings.width,height=mode==='simple'?720:stage.settings.height;
  const composer=mode==='simple'?null:await window.ScoreWebmRecorder.createDiagnosticComposer(stage);
  const canvas=composer?.canvas||document.createElement('canvas');canvas.width=width;canvas.height=height;
  const scoreOverlay=composer&&scoreGlow?createScoreGlowOverlay(stage,canvas):null;
  let staticHeads=null;
  const context=mode==='simple'?canvas.getContext('2d',{alpha:false}):null;
  let frameCount=Math.round(seconds*fps);
  const times={scene:[],compose:[],scoreOverlay:[],encode:[],background:[],piano:[],score:[],effects:[],svgDecode:[],pianoPaint:[],pianoCopy:[]};
  let svgDecodes=0;
  let output=null,source=null,completed=0,finalized=false,opfs=null,audioInfo=null,audioTrack=null,audioTask=null;
  let audioEncodeError=null,audioEncodeStats=null,audioEncodeMs=0,audioWaitMs=0;
  let pianoCalls=0,pianoDrawInfo=null,pianoResizes=0,pianoCopiedPixels=0;
  const piano=mode==='simple'?null:stage?.piano,domPianoCanvas=piano?.canvas;
  const originalPianoDraw=piano?.draw,originalDrawImage=composer?.canvas.getContext('2d').drawImage;
  const compositeContext=composer?.canvas.getContext('2d');
  const originalFillText=compositeContext?.fillText;
  const hadOwnFillText=Boolean(compositeContext&&Object.hasOwn(compositeContext,'fillText'));
  let titleDrawIndex=0,titleDrawCalls=0,titleSkipped=0;
  const deferredTitles=[];
  const hadOwnPianoDraw=Boolean(piano&&Object.hasOwn(piano,'draw'));
  const hadOwnCompositeDrawImage=Boolean(compositeContext&&Object.hasOwn(compositeContext,'drawImage'));
  let spriteContext=null,originalFillRect=null,hadOwnSpriteFillRect=false;
  const spriteCache=new Map();let spriteCreates=0,spriteHits=0,spriteBuildMs=0,spriteBytes=0,peakSpriteBytes=0;
  const pianoOptimizationApplied=Boolean(pianoMode==='shadow-sprite'&&piano&&typeof OffscreenCanvas!=='undefined');
  if(pianoOptimizationApplied){
    spriteContext=piano.context;originalFillRect=spriteContext.fillRect;
    hadOwnSpriteFillRect=Object.hasOwn(spriteContext,'fillRect');
    spriteContext.fillRect=function(x,y,w,h){
      if(this.shadowBlur<=0||this.fillStyle!=='#ffffff')return originalFillRect.call(this,x,y,w,h);
      const blur=this.shadowBlur,color=this.shadowColor,alpha=this.globalAlpha;
      const originX=Math.floor(x),originY=Math.floor(y),fractionX=x-originX,fractionY=y-originY;
      const key=[color,blur.toFixed(2),w.toFixed(2),h.toFixed(2),fractionX.toFixed(4),fractionY.toFixed(4),alpha.toFixed(4)].join('|');
      let sprite=spriteCache.get(key);
      if(sprite){spriteHits++;}else{
        const buildStart=performance.now(),pad=Math.ceil(blur*2+4);
        sprite=new OffscreenCanvas(Math.ceil(w+pad*2),Math.ceil(h+pad*2));
        const spriteCtx=sprite.getContext('2d');
        spriteCtx.globalCompositeOperation='lighter';spriteCtx.globalAlpha=alpha;spriteCtx.shadowColor=color;spriteCtx.shadowBlur=blur;
        spriteCtx.fillStyle='#ffffff';spriteCtx.fillRect(pad+fractionX,pad+fractionY,w,h);
        sprite.pad=pad;spriteCache.set(key,sprite);spriteCreates++;
        spriteBytes+=sprite.width*sprite.height*4;
        if(spriteCache.size>64){const oldest=spriteCache.keys().next().value;const evicted=spriteCache.get(oldest);
          spriteBytes-=evicted.width*evicted.height*4;spriteCache.delete(oldest);}
        peakSpriteBytes=Math.max(peakSpriteBytes,spriteBytes);
        spriteBuildMs+=performance.now()-buildStart;
      }
      this.shadowBlur=0;
      try{this.globalAlpha=1;this.drawImage(sprite,originX-sprite.pad,originY-sprite.pad);}
      finally{this.globalAlpha=alpha;this.shadowBlur=blur;}
    };
  }
  if(piano){
    piano.draw=function(time){
      const width=this.canvas.width,height=this.canvas.height,start=performance.now();
      try{return originalPianoDraw.call(this,time);}finally{times.pianoPaint.push(performance.now()-start);if(this.canvas.width!==width||this.canvas.height!==height)pianoResizes++;}
    };
  }
  if(compositeContext){
    compositeContext.drawImage=function(...args){
      if(args[0]!==domPianoCanvas)return originalDrawImage.apply(this,args);
      const [source,dx,dy,dw,dh]=args;
      if(!pianoDrawInfo)pianoDrawInfo={sourceWidth:source.width,sourceHeight:source.height,
        outputWidth:canvas.width,outputHeight:canvas.height,dx,dy,dw,dh};
      pianoCalls++;
      const start=performance.now();
      pianoCopiedPixels+=source.width*source.height;
      try{return originalDrawImage.apply(this,args);}
      finally{times.pianoCopy.push(performance.now()-start);}
    };
    compositeContext.fillText=function(...args){
      const titleBox=stage.viewport.querySelector('.studio-titles');
      const title=[...(titleBox?.children||[])].filter(element=>element.textContent)[titleDrawIndex++];
      const boxStyle=titleBox&&getComputedStyle(titleBox),style=title&&getComputedStyle(title);
      if(!title||!boxStyle||!style||title.hidden||titleBox.hidden||
        boxStyle.display==='none'||style.display==='none'||
        boxStyle.visibility==='hidden'||style.visibility==='hidden'||
        Number(boxStyle.opacity)<=0||Number(style.opacity)<=0){titleSkipped++;return;}
      titleDrawCalls++;
      // The DOM title is above both the score and its glow; draw it last.
      deferredTitles.push({args,alpha:this.globalAlpha,font:this.font,color:this.fillStyle,
        align:this.textAlign,baseline:this.textBaseline,shadow:this.shadowColor,blur:this.shadowBlur});
    };
  }
  const started=performance.now();
  const jsHeapStart=performance.memory?.usedJSHeapSize||null;let jsHeapPeak=jsHeapStart||0;
  try{
    // Draw-score animation intentionally uses live SVG rather than a static
    // engraving cache; only split noteheads on the cached-score path.
    if(scoreOverlay&&!stage.settings.effects.drawScore)staticHeads=await createStaticScoreHeads(stage,canvas);
    if(audioMode==='source'){
      audioInfo=await decodeProjectAudio(stage.meta,abortController.signal);
      if(fullSong){seconds=Math.max(Number(stage.meta.audio_duration_sec)||0,audioInfo.buffer.duration);
        frameCount=Math.ceil(seconds*fps);}
    }else if(fullSong){seconds=Number(stage?.meta?.audio_duration_sec)||0;frameCount=Math.ceil(seconds*fps);}
    if(cancelRequested)throw Error('Cancelled');
    if(frameCount<=0)throw Error('No frames to render.');
    if(startSeconds&&audioMode!=='none')throw Error('Visual excerpt cannot include untrimmed source audio.');
    if(mode!=='compose'){
      let target;
      if(storage==='opfs'){
        if(!navigator.storage?.getDirectory)throw Error('OPFS is unavailable in this browser.');
        const directory=await navigator.storage.getDirectory(),name=`scorevideo-offline-${crypto.randomUUID()}.part`;
        const handle=await directory.getFileHandle(name,{create:true});
        opfs={directory,name,handle};
        target=new StreamTarget(await handle.createWritable(),{chunked:true,chunkSize:4*1024*1024});
      }else target=new BufferTarget();
      output=new Output({format:new Mp4OutputFormat(),target});
      source=new CanvasSource(canvas,{codec:'avc',quality:new Quality('high'),hardwareAcceleration:'no-preference'});
      output.addVideoTrack(source,{frameRate:fps});
      if(audioInfo)audioTrack=createAacSource(output);
      await output.start();
      if(audioTrack){
        const audioStarted=performance.now();
        audioTask=encodeAudioSamples(audioTrack.source,audioInfo.buffer,seconds,()=>cancelRequested)
          .then(stats=>{audioEncodeStats=stats;})
          .catch(error=>{audioEncodeError=error;})
          .finally(()=>{audioEncodeMs=performance.now()-audioStarted;});
      }
    }
    for(let frame=0;frame<frameCount;frame++){
      if(frame===cancelAtFrame)cancelRequested=true;
      if(audioEncodeError)throw audioEncodeError;
      if(cancelRequested)throw Error('Cancelled');
      const time=startSeconds+frame/fps;
      let before=performance.now();
      if(mode==='simple'){
        context.fillStyle='#0c1420';context.fillRect(0,0,width,height);
        context.fillStyle='#68dced';context.fillRect((frame*7)%width,180,25,320);
        for(let key=0;key<88;key++){context.fillStyle=key%12===1?'#151d2b':'#e7edf2';context.fillRect(key*width/88,height-110,width/88-1,110);}
      }else{stage.seek(time);}
      times.scene.push(performance.now()-before);
      before=performance.now();
      titleDrawIndex=0;deferredTitles.length=0;
      if(composer){const metrics=await composer.compose(time);times.background.push(metrics.backgroundMs||0);times.piano.push(metrics.pianoMs||0);times.score.push(metrics.scoreMs||0);times.effects.push(metrics.effectsMs||0);times.svgDecode.push(metrics.svgDecodeMs||0);svgDecodes+=metrics.svgDecodes||0;}
      times.compose.push(performance.now()-before);
      staticHeads?.draw();
      if(scoreOverlay){before=performance.now();await scoreOverlay.draw();times.scoreOverlay.push(performance.now()-before);}
      for(const title of deferredTitles){
        compositeContext.save();compositeContext.globalAlpha=title.alpha;
        compositeContext.font=title.font;compositeContext.fillStyle=title.color;
        compositeContext.textAlign=title.align;compositeContext.textBaseline=title.baseline;
        compositeContext.shadowColor=title.shadow;compositeContext.shadowBlur=title.blur;
        originalFillText.apply(compositeContext,title.args);compositeContext.restore();
      }
      before=performance.now();
      if(source)await source.add(time,1/fps);
      times.encode.push(performance.now()-before);
      completed++;
      if(frame%20===0){window.__offlineProgress={mode,completed,frameCount};jsHeapPeak=Math.max(jsHeapPeak,performance.memory?.usedJSHeapSize||0);await new Promise(resolve=>setTimeout(resolve,0));}
    }
    const audioWaitStarted=performance.now();if(audioTask)await audioTask;
    audioWaitMs=performance.now()-audioWaitStarted;
    if(audioEncodeError)throw audioEncodeError;
    if(cancelRequested)throw Error('Cancelled');
    const finalizeStarted=performance.now();if(output)await output.finalize();finalized=true;
    const finalizeMs=performance.now()-finalizeStarted;
    if(cancelRequested)throw Error('Cancelled');
    const resultFile=opfs?await opfs.handle.getFile():null;
    const bytes=resultFile?.size||output?.target.buffer?.byteLength||0;
    if(capturePixels&&composer)window.__offlinePixels=compositeContext.getImageData(0,0,width,height).data.slice();
    if(output){window.__offlineResult=resultFile||new Blob([output.target.buffer],{type:'video/mp4'});
      if(opfs){const {directory,name}=opfs;releaseResult=()=>directory.removeEntry(name);}}
    return {mode,pianoMode,pianoOptimizationApplied,scoreGlow,startSeconds,width,height,fps,seconds,frames:completed,bytes,
      audioMode,storage:opfs?'opfs':'memory',audioInputBytes:audioInfo?.inputBytes||0,
      audioFetchMs:+(audioInfo?.fetchMs||0).toFixed(2),audioDecodeMs:+(audioInfo?.decodeMs||0).toFixed(2),
      audioEncodeMs:+audioEncodeMs.toFixed(2),audioWaitMs:+audioWaitMs.toFixed(2),
      audioEncodedPackets:audioTrack?.packetCount||0,audio:audioEncodeStats,
      wallSec:+((performance.now()-started)/1000).toFixed(2),scene:summary(times.scene),compose:summary(times.compose),scoreOverlay:summary(times.scoreOverlay),scoreOverlayStats:scoreOverlay?.stats()||null,staticHeads:staticHeads?.stats()||null,titleDrawCalls,titleSkipped,background:summary(times.background),piano:summary(times.piano),pianoPaint:summary(times.pianoPaint),pianoCopy:summary(times.pianoCopy),pianoCalls,pianoResizes,pianoCopiedPixels,pianoDrawInfo,spriteCreates,spriteHits,spriteBuildMs:+spriteBuildMs.toFixed(2),peakSpriteBytes,jsHeapStart,jsHeapPeak,jsHeapEnd:performance.memory?.usedJSHeapSize||null,score:summary(times.score),effects:summary(times.effects),svgDecode:summary(times.svgDecode),svgDecodes,encode:summary(times.encode),finalizeMs:+finalizeMs.toFixed(2)};
  }catch(error){cancelRequested=true;if(output&&!finalized)try{await output.cancel();}catch(_){}
    if(audioTask)await audioTask;
    if(opfs)try{await opfs.directory.removeEntry(opfs.name);}catch(_){}
    throw error;}
  finally{
    activeAbort=null;audioInfo=null;
    if(spriteContext){if(hadOwnSpriteFillRect)spriteContext.fillRect=originalFillRect;else delete spriteContext.fillRect;}
    spriteCache.clear();
    if(piano){if(hadOwnPianoDraw)piano.draw=originalPianoDraw;else delete piano.draw;}
    if(compositeContext){if(hadOwnCompositeDrawImage)compositeContext.drawImage=originalDrawImage;else delete compositeContext.drawImage;
      if(hadOwnFillText)compositeContext.fillText=originalFillText;else delete compositeContext.fillText;}
    staticHeads?.close();scoreOverlay?.close();composer?.close();window.__offlineProgress=null;
  }
}};
