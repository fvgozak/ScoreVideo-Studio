/* GPU scene compositor selected from the integrated patch; existing stage remains authoritative. */
(function(root){
 'use strict';
 const MODULE='/static/vendor/pixi-8.23.0.min.mjs';
 const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 async function svgImage(xml){
   const blob=new Blob([xml],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
   try{const image=new Image();image.src=url;await image.decode();return image;}
   finally{URL.revokeObjectURL(url);}
 }
 // Cache tiles are aligned in score-image pixels, not viewport pixels. A
 // scrolling camera therefore reuses identical decoded SVG snapshots.
 const TILE_PX=1024;
 const MAX_TILE_BYTES=128*1024*1024;
 // A dynamic piano canvas spans the whole stage; CSS transforms must not
 // redefine its destination box for the deterministic MP4 compositor.
 const pianoLayerBox=(canvas,viewport,width,height,measured)=>
   canvas.classList.contains('piano-dynamic-canvas')&&canvas.parentElement===viewport
     ?{x:0,y:0,width,height}:measured;
 const tileRange=(full,visible,sx,sy,tileSize=TILE_PX)=>{
   if(!(full.width>0&&full.height>0&&sx>0&&sy>0))return [];
   const pxWidth=full.width*sx,pxHeight=full.height*sy;
   const a=Math.max(0,(visible.left-full.left)*sx),b=Math.max(0,(visible.top-full.top)*sy);
   const right=Math.min(pxWidth,(visible.right-full.left)*sx);
   const bottom=Math.min(pxHeight,(visible.bottom-full.top)*sy);
   if(!(right>a&&bottom>b))return [];
   const tiles=[];
   const xStart=Math.floor(a/tileSize),xEnd=Math.ceil(right/tileSize);
   const yStart=Math.floor(b/tileSize),yEnd=Math.ceil(bottom/tileSize);
   for(let iy=yStart;iy<yEnd;iy++)for(let ix=xStart;ix<xEnd;ix++){
     const x0=ix*tileSize,y0=iy*tileSize;
     const x1=Math.min(pxWidth,x0+tileSize),y1=Math.min(pxHeight,y0+tileSize);
     const width=x1-x0,height=y1-y0;
     if(width<=0||height<=0)continue;
     tiles.push({ix,iy,x0,y0,width,height,
       visible:{left:full.left+x0/sx,top:full.top+y0/sy,
         right:full.left+x1/sx,bottom:full.top+y1/sy,
         width:width/sx,height:height/sy}});
   }
   return tiles;
 };
 class GPUComposer{
   constructor(app,PIXI,stage){
     this.PIXI=PIXI;this.app=app;this.stage=stage;this.gpu=true;
     this.canvas=app.canvas;this.canvas.className='score-gpu-compositor';
     this.root=new PIXI.Container();app.stage.addChild(this.root);
     this.background=new PIXI.Graphics(),this.panel=new PIXI.Graphics(),this.cursor=new PIXI.Graphics();
     this.scoreMask=new PIXI.Graphics(),this.scoreGroup=new PIXI.Container();this.scoreGroup.mask=this.scoreMask;
     // The entire engraving is decoded once. Staff lines are the base layer;
     // a screen-space union mask reveals previously hidden notation symbols.
     this.drawMask=new PIXI.Graphics();this.drawOverlayGroup=new PIXI.Container();
     this.drawOverlayGroup.mask=this.drawMask;
     this.root.addChild(this.background);
     // Export-owned sprites must be enumerable at teardown: a WeakMap cannot be
     // walked, and removeChildren() detaches sprites without destroying them.
     this.spriteCache=new Map();this.ownedSources=new Set();
     this.svgCache=new WeakMap();this.headCache=new WeakMap();
     this.canvasMirrors=new WeakMap();
     this.tileCache=new Map();this.tileBytes=0;this.smallSvgBytes=0;this.maxTileBytes=MAX_TILE_BYTES;
     this.svgIds=new WeakMap();this.nextSvgId=0;this.frameNumber=0;
     this.retiredImages=[];this.smallSvgEntries=new Set();
     this.titleCache=new Map();this.photo=null;this.photoKey='';
     this.placed=[];this.isClosed=false;
     const lifetime=root.__scoreMotionExportGpuStats ||= {created:0,closed:0,active:0,lastClosed:null};
     lifetime.created++;lifetime.active++;
   }
   static async create(stage,width,height){
     const PIXI=await import(MODULE),app=new PIXI.Application();
     await app.init({width,height,resolution:1,autoStart:false,backgroundAlpha:1,
       preserveDrawingBuffer:true,preference:'webgl',powerPreference:'high-performance'});
     app.ticker.stop();return new GPUComposer(app,PIXI,stage);
   }
   rectOf(el,base,sx,sy){const r=el.getBoundingClientRect();return {
     x:(r.left-base.left)*sx,y:(r.top-base.top)*sy,width:r.width*sx,height:r.height*sy,
     raw:r};}
   tint(value){
     if(/^#[\da-f]{6}$/i.test(value||''))return parseInt(value.slice(1),16);
     const match=String(value||'').match(/rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
     if(match)return (Math.min(255,+match[1])<<16)|(Math.min(255,+match[2])<<8)|Math.min(255,+match[3]);
     return 0xffffff;
   }
   ensureSprite(source){
     let sprite=this.spriteCache.get(source);
     if(!sprite){sprite=new this.PIXI.Sprite(this.PIXI.Texture.from(source));this.spriteCache.set(source,sprite);}
     else if(source instanceof HTMLCanvasElement) sprite.texture.source.update();
     return sprite;
   }
   mirrorCanvas(source){
     let entry=this.canvasMirrors.get(source);
     if(!entry||entry.canvas.width!==source.width||entry.canvas.height!==source.height){
       const canvas=document.createElement('canvas');
       canvas.width=source.width;canvas.height=source.height;
       entry={canvas,context:canvas.getContext('2d',{alpha:true,desynchronized:true})};
       this.ownedSources.add(canvas);
       this.canvasMirrors.set(source,entry);
     }
     entry.context.setTransform(1,0,0,1,0,0);
     entry.context.globalCompositeOperation='copy';
     entry.context.drawImage(source,0,0,source.width,source.height);
     entry.context.globalCompositeOperation='source-over';
     return entry.canvas;
   }
   place(source,box,group=this.root,alpha=1){
     const sprite=this.ensureSprite(source);
     sprite.x=box.x;sprite.y=box.y;sprite.width=Math.max(0,box.width);sprite.height=Math.max(0,box.height);
     sprite.alpha=alpha;group.addChild(sprite);this.placed.push(sprite);
   }
   async getPhoto(url){
     if(!url)return null;
     if(url!==this.photoKey){
       const response=await fetch(url);if(!response.ok)throw Error(`Background image HTTP ${response.status}`);
       const image=await createImageBitmap(await response.blob());
       if(this.photo){
         // A background can change while composing; destroy its texture before
         // closing the bitmap so no GPU reference to the old bitmap remains.
         const oldSprite=this.spriteCache.get(this.photo);
         if(oldSprite){oldSprite.destroy({texture:true,textureSource:true});this.spriteCache.delete(this.photo);}
         this.ownedSources.delete(this.photo);this.photo.close?.();
       }
       this.photo=image;this.ownedSources.add(image);this.photoKey=url;
     }
     return this.photo;
   }
   svgIdentity(svg){
     let id=this.svgIds.get(svg);
     if(!id){id=++this.nextSvgId;this.svgIds.set(svg,id);}
     return id;
   }
   svgSignature(svg,stage){
     const s=stage.settings,e=s.effects,p=e.minimalPalette;
     return [s.scene.notationStyle,e.minimalMode,p?.note,e.accent,e.ink,e.paper,e.staff,
       e.inverted,e.drawScore,svg.getAttribute('viewBox'),svg.getAttribute('width'),
       svg.getAttribute('height')].join('|');
   }
   // Retire textures only after the old sprites have been removed from the
   // previous frame. LRU eviction never touches tiles used in this frame.
   retireRaster(image){if(image)this.retiredImages.push(image);}
   disposeRaster(image){
     const sprite=this.spriteCache.get(image);
     if(sprite){sprite.destroy({texture:true,textureSource:true});this.spriteCache.delete(image);}
     this.ownedSources.delete(image);
     image.close?.();
   }
   pruneTiles(){
     let excess=this.tileBytes+this.smallSvgBytes-this.maxTileBytes;
     if(excess<=0)return;
     const candidates=[
       ...[...this.tileCache.entries()].filter(([,e])=>e.usedFrame!==this.frameNumber)
         .map(([key,e])=>({key,entry:e,kind:'tile'})),
       ...[...this.smallSvgEntries].filter(e=>e.usedFrame!==this.frameNumber)
         .map(e=>({entry:e,kind:'small'}))
     ].sort((a,b)=>a.entry.usedFrame-b.entry.usedFrame);
     for(const {key,entry,kind} of candidates){
       if(excess<=0)break;
       if(kind==='tile'){
         this.tileCache.delete(key);this.tileBytes-=entry.bytes;
       }else{
         this.smallSvgEntries.delete(entry);this.svgCache.delete(entry.svg);
         this.smallSvgBytes-=entry.bytes;
       }
       excess-=entry.bytes;this.disposeRaster(entry.image);
     }
   }
   // Only a changed engraving reveal invalidates its raster. Glowing and
   // moving noteheads are drawn in a separate dynamic layer in compose().
   async getSvg(svg,stage,css,crop=null,logicalKey='',rasterVariant='live'){
     const signature=this.svgSignature(svg,stage);
     // A reveal changes only when a glyph's visibility changes; animated
     // glows/motion are rendered as separate notehead overlays. Including
     // frameNumber here previously decoded an entire SVG every output frame.
     // If a stage has no revision provider, preserve the conservative fallback.
     const revision=rasterVariant==='live'&&stage.settings.effects.drawScore
       ?(stage.follower?.drawRevision??this.frameNumber):0;
     const key=crop||rasterVariant!=='live'
       ?`${this.svgIdentity(svg)}:${rasterVariant}:${logicalKey||'whole'}`:null;
     const cached=key?this.tileCache.get(key):this.svgCache.get(svg);
     if(cached&&cached.signature===signature&&cached.revision===revision){
       cached.usedFrame=this.frameNumber;
       this.cacheHits++;return cached.image;
     }
     const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
     if(crop){
       const view=svg.viewBox?.baseVal;
       const x=view?.width?view.x:0,y=view?.height?view.y:0;
       const width=view?.width||Number(svg.getAttribute('width'))||crop.full.width;
       const height=view?.height||Number(svg.getAttribute('height'))||crop.full.height;
       const left=x+(crop.visible.left-crop.full.left)/crop.full.width*width;
       const top=y+(crop.visible.top-crop.full.top)/crop.full.height*height;
       const sliceWidth=crop.visible.width/crop.full.width*width;
       const sliceHeight=crop.visible.height/crop.full.height*height;
       copy.setAttribute('viewBox',`${left} ${top} ${sliceWidth} ${sliceHeight}`);
       copy.setAttribute('width',String(crop.width));copy.setAttribute('height',String(crop.height));
       copy.setAttribute('preserveAspectRatio','none');
     }
     copy.setAttribute('data-notation-style',stage.settings.scene.notationStyle);
     if(rasterVariant!=='live'){
       // Fully partition engravings: staff-only base and notation-only overlay.
       // Tagging just some glyphs used to leak beams/slurs/next-page symbols
       // into the base; leaving the staff in the overlay doubled its opacity.
       // Skip <defs> primitives so <use> references remain resolvable.
       for(const el of copy.querySelectorAll('path,line,polyline,polygon,rect,circle,ellipse,text,use')){
         if(el.closest('defs,clipPath,mask,marker,pattern,symbol,filter'))continue;
         el.style.removeProperty('clip-path');
         el.style.removeProperty('-webkit-clip-path');
         const isStaff=el.hasAttribute('data-score-staff-line');
         if((rasterVariant==='staff')!==isStaff)el.style.setProperty('visibility','hidden');
       }
     }
     // Drop transient glow/motion styles in *both* score modes. They change
     // every playback frame and are reconstructed by the dynamic head layer.
     // Preserve the draw-reveal clipPath styles on glyphs: those remain tied
     // to follower.drawRevision, not to arbitrary playback frames.
     copy.querySelectorAll('.score-glowing,.score-note-moving,.score-minimal-active').forEach(node=>{
       node.classList.remove('score-glowing','score-note-moving','score-minimal-active');
       node.style.removeProperty('translate');node.style.removeProperty('scale');
       node.style.removeProperty('--score-minimal-color');
     });
     if(stage.settings.effects.minimalMode)copy.style.setProperty('--minimal-note-base',
       (stage.settings.effects.inverted?stage.settings.effects.paper:stage.settings.effects.ink));
     const style=document.createElementNS('http://www.w3.org/2000/svg','style');
     style.textContent=css.replaceAll('.score-window[data-notation-style=', 'svg[data-notation-style=')
       .replaceAll('.score-minimal-stage',stage.settings.effects.minimalMode?'svg':'.score-minimal-stage');
     copy.insertBefore(style,copy.firstChild);
     const image=await svgImage(new XMLSerializer().serializeToString(copy));
     this.ownedSources.add(image);
     this.cacheMisses++;
     const entry={image,signature,revision,usedFrame:this.frameNumber,svg,
       bytes:crop?Math.ceil(crop.width)*Math.ceil(crop.height)*4:
         Math.max(1,image.naturalWidth||image.width)*Math.max(1,image.naturalHeight||image.height)*4};
     if(key){
       if(cached){this.tileBytes-=cached.bytes;this.retireRaster(cached.image);}
       this.tileCache.set(key,entry);this.tileBytes+=entry.bytes;
     }else{
       if(cached){this.smallSvgBytes-=cached.bytes;this.smallSvgEntries.delete(cached);this.retireRaster(cached.image);}
       this.svgCache.set(svg,entry);this.smallSvgEntries.add(entry);this.smallSvgBytes+=entry.bytes;
     }
     return image;
   }
   async getHead(head,color){
     let palette=this.headCache.get(head);
     if(!palette){palette=new Map();this.headCache.set(head,palette);}
     if(palette.has(color))return palette.get(color);
     let box;
     try{box=head.getBBox();}catch(_){return null;}
     if(!box?.width||!box?.height)return null;
     const copy=head.cloneNode(true);
     const paths=copy.matches?.('path')?[copy]:[...copy.querySelectorAll('path')];
     for(const path of paths){
       if(path.getAttribute('fill')!=='none')path.setAttribute('fill',color);
       path.setAttribute('stroke',path.getAttribute('stroke')==='none'?'none':color);
     }
     const pad=2;
     const xml=`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(box.width+2*pad)}" height="${Math.ceil(box.height+2*pad)}" viewBox="${box.x-pad} ${box.y-pad} ${box.width+pad*2} ${box.height+pad*2}">${new XMLSerializer().serializeToString(copy)}</svg>`;
     const image=await svgImage(xml);
     this.ownedSources.add(image);
     palette.set(color,image);return image;
   }
   async getTitle(text,style,width,height){
     const key=[text,style.color,style.fontSize,style.fontFamily,style.fontWeight,Math.ceil(width),Math.ceil(height)].join('|');
     if(this.titleCache.has(key))return this.titleCache.get(key);
     const w=Math.max(1,Math.ceil(width)),h=Math.max(1,Math.ceil(height));
     const fontSize=Math.max(1,parseFloat(style.fontSize)||18);
     const xml=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><text x="${w/2}" y="${Math.min(h,Math.ceil(fontSize*1.12))}" text-anchor="middle" fill="${esc(style.color)}" font-size="${fontSize}" font-weight="${esc(style.fontWeight)}" font-family="${esc(style.fontFamily)}">${esc(text)}</text></svg>`;
     const image=await svgImage(xml);this.ownedSources.add(image);this.titleCache.set(key,image);
     return image;
   }
   async compose(time){
     const stage=this.stage,settings=stage.settings,w=settings.width,h=settings.height;
     const t0=performance.now(),metrics={backgroundMs:0,pianoMs:0,scoreMs:0,effectsMs:0,svgDecodeMs:0,svgDecodes:0,
       tileCacheHits:0,tileCacheBytes:0,visibleTiles:0};
     this.frameNumber++;this.cacheHits=0;this.cacheMisses=0;
     if(this.app.renderer.width!==w||this.app.renderer.height!==h)this.app.renderer.resize(w,h);
     this.root.removeChildren();this.scoreGroup.removeChildren();this.drawOverlayGroup.removeChildren();
     this.drawMask.clear();this.placed.length=0;
     const base=stage.viewport.getBoundingClientRect(),sx=w/Math.max(1,base.width),sy=h/Math.max(1,base.height);
     const bg=stage.follower?.bgLayer?.style.backgroundColor||settings.effects.paper;
     this.background.clear().rect(0,0,w,h).fill(this.tint(bg));
     this.root.addChild(this.background);
     const photo=await this.getPhoto(settings.effects.backgroundUrl);
     if(photo){const fit=settings.effects.backgroundFit==='contain'?Math.min(w/photo.width,h/photo.height):Math.max(w/photo.width,h/photo.height),
       dw=photo.width*fit,dh=photo.height*fit;
       this.place(photo,{x:(w-dw)*settings.effects.backgroundPositionX/100,
         y:(h-dh)*settings.effects.backgroundPositionY/100,width:dw,height:dh},this.root,settings.effects.backgroundOpacity);
     }
     metrics.backgroundMs=performance.now()-t0;
     const pianoStart=performance.now();
     const visibleCanvas=kind=>[...stage.viewport.querySelectorAll('canvas')].filter(canvas=>
       canvas.width&&canvas.height&&getComputedStyle(canvas).display!=='none'&&kind(canvas));
     const addCanvas=(canvas,group=this.root)=>this.place(canvas,this.rectOf(canvas,base,sx,sy),group);
     const piano=visibleCanvas(c=>/piano-fall-canvas|piano-three-canvas|piano-dynamic-canvas|score-pixi-piano/.test(c.className));
     piano.sort((a,b)=>(parseInt(getComputedStyle(a).zIndex)||0)-(parseInt(getComputedStyle(b).zIndex)||0));
     const dynamic=stage.piano?.dynamic?.canvas;
     if(dynamic&&stage.piano?.settings?.enabled!==false&&!settings.effects.minimalMode&&!piano.includes(dynamic)){
       throw Error('Keyboard Dynamic FX canvas is hidden or missing. Export stopped before encoding an incomplete video.');
     }
     // Dynamic FX is defined in the *full video stage* coordinate system. A
     // DOMRect reflects preview transforms and may not match its WebGL drawing
     // buffer while exporting. Do not crop/offset the output by that DOMRect.
     // The older Three.js keyboard is a bottom-anchored subcanvas and must
     // retain its existing measured rectangle.
     for(const canvas of piano){
       const fullStage=canvas.classList.contains('piano-dynamic-canvas')&&canvas.parentElement===stage.viewport;
       if(fullStage){
         if(canvas.width!==w||canvas.height!==h){
           throw Error(`Keyboard WebGL size mismatch: ${canvas.width}×${canvas.height} versus export ${w}×${h}. Check stage preview geometry before MP4 export.`);
         }
         // Mirror the dynamic WebGL keyboard onto a 2D canvas before it is
         // sampled by the compositor. This avoids cross-WebGL texture upload
         // regressions observed in some 720p exports while preserving the
         // exact stage-space pixels for the encoder.
         const mirrored=this.mirrorCanvas(canvas);
         this.place(mirrored,pianoLayerBox(canvas,stage.viewport,w,h,null));
       }else this.place(canvas,pianoLayerBox(canvas,stage.viewport,w,h,this.rectOf(canvas,base,sx,sy)));
     }
     // Exposed live in the progress record, so a faulty export can be
     // diagnosed immediately without finishing a multi-minute video.
     if(this.frameNumber===1){
       metrics.pianoLayerInfo=piano.map(canvas=>({type:canvas.className,
         canvas:[canvas.width,canvas.height],client:[canvas.clientWidth,canvas.clientHeight],
         rect:(()=>{const r=this.rectOf(canvas,base,sx,sy);return [r.x,r.y,r.width,r.height].map(v=>Math.round(v*100)/100);})(),
         fullStage:canvas.classList.contains('piano-dynamic-canvas')&&canvas.parentElement===stage.viewport}));
       const camera=stage.piano?.dynamic?.renderer?.lastCamera;
       if(camera)metrics.keyboardCamera={strikeY:camera.strikeScreenY,frontY:camera.frontScreenY,
         visibleWidth:camera.visibleWidth,focusX:camera.focusX};
     }
     metrics.pianoMs=performance.now()-pianoStart;
     const scoreStart=performance.now();
     if(settings.scoreVisible&&stage.meta.has_score!==false){
       const region=this.rectOf(stage.scoreWindow,base,sx,sy),crop=settings.scoreRegion.cropTopPercent/100;
       this.scoreMask.clear().rect(region.x,region.y+region.height*crop,region.width,region.height*(1-crop)).fill(0xffffff);
       this.scoreGroup.mask=this.scoreMask;
       this.panel.clear().rect(region.x,region.y,region.width,region.height)
         .fill({color:this.tint(settings.scoreRegion.panelColor),alpha:settings.scoreRegion.panelOpacity});
       this.scoreGroup.addChild(this.panel);
       const drawEnabled=Boolean(settings.effects.drawScore&&stage.follower?.drawSystems?.length);
       for(const svg of stage.scoreWindow.querySelectorAll('svg')){
         const r=svg.getBoundingClientRect(),regionRect=stage.scoreWindow.getBoundingClientRect();
         if(r.bottom<=regionRect.top||r.top>=regionRect.bottom||r.right<=regionRect.left||r.left>=regionRect.right)continue;
         const gl=this.app.renderer.gl,maxTexture=gl?.getParameter(gl.MAX_TEXTURE_SIZE)||8192;
         const width=Number(svg.getAttribute('width'))||r.width,height=Number(svg.getAttribute('height'))||r.height;
         const fullPxWidth=r.width*sx,fullPxHeight=r.height*sy;
         const oversized=width>maxTexture||height>maxTexture||fullPxWidth>maxTexture||fullPxHeight>maxTexture;
         const isDrawMask=drawEnabled;
         const raster=async(crop,logicalKey,box)=>{
           const draw=async(variant,group)=>{
             const before=performance.now(),misses=this.cacheMisses;
             const image=await this.getSvg(svg,stage,this.css,crop,logicalKey,variant);
             if(this.cacheMisses>misses){metrics.svgDecodes++;metrics.svgDecodeMs+=performance.now()-before;}
             this.place(image,box,group);
           };
           if(isDrawMask){
             // Neither raster depends on drawRevision. Only the inexpensive
             // GPU rectangle mask moves as new music symbols are revealed.
             await draw('staff',this.scoreGroup);
             await draw('full',this.drawOverlayGroup);
           }else await draw('live',this.scoreGroup);
         };
         if(oversized){
           const visible={left:Math.max(r.left,regionRect.left),top:Math.max(r.top,regionRect.top),
             right:Math.min(r.right,regionRect.right),bottom:Math.min(r.bottom,regionRect.bottom)};
           const tiles=tileRange(r,visible,sx,sy,Math.min(TILE_PX,maxTexture));
           metrics.visibleTiles+=tiles.length;
           for(const tile of tiles){
             const crop={full:r,visible:tile.visible,width:Math.ceil(tile.width),height:Math.ceil(tile.height)};
             const box={x:(tile.visible.left-base.left)*sx,y:(tile.visible.top-base.top)*sy,
               width:tile.width,height:tile.height};
             await raster(crop,`${tile.ix}:${tile.iy}:${tile.width.toFixed(2)}:${tile.height.toFixed(2)}:${fullPxWidth.toFixed(2)}:${fullPxHeight.toFixed(2)}`,box);
           }
         }else await raster(null,'whole',this.rectOf(svg,base,sx,sy));
       }
       if(drawEnabled&&this.drawOverlayGroup.children.length){
         // Staff lines remain visible all the time. The symbol layer is
         // revealed up to the live score cursor position for the active row,
         // and fully for completed rows. This avoids notes/slurs/beams
         // appearing ahead of the cursor when a glyph bbox is wider than its
         // attack-time point.
         const rect=stage.scoreWindow.getBoundingClientRect();
         const containerRect=stage.follower.container.getBoundingClientRect();
         const viewportScale=base.width/Math.max(1,stage.viewport.clientWidth);
         const rows=[...stage.follower.drawSystems].sort((a,b)=>a.y-b.y);
         const center=row=>containerRect.top+row.y*viewportScale;
         const left=(rect.left-base.left)*sx;
         const fullRight=(rect.right-base.left)*sx;
         for(let i=0;i<rows.length;i++){
           const row=rows[i];
           const revealRight=Number.isFinite(row.revealRight)?row.revealRight:(row.minLeft??0)-1;
           const cutoff=containerRect.left+revealRight*viewportScale;
           const right=Math.min(fullRight,Math.max(left,(cutoff-base.left)*sx));
           const top=i===0?rect.top:(center(rows[i-1])+center(row))*.5;
           const bottom=i===rows.length-1?rect.bottom:(center(row)+center(rows[i+1]))*.5;
           const x0=left,x1=Math.max(left,right);
           const y0=(Math.max(rect.top,top)-base.top)*sy;
           const y1=(Math.min(rect.bottom,bottom)-base.top)*sy;
           if(x1>x0&&y1>y0)this.drawMask.rect(x0,y0,x1-x0,y1-y0).fill(0xffffff);
         }
         this.scoreGroup.addChild(this.drawOverlayGroup,this.drawMask);
       }
       const scoreEffects=visibleCanvas(c=>c.classList.contains('score-pixi-score'));
       for(const canvas of scoreEffects)addCanvas(canvas,this.scoreGroup);
       // True SVG notehead silhouettes, not bounding-box glow. These cached
       // glyph images replace the obsolete Canvas2D score-glow overlay.
       const seen=new Set();
       for(const item of stage.follower?.activeNodes||[]){
         const head=item.el;if(!head||seen.has(head))continue;seen.add(head);
         const glowing=head.classList.contains('score-glowing');
         const minimal=settings.effects.minimalMode&&head.classList.contains('score-minimal-active');
         const moving=item.motionEl?.classList?.contains('score-note-moving');
         if(!glowing&&!minimal&&!moving)continue;
         const style=getComputedStyle(head);
         const color=minimal?(style.getPropertyValue('--score-minimal-color').trim()||stage.follower.colors().accent):
           glowing?(style.getPropertyValue('--score-note-active').trim()||stage.follower.colors().glow):
             stage.follower.colors().ink;
         const image=await this.getHead(head,color);
         if(!image)continue;
         this.place(image,this.rectOf(head,base,sx,sy),this.scoreGroup);
       }
       const cursor=stage.follower?.playbackCursor;
       this.cursor.clear();
       if(cursor&&!cursor.hidden){const box=this.rectOf(cursor,base,sx,sy);
         this.cursor.rect(box.x,box.y,Math.max(1,box.width),box.height)
           .fill({color:this.tint(settings.effects.cursor),alpha:.8});
         this.scoreGroup.addChild(this.cursor);
       }
       this.root.addChild(this.scoreGroup,this.scoreMask);
     }
     metrics.scoreMs=performance.now()-scoreStart;
     const effectsStart=performance.now();
     const box=stage.viewport.querySelector('.studio-titles');
     if(box&&!box.hidden){const boxStyle=getComputedStyle(box);
       if(boxStyle.display!=='none'&&boxStyle.visibility!=='hidden')for(const title of box.children){
         if(!title.textContent||title.hidden)continue;
         const style=getComputedStyle(title),alpha=(Number(boxStyle.opacity)||0)*(Number(style.opacity)||0);
         if(alpha<=0||style.visibility==='hidden'||style.display==='none')continue;
         const rect=this.rectOf(title,base,sx,sy);
         const image=await this.getTitle(title.textContent,style,rect.width,rect.height);
         this.place(image,rect,this.root,alpha);
       }
     }
     this.app.render();
     if(this.frameNumber===1&&stage.piano?.dynamic?.renderer?.gl){
       // First-frame probe samples *both* WebGL drawing buffers. It separates
       // a blank source keyboard from a texture-transfer/compositor failure.
       // Read only 15 pixels once: never stall the GPU for a full-frame dump.
       const pixelSamples=(gl,width,height)=>{
         const old=gl.getParameter(gl.FRAMEBUFFER_BINDING),out=[];
         try{
           gl.bindFramebuffer(gl.FRAMEBUFFER,null);
           for(const y of [.80,.85,.90])for(const x of [.20,.35,.50,.65,.80]){
             const rgba=new Uint8Array(4);
             gl.readPixels(Math.max(0,Math.min(width-1,Math.round(x*width))),
               Math.max(0,Math.min(height-1,Math.round((1-y)*height))),
               1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
             out.push([...rgba]);
           }
         }finally{gl.bindFramebuffer(gl.FRAMEBUFFER,old);}
         return out;
       };
       try{
         const src=stage.piano.dynamic.renderer.gl;
         const srcCanvas=stage.piano.dynamic.canvas;
         metrics.keyboardPixelProbe={
           coordinates:'5 x positions [20%,35%,50%,65%,80%] and 3 y positions [80%,85%,90%] (top-origin)',
           sourceCanvas:[srcCanvas.width,srcCanvas.height],
           outputCanvas:[this.canvas.width,this.canvas.height],
           source:pixelSamples(src,srcCanvas.width,srcCanvas.height),
           output:pixelSamples(this.app.renderer.gl,w,h)
         };
       }catch(error){metrics.keyboardPixelProbe={error:String(error?.message||error)};}
     }
     for(const image of this.retiredImages)this.disposeRaster(image);
     this.retiredImages.length=0;
     this.pruneTiles();
     metrics.tileCacheHits=this.cacheHits;
     metrics.tileCacheBytes=this.tileBytes;
     metrics.svgCacheBytes=this.smallSvgBytes;
     metrics.rasterCacheBytes=this.tileBytes+this.smallSvgBytes;
     metrics.effectsMs=performance.now()-effectsStart;
     return metrics;
   }
   async prepare(){this.css=await fetch('/static/stage.css').then(r=>{if(!r.ok)throw Error('Score CSS missing');return r.text();});return this;}
   drawSimple(frame){
     this.root.removeChildren();this.background.clear().rect(0,0,this.app.renderer.width,this.app.renderer.height).fill(0x0c1420);
     const w=this.app.renderer.width,h=this.app.renderer.height;
     this.background.rect((frame*7)%w,h*.25,25,h*.45).fill(0x68dced);
     for(let i=0;i<88;i++)this.background.rect(i*w/88,h-110,w/88-1,110).fill(i%12===1?0x151d2b:0xe7edf2);
     this.root.addChild(this.background);this.app.render();
   }
   close(){
     if(this.isClosed)return;
     this.isClosed=true;
     const lifetime=root.__scoreMotionExportGpuStats;
     const cleanup={sprites:this.spriteCache.size,ownedSources:this.ownedSources.size,
       rasterEntries:this.tileCache.size+this.smallSvgEntries.size,
       rasterMiB:+((this.tileBytes+this.smallSvgBytes)/1048576).toFixed(2),
       startedAt:performance.now(),success:false};
     try{
       // removeChildren() during compose() leaves many reusable sprites detached.
       // Pixi's recursive app.destroy() cannot reach those detached objects.
       for(const entry of this.tileCache.values())this.disposeRaster(entry.image);
       this.tileCache.clear();this.tileBytes=0;
       for(const entry of this.smallSvgEntries)this.disposeRaster(entry.image);
       this.smallSvgEntries.clear();this.smallSvgBytes=0;
       for(const image of this.retiredImages)this.disposeRaster(image);
       this.retiredImages.length=0;
       for(const [source,sprite] of this.spriteCache){
         // Never destroy a TextureSource belonging to the live preview (piano
         // canvas, etc). Only private raster/bitmap/mirror sources are owned.
         if(!sprite.destroyed)sprite.destroy(this.ownedSources.has(source)
           ?{texture:true,textureSource:true}:undefined);
       }
       this.spriteCache.clear();
       for(const source of this.ownedSources){
         source.close?.();
         // Reset only private mirror canvases, not live stage canvases.
         if(typeof HTMLCanvasElement!=='undefined'&&source instanceof HTMLCanvasElement){
           source.width=0;source.height=0;
         }
       }
       this.ownedSources.clear();
       this.titleCache.clear();
       this.headCache=new WeakMap();this.svgCache=new WeakMap();this.canvasMirrors=new WeakMap();
       this.photo=null;this.photoKey='';this.placed.length=0;
       // Pixi v8: request explicit destruction of the *export-only* WebGL
       // context and GPU resources. The editor's WebGL contexts are separate.
       this.app.destroy(true,{children:true,texture:true,textureSource:true,context:true});
       cleanup.success=true;
     }finally{
       if(lifetime){
         lifetime.closed++;lifetime.active=Math.max(0,lifetime.active-1);
         lifetime.lastClosed={...cleanup,elapsedMs:+(performance.now()-cleanup.startedAt).toFixed(2)};
       }
     }
   }
 }
 async function createDiagnosticComposer(stage){
   const composer=await GPUComposer.create(stage,stage.settings.width,stage.settings.height);
   try{return await composer.prepare();}
   catch(error){composer.close();throw error;}
 }
 async function createSimpleComposer(width=1280,height=720){return GPUComposer.create(null,width,height);}

 root.ScoreGpuComposer={createDiagnosticComposer,createSimpleComposer,
   _test:{tileRange,TILE_PX,MAX_TILE_BYTES,pianoLayerBox,GPUComposer}};
})(window);
