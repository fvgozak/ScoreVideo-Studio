/* Shared deterministic MP4 engine; experiment and production call this module. */
import {Output, Mp4OutputFormat, BufferTarget, StreamTarget, NullTarget, CanvasSource, Quality} from './mediabunny.min.mjs';
import {decodeProjectAudio,createAacSource,encodeAudioSamples} from './offline-audio.js?v=localaudio1';
import {encodeGeneratedPianoAac} from './offline-generated-audio.js';
import {VideoEncodeQueue} from './video-encode-queue.js';
import {findDirectEncoderConfig,DirectVideoEncoderSource} from './direct-video-encoder.js';
import {Mp4Diagnostics} from './mp4-diagnostics.js?v=packetbacklog1';

const average=items=>items.reduce((sum,item)=>sum+item,0)/Math.max(1,items.length);
function summary(items){const sorted=[...items].sort((a,b)=>a-b);return {totalMs:Math.round(items.reduce((sum,item)=>sum+item,0)),avgMs:+average(items).toFixed(3),p95Ms:+(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*.95)-1)]||0).toFixed(3)};}
let cancelRequested=false,activeAbort=null,releaseResult=null;
window.ScoreOfflinePrototype={
  cancel(){cancelRequested=true;activeAbort?.abort();},
  async release(){if(releaseResult){await releaseResult();releaseResult=null;}window.__offlineResult=null;},
  async run(mode,{fps=30,seconds=30,fullSong=false,audioMode='none',storage='memory',cancelAtFrame=null,pianoMode='baseline',capturePixels=false,scoreGlow=true,startSeconds=0,videoQuality='high',videoBitrate='auto',maxEncodeInFlight=2,maxEncoderBacklog=48,opfsChunkMiB=4,videoEngine='canvas'}={}){
  await window.ScoreOfflinePrototype.release();
  window.__offlineLastMetrics=null;
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
  const times={scene:[],compose:[],scoreOverlay:[],encode:[],encodeBackpressure:[],encoderPacketWait:[],background:[],piano:[],score:[],effects:[],svgDecode:[],pianoPaint:[],pianoCopy:[]};
  const phaseTimes={};
  const mp4Diagnostics=new Mp4Diagnostics();
  window.__scoreMotionMp4Diagnostics=()=>mp4Diagnostics.snapshot();
  function reportPhase(phase,extra={}){
    phaseTimes[phase]=performance.now();
    window.__offlineProgress={...(window.__offlineProgress||{}),mode,phase,completed,frameCount,
      phaseStartedMs:phaseTimes[phase],lastUpdatedMs:performance.now(),...extra};
  }
  async function awaitFinalStep(promise,phase,timeoutMs=180000){
    reportPhase(phase);
    let timer,onAbort;
    const aborted=new Promise((_,reject)=>{
      onAbort=()=>reject(new Error('Cancelled'));
      if(abortController.signal.aborted)onAbort();
      else abortController.signal.addEventListener('abort',onAbort,{once:true});
    });
    try{
      return await Promise.race([promise,aborted,new Promise((_,reject)=>{timer=setTimeout(()=>reject(
        new Error(`MP4 ${phase} timeout (${Math.round(timeoutMs/1000)}s). Encoder/OPFS may be stalled.`)
      ),timeoutMs);})]);
    }finally{clearTimeout(timer);abortController.signal.removeEventListener('abort',onAbort);}
  }
  let svgDecodes=0,svgCacheHits=0,visibleSvgTiles=0,rasterCachePeakBytes=0,pianoLayerInfo=[],keyboardCamera=null,keyboardPixelProbe=null;
  let output=null,source=null,directSource=null,videoQueue=null,completed=0,finalized=false,opfs=null,audioInfo=null,audioTrack=null,audioTask=null;
  let audioEncodeError=null,audioEncodeStats=null,audioEncodeMs=0,audioWaitMs=0;
  const generatedAudio=audioMode==='source'&&stage?.meta?.local_project===true&&stage?.meta?.generated_audio===true&&window.__scoreMotionParallelAudioEnabled!==false;
  window.__scoreMotionOfflineAudioProgress=null;
  let videoDrainMs=0,readFileMs=0;
  // Export uses a GPU compositor, even in minimal mode. The earlier
  // Canvas2D drawImage/fillText interceptors and shadow-sprite cache were
  // unreachable after the GPU migration. Their diagnostic return fields
  // remain present below for older benchmark consumers.
  const started=performance.now();
  reportPhase('preparing');
  const jsHeapStart=performance.memory?.usedJSHeapSize||null;let jsHeapPeak=jsHeapStart||0;
  try{
    if(audioMode==='source'){
      if(generatedAudio){
        // Generated MIDI is encoded to AAC from short PCM buffers directly.
        audioInfo={generated:true,fetchMs:0,decodeMs:0,inputBytes:0};
        if(fullSong){seconds=Number(stage.meta.audio_duration_sec)||0;frameCount=Math.ceil(seconds*fps);}
      }else{
        audioInfo=await decodeProjectAudio(stage.meta,abortController.signal);
        if(fullSong){seconds=Math.max(Number(stage.meta.audio_duration_sec)||0,audioInfo.buffer.duration);
          frameCount=Math.ceil(seconds*fps);}
      }
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
        // Diagnostic A/B knob only: keep the historical 4 MiB default.
        const requestedMiB=Number(window.__scoreMotionOpfsChunkMiBOverride??opfsChunkMiB);
        const chunkMiB=[2,4,8,16,32].includes(requestedMiB)?requestedMiB:4;
        target=new StreamTarget(mp4Diagnostics.instrumentOpfs(await handle.createWritable()),
          {chunked:true,chunkSize:chunkMiB*1048576});
      }else if(storage==='discard')target=new NullTarget();
      else if(storage==='memory')target=new BufferTarget();
      else throw Error('Unsupported MP4 target: '+storage);
      output=new Output({format:new Mp4OutputFormat(),target});
      const rate=videoBitrate==='auto'?new Quality(videoQuality):new Quality({bitrate:Number(videoBitrate)*1_000_000});
      // Prefer the dedicated H.264 hardware engine where supported.
      // Fall back to the previous default when the hint is unsupported.
      let acceleration='no-preference';
      if(typeof VideoEncoder!=='undefined'&&window.__scoreMotionHardwareAccelerationOverride!=='no-preference'){
        const bitRateHint=videoBitrate==='auto'?Math.min(100_000_000,Math.max(8_000_000,Math.round(width*height*fps*.14))):Number(videoBitrate)*1_000_000;
        const codecs=width*height*fps>1920*1080*60?['avc1.640034']:
          width*height*fps>1920*1080*30?['avc1.64002a','avc1.640034']:['avc1.420028','avc1.64002a'];
        for(const codec of codecs){
          try{
            const check=await VideoEncoder.isConfigSupported({codec,width,height,framerate:fps,bitrate:bitRateHint,hardwareAcceleration:'prefer-hardware'});
            if(check.supported){acceleration='prefer-hardware';break;}
          }catch(_){}
        }
      }
      const selectedEngine=window.__scoreMotionVideoEngineOverride??videoEngine;
      if(!['canvas','direct'].includes(selectedEngine))throw Error('Unknown MP4 video engine: '+selectedEngine);
      window.__scoreMotionActiveVideoEngine=selectedEngine;
      if(selectedEngine==='direct'){
        // Explicit experiment. Keep CanvasSource unchanged as the production default.
        const config=await findDirectEncoderConfig({width,height,fps,bitrate:videoBitrate,
          acceleration:window.__scoreMotionHardwareAccelerationOverride||acceleration});
        directSource=new DirectVideoEncoderSource({canvas,fps,config,diagnostics:mp4Diagnostics});
        source=directSource;
        output.addVideoTrack(directSource.packetSource,{frameRate:fps});
        window.__offlineEncoderAcceleration=config.hardwareAcceleration;
      }else{
        source=new CanvasSource(canvas,{codec:'avc',quality:rate,hardwareAcceleration:acceleration,
          onEncodedSample:sample=>mp4Diagnostics.videoSample(sample),
          onEncodedPacket:packet=>mp4Diagnostics.videoPacket(packet)});
        window.__offlineEncoderAcceleration=acceleration;
        output.addVideoTrack(source,{frameRate:fps});
      }
      videoQueue=new VideoEncodeQueue(source,{maxInFlight:maxEncodeInFlight,
        onComplete(frame,elapsed){times.encode[frame]=elapsed;},
        onSubmit(frame,elapsed){mp4Diagnostics.canvasSubmit(elapsed);}});
      if(audioInfo)audioTrack=createAacSource(output);
      await output.start();
      if(audioTrack){
        const audioStarted=performance.now();
        audioTask=(generatedAudio
          ? encodeGeneratedPianoAac(audioTrack.source,stage.meta,seconds,()=>cancelRequested,
              abortController.signal,progress=>{window.__scoreMotionOfflineAudioProgress=progress;},
              ()=>completed/fps)
          : encodeAudioSamples(audioTrack.source,audioInfo.buffer,seconds,()=>cancelRequested))
          .then(stats=>{audioEncodeStats=stats;audioTrack.source.close();})
          .catch(error=>{audioEncodeError=error;})
          .finally(()=>{audioEncodeMs=performance.now()-audioStarted;});
      }
    }
    reportPhase('rendering');
    // Keep the legacy 2-call queue but ALSO bound raw frames outstanding in
    // the actual H.264 encoder. Previously 5,000+ samples could accumulate
    // even though VideoEncodeQueue.inFlight never exceeded 2.
    const backlogLimit=Number(window.__scoreMotionMaxEncoderBacklogOverride??maxEncoderBacklog);
    if(!Number.isInteger(backlogLimit)||backlogLimit<0||backlogLimit>1024)
      throw Error('maxEncoderBacklog must be 0 (off) or between 1 and 1024.');
    for(let frame=0;frame<frameCount;frame++){
      if(frame===cancelAtFrame)cancelRequested=true;
      if(audioEncodeError)throw audioEncodeError;
      directSource?.assertHealthy();
      if(cancelRequested)throw Error('Cancelled');
      // Pause BEFORE stage.seek()/compose(): prevent thousands of GPU-backed
      // VideoSamples from accumulating beyond encoder throughput.
      const packetWaitStart=performance.now();
      if(videoQueue&&backlogLimit>0)
        await mp4Diagnostics.waitForEncoderRoom(backlogLimit,{signal:abortController.signal});
      times.encoderPacketWait.push(performance.now()-packetWaitStart);
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
          keyboardPixelProbe=metrics.keyboardPixelProbe||null;}}
      times.compose.push(performance.now()-before);
      // Capture the just-composed canvas synchronously, then allow the next
      // GPU composition to overlap a bounded number of encoder submissions.
      // The queue records full submission latency separately from time spent
      // waiting for an available slot (encoder backpressure).
      if(videoQueue){
        times.encode.push(0);
        times.encodeBackpressure.push(await videoQueue.add(time,1/fps,frame));
      }else{times.encode.push(0);times.encodeBackpressure.push(0);}
      completed++;
      if(frame%20===0){
        const mean100=values=>{const tail=values.slice(-100);return +(tail.reduce((a,b)=>a+b,0)/Math.max(1,tail.length)).toFixed(2);};
        const cpuTiming100Ms={scene:mean100(times.scene),compose:mean100(times.compose),
          piano:mean100(times.piano),score:mean100(times.score),effects:mean100(times.effects),
          svgDecode:mean100(times.svgDecode),encode:mean100(times.encode),
          encodeBackpressure:mean100(times.encodeBackpressure),
          encoderPacketWait:mean100(times.encoderPacketWait)};
        window.__offlineProgress={mode,phase:'rendering',lastUpdatedMs:performance.now(),completed,frameCount,svgDecodes,svgCacheHits,
          visibleSvgTiles,rasterCachePeakBytes,pianoLayerInfo,keyboardCamera,keyboardPixelProbe,cpuTiming100Ms,
          videoEngine:window.__scoreMotionActiveVideoEngine||'canvas',directEncoder:directSource?.snapshot()||null,
          encodeInFlight:videoQueue?.inFlight||0,encodePeakInFlight:videoQueue?.peakInFlight||0,
          encodeMaxInFlight:videoQueue?.maxInFlight||0,
          encoderBacklogLimit:backlogLimit,mp4:mp4Diagnostics.snapshot()};
        jsHeapPeak=Math.max(jsHeapPeak,performance.memory?.usedJSHeapSize||0);await new Promise(resolve=>setTimeout(resolve,0));}
    }
    // All outstanding video frames must be encoded before muxer finalization.
    // The last progress display used to remain stuck at frameCount-14 even
    // while the output was draining/finalizing. Expose each actual stage.
    if(videoQueue){const drainStarted=performance.now();await awaitFinalStep(videoQueue.drain(),'draining-video');
      if(directSource)await awaitFinalStep(directSource.drain(),'draining-encoder');
      videoDrainMs=performance.now()-drainStarted;source.close();}
    const audioWaitStarted=performance.now();if(audioTask)await awaitFinalStep(audioTask,'draining-audio',Math.max(180000,Math.ceil(seconds*1000)));
    audioWaitMs=performance.now()-audioWaitStarted;
    if(audioEncodeError)throw audioEncodeError;
    if(cancelRequested)throw Error('Cancelled');
    const finalizeStarted=performance.now();if(output)await awaitFinalStep(output.finalize(),'finalizing-mp4');finalized=true;
    const finalizeMs=performance.now()-finalizeStarted;
    if(cancelRequested)throw Error('Cancelled');
    reportPhase('reading-file');
    const readStarted=performance.now();
    const resultFile=opfs?await awaitFinalStep(opfs.handle.getFile(),'reading-file'):null;
    readFileMs=performance.now()-readStarted;
    const bytes=resultFile?.size||output?.target.buffer?.byteLength||0;
    if(capturePixels&&composer)throw Error('GPU 합성에서는 Canvas2D 픽셀 캡처를 지원하지 않습니다.');
    if(output&&storage!=='discard'){
      window.__offlineResult=resultFile||new Blob([output.target.buffer],{type:'video/mp4'});
      if(opfs){const {directory,name}=opfs;releaseResult=()=>directory.removeEntry(name);}
    }else window.__offlineResult=null;
    const fxRequested=stage?.settings?.piano?.fxRenderer||'canvas';
    const fxPiano=stage?.piano?.dynamic&&!stage?.settings?.effects?.minimalMode?'dynamic-webgl2':stage?.piano?.gpu?'pixi':'canvas';
    const fxScore=stage?.scoreGpu?'pixi':'canvas';
    reportPhase('completed',{mp4:mp4Diagnostics.snapshot()});
    const result={mode,pianoMode,pianoOptimizationApplied:false,scoreGlow,startSeconds,width,height,fps,seconds,frames:completed,bytes,
      videoEngine:window.__scoreMotionActiveVideoEngine||'canvas',directEncoder:directSource?.snapshot()||null,
      encoderAcceleration:window.__offlineEncoderAcceleration||'no-preference',finalStagesMs:Object.fromEntries(
        Object.entries(phaseTimes).map(([name,time])=>[name,Math.round(time-started)])),
      fxRendererRequested:fxRequested,fxRendererPiano:fxPiano,fxRendererScore:fxScore,
      fxPianoStats:stage?.piano?.gpu?.stats()||null,fxScoreStats:stage?.scoreGpu?.stats()||null,
      audioMode,storage:storage==='discard'?'discard':opfs?'opfs':'memory',audioInputBytes:audioInfo?.inputBytes||0,
      audioFetchMs:+(audioInfo?.fetchMs||0).toFixed(2),audioDecodeMs:+(audioInfo?.decodeMs||0).toFixed(2),
      audioEncodeMs:+audioEncodeMs.toFixed(2),audioWaitMs:+audioWaitMs.toFixed(2),
      audioEncodedPackets:audioTrack?.packetCount||0,audio:audioEncodeStats,
      generatedAudio,generatedAudioProgress:window.__scoreMotionOfflineAudioProgress,
      wallSec:+((performance.now()-started)/1000).toFixed(2),scene:summary(times.scene),compose:summary(times.compose),scoreOverlay:summary(times.scoreOverlay),scoreOverlayStats:null,staticHeads:null,titleDrawCalls:0,titleSkipped:0,background:summary(times.background),piano:summary(times.piano),pianoPaint:summary(times.pianoPaint),pianoCopy:summary(times.pianoCopy),pianoCalls:0,pianoResizes:0,pianoCopiedPixels:0,pianoDrawInfo:null,spriteCreates:0,spriteHits:0,spriteBuildMs:0,peakSpriteBytes:0,spriteEvictions:0,jsHeapStart,jsHeapPeak,jsHeapEnd:performance.memory?.usedJSHeapSize||null,score:summary(times.score),effects:summary(times.effects),svgDecode:summary(times.svgDecode),svgDecodes,svgCacheHits,visibleSvgTiles,rasterCachePeakBytes,pianoLayerInfo,keyboardCamera,keyboardPixelProbe,encode:summary(times.encode),encodeBackpressure:summary(times.encodeBackpressure),
      encoderPacketWait:summary(times.encoderPacketWait),encoderBacklogLimit:backlogLimit,
      encodeMaxInFlight:videoQueue?.maxInFlight||0,encodePeakInFlight:videoQueue?.peakInFlight||0,
      finalizeMs:+finalizeMs.toFixed(2),videoDrainMs:+videoDrainMs.toFixed(2),readFileMs:+readFileMs.toFixed(2),
      mp4Diagnostics:mp4Diagnostics.snapshot()};
    window.__offlineLastMetrics=result;
    return result;
  }catch(error){cancelRequested=true;reportPhase('failed',{
      error:String(error?.message||error),mp4:mp4Diagnostics.snapshot()});
    const settleWithin=async(promise,ms=12000)=>{let timer;try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(resolve,ms);})]);}finally{clearTimeout(timer);}};
    if(videoQueue)try{await settleWithin(videoQueue.settle());}catch(_){}
    directSource?.abort();
    if(output&&!finalized)try{await settleWithin(output.cancel());}catch(_){}
    if(audioTask)try{await settleWithin(audioTask);}catch(_){}
    if(opfs)try{await opfs.directory.removeEntry(opfs.name);}catch(_){}
    throw error;}
  finally{
    activeAbort=null;audioInfo=null;
    composer?.close();
    window.__offlineLastProgress=window.__offlineProgress;window.__offlineProgress=null;
    if(window.__scoreExportFrameCanvas===canvas)window.__scoreExportFrameCanvas=null;
  }
}};
