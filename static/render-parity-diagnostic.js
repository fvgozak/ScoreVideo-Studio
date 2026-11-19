/* ScoreMotion render parity: opt-in, read-only frame investigation.
 * Enabled only with ?render_debug=1. No production frame loop instrumentation. */
(function(root){
 'use strict';
 const enc=new TextEncoder();
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function copyCanvas(source){
   if(!source||!source.width||!source.height)throw Error('발광 캔버스가 비어 있습니다.');
   const out=document.createElement('canvas');out.width=source.width;out.height=source.height;
   const ctx=out.getContext('2d',{willReadFrequently:true,alpha:true});
   if(!ctx)throw Error('Canvas 2D 컨텍스트 생성 실패');
   ctx.drawImage(source,0,0);
   return out;
 }
 function pixelStats(canvas){
   const {width,height}=canvas,ctx=canvas.getContext('2d',{willReadFrequently:true});
   if(!ctx)throw Error('Pixel readback failed');
   const rgba=ctx.getImageData(0,0,width,height).data;
   // Full footprint at A/B, stride on full-frame compositor to limit diagnostic CPU.
   const step=width*height>1500000?3:1;
   let count=0,coverage=0,alphaSum=0,lightSum=0,minX=width,minY=height,maxX=-1,maxY=-1;
   for(let y=0;y<height;y+=step)for(let x=0;x<width;x+=step){
     const i=(y*width+x)*4,a=rgba[i+3];count++;alphaSum+=a;
     lightSum+=(rgba[i]*.2126+rgba[i+1]*.7152+rgba[i+2]*.0722)*a/255;
     if(a>=8){coverage++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
   }
   const bbox=maxX<0?null:[minX,minY,maxX,maxY];
   return {width,height,stride:step,sampled:count,coveragePixelsEstimate:Math.round(coverage*step*step),
     alphaMassEstimate:Math.round(alphaSum*step*step),lightMassEstimate:Math.round(lightSum*step*step),bbox};
 }
 function diffStats(a,b){
   if(a.width!==b.width||a.height!==b.height)return {comparable:false,reason:'dimension_mismatch'};
   const A=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
   const B=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
   const step=a.width*a.height>1500000?4:1;
   let n=0,abs=0,max=0,changed=0,alphaAbs=0;
   for(let y=0;y<a.height;y+=step)for(let x=0;x<a.width;x+=step){
     const i=(y*a.width+x)*4;
     for(let k=0;k<4;k++){const d=Math.abs(A[i+k]-B[i+k]);abs+=d;max=Math.max(max,d);if(k===3)alphaAbs+=d;}
     if(Math.abs(A[i+3]-B[i+3])>3||Math.abs(A[i]-B[i])>3||Math.abs(A[i+1]-B[i+1])>3||Math.abs(A[i+2]-B[i+2])>3)changed++;
     n++;
   }
   return {comparable:true,samples:n,rgbaMae:+(abs/(n*4)).toFixed(4),alphaMae:+(alphaAbs/n).toFixed(4),maxChannelError:max,
     changedFraction:+(changed/n).toFixed(5)};
 }
 function contribution(withGlow,withoutGlow){
   if(withGlow.width!==withoutGlow.width||withGlow.height!==withoutGlow.height)throw Error('합성 이미지 크기가 서로 다릅니다');
   const {width,height}=withGlow;
   const c=document.createElement('canvas');c.width=width;c.height=height;
   const ctx=c.getContext('2d',{willReadFrequently:true});
   const a=withGlow.getContext('2d').getImageData(0,0,width,height).data;
   const b=withoutGlow.getContext('2d').getImageData(0,0,width,height).data;
   const out=ctx.createImageData(width,height);let changed=0,delta=0;
   for(let i=0;i<a.length;i+=4){
     const dr=Math.abs(a[i]-b[i]),dg=Math.abs(a[i+1]-b[i+1]),db=Math.abs(a[i+2]-b[i+2]);
     const m=Math.max(dr,dg,db);if(m>=3)changed++;
     delta+=dr+dg+db;
     // Diagnostic difference image: visible even for a small soft halo.
     out.data[i]=clamp(dr*3,0,255);out.data[i+1]=clamp(dg*3,0,255);
     out.data[i+2]=clamp(db*3,0,255);out.data[i+3]=255;
   }
   ctx.putImageData(out,0,0);
   return {canvas:c,stats:{changedPixels:changed,meanRgbChannelDelta:+(delta/(width*height*3)).toFixed(4)}};
 }
 function crc32(bytes){
   let crc=-1;
   for(let i=0;i<bytes.length;i++){
     crc^=bytes[i];for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
   }
   return (crc^-1)>>>0;
 }
 function writeZip(files){
   // ZIP stored entries: PNG data is compressed already. No dependencies/network.
   let position=0;const local=[],central=[];
   const u16=(v,n,o)=>v.setUint16(o,n,true),u32=(v,n,o)=>v.setUint32(o,n>>>0,true);
   for(const {name,bytes} of files){
     const fname=enc.encode(name),size=bytes.length,crc=crc32(bytes);
     const localHeader=new Uint8Array(30+fname.length),lv=new DataView(localHeader.buffer);
     u32(lv,0x04034b50,0);u16(lv,20,4);u16(lv,0,6);u16(lv,0,8);
     u32(lv,crc,14);u32(lv,size,18);u32(lv,size,22);u16(lv,fname.length,26);
     localHeader.set(fname,30);local.push(localHeader,bytes);
     const center=new Uint8Array(46+fname.length),cv=new DataView(center.buffer);
     u32(cv,0x02014b50,0);u16(cv,20,4);u16(cv,20,6);
     u32(cv,crc,16);u32(cv,size,20);u32(cv,size,24);u16(cv,fname.length,28);u32(cv,position,42);
     center.set(fname,46);central.push(center);position+=localHeader.length+size;
   }
   const centralSize=central.reduce((sum,x)=>sum+x.length,0);
   const end=new Uint8Array(22),ev=new DataView(end.buffer);
   u32(ev,0x06054b50,0);u16(ev,files.length,8);u16(ev,files.length,10);
   u32(ev,centralSize,12);u32(ev,position,16);
   return new Blob([...local,...central,end],{type:'application/zip'});
 }
 async function bytesOf(canvas){
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG 인코딩 실패')),'image/png'));
   return new Uint8Array(await blob.arrayBuffer());
 }
 async function videoFrame(file,time,expectedWidth,expectedHeight){
   if(!file)return null;
   const video=document.createElement('video');video.muted=true;video.preload='auto';video.playsInline=true;
   const url=URL.createObjectURL(file);video.src=url;
   const wait=(type)=>new Promise((resolve,reject)=>{
     const timeout=setTimeout(()=>{cleanup();reject(Error(`MP4 ${type} 대기 시간 초과`));},15000);
     const cleanup=()=>{clearTimeout(timeout);video.removeEventListener(type,done);video.removeEventListener('error',err);};
     const done=()=>{cleanup();resolve();};const err=()=>{cleanup();reject(Error('MP4 디코딩 실패'));};
     video.addEventListener(type,done,{once:true});video.addEventListener('error',err,{once:true});
   });
   try{
     if(video.readyState<1)await wait('loadedmetadata');
     if(time>video.duration+0.01)throw Error('선택한 프레임 시간이 MP4 길이를 초과합니다.');
     const seekTo=Math.min(Math.max(0,time+0.00001),Math.max(0,video.duration-0.001));
     if(Math.abs(video.currentTime-seekTo)>0.0001){const seeked=wait('seeked');video.currentTime=seekTo;await seeked;}
     // rVFC provides decoded mediaTime where supported; timeout fallback to seeked.
     let mediaTime=null;
     if(video.requestVideoFrameCallback){
       mediaTime=await Promise.race([
         new Promise(resolve=>video.requestVideoFrameCallback((_,meta)=>resolve(meta.mediaTime))),
         new Promise(resolve=>setTimeout(()=>resolve(null),500))]);
     }
     const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
     canvas.getContext('2d').drawImage(video,0,0);
     return {canvas,mediaTime,seekTo,videoDuration:video.duration,
       dimensionsMatch:video.videoWidth===expectedWidth&&video.videoHeight===expectedHeight};
   }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
 }
 function gpuCapabilities(stage,composer){
   const probe=renderer=>{
     const gl=renderer?.gl;
     if(!gl)return {hasContext:false};
     try{return {hasContext:true,contextLost:gl.isContextLost?.()||false,
       maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),
       maxRenderbufferSize:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
       maxViewportDims:Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)||[]),
       maxTextureUnits:gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)};
     }catch(error){return {error:String(error?.message||error)};}
   };
   return {score:probe(stage.scoreGpu?.app?.renderer),composer:probe(composer?.app?.renderer)};
 }
 function resizeForShortEdge(dimensions,shortEdge){
   if(!dimensions?.width||!dimensions?.height)throw Error('출력 해상도를 먼저 선택하세요.');
   const scale=shortEdge/Math.min(dimensions.width,dimensions.height);
   const even=n=>2*Math.round(n/2);
   return {width:even(dimensions.width*scale),height:even(dimensions.height*scale)};
 }
 function normalizedGlow(metrics){
   const m=metrics?.original,box=m?.bbox;
   if(!m?.width||!m?.height)return null;
   const area=m.width*m.height;
   return {alphaMassPerPixel:+(m.alphaMassEstimate/area).toFixed(5),
     lightMassPerPixel:+(m.lightMassEstimate/area).toFixed(5),
     coverageFraction:+(m.coveragePixelsEstimate/area).toFixed(6),
     bboxFraction:box?[+(Math.max(0,box[2]-box[0])/m.width).toFixed(4),
       +(Math.max(0,box[3]-box[1])/m.height).toFixed(4)]:null};
 }
 // Run one full-quality frame at a time. Reusing a compositor between qualities
 // can leave stale textures; capture() owns and disposes it for each pass.
 async function captureResolutionPair({seconds=0,fps=30,mp4=null,qualities=[1440,2160],onStatus=()=>{}}={}){
   const base=root.__scoreVideoDebug?.config?.();
   if(!base)throw Error('진단용 설정을 읽지 못했습니다.');
   const files=[],entries=[],warnings=[];
   for(let i=0;i<qualities.length;i++){
     const short=qualities[i],dimensions=resizeForShortEdge(base,short);
     const name=`${short}p`;
     onStatus(`${name} (${dimensions.width}×${dimensions.height}) 진단 중 (${i+1}/${qualities.length})…`);
     // User MP4 is from the selected 4K export; never compare it to 1440p.
     const result=await capture({seconds,fps,dimensions,mp4:i===qualities.length-1?mp4:null,
       onStatus:msg=>onStatus(`${name}: ${msg}`)});
     files.push({name:`${name}_diagnostic.zip`,bytes:new Uint8Array(await result.blob.arrayBuffer())});
     entries.push({quality:short,dimensions,frameTimeSeconds:result.report.frameTimeSeconds,
       original:normalizedGlow(result.report),mirror:result.report.mirror,
       mirrorVsOriginal:result.report.originalVsMirror,
       gpuGlowContribution:result.report.gpuGlowContribution,
       gpu:result.report.gpu,pixiFxStats:result.report.pixiFxStats,
       warnings:result.report.warnings});
     warnings.push(...result.report.warnings.map(w=>`${name}: ${w}`));
   }
   const ratio=(a,b)=>a>0&&b>0?+(b/a).toFixed(3):null;
   const low=entries[0],high=entries[entries.length-1];
   const comparison={schema:'scoremotion-resolution-parity/1',qualities,
     sameFrameTime:entries.every(x=>x.frameTimeSeconds===low.frameTimeSeconds),
     frameTimeSeconds:low.frameTimeSeconds,profiles:entries,
     relativeChange:{alphaMassPerPixelRatio:ratio(low.original?.alphaMassPerPixel,high.original?.alphaMassPerPixel),
       coverageFractionRatio:ratio(low.original?.coverageFraction,high.original?.coverageFraction),
       lightMassPerPixelRatio:ratio(low.original?.lightMassPerPixel,high.original?.lightMassPerPixel),
       gpuGlowChangedPixelFractionRatio:ratio(low.gpuGlowContribution.changedPixels/(low.dimensions.width*low.dimensions.height),
         high.gpuGlowContribution.changedPixels/(high.dimensions.width*high.dimensions.height))},warnings};
   if(comparison.relativeChange.alphaMassPerPixelRatio!==null&&comparison.relativeChange.alphaMassPerPixelRatio<.75)
     warnings.push('4K Pixi 원본의 상대 후광 알파가 1440p보다 25% 이상 낮습니다. 발광 생성(크기/블러/GPU 메모리) 문제를 우선 확인하세요.');
   if(comparison.relativeChange.gpuGlowChangedPixelFractionRatio!==null&&comparison.relativeChange.gpuGlowChangedPixelFractionRatio<.75)
     warnings.push('4K GPU 합성에서 후광이 영향을 주는 상대 픽셀 비율이 25% 이상 감소했습니다. 원본과 합성 간 손실을 비교하세요.');
   if(!comparison.sameFrameTime)warnings.push('두 렌더링의 프레임 시각이 다릅니다.');
   files.push({name:'resolution_comparison.json',bytes:enc.encode(JSON.stringify(comparison,null,2))});
   files.push({name:'README_4K.txt',bytes:enc.encode([
     'ScoreMotion 1440p vs 4K controlled diagnostic',
     'Both samples use the same project, effect configuration, musical timestamp and aspect ratio.',
     'In each inner ZIP: A = original Pixi glow, B = 2D mirror, C = GPU full, C_no_glow = without Pixi glow, D = optional MP4 decoded frame.',
     'Compare 1440p/A vs 2160p/A for size-dependent bloom generation.',
     'Compare A vs B and C vs C_no_glow within 2160p for transfer/composition problems.',
     'Compare 2160p/C vs D when a matching 4K MP4 was supplied (encoder differences).',
     'Both samples run at true output resolution; intermediate frame captures may use considerable GPU memory.',
     'The ratios in resolution_comparison.json are estimates, not final visual matching scores.'
   ].join('\n'))});
   return {blob:writeZip(files),report:comparison};
 }

 async function capture({seconds=0,fps=30,mp4=null,dimensions=null,onStatus=()=>{}}={}){
   const debug=root.__scoreVideoDebug,stage=debug?.getStage?.();
   if(!stage?.scoreGpu?.app?.canvas)throw Error('Pixi 악보 빛이 활성화된 프로젝트를 먼저 불러오세요.');
   if(!Number.isFinite(seconds)||seconds<0||!Number.isFinite(fps)||fps<=0)throw Error('시간 또는 FPS가 잘못됐습니다.');
   const frame=Math.round(seconds*fps),time=frame/fps;
   const audio=document.getElementById('audioPlayer'),previousTime=stage.time;
   if(audio&&!audio.paused)audio.pause();
   let composer=null,prepared=false;
   try{
     onStatus('출력 해상도로 전환 중…');
     if(typeof debug.prepareExportStage==='function'){
       prepared=true;await debug.prepareExportStage(dimensions);
     }
     const outputStage=debug.getStage?.()||stage;
     outputStage.seek(time);
     const source=outputStage.scoreGpu?.app?.canvas;
     if(!source)throw Error('선택한 시간에서 Pixi 원본 빛 캔버스가 없습니다.');
     onStatus('A: Pixi 원본 발광 캡처…');
     const A=copyCanvas(source);
     onStatus('B·C: 미러와 GPU 합성 캡처…');
     composer=await root.ScoreWebmRecorder.createDiagnosticComposer(outputStage);
     const composeMetrics=await composer.compose(time);
     const Bsource=composer.canvasMirrors.get(source)?.canvas;
     if(!Bsource)throw Error('미러를 찾지 못했습니다. 해당 Pixi 캔버스가 출력에 포함되지 않았을 가능성이 있습니다.');
     const B=copyCanvas(Bsource),C=copyCanvas(composer.canvas);
     // Isolate the actual GPU contribution of the source halo, avoiding a
     // misleading whole-image comparison against the transparent layer.
     onStatus('C−Glow: 발광 기여량 계산…');
     const previousDisplay=source.style.display;
     let noGlow;
     try{source.style.display='none';await composer.compose(time);noGlow=copyCanvas(composer.canvas);}
     finally{source.style.display=previousDisplay;}
     const result=contribution(C,noGlow);
     const D=mp4?await videoFrame(mp4,time,C.width,C.height):null;
     const metrics={schema:'scoremotion-render-parity/1',captureTime:new Date().toISOString(),requestedSeconds:seconds,
       frame,fps,frameTimeSeconds:time,stageResolution:[C.width,C.height],sourceCanvasSize:[A.width,A.height],
       stageCssSize:[outputStage.viewport.clientWidth,outputStage.viewport.clientHeight],
       previewOriginalBeforeExport:[stage.settings.width,stage.settings.height],
       scoreGlowSettings:outputStage.settings?.gpuEffects?.glow||null,
       pixiRendererType:outputStage.scoreGpu?.app?.renderer?.type??null,
       gpu:gpuCapabilities(outputStage,composer),
       pixiFxStats:outputStage.scoreGpu?.stats?.()||null,
       original:pixelStats(A),mirror:pixelStats(B),originalVsMirror:diffStats(A,B),
       gpuFull:pixelStats(C),gpuWithoutGlow:pixelStats(noGlow),gpuGlowContribution:result.stats,
       composer:composeMetrics.scoreGlowTransferInfo||null,
       mp4:D?{file:mp4.name,decodedMediaTime:D.mediaTime,requestedSeekTime:D.seekTo,duration:D.videoDuration,
         dimensionsMatch:D.dimensionsMatch,frame:pixelStats(D.canvas),gpuVsMp4:diffStats(C,D.canvas)}:null};
     const warnings=[];
     if(metrics.original.alphaMassEstimate===0)warnings.push('A 원본에서 알파 발광이 감지되지 않았습니다. 정확한 타건 시점을 선택하세요.');
     else if(metrics.mirror.alphaMassEstimate<metrics.original.alphaMassEstimate*.95)warnings.push('A→B 발광 알파가 5% 이상 감소했습니다. WebGL 복사 경로를 우선 점검하세요.');
     if(metrics.gpuGlowContribution.changedPixels===0)warnings.push('C 합성 결과에 발광 기여 픽셀이 없습니다. GPU 텍스처/블렌드/마스크 점검이 필요합니다.');
     if(D&&!D.dimensionsMatch)warnings.push('C와 MP4 해상도가 다릅니다. 픽셀 비교는 생략했습니다.');
     if(D&&D.mediaTime!==null&&Math.abs(D.mediaTime-time)>1/fps+.001)warnings.push('MP4 실제 디코딩 시각이 선택 프레임보다 1프레임 이상 차이납니다.');
     metrics.warnings=warnings;
     onStatus('PNG·분석표를 ZIP으로 묶는 중…');
     const images=[['A_pixi_original.png',A],['B_2d_mirror.png',B],['C_gpu_composite.png',C],
       ['C_no_glow.png',noGlow],['C_glow_difference_x3.png',result.canvas]];
     if(D)images.push(['D_mp4_decoded.png',D.canvas]);
     const files=[];for(const [name,canvas] of images)files.push({name,bytes:await bytesOf(canvas)});
     files.push({name:'report.json',bytes:enc.encode(JSON.stringify(metrics,null,2))});
     files.push({name:'README.txt',bytes:enc.encode([
       'ScoreMotion Render Parity Probe v1',
       'A: actual live PixiJS score bloom canvas (transparent)',
       'B: GPUComposer persistent 2D mirror of A (transparent)',
       'C: full GPU composited frame with bloom',
       'C_no_glow: recomposed with score Pixi canvas temporarily hidden',
       'C_glow_difference_x3: absolute RGB difference, 3x amplified',
       'D: optional decoded user-supplied MP4 frame (not the compressed bitstream)',
       'report.json: alpha footprint, energy, A/B pixel error, GPU glow contribution, export dimensions and warnings',
       'Compare A and B to isolate transfer losses; C with C_no_glow for composition losses; C with D for encoder/decode losses.',
       'Do not use D comparison if FPS/start offset or resolution does not match.',
       'No original project files or audio are packaged.'
     ].join('\n'))});
     return {blob:writeZip(files),report:metrics};
   }finally{
     composer?.close();
     if(prepared)await debug.restorePreviewStage();
     (debug.getStage?.()||stage)?.seek(previousTime);
   }
 }
 function install(){
   if(!new URLSearchParams(location.search).has('render_debug'))return;
   const panel=document.createElement('section');panel.id='renderParityPanel';
   panel.style.cssText='position:fixed;z-index:2147483600;right:12px;bottom:12px;width:min(340px,calc(100vw - 24px));box-sizing:border-box;padding:14px;border:1px solid #566;box-shadow:0 6px 30px #000a;border-radius:12px;background:#141820;color:#edf3f8;font:13px/1.5 system-ui,sans-serif;';
   panel.innerHTML='<div style="font-size:15px;font-weight:700;margin-bottom:9px">🔬 MP4 빛 비교 진단</div>'+
     '<label>재생 시간 (초) <input data-parity="time" type="number" min="0" step="0.001" value="0" style="width:85px;margin-left:5px"></label> '+
     '<label>FPS <input data-parity="fps" type="number" min="1" max="120" step="1" value="30" style="width:55px;margin-left:5px"></label>'+
     '<label style="display:block;margin-top:8px">비교할 MP4 (선택) <input data-parity="mp4" type="file" accept="video/mp4" style="max-width:100%;display:block"></label>'+
     '<button data-parity="pair" type="button" style="margin-top:10px;padding:8px 12px;border-radius:7px;background:#439172;color:white;border:0;cursor:pointer">1440p ↔ 4K 비교 ZIP</button><div style="font-size:11px;margin-top:3px;color:#abb">같은 프레임으로 두 해상도를 순차 검증 (4K MP4 파일 선택 가능)</div>'+
     '<button data-parity="go" type="button" style="margin-top:10px;padding:8px 12px;border-radius:7px;background:#419ccc;color:white;border:0;cursor:pointer">프레임 진단 ZIP 저장</button> '+
     '<button data-parity="close" type="button" style="background:transparent;border:0;color:#bbb;cursor:pointer">닫기</button>'+
     '<div data-parity="status" role="status" style="white-space:pre-wrap;max-height:140px;overflow:auto;color:#aebec9;margin-top:8px">프로젝트 로드 후 발광하는 시각을 지정하세요. 일반 출력에는 영향이 없습니다.</div>';
   document.body.appendChild(panel);
   const el=k=>panel.querySelector(`[data-parity="${k}"]`),status=el('status');
   const fps=document.getElementById('fps');if(fps)el('fps').value=fps.value;
   const audio=document.getElementById('audioPlayer');if(audio)el('time').value=(audio.currentTime||0).toFixed(3);
   el('close').onclick=()=>panel.remove();
   el('pair').onclick=async()=>{
     const button=el('pair'),other=el('go');button.disabled=true;other.disabled=true;
     try{
       const {blob,report}=await captureResolutionPair({seconds:Number(el('time').value),
         fps:Number(el('fps').value),mp4:el('mp4').files?.[0]||null,
         onStatus:msg=>status.textContent=msg});
       const url=URL.createObjectURL(blob),link=document.createElement('a');
       link.href=url;link.download=`ScoreMotion-1440p-4K-parity-${Date.now()}.zip`;
       document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
       status.textContent=`1440p ↔ 4K 비교 완료. 후광 알파 밀도 비율: ${report.relativeChange.alphaMassPerPixelRatio??'측정 불가'}\n`+
         (report.warnings.length?report.warnings.join('\n'):'경고 없음 — ZIP 내부 PNG도 확인하세요.');
     }catch(err){status.textContent=`진단 실패: ${err?.stack||err}`;console.error('[ScoreMotion 4K parity]',err);}
     finally{button.disabled=false;other.disabled=false;}
   };
   el('go').onclick=async()=>{
     const button=el('go');button.disabled=true;
     try{
       const opts={seconds:Number(el('time').value),fps:Number(el('fps').value),mp4:el('mp4').files?.[0]||null,
         onStatus:msg=>status.textContent=msg};
       const {blob,report}=await capture(opts),url=URL.createObjectURL(blob);
       const link=document.createElement('a');link.href=url;link.download=`ScoreMotion-parity-f${report.frame}-${Date.now()}.zip`;
       document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
       status.textContent=`진단 완료: A→B 평균 오류 ${report.originalVsMirror.rgbaMae}\n`+
         `GPU 발광 기여 픽셀 ${report.gpuGlowContribution.changedPixels.toLocaleString()}\n`+
         (report.warnings.length?report.warnings.join('\n'):'경고 없음 (시각적 완전 일치 판정은 아님)');
     }catch(err){status.textContent=`진단 실패: ${err?.stack||err}`;console.error('[ScoreMotion parity]',err);}
     finally{button.disabled=false;}
   };
 }
 root.ScoreRenderParity={capture,captureResolutionPair,_test:{copyCanvas,pixelStats,diffStats,contribution,crc32,writeZip,resizeForShortEdge,normalizedGlow}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
