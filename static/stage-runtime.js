/* Shared scene/runtime for the EDITOR and the MP4 EXPORT route. */
(function (root) {
 'use strict';
 const hex=(v,d)=>/^#[0-9a-f]{6}$/i.test(v||'')?v:d;
 const number=(v,d)=>Number.isFinite(Number(v))?Number(v):d;
 const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
 function normalized(raw={},meta={}) {
   const s=raw&&typeof raw==='object'?raw:{};
   const effect={
     paper:hex(s.paper_color,'#fffdf6'),ink:hex(s.ink_color,'#181b22'),
     staff:hex(s.staff_color,'#323a43'),glow:hex(s.glow_color,'#68ddfa'),
     cursor:hex(s.cursor_color,'#2ec9d3'),cursorVisible:s.cursor_visible!==false,cursorMotion:s.cursor_motion==='step'?'step':'smooth',accent:hex(s.accent_color,'#2ec9d3'),
     texture:s.texture||'none',inverted:Boolean(s.inverted),
     backgroundUrl:meta.background_filename?`/api/projects/${meta.id}/background?v=${encodeURIComponent(meta.background_version||meta.background_filename)}`: '',
     backgroundOpacity:clamp(number(s.background_opacity,.5),0,1),backgroundFit:s.background_fit||'cover',
     backgroundPositionX:clamp(number(s.background_position_x,50),0,100),backgroundPositionY:clamp(number(s.background_position_y,50),0,100),
     glitter:Boolean(s.glitter),sparkle:s.sparkle!==false,drawScore:Boolean(s.draw_score),
     velocityReactive:s.velocity_reactive!==false,noteMotion:s.note_motion!==false,
     motionStrength:clamp(number(s.motion_strength,1),0,2),
     scorePositionX:clamp(number(s.score_position_x,38),0,100),scorePositionY:clamp(number(s.score_position_y,12),0,100),
   };
   const layout=(s.layout_mode||s.scroll_mode||'page');
   return {
     width:clamp(Math.round(number(s.width,1280)),200,4096),
     height:clamp(Math.round(number(s.height,720)),200,4096),
     zoom:clamp(number(s.zoom,.9),.5,1.5),offsetSec:number(s.offset_sec,0),
     layoutMode:['page','singleline','vertical','horizontal'].includes(layout)?layout:'page',
     scrollMode:(layout==='singleline'||layout==='horizontal')?'horizontal':'vertical',
     scoreRegion:{widthPercent:clamp(number(s.score_area_width,94),30,100),
       xPercent:clamp(number(s.score_area_x,50),0,100),
       heightPercent:clamp(number(s.score_area_height,s.piano_enabled===false?70:50),15,100),
       marginTopPercent:clamp(number(s.score_margin_top,12),0,45),
       marginBottomPercent:clamp(number(s.score_margin_bottom,9),0,45),
       panelColor:hex(s.score_panel_color,'#0c1120'),panelOpacity:clamp(number(s.score_panel_opacity,0),0,1)},
     cameraPoints:(Array.isArray(s.camera_points)?s.camera_points:[]).slice(0,500).map(p=>({
       key:String(p?.key||'').slice(0,80),zoom:clamp(number(p?.zoom,1.3),1.05,1.6),
       duration:clamp(number(p?.duration,1.6),.4,5),shake:clamp(number(p?.shake,0),0,1),timing:clamp(number(p?.timing,-.6),-2,1.5)
     })).filter(p=>p.key),
     effects:effect,scene:root.ScoreStudio.normalize(s.scene||{}),
     piano:{enabled:s.piano_enabled!==false,light:s.piano_light!==false,
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
     el.style.left=`${g.left}px`;el.style.top=`${g.top}px`;
     el.style.width=`${g.width}px`;el.style.height=`${g.height}px`;
     this.scorePanel.style.backgroundColor=s.scoreRegion.panelColor;
     this.scorePanel.style.opacity=String(s.scoreRegion.panelOpacity);
     el.style.visibility='visible';
     return g;
   }
   static scoreTopPadding(settings){
     // Only the explicit Single Line Y control changes the top position
     // of the notation INSIDE its display region. Never add title space.
     return settings.scrollMode==='horizontal'
       ?Math.round(Math.max(0,Stage.scoreGeometry(settings).height-200)*settings.effects.scorePositionY/100*.7):0;
   }
   async load(){
     if(this.follower?.osmd?.dispose)try{this.follower.osmd.dispose();}catch(_){}
     this.container.replaceChildren();
     this.viewport.querySelectorAll('.score-background,.score-glitter-overlay,.studio-fx-canvas,.studio-atmosphere,.studio-titles').forEach(e=>e.remove());
     const s=this.settings;
     this.applyScoreWindow();
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
       tempoMap:this.meta.tempo_map,noteEvents:this.meta.note_events,scoreAlignment:this.meta.score_alignment,tieContinuations:this.meta.tie_continuations,
       sync:this.meta.sync,offsetSec:s.offsetSec,zoom:s.zoom,cameraPoints:s.cameraPoints,
       stageRoot:this.viewport,
       effects:{...s.effects,lightColorMode:s.scene.lightColorMode,
         auroraLow:s.scene.auroraLow,auroraHigh:s.scene.auroraHigh,velocityScale:s.scene.velocityScale,
         // Only explicit Single Line Y controls internal score spacing.
         scoreTopPadding:Stage.scoreTopPadding(s)},
       scrollMode:s.scrollMode});
     this.follower.cameraMode=s.scene.cameraMode;
     this.follower.audioDuration=this.meta.audio_duration_sec;
     await this.follower.load(`/api/projects/${this.meta.id}/score`);
     this.layer=new root.ScoreStudio.LayerRenderer(this.viewport);
     this.layer.setScene(s.scene);
     if(!this.piano)this.piano=new root.ScorePianoFall.PianoFall(this.viewport);
     this.piano.setSettings(s.piano);
     this.piano.setFollower(this.follower);
     this.seek(this.time);
     return this;
   }
   setSettings(settings,{layout=false}={}){
     const next=normalized(settings,this.meta);
     const prev=this.settings;this.settings=next;
     const changed=layout||prev.zoom!==next.zoom||prev.scrollMode!==next.scrollMode||
       prev.scoreRegion.widthPercent!==next.scoreRegion.widthPercent||
       prev.scoreRegion.xPercent!==next.scoreRegion.xPercent||
       prev.scoreRegion.heightPercent!==next.scoreRegion.heightPercent||
       Stage.scoreGeometry(prev).width!==Stage.scoreGeometry(next).width||
       prev.width!==next.width||prev.height!==next.height||
       prev.effects.staff!==next.effects.staff||prev.effects.ink!==next.effects.ink||
       prev.effects.inverted!==next.effects.inverted||prev.layoutMode!==next.layoutMode||
       prev.effects.scorePositionX!==next.effects.scorePositionX||
       (next.scrollMode==='horizontal'&&prev.effects.scorePositionY!==next.effects.scorePositionY)||
       (next.scrollMode==='horizontal'&&Stage.scoreGeometry(prev).height!==Stage.scoreGeometry(next).height);
     if(!this.follower)return Promise.resolve();
     if(changed)return this.load();
     this.applyScoreWindow();
     this.follower.setEffects({...next.effects,lightColorMode:next.scene.lightColorMode,
       auroraLow:next.scene.auroraLow,auroraHigh:next.scene.auroraHigh,velocityScale:next.scene.velocityScale});
     this.follower.setOffset(next.offsetSec);
     this.piano?.setSettings(next.piano);
     this.piano?.setFollower(this.follower);
     if(JSON.stringify(prev.cameraPoints)!==JSON.stringify(next.cameraPoints))this.follower.setCameraPoints(next.cameraPoints);
     this.follower.cameraMode=next.scene.cameraMode;
     this.layer?.setScene(next.scene);this.seek(this.time);
     return Promise.resolve();
   }
   seek(time){
     this.time=Math.max(0,Number(time)||0);
     if(!this.follower)return;
     this.follower.seek(this.time,true);
     this.layer?.draw(this.time,this.follower);
     this.piano?.draw(this.time);
   }
   getMeasureStarts(){return this.follower?.measureStarts||[];}
   setSync(sync){this.meta.sync=sync;if(this.follower){this.follower.setSync(sync);this.piano?.setFollower(this.follower);this.seek(this.time);}}
   setCameraPoints(points){this.settings.cameraPoints=Array.isArray(points)?points:[];this.follower?.setCameraPoints(this.settings.cameraPoints);this.seek(this.time);}
 }
 root.ScoreStage={normalized,Stage};
})(typeof window==='undefined'?globalThis:window);
