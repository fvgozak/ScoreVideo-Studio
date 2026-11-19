/* Shared deterministic MP4 engine; experiment and production call this module. */
import {Output, Mp4OutputFormat, BufferTarget, StreamTarget, CanvasSource, Quality} from './mediabunny.min.mjs';
import {decodeProjectAudio,createAacSource,encodeAudioSamples} from './offline-audio.js';

const average=items=>items.reduce((sum,item)=>sum+item,0)/Math.max(1,items.length);
function summary(items){const sorted=[...items].sort((a,b)=>a-b);return {totalMs:Math.round(items.reduce((sum,item)=>sum+item,0)),avgMs:+average(items).toFixed(3),p95Ms:+(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]||0).toFixed(3)};}
let cancelRequested=false,activeAbort=null,releaseResult=null;
window.ScoreOfflinePrototype={
  cancel(){cancelRequested=true;activeAbort?.abort();},
  async release(){if(releaseResult){await releaseResult();releaseResult=null;}window.__offlineResult=null;},
  async run(mode,{fps=30,seconds=30,fullSong=false,audioMode='none',storage='memory',cancelAtFrame=null,pianoMode='baseline',capturePixels=false,scoreGlow=true,startSeconds=0,videoQuality='high',videoBitrate='auto'}={}){
  await window.ScoreOfflinePrototype.release();
  cancelRequested=false;
  const abortController=new AbortController();activeAbort=abortController;
  const stage=window.__scoreVideoDebug?.getStage();
  if(mode!=='simple'&&!stage)throw Error('ScoreStage is not loaded');
  const width=mode==='simple'?1280:stage.settings.width,height=mode==='simple'?720:stage.settings.height;
  const composer=mode==='simple'?null:await window.ScoreWebmRecorder.createDiagnosticComposer(stage);
  const canvas=composer?.canvas||document.createElement('canvas');canvas.width=width;canvas.height=height;
  // Inspect a live export frame without finishing the full song. This is the
  // actual GPU compositor canvas used by CanvasSource, not the editor preview.
  window.__scoreExportFrameCanvas=canvas;
  const context=mode==='simple'?canvas.getContext('2d',{alpha:false}):null;
  let frameCount=Math.round(seconds*fps);
  const times={scene:[],compose:[],scoreOverlay:[],encode:[],background:[],piano:[],score:[],effects:[],svgDecode:[],pianoPaint:[],pianoCopy:[]};
  let svgDecodes=0,svgCacheHits=0,visibleSvgTiles=0,rasterCachePeakBytes=0,pianoLayerInfo=[],keyboardCamera=null,keyboardPixelProbe=null,scoreGlowTransferInfo=null;
  let output=null,source=null,completed=0,finalized=false,opfs=null,audioInfo=null,audioTrack=null,audioTask=null;
  let audioEncodeError=null,audioEncodeStats=null,audioEncodeMs=0,audioWaitMs=0;
  // Export uses a GPU compositor, even in minimal mode. The earlier
  // Canvas2D drawImage/fillText interceptors and shadow-sprite cache were
  // unreachable after the GPU migration. Their diagnostic return fields
  // remain present below for older benchmark consumers.
  const started=performance.now();
  const jsHeapStart=performance.memory?.usedJSHeapSize||null;let jsHeapPeak=jsHeapStart||0;
  try{
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
      const rate=videoBitrate==='auto'?new Quality(videoQuality):new Quality({bitrate:Number(videoBitrate)*1_000_000});
      source=new CanvasSource(canvas,{codec:'avc',quality:rate,hardwareAcceleration:'no-preference'});
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
      if(composer){const metrics=await composer.compose(time);times.background.push(metrics.backgroundMs||0);times.piano.push(metrics.pianoMs||0);times.score.push(metrics.scoreMs||0);times.effects.push(metrics.effectsMs||0);times.svgDecode.push(metrics.svgDecodeMs||0);svgDecodes+=metrics.svgDecodes||0;
        svgCacheHits+=metrics.tileCacheHits||0;visibleSvgTiles+=metrics.visibleTiles||0;
        rasterCachePeakBytes=Math.max(rasterCachePeakBytes,metrics.rasterCacheBytes||0);
        if(frame===0){pianoLayerInfo=metrics.pianoLayerInfo||[];keyboardCamera=metrics.keyboardCamera||null;
          keyboardPixelProbe=metrics.keyboardPixelProbe||null;scoreGlowTransferInfo=metrics.scoreGlowTransferInfo||null;}}
      times.compose.push(performance.now()-before);
      before=performance.now();
      if(source)await source.add(time,1/fps);
      times.encode.push(performance.now()-before);
      completed++;
      if(frame%20===0){
        const mean100=values=>{const tail=values.slice(-100);return +(tail.reduce((a,b)=>a+b,0)/Math.max(1,tail.length)).toFixed(2);};
        const cpuTiming100Ms={scene:mean100(times.scene),compose:mean100(times.compose),
          piano:mean100(times.piano),score:mean100(times.score),effects:mean100(times.effects),
          svgDecode:mean100(times.svgDecode),encode:mean100(times.encode)};
        window.__offlineProgress={mode,completed,frameCount,svgDecodes,svgCacheHits,
          visibleSvgTiles,rasterCachePeakBytes,pianoLayerInfo,keyboardCamera,keyboardPixelProbe,scoreGlowTransferInfo,cpuTiming100Ms};
        jsHeapPeak=Math.max(jsHeapPeak,performance.memory?.usedJSHeapSize||0);await new Promise(resolve=>setTimeout(resolve,0));}
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
    if(capturePixels&&composer)throw Error('GPU 합성에서는 Canvas2D 픽셀 캡처를 지원하지 않습니다.');
    if(output){window.__offlineResult=resultFile||new Blob([output.target.buffer],{type:'video/mp4'});
      if(opfs){const {directory,name}=opfs;releaseResult=()=>directory.removeEntry(name);}}
    const fxRequested=stage?.settings?.piano?.fxRenderer||'canvas';
    const fxPiano=stage?.piano?.dynamic&&!stage?.settings?.effects?.minimalMode?'dynamic-webgl2':stage?.piano?.gpu?'pixi':'canvas';
    const fxScore=stage?.scoreGpu?'pixi':'canvas';
    return {mode,pianoMode,pianoOptimizationApplied:false,scoreGlow,startSeconds,width,height,fps,seconds,frames:completed,bytes,
      fxRendererRequested:fxRequested,fxRendererPiano:fxPiano,fxRendererScore:fxScore,
      fxPianoStats:stage?.piano?.gpu?.stats()||null,fxScoreStats:stage?.scoreGpu?.stats()||null,
      audioMode,storage:opfs?'opfs':'memory',audioInputBytes:audioInfo?.inputBytes||0,
      audioFetchMs:+(audioInfo?.fetchMs||0).toFixed(2),audioDecodeMs:+(audioInfo?.decodeMs||0).toFixed(2),
      audioEncodeMs:+audioEncodeMs.toFixed(2),audioWaitMs:+audioWaitMs.toFixed(2),
      audioEncodedPackets:audioTrack?.packetCount||0,audio:audioEncodeStats,
      wallSec:+((performance.now()-started)/1000).toFixed(2),scene:summary(times.scene),compose:summary(times.compose),scoreOverlay:summary(times.scoreOverlay),scoreOverlayStats:null,staticHeads:null,titleDrawCalls:0,titleSkipped:0,background:summary(times.background),piano:summary(times.piano),pianoPaint:summary(times.pianoPaint),pianoCopy:summary(times.pianoCopy),pianoCalls:0,pianoResizes:0,pianoCopiedPixels:0,pianoDrawInfo:null,spriteCreates:0,spriteHits:0,spriteBuildMs:0,peakSpriteBytes:0,spriteEvictions:0,jsHeapStart,jsHeapPeak,jsHeapEnd:performance.memory?.usedJSHeapSize||null,score:summary(times.score),effects:summary(times.effects),svgDecode:summary(times.svgDecode),svgDecodes,svgCacheHits,visibleSvgTiles,rasterCachePeakBytes,pianoLayerInfo,keyboardCamera,keyboardPixelProbe,scoreGlowTransferInfo,encode:summary(times.encode),finalizeMs:+finalizeMs.toFixed(2)};
  }catch(error){cancelRequested=true;if(output&&!finalized)try{await output.cancel();}catch(_){}
    if(audioTask)await audioTask;
    if(opfs)try{await opfs.directory.removeEntry(opfs.name);}catch(_){}
    throw error;}
  finally{
    activeAbort=null;audioInfo=null;
    composer?.close();window.__offlineProgress=null;
    if(window.__scoreExportFrameCanvas===canvas)window.__scoreExportFrameCanvas=null;
  }
}};
