/* ScoreMotion BIT V1.1: independent final-frame style, no audio changes. */
(function(root){
 'use strict';
 const DEFAULT={version:1,enabled:false,pixelSize:4};
 function normalize(v){const p=Number(v?.pixelSize);return {version:1,enabled:v?.version===1&&v.enabled===true,pixelSize:Number.isFinite(p)?Math.min(12,Math.max(2,Math.round(p))):4};}
 // Pixel size is measured against a 1080-pixel short edge, not CSS pixels.
 function grid(w,h,size){const block=Math.max(1,size*Math.min(w,h)/1080);return [Math.max(1,Math.round(w/block)),Math.max(1,Math.round(h/block))];}
 function canvasPass(source){
   const low=document.createElement('canvas'),out=document.createElement('canvas');
   const l=low.getContext('2d',{alpha:false}),o=out.getContext('2d',{alpha:false});
   if(!l||!o)throw Error('BIT canvas unavailable');
   return {canvas:out,backend:'canvas',draw(size){const w=source.width,h=source.height;
     if(!w||!h)throw Error('BIT source canvas is empty');
     const [gw,gh]=grid(w,h,size);
     if(out.width!==w||out.height!==h){out.width=w;out.height=h;}
     if(low.width!==gw||low.height!==gh){low.width=gw;low.height=gh;}
     l.imageSmoothingEnabled=false;l.drawImage(source,0,0,gw,gh);
     o.imageSmoothingEnabled=false;o.drawImage(low,0,0,w,h);
   },close(){low.width=low.height=out.width=out.height=0;}};
 }
 // V1.1: bypass the unverified Pixi WebGL filter. Keep the original
 // compositor (including WebGL) intact and pixelate only its finished canvas.
 // Reuse both buffers; no getImageData/readPixels or per-frame DOM capture.
 function createPass(c){return canvasPass(c.canvas);}
 // Export and BIT preview share this wrapper. Normal mode returns original composer.
 async function createComposer(stage,size){
   const c=await root.ScoreGpuComposer.createDiagnosticComposer(stage);
   let pass;try{pass=createPass(c);}catch(e){c.close();throw e;}
   let closed=false;
   // Encoder constructors inspect canvas dimensions before frame 0.
   if(pass.backend==='canvas'){pass.canvas.width=c.canvas.width;pass.canvas.height=c.canvas.height;}
   return {canvas:pass.canvas,backend:pass.backend,canvasMirrors:c.canvasMirrors,async compose(t,pixelSize=size){
     if(closed)throw Error('BIT composer closed');
     pass.before?.(stage.settings.width,stage.settings.height,pixelSize);
     const metrics=await c.compose(t),start=performance.now();
     if(c.app.renderer.gl?.isContextLost?.())throw Error('BIT source WebGL context lost');
     pass.draw?.(pixelSize);
     return {...metrics,bitPostMs:performance.now()-start,bitBackend:pass.backend};
   },close(){if(closed)return;closed=true;try{pass.close();}finally{c.close();}}};
 }
 let state={...DEFAULT},stage=null,composer=null,pending=null,raf=0,dirty=false,suspended=false,exportBusy=false,epoch=0,onChange=()=>{},transition=null;
 const $=id=>document.getElementById(id);
 function sync(){const b=$('bitToggle'),p=$('bitPixelSize'),label=$('bitPixelValue');if(!b||!p)return;
   b.setAttribute('aria-pressed',String(state.enabled));b.disabled=suspended||exportBusy||!stage;
   p.value=String(state.pixelSize);p.disabled=suspended||exportBusy||!stage||!state.enabled;p.parentElement.hidden=!state.enabled;
   if(label)label.textContent=state.pixelSize+' px';
 }
 function report(error){console.error('ScoreMotion BIT:',error);const el=$('bitStatus');if(el){el.hidden=false;el.textContent=root.ScoreI18n?.t('bit.error')||'BIT preview failed';}}
 function clearStatus(){const el=$('bitStatus');if(el)el.hidden=true;}
 function schedule(){if(!raf&&!pending&&!suspended&&!exportBusy&&stage&&(state.enabled||transition))raf=requestAnimationFrame(tick);}
 function closeComposer(){if(composer){const old=composer;composer=null;old.canvas.remove();old.close();}}
 async function stop(){epoch++;cancelAnimationFrame(raf);raf=0;transition=null;dirty=false;if(pending)await pending.catch(()=>{});closeComposer();}
 function tick(now){raf=0;if(suspended||exportBusy||!stage||(!state.enabled&&!transition))return;
   if(!dirty&&!transition)return;
   dirty=false;const current=stage,token=epoch,tr=transition;
   pending=(async()=>{
     if(!composer){const candidate=await createComposer(current,state.pixelSize);if(token!==epoch||current!==stage||suspended){candidate.close();return;}composer=candidate;}
     const progress=tr?Math.min(1,(now-tr.start)/350):1;
     const size=tr?Math.max(1,1+(state.pixelSize-1)*(tr.on?progress:1-progress)):state.pixelSize;
     await composer.compose(current.time||0,size);
     if(token!==epoch||current!==stage||suspended)return;
     const canvas=composer.canvas;canvas.classList.add('scoremotion-bit-preview');
     if(!canvas.isConnected)current.viewport.parentElement.appendChild(canvas);
     if(tr&&transition===tr&&progress>=1){transition=null;if(!state.enabled)closeComposer();}
   })().catch(error=>{if(token===epoch){transition=null;state={...state,enabled:false};closeComposer();sync();report(error);onChange();}}).finally(()=>{pending=null;if(dirty||transition)schedule();});
 }
 function mark(s){if(s===stage&&!suspended&&!exportBusy&&(state.enabled||transition)){dirty=true;schedule();}}
 function setEnabled(v){if(!stage||suspended||exportBusy)return;state={...state,enabled:!!v};clearStatus();transition={on:state.enabled,start:performance.now()};sync();mark(stage);onChange();}
 function restore(v){state=normalize(v);clearStatus();sync();if(!state.enabled)void stop();else mark(stage);}
 async function bindStage(s){stage=null;await stop();stage=s;sync();if(s&&state.enabled)mark(s);}
 async function setSuspended(v){suspended=!!v;sync();if(v)await stop();else mark(stage);}
 async function exportComposer(s){if(!state.enabled)return root.ScoreGpuComposer.createDiagnosticComposer(s);
   // The UI suspends BIT preview before export, including preparation/seek.
   // Snapshot pixel size; do not encode the UI's 350ms transition.
   const size=state.pixelSize;exportBusy=true;sync();
   const release=()=>{exportBusy=false;sync();mark(stage);};
   try{await stop();const c=await createComposer(s,size),close=c.close.bind(c);c.close=()=>{try{close();}finally{release();}};return c;}catch(error){release();throw error;}
 }
 function init(opts={}){onChange=opts.onChange||(()=>{});const b=$('bitToggle'),p=$('bitPixelSize');if(!b||!p)return;
   b.addEventListener('click',()=>setEnabled(!state.enabled));p.addEventListener('input',()=>{state=normalize({...state,pixelSize:p.value});sync();mark(stage);onChange();});sync();}
 root.ScoreMotionBit={init,mark,bindStage,setSuspended,restore,getState:()=>({...state}),exportComposer,waitIdle:()=>pending?.catch(()=>{})||Promise.resolve(),
   _test:{normalize,grid,canvasPass,createPass,createComposer}};
})(window);
