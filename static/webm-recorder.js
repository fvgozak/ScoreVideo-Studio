/* Experimental, browser-only, real-time ScoreStage + source audio -> WebM. */
(function(root){
 'use strict';
 const MIME_TYPES=['video/webm;codecs=vp8','video/webm;codecs=vp9','video/webm'];
 const AUDIO_TYPES=['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'];
 // The video track is sampled after composition; lead the visual scene by one
 // output frame while keeping progress and cancellation on the audio clock.
 const VISUAL_LEAD_SECONDS=1/30;
 function supportedType(withAudio=false){return typeof MediaRecorder==='undefined'?'':(withAudio?AUDIO_TYPES:MIME_TYPES).find(type=>MediaRecorder.isTypeSupported(type))||'';}
 const audioGraphs=new WeakMap();
 async function audioGraph(audio){
   let graph=audioGraphs.get(audio);
   if(!graph){
     const context=new AudioContext(),source=context.createMediaElementSource(audio);
     source.connect(context.destination);
     graph={context,source};audioGraphs.set(audio,graph);
   }
   await graph.context.resume();
   const destination=graph.context.createMediaStreamDestination();graph.source.connect(destination);
   return {...graph,destination};
 }
 function storageError(error){return Error(`WebM 임시 저장 실패${error?.name==='QuotaExceededError'?' (저장 공간 부족)':''}: ${error?.message||error}. 디스크 여유 공간을 확인한 뒤 다시 시도하세요.`);}
 async function chunkStore(onError=()=>{}){
   if(navigator.storage?.getDirectory){
     try{
       const directory=await navigator.storage.getDirectory();
       const name=`scorevideo-webm-${crypto.randomUUID()}.part`;
       const handle=await directory.getFileHandle(name,{create:true});
       const writer=await handle.createWritable();let chain=Promise.resolve(),closed=false,pendingBytes=0,failure=null;
       return {
         kind:'opfs',append(blob){
           if(failure)throw failure;
           pendingBytes+=blob.size;
           if(pendingBytes>64*1024*1024){failure=Error('WebM 임시 저장 기록이 인코딩 속도를 따라가지 못합니다.');onError(failure);throw failure;}
           chain=chain.then(async()=>{await writer.write(blob);pendingBytes-=blob.size;}).catch(error=>{failure=storageError(error);onError(failure);});
         },
         async finish(){await chain;if(failure)throw failure;try{await writer.close();closed=true;return await handle.getFile();}catch(error){throw storageError(error);}},
         async discard(){try{await chain;}catch(_){}if(!closed)try{await writer.abort();}catch(_){}try{await directory.removeEntry(name);}catch(_){}},
         async release(){try{await directory.removeEntry(name);}catch(_){}}
       };
     }catch(_){}
   }
   const chunks=[];let bytes=0;
   return {kind:'memory',append(blob){bytes+=blob.size;if(bytes>256*1024*1024)throw Error('임시 저장소를 사용할 수 없어 WebM 메모리 한도(256MB)를 넘었습니다. 디스크 여유 공간과 브라우저 저장소 권한을 확인하세요.');chunks.push(blob);},
     async finish(type){return new Blob(chunks,{type});},async discard(){chunks.length=0;},async release(){chunks.length=0;}};
 }
 async function cleanupOldChunks(){
   if(!navigator.storage?.getDirectory)return;
   try{
     const directory=await navigator.storage.getDirectory();
     for await(const [name,handle] of directory.entries()){
       if(!/^scorevideo-webm-.*\.part$/.test(name))continue;
       const file=await handle.getFile();
       if(Date.now()-file.lastModified>24*60*60*1000)await directory.removeEntry(name);
     }
   }catch(_){}
 }
 void cleanupOldChunks();
 async function imageFromSvg(xml){const blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'});const url=URL.createObjectURL(blob);try{const image=new Image();image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url);}}
 function drawLiveCanvases(ctx,stage,kind){
   const viewport=stage.viewport,base=viewport.getBoundingClientRect();
   if(!base.width||!base.height)return;
   const sx=stage.settings.width/base.width,sy=stage.settings.height/base.height;
   const canvases=[...viewport.querySelectorAll('canvas')].filter(canvas=>canvas.width&&canvas.height&&getComputedStyle(canvas).display!=='none'&&
     (kind==='piano'?canvas.classList.contains('piano-fall-canvas'):!canvas.classList.contains('piano-fall-canvas')));
   canvases.sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0));
   for(const canvas of canvases){
     const r=canvas.getBoundingClientRect();ctx.save();
     const scoreWindow=canvas.closest('.score-window');
     if(scoreWindow){const clip=scoreWindow.getBoundingClientRect();ctx.beginPath();ctx.rect((clip.left-base.left)*sx,(clip.top-base.top)*sy,clip.width*sx,clip.height*sy);ctx.clip();}
     ctx.drawImage(canvas,(r.left-base.left)*sx,(r.top-base.top)*sy,r.width*sx,r.height*sy);ctx.restore();
   }
 }
 function drawPhoto(ctx,image,stage){
   if(!image)return;const {width:w,height:h,effects}=stage.settings;
   const fit=effects.backgroundFit==='contain'?Math.min(w/image.width,h/image.height):Math.max(w/image.width,h/image.height);
   const dw=image.width*fit,dh=image.height*fit;
   const x=(w-dw)*(effects.backgroundPositionX/100),y=(h-dh)*(effects.backgroundPositionY/100);
   ctx.save();ctx.globalAlpha=effects.backgroundOpacity;ctx.drawImage(image,x,y,dw,dh);ctx.restore();
 }
 function drawAtmosphere(ctx,stage,t){
   const scene=stage.settings.scene,{width:w,height:h}=stage.settings;
   if(scene.minimalMode)return;
   const frame=root.ScoreStudio.frame(scene,t),color=frame.glow;
   const opacity=scene.template==='cinematic'?.32:scene.template==='illustrated'?.1:.035;
   ctx.save();ctx.globalAlpha=opacity;ctx.globalCompositeOperation='screen';
   for(const [x,y,r,alpha] of [[(25+Math.sin(t*.09)*17)*w/100,h*.18,w*.65,.21],[w*.85,h*.87,w*.55,.13]]){
     const gradient=ctx.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,color+Math.round(alpha*255).toString(16).padStart(2,'0'));gradient.addColorStop(1,color+'00');
     ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
   }
   ctx.restore();
 }
 function drawTitles(ctx,stage){
   const base=stage.viewport.getBoundingClientRect(),sx=stage.settings.width/base.width,sy=stage.settings.height/base.height;
   const titleBox=stage.viewport.querySelector('.studio-titles');if(!titleBox)return;
   for(const element of titleBox.children){if(!element.textContent)continue;
     const style=getComputedStyle(element),rect=element.getBoundingClientRect();
     ctx.save();ctx.globalAlpha=(Number(getComputedStyle(titleBox).opacity)||1)*(Number(style.opacity)||1);
     ctx.font=`${style.fontWeight} ${parseFloat(style.fontSize)}px ${style.fontFamily}`;ctx.fillStyle=style.color;
     ctx.textAlign='center';ctx.textBaseline='top';ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=stage.settings.effects.minimalMode?0:11*sy;
     ctx.fillText(element.textContent,(rect.left+rect.width/2-base.left)*sx,(rect.top-base.top)*sy,rect.width*sx);
     ctx.restore();
   }
 }
 async function drawScore(ctx,stage,css,cache,measure){
   if(!stage.settings.scoreVisible||stage.meta.has_score===false)return;
   const base=stage.viewport.getBoundingClientRect(),region=stage.scoreWindow.getBoundingClientRect();
   const sx=stage.settings.width/base.width,sy=stage.settings.height/base.height;
   ctx.save();ctx.beginPath();ctx.rect((region.left-base.left)*sx,(region.top-base.top)*sy,region.width*sx,region.height*sy);ctx.clip();
   ctx.globalAlpha=stage.settings.scoreRegion.panelOpacity;ctx.fillStyle=stage.settings.scoreRegion.panelColor;
   ctx.fillRect((region.left-base.left)*sx,(region.top-base.top)*sy,region.width*sx,region.height*sy);ctx.globalAlpha=1;
   const notation=stage.settings.scene.notationStyle;
   for(const svg of stage.scoreWindow.querySelectorAll('svg')){
     const rect=svg.getBoundingClientRect();if(rect.bottom<=region.top||rect.top>=region.bottom||rect.right<=region.left||rect.left>=region.right)continue;
     let image=cache.get(svg);
     if(!image||stage.settings.effects.drawScore){
       const decodeStarted=measure?performance.now():0;
       // Static engraving is cached; moving cursor and impact glow are drawn
       // separately from the live ScoreStage each frame.
       const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');copy.setAttribute('data-notation-style',notation);
       if(!stage.settings.effects.drawScore)copy.querySelectorAll('.score-glowing,.score-note-moving,.score-minimal-active').forEach(node=>{node.classList.remove('score-glowing','score-note-moving','score-minimal-active');node.style.removeProperty('translate');node.style.removeProperty('scale');node.style.removeProperty('--score-minimal-color');});
       const style=document.createElementNS('http://www.w3.org/2000/svg','style');
       style.textContent=css.replaceAll('.score-window[data-notation-style=', 'svg[data-notation-style=');copy.insertBefore(style,copy.firstChild);
       image=await imageFromSvg(new XMLSerializer().serializeToString(copy));cache.set(svg,image);
       if(measure){measure.svgDecodeMs+=performance.now()-decodeStarted;measure.svgDecodes++;}
     }
     ctx.drawImage(image,(rect.left-base.left)*sx,(rect.top-base.top)*sy,rect.width*sx,rect.height*sy);
   }
   const cursor=stage.follower?.playbackCursor;
   if(cursor&&!cursor.hidden){const r=cursor.getBoundingClientRect(),color=stage.settings.effects.cursor;
     ctx.save();ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=stage.settings.effects.minimalMode?0:8;ctx.globalAlpha=.8;
     ctx.fillRect((r.left-base.left)*sx,(r.top-base.top)*sy,Math.max(1,r.width*sx),r.height*sy);ctx.restore();}
   ctx.restore();
 }
 async function drawScene(ctx,stage,css,photo,t,cache,measure){
   const {width,height,effects}=stage.settings;
   const start=measure?performance.now():0;
   ctx.fillStyle=stage.follower?.bgLayer?.style.backgroundColor||effects.paper;ctx.fillRect(0,0,width,height);
   drawPhoto(ctx,photo,stage);drawAtmosphere(ctx,stage,t);
   if(measure)measure.backgroundMs=performance.now()-start;
   const pianoStart=measure?performance.now():0;
   drawLiveCanvases(ctx,stage,'piano');if(measure)measure.pianoMs=performance.now()-pianoStart;
   const scoreStart=measure?performance.now():0;
   await drawScore(ctx,stage,css,cache,measure);if(measure)measure.scoreMs=performance.now()-scoreStart;
   const effectsStart=measure?performance.now():0;
   if(!effects.minimalMode)drawLiveCanvases(ctx,stage,'effects');drawTitles(ctx,stage);
   if(measure){measure.effectsMs=performance.now()-effectsStart;measure.totalMs=performance.now()-start;}
 }
 async function createDiagnosticComposer(stage){
   const {width,height}=stage.settings,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
   const ctx=canvas.getContext('2d',{alpha:false}),cache=new WeakMap();
   if(!ctx)throw Error('Canvas 2D unavailable');
   const css=await fetch('/static/stage.css').then(response=>response.text());
   let photo=null;
   if(stage.settings.effects.backgroundUrl){const response=await fetch(stage.settings.effects.backgroundUrl);photo=await createImageBitmap(await response.blob());}
   return {canvas,async compose(time){const measure={svgDecodeMs:0,svgDecodes:0};await drawScene(ctx,stage,css,photo,time,cache,measure);return measure;},close(){photo?.close?.();}};
 }
 class Recorder{
   constructor(stage,{seconds=10,fps=30,audio=null,onProgress=()=>{},onFrame=()=>{}}={}){
     this.stage=stage;this.seconds=seconds;this.fps=fps;this.audio=audio;this.onProgress=onProgress;this.onFrame=onFrame;
     this.cancelled=false;this.finished=false;this.stream=null;this.media=null;this.raf=0;this.frameCount=0;this.droppedFrames=0;this.lastFrame=-1;this.stalls=0;this.maxFrameGapMs=0;this.lastPaintAt=0;this.hiddenSeconds=0;this.lastVisibilityAt=0;
     this.cancelSignal=new Promise(resolve=>{this.cancelWake=resolve;});
   }
   prepareAudio(){
     if(this.audio&&!this.audioReady)this.audioReady=audioGraph(this.audio).then(graph=>{
       if(this.cancelled){try{graph.source.disconnect(graph.destination);}catch(_){}graph.destination.stream.getTracks().forEach(track=>track.stop());}
       return graph;
     });
     return this.audioReady;
   }
   cancel(){if(this.finished||this.cancelled)return;this.cancelled=true;this.cancelWake();this.audio?.pause();cancelAnimationFrame(this.raf);if(this.media?.state==='recording')this.media.stop();}
   cleanup(){cancelAnimationFrame(this.raf);this.audio?.pause();if(this.graph){try{this.graph.source.disconnect(this.graph.destination);}catch(_){}this.graph.destination.stream.getTracks().forEach(track=>track.stop());this.graph=null;}this.stream?.getTracks().forEach(track=>track.stop());this.stream=null;}
   async start(){
     const mimeType=supportedType(Boolean(this.audio));if(!mimeType)throw Error('이 브라우저는 오디오가 포함된 WebM MediaRecorder를 지원하지 않습니다.');
     const stage=this.stage,{width,height}=stage.settings;
     const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
     const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('녹화 Canvas를 만들 수 없습니다.');
     const renderCanvas=document.createElement('canvas');renderCanvas.width=width;renderCanvas.height=height;
     const renderCtx=renderCanvas.getContext('2d',{alpha:false});if(!renderCtx)throw Error('합성 Canvas를 만들 수 없습니다.');
     const scoreCache=new WeakMap();
     const css=await fetch('/static/stage.css').then(r=>{if(!r.ok)throw Error('악보 스타일을 읽지 못했습니다.');return r.text();});
     let photo=null;const background=stage.settings.effects.backgroundUrl;
     if(background){const response=await fetch(background);if(!response.ok)throw Error('배경 이미지를 읽지 못했습니다.');photo=await createImageBitmap(await response.blob());}
     if(this.cancelled){photo?.close?.();throw Error('녹화가 취소되었습니다.');}
     const bitrate=Math.min(20_000_000,Math.max(5_000_000,width*height*this.fps*.18));
     if(navigator.storage?.estimate){try{const {quota,usage}=await navigator.storage.estimate();const free=quota-usage,needed=this.seconds*(bitrate+256_000)/8*1.1+16*1024*1024;if(Number.isFinite(free)&&free<needed)throw Error(`WebM 저장 공간이 부족할 수 있습니다. 예상 필요 공간 ${Math.ceil(needed/1048576)}MB, 사용 가능 약 ${Math.floor(free/1048576)}MB.`);}catch(error){if(error.message?.startsWith('WebM 저장 공간'))throw error;}}
     const store=await chunkStore(error=>{this.error=error;this.cancel();});this.store=store;
     stage.seek(0);this.onFrame(0);
     if(this.audio){
       this.audio.pause();this.audio.currentTime=0;
       try{this.graph=await Promise.race([this.audioReady||this.prepareAudio(),this.cancelSignal.then(()=>{throw Error('녹화가 취소되었습니다.');})]);}
       catch(error){photo?.close?.();await store.discard();throw error;}
     }
     let media;
     try{
       const video=canvas.captureStream(this.fps);
       this.stream=this.audio?new MediaStream([...video.getVideoTracks(),...this.graph.destination.stream.getAudioTracks()]):video;
       media=this.media=new MediaRecorder(this.stream,{mimeType,videoBitsPerSecond:bitrate});
     }catch(error){photo?.close?.();this.cleanup();await store.discard();throw error;}
     const finished=new Promise((resolve,reject)=>{
       media.ondataavailable=event=>{if(!this.cancelled&&event.data.size)try{store.append(event.data);}catch(error){this.error=error;this.cancel();}};
       media.addEventListener('error',event=>reject(event.error||Error('WebM 인코딩 오류')),{once:true});
       media.onstop=()=>resolve(!this.cancelled);
     });
     let processing=false,startTime=0,succeeded=false;
     const paint=async now=>{
       if(this.finished||this.cancelled)return;
       if(this.lastPaintAt){const gap=now-this.lastPaintAt;this.maxFrameGapMs=Math.max(this.maxFrameGapMs,gap);if(gap>250)this.stalls++;if(document.visibilityState==='hidden')this.hiddenSeconds+=gap/1000;}
       this.lastPaintAt=now;
       const playback=this.audio?Number(this.audio.currentTime)||0:(now-startTime)/1000;
       const elapsed=Math.min(this.seconds,playback),index=Math.min(Math.ceil(this.seconds*this.fps)-1,Math.floor(elapsed*this.fps));
       const visualTime=Math.min(this.seconds,elapsed+(this.audio?VISUAL_LEAD_SECONDS:0));
       if(index>this.lastFrame&&!processing){
         processing=true;
         try{
           this.droppedFrames+=Math.max(0,index-this.lastFrame-1);this.lastFrame=index;
           stage.seek(visualTime);this.onFrame(elapsed);
           if(!this.cancelled){await drawScene(renderCtx,stage,css,photo,visualTime,scoreCache);if(!this.cancelled){ctx.drawImage(renderCanvas,0,0);this.frameCount++;}}
         }catch(error){this.error=error;this.cancel();}
         processing=false;
       }
       if(this.cancelled||this.finished)return;
       this.onProgress({elapsed,total:this.seconds,progress:Math.min(100,Math.round(elapsed/this.seconds*100)),frames:this.frameCount,dropped:this.droppedFrames,stalls:this.stalls,hiddenSeconds:this.hiddenSeconds,maxFrameGapMs:this.maxFrameGapMs});
       if(elapsed>=this.seconds||this.audio?.ended){
         if(!processing&&media.state==='recording'){
           this.audio?.pause();stage.seek(this.seconds);this.onFrame(this.seconds);
           try{await drawScene(renderCtx,stage,css,photo,this.seconds,scoreCache);if(!this.cancelled)ctx.drawImage(renderCanvas,0,0);}
           catch(error){this.error=error;this.cancel();return;}
           if(this.cancelled)return;
           setTimeout(()=>{if(media.state==='recording')media.stop();},220);
         }else this.raf=requestAnimationFrame(paint);
       }
       else this.raf=requestAnimationFrame(paint);
     };
     try{
       // First frame is painted before recording to avoid a blank lead-in.
       await drawScene(renderCtx,stage,css,photo,0,scoreCache);ctx.drawImage(renderCanvas,0,0);
       if(this.cancelled)return null;
       media.start(1000);
       if(media.state!=='recording')throw Error('WebM 녹화가 시작되지 않았습니다.');
       if(this.cancelled)return null;
       if(this.audio)await this.audio.play();
       startTime=performance.now();this.raf=requestAnimationFrame(paint);
       const completed=await finished;
       if(this.error)throw this.error;
       if(!completed||this.cancelled)return null;
       if(this.frameCount<2||this.audio&&this.audio.currentTime<this.seconds-.5)throw Error('녹화 화면 또는 오디오가 끝까지 기록되지 않았습니다. 불완전한 파일은 다운로드하지 않습니다.');
       const blob=await store.finish(mimeType);
       if(this.cancelled)return null;
       if(blob.size<1024)throw Error('브라우저가 유효한 WebM 데이터를 생성하지 못했습니다.');
       succeeded=true;this.finished=true;
       return {blob,mimeType,elapsed:(performance.now()-startTime)/1000,frames:this.frameCount,dropped:this.droppedFrames,stalls:this.stalls,hiddenSeconds:this.hiddenSeconds,maxFrameGapMs:this.maxFrameGapMs,width,height,storage:store.kind,release:()=>store.release()};
     }finally{this.finished=true;if(media.state==='recording')media.stop();photo?.close?.();this.cleanup();if(!succeeded)await store.discard();}
   }
 }
 root.ScoreWebmRecorder={Recorder,supportedType,createDiagnosticComposer};
})(window);
