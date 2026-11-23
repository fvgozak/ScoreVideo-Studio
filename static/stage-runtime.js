/* Shared scene/runtime for the EDITOR and the MP4 EXPORT route. */
(function (root) {
 'use strict';
 const hex=(v,d)=>/^#[0-9a-f]{6}$/i.test(v||'')?v:d;
 const number=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function pianoOnlyFollower(meta,settings,viewport){
   const bg=document.createElement('div');bg.className='score-background';
   const photo=document.createElement('div');photo.className='score-photo';bg.appendChild(photo);
   viewport.prepend(bg);
   const velocities=(meta.note_events||[]).map(note=>Number(note.velocity)).filter(Number.isFinite);
   const range=velocities.reduce((result,velocity)=>({min:Math.min(result.min,velocity),max:Math.max(result.max,velocity)}),{min:127,max:1});
   return {
     stageRoot:viewport,viewport,container:null,bgLayer:bg,photoLayer:photo,
     noteEvents:meta.note_events||[],pedalEvents:meta.pedal_events||[],noteTriggers:[],tieContinuations:[],timestamps:[0,meta.audio_duration_sec||0],measureStarts:[],
     tempoMap:meta.tempo_map||[{beat:0,second:0,tempo_us:500000}],audioDuration:meta.audio_duration_sec,
     offsetSec:settings.offsetSec,sync:meta.sync,effects:{...settings.effects,velocityScale:settings.scene.velocityScale,lightColorPreset:settings.scene.lightColorPreset},scene:settings.scene,velocityRange:range,
     colors(){const e=this.effects;return {paper:e.inverted?e.ink:e.paper,ink:e.inverted?e.paper:e.ink,accent:e.accent,glow:e.glow};},
     eventLightColor(velocity,entry=null){return root.ScoreStudio.noteLightColor(this.scene,velocity,this.colors().accent,this.velocityRange,entry);},
     beatToSeconds(beat){const map=this.tempoMap;let lo=0,hi=map.length-1;
       while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(map[mid].beat<=beat)lo=mid;else hi=mid-1;}
       const p=map[lo];return p.second+(beat-p.beat)*p.tempo_us/1e6;},
     midiToAudio(second){const anchors=this.sync?.anchors;
       if(!Array.isArray(anchors)||anchors.length<2)return second+this.offsetSec;
       let lo=0,hi=anchors.length-1;
       while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(anchors[mid].midi<=second)lo=mid;else hi=mid-1;}
       const a=anchors[Math.min(lo,anchors.length-2)],b=anchors[Math.min(lo+1,anchors.length-1)];
       return a.audio+(b.audio-a.audio)*(second-a.midi)/Math.max(.000001,b.midi-a.midi)+this.offsetSec;},
     setEffects(effects){this.effects={...this.effects,...effects};const e=this.effects;
       viewport.classList.toggle('score-minimal-stage',Boolean(e.minimalMode));
       viewport.style.backgroundColor=this.colors().paper;bg.style.backgroundColor=this.colors().paper;
       const url=String(e.backgroundUrl||'');photo.style.backgroundImage=(url.startsWith('/api/projects/')||url.startsWith('blob:'))?'url('+JSON.stringify(url)+')':'none';
       photo.style.backgroundSize=e.backgroundFit==='contain'?'contain':'cover';
       photo.style.backgroundPosition=`${e.backgroundPositionX}% ${e.backgroundPositionY}%`;
       photo.style.opacity=String(e.backgroundOpacity);
       },
     setOffset(value){this.offsetSec=value;},setSync(value){this.sync=value;},setCameraPoints(){},setCameraPointPicking(){},seek(){},
   };
 }
 function normalized(raw={},meta={}) {
   const s=raw&&typeof raw==='object'?raw:{};
   const effect={
     paper:hex(s.paper_color,'#fffdf6'),ink:hex(s.ink_color,'#181b22'),
     staff:hex(s.staff_color,'#323a43'),glow:hex(s.glow_color,'#68ddfa'),
     cursor:hex(s.cursor_color,'#2ec9d3'),cursorVisible:s.cursor_visible!==false,cursorMotion:s.cursor_motion==='step'?'step':'smooth',accent:hex(s.accent_color,'#2ec9d3'),
     texture:'none',inverted:Boolean(s.inverted),
     backgroundUrl:meta.background_filename?(root.ScoreLocalProjects?.enabled?root.ScoreLocalProjects.assetUrl(meta.id,'background'):`/api/projects/${meta.id}/background?v=${encodeURIComponent(meta.background_version||meta.background_filename)}`): '',
     backgroundOpacity:clamp(number(s.background_opacity,.5),0,1),backgroundFit:s.background_fit||'cover',
     backgroundPositionX:clamp(number(s.background_position_x,50),0,100),backgroundPositionY:clamp(number(s.background_position_y,50),0,100),
     glitter:Boolean(s.glitter),sparkle:s.sparkle!==false,drawScore:Boolean(s.draw_score),minimalMode:Boolean(s.minimal_mode),
     staffColors:s.staff_colors&&typeof s.staff_colors==='object'?s.staff_colors:{enabled:false,keyboard:false,colors:{}},
     velocityReactive:s.velocity_reactive!==false,noteMotion:s.note_motion!==false,
     motionStrength:clamp(number(s.motion_strength,1),0,2),
     scorePositionX:clamp(number(s.score_position_x,38),0,100),scorePositionY:clamp(number(s.score_position_y,0),0,100),
   };
   effect.minimalPalette=root.ScoreStudio.minimalPalette(s.minimal_palette,{
     paper:effect.paper,ink:effect.ink,accent:effect.accent,glow:effect.glow,
     white:hex(s.piano_white_key_color,'#f1f1f5'),black:hex(s.piano_black_key_color,'#151821')});
   const gpuEffects=root.ScorePixiFx?.normalizeEffects(s.gpu_effects);
   const scene=root.ScoreStudio.normalize({...s.scene,minimalMode:Boolean(s.minimal_mode)});
   const layout=(s.layout_mode||s.scroll_mode||'page');
   const width=clamp(Math.round(number(s.width,1280)),200,8192);
   const height=clamp(Math.round(number(s.height,720)),200,8192);
   return {
     width,height,
     layoutScale:clamp(number(s.score_layout_scale,1),.5,4),
     zoom:clamp(number(s.zoom,.9),.5,2),offsetSec:number(s.offset_sec,0),scoreVisible:meta.has_score!==false&&s.score_visible!==false,
     layoutMode:['page','singleline','vertical','horizontal'].includes(layout)?layout:'page',
     scrollMode:(layout==='singleline'||layout==='horizontal')?'horizontal':'vertical',
     scoreRegion:{widthPercent:clamp(number(s.score_area_width,94),30,100),
       xPercent:clamp(number(s.score_area_x,50),0,100),
       heightPercent:clamp(number(s.score_area_height,s.piano_enabled===false?70:50),15,100),
       cropTopPercent:clamp(number(s.score_crop_top,0),0,50),
       marginTopPercent:clamp(number(s.score_margin_top,4),0,45),
       marginBottomPercent:clamp(number(s.score_margin_bottom,9),0,45),
       panelColor:hex(s.score_panel_color,'#0c1120'),panelOpacity:clamp(number(s.score_panel_opacity,0),0,1)},
     cameraPoints:(Array.isArray(s.camera_points)?s.camera_points:[]).slice(0,500).map(p=>({
       key:String(p?.key||'').slice(0,80),zoom:clamp(number(p?.zoom,1.3),1.05,1.6),
       duration:clamp(number(p?.duration,1.6),.4,5),shake:clamp(number(p?.shake,0),0,1),timing:clamp(number(p?.timing,-.6),-2,1.5)
     })).filter(p=>p.key),
     effects:effect,gpuEffects,scene,
     piano:{enabled:s.piano_enabled!==false,light:s.piano_light!==false,minimalMode:Boolean(s.minimal_mode),
       fxRenderer:['canvas','auto','pixi'].includes(s.fx_renderer)?s.fx_renderer:'canvas',
       gpuEffects,minimalPalette:effect.minimalPalette,
       lightingScene:scene,
       scoreLighting:{panelColor:hex(s.score_panel_color,'#0c1120'),
         panelOpacity:clamp(number(s.score_panel_opacity,0),0,1),scoreVisible:meta.has_score!==false&&s.score_visible!==false},
       camera:s.piano_camera!==false,portrait:height>width,
       verticalOffsetPct:clamp(number(s.piano_vertical_offset_pct,0),-20,20),
       keyStyle:['auto','dark','classic','custom'].includes(s.piano_key_style)?s.piano_key_style:'auto',
       whiteKeyColor:hex(s.piano_white_key_color,'#5a6576'),blackKeyColor:hex(s.piano_black_key_color,'#141b27'),
       strength:clamp(number(s.piano_light_strength,1.4),0,4),
       offsetSec:clamp(number(s.piano_offset_sec,0),-5,5)},
   };
 }
 class Stage {
   constructor({viewport,container,meta,settings}) {
     this.viewport=viewport;this.container=container;this.meta=meta;
     this.settings=normalized(settings,meta);this.follower=null;this.layer=null;this.piano=null;this.time=0;
     this.scoreWindow=null;this.scoreScroll=null;this.scorePanel=null;
     this.setupWindow();
   }
   setupWindow(){
     // Same DOM structure in the editor and the offscreen MP4 page.
     this.scoreWindow=this.viewport.querySelector('.score-window');
     if(!this.scoreWindow){
       this.scoreWindow=document.createElement('div');this.scoreWindow.className='score-window';
       this.viewport.appendChild(this.scoreWindow);
     }
     this.scorePanel=this.scoreWindow.querySelector('.score-panel');
     if(!this.scorePanel){this.scorePanel=document.createElement('div');this.scorePanel.className='score-panel';this.scoreWindow.appendChild(this.scorePanel);}
     this.scoreScroll=this.scoreWindow.querySelector('.score-scroll');
     if(!this.scoreScroll){this.scoreScroll=document.createElement('div');this.scoreScroll.className='score-scroll';this.scoreWindow.appendChild(this.scoreScroll);}
     this.cameraSpace=this.scoreScroll.querySelector('.score-camera-space');
     if(!this.cameraSpace){this.cameraSpace=document.createElement('div');this.cameraSpace.className='score-camera-space';this.scoreScroll.appendChild(this.cameraSpace);}
     this.cameraSpacer=this.cameraSpace.querySelector('.score-camera-spacer');
     if(!this.cameraSpacer){this.cameraSpacer=document.createElement('div');this.cameraSpacer.className='score-camera-spacer';this.cameraSpace.appendChild(this.cameraSpacer);}
     if(this.container.parentElement!==this.cameraSpace)this.cameraSpace.appendChild(this.container);
   }
   static scoreGeometry(settings){
     const w=settings.width,h=settings.height,r=settings.scoreRegion,s=settings.scene;
     // Top/bottom margins are ABSOLUTE clearances from the video edges.
     // Do not center the score in unused space and do not silently reserve
     // space for the title. In particular, top=0 must mean top=0.
     // The title is an independent overlay; use explicit titleGap only as
     // part of title composition, not as another invisible score margin.
     const top=h*r.marginTopPercent/100;
     const bottom=h*r.marginBottomPercent/100;
     const available=Math.max(1,h-top-bottom);
     const regionHeight=Math.max(1,Math.min(h*r.heightPercent/100,available));
     const regionWidth=Math.max(1,w*r.widthPercent/100);
     return {left:(w-regionWidth)*r.xPercent/100,top,
       width:regionWidth,height:regionHeight,bottom,available};
   }
   applyScoreWindow(){
     this.setupWindow();
     const s=this.settings,g=Stage.scoreGeometry(s);
     const el=this.scoreWindow;
     el.dataset.notationStyle=s.scene.notationStyle;
     el.style.setProperty('--notation-ink',s.effects.inverted?s.effects.paper:s.effects.ink);
     el.style.setProperty('--notation-staff',s.effects.staff);
     el.style.left=`${g.left}px`;el.style.top=`${g.top}px`;
     el.style.width=`${g.width}px`;el.style.height=`${g.height}px`;
     el.style.clipPath=`inset(${s.scoreRegion.cropTopPercent}% 0 0 0)`;
     this.scorePanel.style.backgroundColor=s.scoreRegion.panelColor;
     this.scorePanel.style.opacity=this.meta.has_score===false?'0':String(s.scoreRegion.panelOpacity);
     el.hidden=this.meta.has_score===false;
     el.style.visibility=s.scoreVisible?'visible':'hidden';
     el.style.pointerEvents=s.scoreVisible?'':'none';
     return g;
   }
   applyScoreVisibility(){
     const visible=this.settings.scoreVisible;
     if(this.layer){
       this.layer.scoreVisible=visible;
       if(this.layer.canvas){
         this.layer.canvas.style.display=visible&&!this.layer.scene?.minimalMode?'':'none';
         if(!visible)this.layer.context?.clearRect?.(0,0,this.layer.canvas.width,this.layer.canvas.height);
       }
       if(!visible)this.layer.gpuCommands=[];
     }
     if(this.follower?.glitterLayer)this.follower.glitterLayer.style.display=visible?'':'none';
   }
   static scoreTopPadding(settings){
     // X/Y sliders move engraving *inside* the score window in both layouts.
     // The window geometry and title spacing remain independent.
     const scale=Math.max(1,Math.min(settings.width,settings.height)/1080);
     const logicalHeight=Stage.scoreGeometry(settings).height/scale;
     return Math.round(Math.max(0,logicalHeight-200)*settings.effects.scorePositionY/100*.7*scale);
   }
   async configureScoreGpu(){
     const epoch=this.scoreGpuEpoch=(this.scoreGpuEpoch||0)+1;
     this.scoreGpu?.dispose();this.scoreGpu=null;
     if(this.follower)this.follower.gpuParticles=false;
     if(this.layer)this.layer.gpuLayer=null;
     this.viewport.classList.remove('score-pixi-active');
     const mode=this.settings.piano.fxRenderer;
     if(this.settings.effects.minimalMode||!this.settings.scoreVisible||this.meta.has_score===false)return;
     try{
       const Layer=root.ScorePixiFx?.Layer;
       if(!Layer)throw Error('PixiJS 효과 모듈이 로드되지 않았습니다.');
       const layer=await Layer.create(this.scoreWindow,'score');
       if(epoch!==this.scoreGpuEpoch){layer.dispose();return;}
       this.scoreGpu=layer;this.viewport.classList.add('score-pixi-active');
       this.follower.gpuParticles=true;
       if(this.layer)this.layer.gpuLayer=layer;
     }catch(error){
       if(epoch!==this.scoreGpuEpoch)return;
       if(this.follower)this.follower.gpuParticles=false;
       this.viewport.dispatchEvent(new CustomEvent('score-fx-renderer',
         {detail:{actual:'error',requested:mode,reason:String(error?.message||error)}}));
       throw error;
     }
   }
   drawScoreGpu(){
     const gpu=this.scoreGpu,score=this.scoreWindow;
     if(!this.settings.scoreVisible||!gpu||!this.follower)return;
     const base=score.getBoundingClientRect(),stage=this.viewport.getBoundingClientRect();
     if(!base.width||!base.height||!stage.width||!stage.height)return;
     const commands=[],scoreScaleX=base.width/score.clientWidth,scoreScaleY=base.height/score.clientHeight;
     const toScore=(x,y)=>({
       x:(stage.left+x*stage.width/this.viewport.clientWidth-base.left)/scoreScaleX,
       y:(stage.top+y*stage.height/this.viewport.clientHeight-base.top)/scoreScaleY});
     const pointOf=element=>root.ScoreStudio.gpuScorePoint(element,score);
     for(const command of this.layer?.gpuCommands||[]){
       if(command.kind==='trailRibbon'){
         commands.push({...command,a:{...command.a,...toScore(command.a.x,command.a.y)},
           b:{...command.b,...toScore(command.b.x,command.b.y)}});
         continue;
       }
       const point=toScore(command.x,command.y);
       commands.push({...command,...point});
     }
     for(const active of this.follower.activeNodes||[]){
       const el=active.el;if(!el?.classList?.contains('score-glowing'))continue;
       const rect=el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
       const point=pointOf(el);if(!point)continue;
       const style=getComputedStyle(el),color=style.getPropertyValue('--score-note-active').trim()||this.follower.colors().glow;
       const blur=parseFloat(style.getPropertyValue('--score-glow-blur'))||3;
       let headWidth=rect.width,headHeight=rect.height,rotation=0;
       if(typeof el.getBBox==='function'&&typeof el.getScreenCTM==='function')try{
         const box=el.getBBox(),matrix=el.getScreenCTM();
         if(matrix&&box.width&&box.height){
           headWidth=box.width*Math.hypot(matrix.a,matrix.b);
           headHeight=box.height*Math.hypot(matrix.c,matrix.d);
           rotation=Math.atan2(matrix.b,matrix.a);
         }
       }catch(_){}
       commands.push({kind:'note',x:point.x,y:point.y,
         radius:Math.max(headWidth/scoreScaleX,headHeight/scoreScaleY)+blur*5,
         width:headWidth/scoreScaleX+blur*7,height:headHeight/scoreScaleY+blur*5,rotation,
         energy:Math.min(.65,.18+blur*.07),color,age:active.age??1,
         velocity:(active.velocity??78)/127,seed:active.seed??0});
       if((this.settings.gpuEffects?.stardust?.on||this.settings.gpuEffects?.burst?.on)&&
           this.settings.scene.fxMode!=='glitter')
         commands.push({kind:'burst',x:point.x,y:point.y,age:active.age??1,
           velocity:(active.velocity??78)/127,energy:1,color,seed:active.seed??0});
     }
     for(const particle of this.follower.overlay?.children||[]){
       if(!particle.classList.contains('note-star')&&!particle.classList.contains('note-trail'))continue;
       const rect=particle.getBoundingClientRect();if(!rect.width||!rect.height)continue;
       const point=pointOf(particle);if(!point)continue;
       const style=getComputedStyle(particle),color=style.getPropertyValue('--score-glow').trim()||this.follower.colors().glow;
       commands.push({kind:particle.classList.contains('note-star')?'particle':'trail',
         x:point.x,y:point.y,size:Math.max(rect.width/scoreScaleX,rect.height/scoreScaleY),
         width:rect.width/scoreScaleX,
         energy:Number(style.opacity)||.5,color});
     }
     try{gpu.draw(commands,score.clientWidth,score.clientHeight,this.settings.gpuEffects);}
     catch(error){gpu.dispose();this.scoreGpu=null;this.viewport.classList.remove('score-pixi-active');
       this.follower.gpuParticles=false;
       if(this.layer)this.layer.gpuLayer=null;
       this.viewport.dispatchEvent(new CustomEvent('score-fx-renderer',
         {detail:{actual:'error',requested:this.settings.piano.fxRenderer,reason:String(error?.message||error)}}));
       throw error;}
   }
   async load(){
     const previous=this.viewport.__scoreFxStage;
     if(previous&&previous!==this){
       previous.scoreGpuEpoch=(previous.scoreGpuEpoch||0)+1;
       previous.scoreGpu?.dispose();previous.scoreGpu=null;
       if(previous.layer)previous.layer.gpuLayer=null;
     }
     this.viewport.__scoreFxStage=this;
     this.scoreGpuEpoch=(this.scoreGpuEpoch||0)+1;
     this.scoreGpu?.dispose();this.scoreGpu=null;this.viewport.classList.remove('score-pixi-active');
     if(this.layer)this.layer.gpuLayer=null;
     if(this.follower?.osmd?.dispose)try{this.follower.osmd.dispose();}catch(_){}
     this.container.replaceChildren();
     // Switching projects creates a new Stage on the same viewport. Remove
     // canvases owned by the previous Stage so its keyboard cannot linger.
     this.viewport.querySelectorAll('.piano-fall-canvas').forEach(canvas=>{
       if(canvas!==this.piano?.canvas)canvas.remove();
     });
     this.viewport.querySelectorAll('.piano-three-canvas').forEach(canvas=>{
       if(canvas!==this.piano?.keyboard3d?.canvas)canvas.remove();
     });
     this.viewport.querySelectorAll('.score-background,.score-glitter-overlay,.studio-fx-canvas,.studio-atmosphere,.studio-titles').forEach(e=>e.remove());
     const s=this.settings;
     this.applyScoreWindow();
     if(this.meta.has_score===false){
       this.follower=pianoOnlyFollower(this.meta,s,this.viewport);
       this.follower.setEffects(s.effects);
       this.layer=new root.ScoreStudio.LayerRenderer(this.viewport);
       this.layer.setScene(s.scene);
       this.applyScoreVisibility();
       if(!this.piano)this.piano=new root.ScorePianoFall.PianoFall(this.viewport);
       this.piano.setSettings(s.piano);this.piano.setFollower(this.follower);
       await Promise.all([this.piano.ready,this.piano.notesReady,this.piano.keyboardReady,this.piano.dynamicReady]);
       await this.piano.dynamic?.lightingReady;
       await this.configureScoreGpu();
       this.seek(this.time);return this;
     }
     // Force the score subviewport to settle before OSMD measures its width.
     // Without this the first render after changing Page/Single Line can use
     // the *previous* container geometry until the zoom slider is touched.
     this.scoreScroll.scrollLeft=0;
     this.scoreScroll.scrollTop=0;
     if(typeof requestAnimationFrame==='function'){
       await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
     }
     this.scoreScroll.getBoundingClientRect();
     this.viewport.style.setProperty('--stage-title-size',Math.round(s.width*.038)+'px');
     this.viewport.style.setProperty('--stage-artist-size',Math.round(s.width*.015)+'px');
     this.viewport.style.setProperty('--stage-credit-size',Math.round(s.width*.013)+'px');
     this.follower=new root.ScoreFollower({container:this.container,viewport:this.scoreScroll,
       tempoMap:this.meta.tempo_map,noteEvents:this.meta.note_events,scoreAlignment:this.meta.score_alignment,tieContinuations:this.meta.tie_continuations,staffGroups:this.meta.staff_groups||[],
       // The export-only calibration keeps notehead scale relative to the
       // preview without changing the user's saved zoom value.
       sync:this.meta.sync,offsetSec:s.offsetSec,
       zoom:s.zoom*s.layoutScale,cameraPoints:s.cameraPoints,
       stageRoot:this.viewport,
       effects:{...s.effects,lightColorMode:s.scene.lightColorMode,
         auroraLow:s.scene.auroraLow,auroraHigh:s.scene.auroraHigh,velocityScale:s.scene.velocityScale,
         lightPaletteStops:s.scene.lightPaletteStops,lightColorPreset:s.scene.lightColorPreset,
       // Explicit Y slider controls internal score spacing in both layouts.
         scoreTopPadding:Stage.scoreTopPadding(s)},
       scrollMode:s.scrollMode});
     this.follower.cameraMode=s.scene.cameraMode;
     this.follower.pedalEvents=this.meta.pedal_events||[];
     this.follower.audioDuration=this.meta.audio_duration_sec;
     // OSMD may use its own native network loader. Supply XML text directly
     // in browser-only mode so no API/Functions request can escape the client.
     if(root.ScoreLocalProjects?.enabled){
       const result=await fetch(`/api/projects/${this.meta.id}/score`);
       if(!result.ok)throw Error('브라우저 로컬 악보를 읽을 수 없습니다.');
       await this.follower.load(await result.text());
     }else await this.follower.load(`/api/projects/${this.meta.id}/score`);
     this.layer=new root.ScoreStudio.LayerRenderer(this.viewport);
     this.layer.setScene(s.scene);
     this.applyScoreVisibility();
     if(!this.piano)this.piano=new root.ScorePianoFall.PianoFall(this.viewport);
     this.piano.setSettings(s.piano);
     this.piano.setFollower(this.follower);
     await Promise.all([this.piano.ready,this.piano.notesReady,this.piano.keyboardReady,this.piano.dynamicReady]);
     await this.piano.dynamic?.lightingReady;
     await this.configureScoreGpu();
     this.seek(this.time);
     return this;
   }
   // Change existing score/keyboard light colors without recreating OSMD or WebGL.
   setStaffColors(config,{redraw=true}={}){
     const colors={};
     for(const [key,value] of Object.entries(config?.colors||{})){
       if(/^#[0-9a-f]{6}$/i.test(value))colors[key]=value;
     }
     const palette={enabled:config?.enabled===true,keyboard:config?.keyboard===true,colors};
     this.settings.effects.staffColors=palette;
     if(this.follower){
       this.follower.effects.staffColors=palette;
       this.follower.colorActiveNodes?.();
       this.piano?.updateStaffColors?.(palette);
       if(redraw)this.seek(this.time);
     }
   }
   setSettings(settings,{layout=false}={}){
     const next=normalized(settings,this.meta);
     const prev=this.settings;this.settings=next;
     const changed=layout||prev.zoom!==next.zoom||prev.layoutScale!==next.layoutScale||prev.scrollMode!==next.scrollMode||
       prev.scoreRegion.widthPercent!==next.scoreRegion.widthPercent||
       prev.scoreRegion.xPercent!==next.scoreRegion.xPercent||
       prev.scoreRegion.heightPercent!==next.scoreRegion.heightPercent||
       Stage.scoreGeometry(prev).width!==Stage.scoreGeometry(next).width||
       prev.width!==next.width||prev.height!==next.height||
       prev.effects.staff!==next.effects.staff||prev.effects.ink!==next.effects.ink||
       prev.effects.inverted!==next.effects.inverted||prev.layoutMode!==next.layoutMode||
       prev.effects.scorePositionX!==next.effects.scorePositionX||
       prev.effects.scorePositionY!==next.effects.scorePositionY||
       Stage.scoreGeometry(prev).height!==Stage.scoreGeometry(next).height;
     if(!this.follower)return Promise.resolve();
     if(changed)return this.load();
     this.applyScoreWindow();
     this.applyScoreVisibility();
     this.follower.setEffects({...next.effects,lightColorMode:next.scene.lightColorMode,
       auroraLow:next.scene.auroraLow,auroraHigh:next.scene.auroraHigh,velocityScale:next.scene.velocityScale,
       lightPaletteStops:next.scene.lightPaletteStops,lightColorPreset:next.scene.lightColorPreset});
     if(prev.effects.glow!==next.effects.glow||prev.effects.accent!==next.effects.accent||
       prev.effects.paper!==next.effects.paper||prev.scene.lightColorMode!==next.scene.lightColorMode||
       prev.scene.lightColorPreset!==next.scene.lightColorPreset||prev.scene.auroraLow!==next.scene.auroraLow||prev.scene.auroraHigh!==next.scene.auroraHigh||
       JSON.stringify(prev.scene.lightPaletteStops)!==JSON.stringify(next.scene.lightPaletteStops)||
       prev.scene.velocityScale!==next.scene.velocityScale)this.piano?.shadowCache?.clear();
     if(this.meta.has_score===false)this.follower.scene=next.scene;
     this.follower.setOffset(next.offsetSec);
     this.piano?.setSettings(next.piano);
     this.piano?.setFollower(this.follower);
     if(JSON.stringify(prev.cameraPoints)!==JSON.stringify(next.cameraPoints))this.follower.setCameraPoints(next.cameraPoints);
     this.follower.cameraMode=next.scene.cameraMode;
     this.layer?.setScene(next.scene);
     if(prev.piano.fxRenderer!==next.piano.fxRenderer||prev.effects.minimalMode!==next.effects.minimalMode||prev.scoreVisible!==next.scoreVisible)
       return Promise.all([this.piano?.ready,this.piano?.notesReady,this.piano?.keyboardReady,this.piano?.dynamicReady,
         this.piano?.dynamic?.lightingReady,this.configureScoreGpu()]).then(()=>{this.seek(this.time);});
     return Promise.resolve(this.piano?.dynamic?.lightingReady).then(()=>{this.seek(this.time);});
   }
   seek(time){
     this.time=Math.max(0,Number(time)||0);
     if(!this.follower)return;
     this.follower.seek(this.time,true);
     if(this.layer)this.layer.gpuEffects=this.settings.gpuEffects;
     this.layer?.draw(this.time,this.follower);
     this.piano?.draw(this.time);
     this.drawScoreGpu();
   }
   getMeasureStarts(){return this.follower?.measureStarts||[];}
   setSync(sync){this.meta.sync=sync;if(this.follower){this.follower.setSync(sync);this.piano?.setFollower(this.follower);this.seek(this.time);}}
   setCameraPoints(points){this.settings.cameraPoints=Array.isArray(points)?points:[];this.follower?.setCameraPoints(this.settings.cameraPoints);this.seek(this.time);}
 }
 root.ScoreStage={normalized,Stage};
})(typeof window==='undefined'?globalThis:window);
