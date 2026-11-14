/* Isolated 30-second profiling harness. No production playback settings change. */
window.ScoreWebmProbe={async run({mode,seconds=30,mime='video/webm;codecs=vp8'}){
  window.ScoreWebmProbe.lastBlob=null;
  const stage=window.__scoreVideoDebug.getStage();
  const needStage=['stage','compose','record-compose'].includes(mode);
  const needComposer=['compose','record-compose'].includes(mode);
  const needRecorder=mode.startsWith('record-');
  const composer=needComposer?await window.ScoreWebmRecorder.createDiagnosticComposer(stage):null;
  const canvas=composer?.canvas||document.createElement('canvas');
  if(!composer){canvas.width=stage.settings.width;canvas.height=stage.settings.height;}
  const ctx=!composer?canvas.getContext('2d',{alpha:false}):null;
  const samples={rafGap:[],stageMs:[],composeMs:[],backgroundMs:[],pianoMs:[],scoreMs:[],effectsMs:[],svgDecodeMs:[],svgDecodes:0};
  let recorder=null,chunks=[];
  if(needRecorder){
    recorder=new MediaRecorder(canvas.captureStream(30),{mimeType:mime,videoBitsPerSecond:5_000_000});
    recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    recorder.start(1000);
  }
  const start=performance.now();let prior=0,frames=0;
  await new Promise(resolve=>{
    const frame=async now=>{
      if(prior)samples.rafGap.push(now-prior);prior=now;
      const t=Math.min(seconds,(now-start)/1000);
      if(needStage){const before=performance.now();stage.seek(t);samples.stageMs.push(performance.now()-before);}
      if(needComposer){const detail=await composer.compose(t);for(const key of ['totalMs','backgroundMs','pianoMs','scoreMs','effectsMs','svgDecodeMs'])samples[key==='totalMs'?'composeMs':key].push(detail[key]);samples.svgDecodes+=detail.svgDecodes;}
      else if(ctx){ctx.fillStyle='#101820';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#61dce5';ctx.fillRect(mode==='record-animate'?((t*220)%(canvas.width-80)):canvas.width*.5,canvas.height*.4,80,120);}
      frames++;
      if(now-start>=seconds*1000)resolve();else requestAnimationFrame(frame);
    };requestAnimationFrame(frame);
  });
  if(recorder){const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.stop();await stopped;window.ScoreWebmProbe.lastBlob=new Blob(chunks,{type:mime});}
  composer?.close();
  const summary={mode,width:canvas.width,height:canvas.height,mime,wallSeconds:(performance.now()-start)/1000,frames,blobBytes:window.ScoreWebmProbe.lastBlob?.size||0,svgDecodes:samples.svgDecodes};
  for(const [key,values] of Object.entries(samples)){if(!Array.isArray(values)||!values.length)continue;const sorted=[...values].sort((a,b)=>a-b);summary[key]={mean:values.reduce((a,b)=>a+b,0)/values.length,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],max:sorted.at(-1)};}
  return summary;
}};
