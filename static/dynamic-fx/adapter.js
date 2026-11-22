/* ScoreMotion clock/data adapter for the Dynamic FX v1.6 visual modules. */
import {DEFAULTS} from './dynamics.js?v=harmony4';
import {MidiFXEngine,ParticleField} from './engine.js?v=aurora3';
import {DynamicFXRenderer} from './renderer.js?v=keyboard24';
// Namespace import is intentionally tolerant of an older cached lighting module.
// v18 initially imported fxBackdropAlpha as a *required* named export, which
// crashed the whole Dynamic FX renderer when Chromium retained background1.
import * as AdaptiveLighting from './adaptive-lighting.js?v=browserlocal1';
const {keyboardMaterialAt,loadBackdropImage}=AdaptiveLighting;
function fxBackdropAlpha(effects={}){
  if(typeof AdaptiveLighting.fxBackdropAlpha==='function')
    return AdaptiveLighting.fxBackdropAlpha(effects);
  // Same rule as v18. Protect existing sessions if the helper's module is
  // cached from a previous version or a deployment was only partly updated.
  const opacity=Number(effects?.backgroundOpacity??0);
  const visible=(/^\/api\/projects\//.test(String(effects?.backgroundUrl||''))||String(effects?.backgroundUrl||'').startsWith('blob:'))&&
    Number.isFinite(opacity)&&opacity>0;
  return visible?0:.94;
}
import {normalizeBoundaryLight} from './boundary-light.js?v=boundary8';

const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function rgb(value){
  const text=String(value||'');
  if(/^#[0-9a-f]{6}$/i.test(text))return [1,3,5].map(i=>parseInt(text.slice(i,i+2),16)/255);
  const values=text.match(/^rgba?\((\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/i);
  return values?values.slice(1,4).map(n=>clamp(Number(n)/255,0,1)):null;
}
function songFrom(piano,follower,randomMode=false){
  const events=[];
  for(const [noteIndex,note] of piano.notes.entries()){
    const base={midi:note.pitch,channel:note.channel??0,track:note.track??0,noteIndex};
    // An explicit Random keyboard palette must override a saved per-staff color.
    // Preserve per-staff RGB only when Random is not selected.
    const staffColor=randomMode?(rgb(globalThis.ScoreStudio?.randomNoteColor?.(note))||note.staffColor||null):(note.staffColor||null);
    events.push({...base,type:'on',time:Math.max(0,note.audio),velocity:clamp(note.velocity||64,1,127),staffColor});
    events.push({...base,type:'off',time:Math.max(0,note.endAudio),velocity:0});
  }
  for(const pedal of piano.pedalEvents)events.push({type:'pedal',time:Math.max(0,pedal.audio),
    channel:pedal.channel??0,value:pedal.down?127:0});
  const order={pedal:0,off:1,on:2};
  events.sort((a,b)=>a.time-b.time||(order[a.type]-order[b.type]));
  const tempos=(follower?.tempoMap||[]).map(t=>({
    time:Number.isFinite(t.second)?follower.midiToAudio(t.second):0,
    bpm:60000000/(t.tempo_us||500000)})).sort((a,b)=>a.time-b.time);
  return {events,tempos,duration:Math.max(follower?.audioDuration||0,piano.notes.at(-1)?.endAudio||0)+1};
}
export class ScoreDynamicFX {
  constructor(viewport){
    this.canvas=document.createElement('canvas');
    this.canvas.className='piano-dynamic-canvas';
    viewport.appendChild(this.canvas);
    this.settings={...DEFAULTS};
    try{this.renderer=new DynamicFXRenderer(this.canvas,this.settings);}
    catch(error){this.canvas.remove();throw error;}
    this.time=null;this.drawCount=0;this.noteOnCount=0;this.lastNoteOn=null;
    this.lightingImage=null;this.lightingReady=Promise.resolve();this.lightingEpoch=0;
    this.noteSource=[]; // Last loaded MIDI notes, for color changes without rebuilding the project.
  }
  configure(pianoSettings,follower){
    const fx=pianoSettings.gpuEffects||{};
    const keyboard=fx.keyboard||{};
    const scene=pianoSettings.lightingScene||{};
    const linked=keyboard.paletteLink===true||fx.groups?.keyboard?.colorPreset==='linked';
    const scoreAurora=scene.lightColorMode==='aurora';
    const randomNoteColors=fx.groups?.keyboard?.colorPreset==='random'||
      (linked&&scoreAurora&&scene.lightColorPreset==='random');
    const low=rgb(keyboard.colorLow),high=rgb(keyboard.colorHigh);
    const scoreLow=rgb(scene.auroraLow),scoreHigh=rgb(scene.auroraHigh);
    const solid=rgb(follower?.colors?.().accent)||rgb(follower?.eventLightColor?.(64));
    const blend=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
    // Use the score's actual endpoints for linked Aurora. Sampling its
    // already-normalized colors at four arbitrary raw velocities collapsed
    // the range in relative mode, often leaving all keyboard lights alike.
    const useScorePalette=linked||!(low&&high);
    const declared=useScorePalette?scene.lightPaletteStops:keyboard.colorStops;
    const full=Array.isArray(declared)&&declared.length>=3&&declared.length<=8
      ?declared.map(rgb):null;
    const stops=full&&full.every(Boolean)?full:(useScorePalette
      ?(scoreAurora&&scoreLow&&scoreHigh?[scoreLow,scoreHigh]:[solid,solid])
      :[low,high]);
    const colors=stops.every(Boolean)
      ?(stops.length>2?stops:[stops[0],blend(stops[0],stops[1],1/3),blend(stops[0],stops[1],2/3),stops[1]])
      :undefined;
    const keyColors=pianoSettings.keyStyle==='custom'?{
      white:rgb(pianoSettings.whiteKeyColor),black:rgb(pianoSettings.blackKeyColor)}:
      pianoSettings.keyStyle==='dark'?{white:rgb('#596475'),black:rgb('#111823')}:
      pianoSettings.keyStyle==='classic'?{white:rgb('#f1f1f5'),black:rgb('#151821')}:null;
    Object.assign(this.settings,{
      randomNoteColors,
      staffKeyboardEnabled:follower?.effects?.staffColors?.enabled===true&&follower?.effects?.staffColors?.keyboard===true,
      velocityLight:clamp(Number(pianoSettings.strength??1.4),0,4),
      velocityReactive:follower?.effects?.velocityReactive!==false,
      colorStops:colors,
      useHarmonicStops:Boolean(full&&full.every(Boolean)),
      scoreAuroraLinked:useScorePalette&&scoreAurora&&!!scoreLow&&!!scoreHigh,
      // Independent keyboard defaults to *MIDI-local* normalization so
      // narrow performance ranges still span the selected Aurora colors.
      // The score's mapping remains selectable for exact visual linking.
      velocityScale:linked?(scene.velocityScale||'absolute'):keyboard.velocityScale==='absolute'?'absolute':
        keyboard.velocityScale==='follow-score'
          ?(scene.velocityScale||follower?.effects?.velocityScale||'absolute'):'relative',
      velocityRange:follower?.velocityRange||this.settings.velocityRange,
      velocityColor:keyboard.velocityColor!==false,
      velocityContrast:clamp(Number(keyboard.velocityContrast??1),.4,2.5),
      particleLife:clamp(Number(keyboard.particleLife??1.25),.2,3),
      particleSize:clamp(Number(keyboard.particleSize??1),.5,2),
      curlStrength:clamp(Number(keyboard.curlStrength??1.05),0,3),
      densityFastWeight:clamp(Number(keyboard.densityFastWeight??.35),0,1),
      glowSize:clamp(Number(keyboard.glowSize??1),.5,2),
      bloomRadius:clamp(Number(keyboard.bloomRadius??1),.5,2),
      keyColors,
      textureMode:0, // legacy background patterns are retired
      // A user-selected photo is the actual video background. The WebGL
      // fullscreen studio shader stays transparent over it while the key
      // geometry, falling notes, hitline and bloom remain independently drawn.
      backgroundAlpha:fxBackdropAlpha(follower?.effects),
      showGlow:pianoSettings.light!==false,
      showParticles:pianoSettings.light!==false,
      particleDensity:clamp(Number(keyboard.particleDensity??1),0,3),
      pedalResonance:fx.pedalResonance===false?0:DEFAULTS.pedalResonance,
      glowBloom:clamp(Number(keyboard.bloomStrength??.7),0,2),
      masterGlow:clamp(Number(pianoSettings.strength??1.4),0,4),
      cameraZoom:1,cameraFollow:false,
      cameraVerticalOffsetPct:clamp(Number(pianoSettings.verticalOffsetPct??0),-20,20),
      portraitAutoFrame:pianoSettings.portrait&&pianoSettings.camera!==false,
      cameraLeadSeconds:5,cameraSmoothness:1,
      showNotes:true,
      noteBarMode:['fall','rise','both','off'].includes(keyboard.noteBarMode)?keyboard.noteBarMode:'fall',
      noteRiseSpeed:clamp(Number(keyboard.noteRiseSpeed??1)||1,.35,2),
      boundaryLight:normalizeBoundaryLight(keyboard.boundaryLight),
    });
    this.lightingScene=pianoSettings.lightingScene||{};
    this.scoreLighting={...pianoSettings.scoreLighting,...keyboard,
      mode:keyboard.lightingMode,offset:keyboard.brightnessOffset};
    this.lightingEffects={...follower?.effects};
    // configure() also runs on palette edits, when no local `piano` exists.
    // Recolor previously loaded events, rectangles and active voices in place.
    if(this.engine&&Array.isArray(this.noteSource)){
      this.updateStaffColors(this.noteSource,follower?.effects?.staffColors);
      this.field?.clear(); // drop old-color particles on palette changes
      this.time=null;
    }
    const epoch=++this.lightingEpoch;
    this.lightingImage=null;
    this.lightingReady=loadBackdropImage(this.lightingEffects.backgroundUrl).then(image=>{
      if(epoch===this.lightingEpoch)this.lightingImage=image;
    });
    this.canvas.style.display=pianoSettings.enabled===false||pianoSettings.minimalMode?'none':'';
  }
  load(piano,follower){
    this.configure(piano.settings,follower);
    this.noteSource=piano.notes;
    if(!follower?.velocityRange&&piano.notes.length){
      let min=127,max=1,found=false;
      for(const note of piano.notes){
        const value=Number(note.velocity);
        if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);found=true;}
      }
      if(found)this.settings.velocityRange={min,max};
    }
    this.engine=new MidiFXEngine(songFrom(piano,follower,this.settings.randomNoteColors),this.settings);
    this.field=new ParticleField(this.engine,this.settings);
    // Keep initial loading and in-place palette updates on the same priority rules.
    this.updateStaffColors(this.noteSource,follower?.effects?.staffColors);
    this.engine.onNote=voice=>{this.noteOnCount++;this.lastNoteOn={midi:voice.midi,time:voice.startedAt};this.field.onNote(voice);};
    this.drawCount=0;this.noteOnCount=0;this.lastNoteOn=null;
    this.renderer.resetCamera();this.time=null;
  }
  updateStaffColors(notes,palette){
    const linked=palette?.enabled===true&&palette?.keyboard===true;
    this.settings.staffKeyboardEnabled=linked;
    const colorFor=note=>this.settings.randomNoteColors
      ?(rgb(globalThis.ScoreStudio?.randomNoteColor?.(note))||(linked?note?.staffColor:null))
      :(linked?note?.staffColor:null);
    if(!this.engine)return;
    for(const event of this.engine.song.events||[]){
      if(event.type==='on')event.staffColor=colorFor(notes[event.noteIndex]);
    }
    for(const note of this.engine.notes||[]){
      note.staffColor=colorFor(notes[note.noteIndex]);
    }
    for(const voice of this.engine.voices||[]){
      voice.staffColor=colorFor(notes[voice.noteIndex]);
    }
  }
  draw(time){
    if(!this.engine)return;
    const target=Math.max(0,Number(time)||0),previous=this.time;
    const paletteColor=this.lightingScene?.animateBackground?
      globalThis.ScoreStudio?.frame?.(this.lightingScene,target)?.color:null;
    this.settings.paletteBackground=Boolean(paletteColor);
    this.settings.backgroundColor=rgb(paletteColor)||[0,0,0];
    this.renderer.material=keyboardMaterialAt(target,{lighting:this.scoreLighting,
      effects:this.lightingEffects,scene:this.lightingScene,image:this.lightingImage,
      width:this.canvas.clientWidth||this.canvas.width,height:this.canvas.clientHeight||this.canvas.height,
      backgroundAlpha:this.settings.backgroundAlpha});
    if(previous===null||target<previous-.001||target-previous>.25){
      this.renderer.resetCamera();this.field.clear();
      const start=Math.max(0,target-6);
      this.engine.seek(start);
      // Rebuild the visible particle tail when scrubbing or starting mid-song.
      for(let t=start+1/60;t<target-1e-7;t+=1/60){this.engine.advance(t);this.field.update(1/60);}
      const last=Math.max(0,target-this.engine.time);
      this.engine.advance(target);this.field.update(last);
      this.renderer.keyPress.set(this.engine.keyPressTargets());
      this.renderer.frame(this.engine,this.field,0);
    }else{
      const dt=Math.max(0,target-previous);
      this.engine.advance(target);this.field.update(dt);
      this.renderer.frame(this.engine,this.field,dt);
    }
    this.time=target;
    this.drawCount++;this.lastDrawWall=performance.now();
  }
  stats(){const gl=this.renderer.gl,style=getComputedStyle(this.canvas);
    return {initialized:!!this.renderer.screen,canvas:[this.canvas.width,this.canvas.height],
      cssSize:[this.canvas.clientWidth,this.canvas.clientHeight],position:style.position,
      display:style.display,visibility:style.visibility,zIndex:style.zIndex,
      webgl2:!gl.isContextLost()?'active':'lost',
      frameDraws:this.renderer.frameCount,drawCalls:this.drawCount,lastDrawTime:this.time,
      lastDrawWall:this.lastDrawWall??null,noteOnCount:this.noteOnCount,lastNoteOn:this.lastNoteOn,
      particles:this.field?.particles.length||0,material:this.renderer.material,
      backgroundSampleReady:!this.lightingEffects?.backgroundUrl||!!this.lightingImage,
      backgroundAlpha:this.settings.backgroundAlpha,
      premultipliedAlpha:gl.getContextAttributes()?.premultipliedAlpha,
      glError:gl.getError()};
  }
  dispose(){this.renderer.dispose();this.canvas.remove();this.engine=null;this.field=null;this.noteSource=[];}
}
