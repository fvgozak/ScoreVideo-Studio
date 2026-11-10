/* ScoreVideo Local: one deterministic score follower for preview AND MP4 frames. */
(function () {
  'use strict';
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const hex = (s, fallback) => /^#[0-9a-f]{6}$/i.test(s || '') ? s : fallback;
  function lerp(a,b,t) { return a + (b-a)*t; }
  function smooth(t) { t=clamp(t,0,1); return t*t*(3-2*t); }

  class ScoreFollower {
    constructor({container,viewport,stageRoot=null,tempoMap,noteEvents=[],scoreAlignment=null,tieContinuations=[],cameraPoints=[],sync=null,offsetSec=0,zoom=.9,effects={},scrollMode='vertical'}) {
      this.container=container;
      this.viewport=viewport;
      this.stageRoot=stageRoot||viewport;
      this.cameraSpace=container.parentElement;
      this.cameraSpacer=this.cameraSpace?.querySelector('.score-camera-spacer');
      this.cameraBaseWidth=0;this.cameraBaseHeight=0;this.cameraScale=1;this.cameraPointsRaw=Array.isArray(cameraPoints)?cameraPoints:[];this.cameraPoints=[];
      this.tempoMap=tempoMap;
      this.scoreAlignment=scoreAlignment;
      this.scoreAnchors=Array.isArray(scoreAlignment?.anchors)?scoreAlignment.anchors:[];
      this.scoreNoteMatches=new Map();
      this.scoreNoteMatchesSource=scoreAlignment?.note_matches||[];
      this.tieLinksSource=Array.isArray(tieContinuations)?tieContinuations:[];
      this.tieLinks=new Map();
      this.scoreOrigins=new Map();
      for(const hit of this.scoreNoteMatchesSource){
        const key=`${Number(hit.beat).toFixed(6)}:${hit.pitch}`;
        if(!this.scoreOrigins.has(key))this.scoreOrigins.set(key,hit);
      }
      for(const hit of (scoreAlignment?.note_matches||[])){
        const key=`${Number(hit.beat).toFixed(6)}:${hit.pitch}`;
        if(!this.scoreNoteMatches.has(key))this.scoreNoteMatches.set(key,[]);
        this.scoreNoteMatches.get(key).push(hit);
      }
      // MIDI event beats can diverge from MusicXML beats after a fermata.
      // Each score timestamp is therefore mapped to a matched MIDI note-on,
      // not inferred from tempo_map alone.
      // Pitch is MIDI note number 0..127.
      this.noteEvents=(Array.isArray(noteEvents)?noteEvents:[])
        .filter(n=>Number.isFinite(n.beat)&&Number.isInteger(n.pitch)&&Number.isInteger(n.velocity))
        .sort((a,b)=>a.beat-b.beat);
      const velocities=this.noteEvents.map(e=>e.velocity);
      this.velocityRange=velocities.length?{min:Math.min(...velocities.slice(0,10000)),max:Math.max(...velocities.slice(0,10000))}:{min:1,max:127};
      if(velocities.length>10000){for(const v of velocities.slice(10000)){this.velocityRange.min=Math.min(v,this.velocityRange.min);this.velocityRange.max=Math.max(v,this.velocityRange.max);}}
      // Pitch-indexed attacks make MusicXML-to-MIDI mapping scalable for long pieces.
      this.eventsByPitch=new Map();
      for(const e of this.noteEvents){
        if(!this.eventsByPitch.has(e.pitch))this.eventsByPitch.set(e.pitch,[]);
        this.eventsByPitch.get(e.pitch).push(e);
      }
      for(const arr of this.eventsByPitch.values())arr.sort((a,b)=>
        (a.second??this.beatToSeconds(a.beat))-(b.second??this.beatToSeconds(b.beat)));
      this.sync=sync;
      this.offsetSec=Number(offsetSec)||0;
      this.zoom=zoom;
      this.effects={paper:'#fffdf6',ink:'#181b22',staff:'#323a43',accent:'#2ec9d3',glow:'#68ddfa',cursor:'#2ec9d3',cursorVisible:true,cursorMotion:'smooth',texture:'none',backgroundUrl:'',backgroundOpacity:.5,backgroundFit:'cover',backgroundPositionX:50,backgroundPositionY:50,scorePositionX:38,scorePositionY:12,inverted:false,glitter:false,sparkle:true,velocityReactive:true,noteMotion:true,drawScore:false,motionStrength:1,...effects};
      this.scrollMode=scrollMode;this.cameraMode='follow';
      this.osmd=null;
      this.timestamps=[]; this.beats=[]; this.audioTimestamps=[]; this.lines=[]; this.positions=[]; this.measureStarts=[];
      this.index=0; this.activeNodes=[]; this.noteTriggers=[]; this.tieContinuations=[];
      this.activeTime=-1; this.overlay=null; this.glitterLayer=null;
      this.drawItems=[];this.drawSystems=[];this.drawCompleteCount=0;this.drawingActive=false;this.lastSeekTime=0;
    }
    beatToSeconds(beat) {
      let lo=0, hi=this.tempoMap.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(this.tempoMap[mid].beat<=beat)lo=mid;else hi=mid-1;}
      const p=this.tempoMap[lo];
      return p.second+(beat-p.beat)*p.tempo_us/1e6;
    }
    scoreBeatToMidi(beat){
      const anchors=this.scoreAnchors;
      if(!anchors.length)return this.beatToSeconds(beat);
      let lo=0,hi=anchors.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(anchors[mid].beat<beat)lo=mid+1;else hi=mid;}
      if(lo<anchors.length&&Math.abs(anchors[lo].beat-beat)<1e-5)return anchors[lo].second;
      const tempoSecPerBeat=(()=>{
        const map=this.tempoMap||[];
        return map.length?Math.max(.04,(map[0].tempo_us||500000)/1e6):.5;
      })();
      if(lo===0){
        const a=anchors[0],b=anchors[1];
        const slope=b&&b.beat>a.beat?(b.second-a.second)/(b.beat-a.beat):tempoSecPerBeat;
        return Math.max(0,a.second+(beat-a.beat)*Math.max(.05,slope));
      }
      if(lo===anchors.length){
        const b=anchors.at(-1),a=anchors.at(-2);
        const slope=a&&b.beat>a.beat?(b.second-a.second)/(b.beat-a.beat):tempoSecPerBeat;
        return b.second+(beat-b.beat)*Math.max(.05,slope);
      }
      const a=anchors[lo-1],b=anchors[lo];
      return a.second+(b.second-a.second)*(beat-a.beat)/(b.beat-a.beat);
    }
    midiToAudio(midiSeconds) {
      const anchors=this.sync?.anchors;
      if(!Array.isArray(anchors)||anchors.length<2) return midiSeconds+this.offsetSec;
      let lo=0,hi=anchors.length-1;
      while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(anchors[mid].midi<=midiSeconds)lo=mid;else hi=mid-1;}
      const i=Math.min(lo,anchors.length-2);
      const a=anchors[i], b=anchors[i+1];
      return lerp(a.audio,b.audio,(midiSeconds-a.midi)/(b.midi-a.midi))+this.offsetSec;
    }
    // At matching score beats, prioritize the pitch-specific velocity. If a
    // transposing instrument or enharmonic spelling prevents matching, use the
    // median velocity of notes attacking on the same beat.
    getVelocity(beat,pitch=null) {
      if(!this.noteEvents.length) return 78; // For older projects without note events.
      const events=this.noteEvents;
      const margin=.18; // Less than a 16th-note step. Allows small MIDI humanization.
      let lo=0,hi=events.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(events[mid].beat<beat-margin)lo=mid+1;else hi=mid;}
      const candidates=[];
      for(let i=lo;i<events.length&&events[i].beat<=beat+margin;i++)candidates.push(events[i]);
      if(!candidates.length)return null; // Do not animate rests or non-attacks.
      const matching=Number.isInteger(pitch)?candidates.filter(e=>e.pitch===pitch):[];
      if(matching.length){matching.sort((a,b)=>Math.abs(a.beat-beat)-Math.abs(b.beat-beat));return matching[0].velocity;}
      // If the pitch is unknown/transposed, choose the median velocity from
      // the nearest chord, not an arbitrarily distant pitch.
      const minDistance=Math.min(...candidates.map(e=>Math.abs(e.beat-beat)));
      const chord=candidates.filter(e=>Math.abs(e.beat-beat)<=minDistance+.025)
        .map(e=>e.velocity).sort((a,b)=>a-b);
      return chord[Math.floor(chord.length/2)];
    }
    // A chord engraved at the same MusicXML timestamp can have staggered
    // MIDI note-on events (rolled chords/arpeggiando). Match each SVG notehead
    // by pitch and NEAREST MIDI attack, not by the single score cursor time.
    // Reusing an attack is prohibited, so repeated same-pitch notes remain distinct.
    matchAttack(beat, pitch, used, events=this.noteEvents){
      if(!Number.isInteger(pitch)||!events.length)return null;
      const target=this.beatToSeconds(beat);
      const pool=events===this.noteEvents?(this.eventsByPitch.get(pitch)||[]):events.filter(e=>e.pitch===pitch);
      const when=e=>Number.isFinite(e.second)?e.second:this.beatToSeconds(e.beat);
      let lo=0,hi=pool.length;
      while(lo<hi){const m=(lo+hi)>>>1;if(when(pool[m])<target-.85)lo=m+1;else hi=m;}
      let best=null,bestDiff=Infinity;
      for(let i=lo;i<pool.length;i++){
        const e=pool[i],tm=when(e);
        if(tm>target+.85)break;
        const diff=Math.abs(tm-target);
        if(!used.has(e)&&diff<bestDiff){best=e;bestDiff=diff;}
      }
      if(!best)return null;
      used.add(best);
      return best;
    }
    // Compute a camera target from measured score coordinates, interpolating
    // between time-stamped cursor locations (not jumping bar-by-bar).
    static cameraX(t,positions,viewportWidth,contentWidth,anchor=.38){
      if(!positions.length)return 0;
      let lo=0,hi=positions.length;
      while(lo<hi){const m=(lo+hi)>>>1;if(positions[m].audio<=t)lo=m+1;else hi=m;}
      const i=clamp(lo-1,0,positions.length-1),a=positions[i],b=positions[Math.min(i+1,positions.length-1)];
      const x=b.audio>a.audio?lerp(a.x,b.x,clamp((t-a.audio)/(b.audio-a.audio),0,1)):a.x;
      return clamp(x-viewportWidth*anchor,0,Math.max(0,contentWidth-viewportWidth));
    }
    // Deterministic playback cursor, evaluated at the same audio time in
    // the editor and the MP4 renderer. No CSS timers or requestAnimationFrame
    // interpolation that would make the rendered frames differ.
    static cursorAt(t,positions,mode='smooth'){
      if(!Array.isArray(positions)||positions.length===0)return null;
      let lo=0,hi=positions.length;
      while(lo<hi){const m=(lo+hi)>>>1;if(positions[m].audio<=t+1e-7)lo=m+1;else hi=m;}
      const i=clamp(lo-1,0,positions.length-1);
      const a=positions[i],b=positions[Math.min(i+1,positions.length-1)];
      const current={x:a.x,y:a.y,height:a.height||120};
      if(mode!=='smooth'||a===b||!Number.isFinite(a.audio)||!Number.isFinite(b.audio))return current;
      const dt=b.audio-a.audio;
      // Do not glide diagonally or backwards into the next engraved system.
      const sameSystem=Math.abs(b.y-a.y)<Math.max(24,Math.min(a.height||120,b.height||120)*.4)
        && b.x>=a.x-6;
      if(!sameSystem||dt<=1e-5)return current;
      // Hold on a sustained tone/fermata, then travel into the next attack.
      const travel=Math.min(.32,dt*.70);
      const p=smooth((t-(b.audio-travel))/Math.max(1e-5,travel));
      return {x:lerp(a.x,b.x,p),y:lerp(a.y,b.y,p),
        height:lerp(a.height||120,b.height||120,p)};
    }
    // Keep the output stable when exporting individual frames out of order.
    static dynamics(velocity,time,options={}){
      const strength=clamp(Number(options.motionStrength ?? 1),0,2);
      const v=options.velocityReactive===false?78:clamp(Number(velocity)||78,1,127);
      const expressive=Math.pow(v/127,1.4);
      const life=.54+.40*expressive;
      if(time<0||time>=life||strength===0)return {alive:false,opacity:0,dy:0,dx:0,scale:1,radius:0,velocity:v,intensity:0,energy:0};
      const fade=Math.pow(1-time/life,1.72);
      const attack=1-Math.exp(-time*55);
      const intensity=(.16+.84*expressive)*strength;
      const energy=fade*attack;
      // A soft note breathes while a hard accent gently rebounds.
      const bounce=Math.exp(-time*11)*Math.sin(time*25);
      return {alive:true,opacity:clamp((.20+.75*intensity)*energy,0,1),
        dy:-3.3*intensity*energy-1.3*intensity*bounce,
        dx:.65*intensity*bounce,
        scale:1+.105*intensity*energy+.028*intensity*bounce,
        radius:16+28*intensity,velocity:v,intensity,energy,life,progress:time/life};
    }
    setOffset(sec){this.offsetSec=Number(sec)||0;this.rebuildAudioAxis();}
    setSync(sync){this.sync=sync;this.rebuildAudioAxis();}
    // The hand belongs to a *staff*, not a screen Y coordinate. The same
    // staff remains the same hand when the score switches to the next system.
    // Prefer OSMD's piano-specific metadata; for two-staff instruments use
    // stable per-instrument staff IDs, never a global vertical median.
    static assignHands(events){
      const byInstrument=new Map();
      for(const e of events){
        const instrument=e.instrumentRef||'__default_instrument__';
        if(!byInstrument.has(instrument))byInstrument.set(instrument,new Set());
        if(Number.isFinite(e.staffId))byInstrument.get(instrument).add(e.staffId);
      }
      const ordered=new Map([...byInstrument].map(([key,ids])=>[key,[...ids].sort((a,b)=>a-b)]));
      for(const e of events){
        if(e.handHint==='upper'||e.handHint==='lower'){e.hand=e.handHint;continue;}
        const staves=ordered.get(e.instrumentRef||'__default_instrument__')||[];
        if(Number.isFinite(e.staffId)&&staves.length>=2){
          e.hand=e.staffId===staves[0]?'upper':'lower';
        }else if(Number.isFinite(e.staffId)){
          e.hand='upper';
        }else{
          // A malformed score with missing staff data: never let changing
          // screen position swap the two fixed light colors mid-piece.
          e.hand='upper';
        }
      }
      return events;
    }
    rebuildAudioAxis(){
      this.audioTimestamps=this.timestamps.map(t=>this.midiToAudio(t));
      this.lines.forEach(l=>l.audio=this.midiToAudio(l.midi));
      this.positions.forEach(p=>p.audio=this.midiToAudio(p.midi));
      this.noteTriggers.forEach(n=>{
        n.audio=this.midiToAudio(n.midi);
        n.endAudio=this.midiToAudio(Number.isFinite(n.midiEnd)?n.midiEnd:n.midi+.12);
      });
      this.tieContinuations.forEach(n=>{n.audio=this.midiToAudio(n.midi);n.endAudio=this.midiToAudio(n.midiEnd);});
      this.tieContinuations.sort((a,b)=>a.audio-b.audio);
      this.longestTie=Math.max(0,...this.tieContinuations.slice(0,10000).map(n=>n.endAudio-n.audio));
      if(this.tieContinuations.length>10000){for(const tie of this.tieContinuations.slice(10000))this.longestTie=Math.max(this.longestTie,tie.endAudio-tie.audio);}
      this.noteTriggers.sort((a,b)=>a.audio-b.audio);
      this.measureStarts.forEach(m=>m.audio=this.midiToAudio(m.midi));
      ScoreFollower.assignHands(this.noteTriggers);
      this.prepareCameraAccents();
      this.resolveCameraPoints();
      this.bindCameraPointTargets();
    }
    prepareDrawing(){
      this.drawItems=[];
      const rows=new Map();
      for(const note of this.noteTriggers){
        const key=note.systemKey??0;
        if(!rows.has(key))rows.set(key,{key,ys:[],times:[]});
        if(Number.isFinite(note.noteY))rows.get(key).ys.push(note.noteY);
        rows.get(key).times.push(note.audio);
      }
      const systems=[...rows.values()].map(row=>({key:row.key,
        y:row.ys.reduce((a,b)=>a+b,0)/Math.max(1,row.ys.length),
        first:Math.min(...row.times),last:Math.max(...row.times),lines:[],items:[]}));
      const svg=this.container.querySelector('svg');
      const viewportWidth=this.viewport.clientWidth||1000;
      const scale=this.viewport.getBoundingClientRect().width/viewportWidth||1;
      const containerBox=this.container.getBoundingClientRect();
      if(svg&&systems.length){
        const graphicSelector='path,line,polyline,polygon,rect,circle,ellipse,text,use';
        for(const el of svg.querySelectorAll(graphicSelector)){
          let rect;try{rect=el.getBoundingClientRect();}catch(_){continue;}
          if(!rect.width&&!rect.height)continue;
          const css=getComputedStyle(el);
          if(css.display==='none'||css.visibility==='hidden'||(css.stroke==='none'&&css.fill==='none'))continue;
          const width=rect.width/scale,height=rect.height/scale;
          const y=(rect.top+rect.height*.5-containerBox.top)/scale;
          let nearest=systems[0],distance=Infinity;
          for(const system of systems){const next=Math.abs(system.y-y);if(next<distance){distance=next;nearest=system;}}
          if(distance>=240)continue;
          const isStaffLine=(el.matches('path,line,polyline')&&width>=Math.max(90,viewportWidth*.18)
            &&height<=4&&css.fill==='none'&&css.stroke!=='none');
          if(isStaffLine){
            nearest.lines.push({el,
              originalClipPath:el.style.clipPath||'',originalWebkitClipPath:el.style.webkitClipPath||''});
            continue;
          }
          // The cursor itself controls visibility. This keeps every symbol in
          // lockstep and avoids estimating separate timings for beams, rests,
          // dynamics, tempo text, and other engraved objects.
          const right=(rect.right-containerBox.left)/scale;
          nearest.items.push({el,right,revealed:false,
            originalClipPath:el.style.clipPath||'',originalWebkitClipPath:el.style.webkitClipPath||''});
        }
      }
      for(const system of systems){
        system.items.sort((a,b)=>a.right-b.right);
        this.drawItems.push(...system.items);
      }
      this.drawSystems=systems;
    }
    setDrawClip(item,progress){
      const right=`${(100-(Math.max(0,Math.min(1,progress))*100)).toFixed(2)}%`;
      item.el.style.clipPath=`inset(0 ${right} 0 0)`;
      item.el.style.webkitClipPath=`inset(0 ${right} 0 0)`;
    }
    activateDrawing(){
      for(const item of this.drawItems){this.setDrawClip(item,0);item.revealed=false;}
      for(const system of this.drawSystems)for(const line of system.lines)this.setDrawClip(line,1);
      this.drawCompleteCount=0;this.drawingActive=true;
      this.updateDrawing(this.lastSeekTime);
    }
    deactivateDrawing(){
      for(const item of this.drawItems){item.el.style.clipPath=item.originalClipPath;item.el.style.webkitClipPath=item.originalWebkitClipPath;item.revealed=false;}
      for(const system of this.drawSystems)for(const line of system.lines){line.el.style.clipPath=line.originalClipPath;line.el.style.webkitClipPath=line.originalWebkitClipPath;}
      this.drawCompleteCount=0;this.drawingActive=false;
    }
    updateDrawing(time){
      if(!this.effects.drawScore){if(this.drawingActive)this.deactivateDrawing();return;}
      if(!this.drawingActive)this.activateDrawing();
      const cursor=ScoreFollower.cursorAt(time,this.positions,this.effects.cursorMotion);
      const offsetLeft=this.container.offsetLeft||0,offsetTop=this.container.offsetTop||0;
      let currentIndex=0;
      if(cursor&&Number.isFinite(cursor.y)&&this.drawSystems.length){
        const cursorY=cursor.y-offsetTop;
        let nearest=Infinity;
        for(let i=0;i<this.drawSystems.length;i++){
          const distance=Math.abs(this.drawSystems[i].y-cursorY);
          if(distance<nearest){nearest=distance;currentIndex=i;}
        }
      }
      for(let i=0;i<this.drawSystems.length;i++){
        const system=this.drawSystems[i];
        // Use the visible score cursor's row, not MIDI attack-time ranges.
        // A rest or a sync gap at a system boundary must not strand the draw
        // animation on the preceding row.
        // There is no following cursor position after the final attack to
        // carry the reveal past the last notehead/stem. Complete the last
        // system when its final MIDI attack sounds so its final symbols never
        // remain clipped for the rest of the video.
        const finalAttackReached=i===this.drawSystems.length-1&&time>=system.last-1e-4;
        const state=i<currentIndex||finalAttackReached?1:i===currentIndex?2:0;
        const cursorX=state===2&&cursor?cursor.x-offsetLeft:NaN;
        for(const item of system.items){
          const reveal=state===1||(state===2&&Number.isFinite(cursorX)&&item.right<=cursorX+1);
          if(item.revealed!==reveal){this.setDrawClip(item,reveal?1:0);item.revealed=reveal;}
        }
      }
    }
    colors(){
      const p=hex(this.effects.paper,'#fffdf6');
      const i=hex(this.effects.ink,'#181b22');
      return {paper:this.effects.inverted?i:p, ink:this.effects.inverted?p:i, staff:this.effects.inverted?p:hex(this.effects.staff,'#323a43'), accent:hex(this.effects.accent,'#2ec9d3'), glow:hex(this.effects.glow,'#68ddfa'), cursor:hex(this.effects.cursor,'#2ec9d3')};
    }
    buildEffectLayers(){
      this.container.style.position='relative';
      const background=document.createElement('div');background.className='score-background';
      const photo=document.createElement('div');photo.className='score-photo';background.appendChild(photo);
      const texture=document.createElement('div');texture.className='score-texture';background.appendChild(texture);
      this.stageRoot.prepend(background);
      this.bgLayer=background;this.photoLayer=photo;this.textureLayer=texture;
      const overlay=document.createElement('div');
      overlay.className='score-notes-overlay';
      this.container.appendChild(overlay);
      this.overlay=overlay;
      const playbackCursor=document.createElement('div');
      playbackCursor.className='score-playback-cursor';
      playbackCursor.setAttribute('aria-hidden','true');
      this.container.appendChild(playbackCursor);
      this.playbackCursor=playbackCursor;
      const ambient=document.createElement('div');
      ambient.className='score-glitter-overlay';
      this.stageRoot.appendChild(ambient);
      this.glitterLayer=ambient;
    }
    setEffects(effects){
      const wasDrawing=this.effects.drawScore;
      this.effects={...this.effects,...effects};
      if(this.drawItems.length){
        if(this.effects.drawScore&&!this.drawingActive)this.activateDrawing();
        else if(!this.effects.drawScore&&wasDrawing&&this.drawingActive)this.deactivateDrawing();
      }
      const {paper,ink,accent,glow,cursor}=this.colors();
      this.viewport.style.backgroundColor=this.stageRoot===this.viewport?paper:'transparent';
      this.stageRoot.style.backgroundColor=paper;
      this.container.style.color=ink;
      this.viewport.style.setProperty('--score-accent',accent);
      this.stageRoot.style.setProperty('--score-accent',accent);
      this.viewport.style.setProperty('--score-paper',paper);
      this.stageRoot.style.setProperty('--score-paper',paper);
      this.viewport.style.setProperty('--score-glow',glow);
      this.stageRoot.style.setProperty('--score-glow',glow);
      if(this.bgLayer){
        this.bgLayer.style.backgroundColor=paper;
        const validTextures=['none','paper','parchment','grain','linen','dots'];
        this.textureLayer.dataset.texture=validTextures.includes(this.effects.texture)?this.effects.texture:'none';
        // Asset URL is a project-specific same-origin endpoint, not a user URL.
        const url=String(this.effects.backgroundUrl||'');
        this.photoLayer.style.backgroundImage=url.startsWith('/api/projects/')?'url('+JSON.stringify(url)+')':'none';
        this.photoLayer.style.backgroundSize=this.effects.backgroundFit==='contain'?'contain':'cover';
        this.photoLayer.style.backgroundPosition=`${clamp(Number(this.effects.backgroundPositionX)||50,0,100)}% ${clamp(Number(this.effects.backgroundPositionY)||50,0,100)}%`;
        this.photoLayer.style.opacity=String(clamp(Number(this.effects.backgroundOpacity)||0,0,1));
      }
      if(this.glitterLayer)this.glitterLayer.style.display='none';
      // Re-loading OSMD is necessary to recolor the default black engraving;
      // caller reloads on paper/ink/inversion changes. Accent/effects are live.
      if(this.osmd?.cursor?.CursorOptions)this.osmd.cursor.CursorOptions.color=cursor;
      if(this.playbackCursor){
        this.playbackCursor.style.setProperty('--playback-cursor-color',cursor);
        this.playbackCursor.hidden=this.effects.cursorVisible===false;
      }
      if(this.activeNodes.length) this.colorActiveNodes();
    }
    static singleLineRules(rules){
      if(!rules)return;
      // OSMD's default SheetMaximumWidth (often ~32767px) breaks long pieces
      // into a second row even with RenderSingleHorizontalStaffline=true.
      // SVG backend supports greater widths than Canvas; keep all systems on one line.
      rules.SheetMaximumWidth=1000000;
      rules.RenderSingleHorizontalStaffline=true;
      rules.RenderXMeasuresPerLineAkaSystem=0;
      rules.NewSystemAtXMLNewSystemAttribute=false;
      rules.NewSystemAtXMLNewPageAttribute=false;
      rules.NewPageAtXMLNewPageAttribute=false;
      rules.NewPartAndSystemAfterFinalBarline=false;
    }
    async load(url){
      this.container.style.removeProperty('transform');this.cameraScale=1;
      if(this.cameraSpacer){this.cameraSpacer.style.width='0px';this.cameraSpacer.style.height='0px';}
      await window.loadOSMD();
      if(!window.opensheetmusicdisplay?.OpenSheetMusicDisplay)throw Error('OSMD 라이브러리를 불러오지 못했습니다.');
      const c=this.colors();
      const scorePosX=clamp(Number(this.effects.scorePositionX??38),0,100);
      const leftPad=16+Math.round((this.viewport.clientWidth||1080)*0.22*(scorePosX/100));
      const topPad=Number.isFinite(this.effects.scoreTopPadding)?Math.max(0,this.effects.scoreTopPadding):0;
      this.container.style.paddingLeft=`${leftPad}px`;
      this.container.style.paddingTop=`${topPad}px`;
      this.container.style.paddingRight='24px';
      this.container.style.paddingBottom='0px';
      // The engraving rules, not a giant HTML container width, control wrapping.
      // Oversizing the DOM used to create unexpected additional lines at high zoom.
      this.container.style.removeProperty('width');
      this.osmd=new opensheetmusicdisplay.OpenSheetMusicDisplay(this.container,{
        backend:'svg', autoResize:false, drawTitle:false, drawComposer:false,followCursor:false,
        renderSingleHorizontalStaffline:this.scrollMode==='horizontal',
        newSystemFromXML:false,newSystemFromNewPageInXML:false,newPageFromXML:false,
        defaultColorMusic:c.staff, defaultColorNotehead:c.ink,defaultColorStem:c.ink,defaultColorRest:c.ink,
        defaultColorLabel:c.ink, defaultColorTitle:c.ink,
        cursorsOptions:[{type:1,color:c.cursor,alpha:.3,follow:false}],
      });
      await this.osmd.load(url);
      if(this.scrollMode==='horizontal')ScoreFollower.singleLineRules(this.osmd.EngravingRules);
      this.osmd.zoom=this.zoom;
      if(this.osmd.EngravingRules)this.osmd.EngravingRules.StaffLineColor=c.staff;
      this.osmd.render();
      this.viewport.dataset.scrollMode=this.scrollMode;
      // Some OSMD releases put their wide SVG in a nested div. Force that
      // width into the scrollable layout, so the camera can reach later bars.
      if(this.scrollMode==='horizontal'){
        const svg=this.container.querySelector('svg');
        const width=Number(svg?.getAttribute('width')?.replace('px',''))||svg?.getBoundingClientRect().width||0;
        const finalWidth=Math.max(width,this.viewport.clientWidth*2);
        this.container.style.minWidth=`${Math.ceil(finalWidth+24)}px`;
      }else{this.container.style.removeProperty('min-width');}
      const systems=(this.osmd.GraphicSheet?.MusicPages||this.osmd.graphic?.MusicPages||[])
        .flatMap(p=>p.MusicSystems||[]);
      if(this.scrollMode==='horizontal'&&systems.length>1){
        throw Error(`싱글라인 렌더링이 ${systems.length}개 행으로 분할됐습니다. MusicXML 강제 개행/OSMD 렌더링 제한을 확인해야 합니다.`);
      }
      const cursor=this.osmd.cursor;
      cursor.reset();cursor.show();
      this.timestamps=[];this.beats=[];this.lines=[];this.positions=[];this.noteTriggers=[];this.tieContinuations=[];this.measureStarts=[];
      // Rebuild note queues whenever OSMD is re-rendered (zoom/ink/layout).
      this.scoreNoteMatches=new Map();
      for(const hit of this.scoreNoteMatchesSource){
        const key=`${Number(hit.beat).toFixed(6)}:${hit.pitch}`;
        if(!this.scoreNoteMatches.has(key))this.scoreNoteMatches.set(key,[]);
        this.scoreNoteMatches.get(key).push(hit);
      }
      this.tieLinks=new Map();
      for(const t of this.tieLinksSource){
        const key=`${Number(t.beat).toFixed(6)}:${t.pitch}`;
        if(!this.tieLinks.has(key))this.tieLinks.set(key,[]);
        this.tieLinks.get(key).push(t);
      }
      const usedMidiEvents=new Set();
      const seenGraphical=new Set();
      const scoreKeyCounts=new Map();
      const systemIds=new Map(); // stable IDs for OSMD graphical MusicSystem objects

      this._initialContainerBox=null;
      const viewportRect=this.viewport.getBoundingClientRect();
      let lastY=-Infinity,lastMeasureIndex=null;
      for(let i=0;i<100000 && !cursor.iterator.EndReached;i++){
        const stamp=cursor.iterator.currentTimeStamp;
        let val=Number(stamp?.RealValue);
        if(!Number.isFinite(val))val=Number(stamp?.Numerator)/Number(stamp?.Denominator);
        if(!Number.isFinite(val))break;
        const midiSec=this.scoreBeatToMidi(val*4);
        this.timestamps.push(midiSec);this.beats.push(val*4);
        // OSMD's iterator exposes the actual source measure index. Record
        // bar-start positions, including bars that begin with a rest. For a
        // written pickup or unusual repeat use the first visited timestamp.
        const measureIndex=Number(cursor.iterator.CurrentMeasureIndex);
        if(Number.isInteger(measureIndex)&&measureIndex!==lastMeasureIndex){
          const measure=cursor.iterator.CurrentMeasure;
          const absolute=Number(measure?.AbsoluteTimestamp?.RealValue);
          const firstBeat=Number.isFinite(absolute)&&absolute>=0&&absolute*4<=val*4+1e-5
            ?absolute*4:val*4;
          this.measureStarts.push({index:measureIndex,number:Number(measure?.MeasureNumber)||measureIndex+1,
            midi:this.scoreBeatToMidi(firstBeat),audio:0});
          lastMeasureIndex=measureIndex;
        }
        if(typeof cursor.GNotesUnderCursor==='function'){
          let graphical=[];
          try{graphical=cursor.GNotesUnderCursor()||[];}catch(e){}
          for(const gn of graphical){
            if(typeof gn?.sourceNote?.isRest==='function'?gn.sourceNote.isRest():Boolean(gn?.sourceNote?.isRest))continue;
            const node=gn?.getSVGGElement?.();
            if(!(node instanceof Element)||seenGraphical.has(node))continue;
            seenGraphical.add(node);
            const ht=Number(gn?.sourceNote?.halfTone);
            // MusicXML halfTone is semitones above C-1 in OSMD (+12 maps to MIDI).
            const pitch=Number.isFinite(ht)?Math.round(ht+12):null;
            const scoreBase=`${(val*4).toFixed(6)}:${pitch}`;
            const scoreOccurrence=scoreKeyCounts.get(scoreBase)||0;scoreKeyCounts.set(scoreBase,scoreOccurrence+1);
            const scoreKey=`${scoreBase}:${scoreOccurrence}`;
            // Use the exact score-to-MIDI pitch mapping. Nearest-in-time
            // lookup is wrong after a fermata or a substantially delayed note.
            const key=`${(val*4).toFixed(6)}:${pitch}`;
            let attack;
            if(this.scoreAlignment){
              const candidates=this.scoreNoteMatches.get(key)||[];
              attack=candidates.shift()||null;
            }else{
              attack=this.matchAttack(val*4,pitch,usedMidiEvents);
            }
            const tieLink=!attack?(this.tieLinks.get(key)||[]).shift():null;
            const origin=tieLink?this.scoreOrigins.get(`${Number(tieLink.origin_beat).toFixed(6)}:${pitch}`):null;
            if(attack||(tieLink&&origin)){
              // OSMD GraphicalNote -> GraphicalVoiceEntry -> GraphicalStaffEntry
              // -> GraphicalMeasure. The staff ID is stable across systems;
              // the MusicSystem object changes at each printed line break.
              const gm=gn?.parentVoiceEntry?.parentStaffEntry?.parentMeasure;
              const staff=gn?.sourceNote?.ParentStaff||gm?.ParentStaff;
              let handHint=null;
              try{
                if(gm?.isPianoRightHand?.())handHint='upper';
                else if(gm?.isPianoLeftHand?.())handHint='lower';
              }catch(_){ /* fall back to stable Staff.Id below */ }
              const staffId=Number(staff?.Id);
              const instrumentRef=staff?.ParentInstrument||null;
              const systemRef=gm?.ParentMusicSystem||gm?.ParentStaffLine?.parentSystem||null;
              const nr=node.getBoundingClientRect?.();
              let noteHeadNodes=[];
              try{noteHeadNodes=gn?.getNoteheadSVGs?.()||[];}catch(_){ /* use SVG markup fallback below */ }
              if(!noteHeadNodes.length){
                try{noteHeadNodes=[...node.querySelectorAll('.vf-notehead,[class*="notehead"]')];}catch(_){ /* old OSMD SVG */ }
              }
              let noteHeadRect=null;
              for(const head of noteHeadNodes){
                try{const r=head.getBoundingClientRect();if(r.width||r.height){noteHeadRect=r;break;}}catch(_){ /* skip detached SVG nodes */ }
              }
              const anchorRect=noteHeadRect||nr;
              const scale=viewportRect.width/this.viewport.clientWidth||1;
              const localY=anchorRect&&Number.isFinite(anchorRect.top)?this.viewport.scrollTop+(anchorRect.top-viewportRect.top)/scale+anchorRect.height*.5/scale:null;
              // Anchor lights to OSMD's actual notehead glyph, not the full
              // note group whose bounds also include stems, flags, and beams.
              // Store this geometry once per layout; every export
              // frame can then reuse it without N layout reads per active note.
              const containerBox=this._initialContainerBox||(this._initialContainerBox=this.container.getBoundingClientRect());
              const noteX=anchorRect&&(anchorRect.width||anchorRect.height)?(anchorRect.left+anchorRect.width*.5-containerBox.left)/scale:null;
              const noteY=anchorRect&&(anchorRect.width||anchorRect.height)?(anchorRect.top+anchorRect.height*.5-containerBox.top)/scale:null;
              const systemFallback=Number.isFinite(localY)?`y:${Math.round(localY/220)}`:'unknown';
              const systemToken=systemRef||systemFallback;
              if(!systemIds.has(systemToken))systemIds.set(systemToken,systemIds.size);
              if(attack){
                const midiOn=Number.isFinite(attack.second)?attack.second:this.beatToSeconds(attack.beat);
                const midiEnd=Number(attack.end_second);
                this.noteTriggers.push({el:node,midi:midiOn,
                    midiEnd:Number.isFinite(midiEnd)&&midiEnd>=midiOn?midiEnd:null,
                    velocity:attack.velocity,pitch,beat:val*4,scoreKey,measure:Number(gm?.MeasureNumber)||measureIndex+1,audio:0,localY,noteX,noteY,
                    staffId:Number.isFinite(staffId)?staffId:null,instrumentRef,handHint,
                    systemKey:systemIds.get(systemToken)});
              }else if(origin){
                const begin=this.scoreBeatToMidi(val*4);
                const end=Number(origin.end_second);
                // A written tied note is a held continuation, never a fresh note-on.
                this.tieContinuations.push({el:node,midi:begin,
                    midiEnd:Number.isFinite(end)?Math.max(begin+.05,end):begin+.65,
                    velocity:origin.velocity,pitch,beat:val*4,scoreKey,measure:Number(gm?.MeasureNumber)||measureIndex+1,audio:0,endAudio:0,noteX,noteY});
              }
            }
          }
        }
        const r=cursor.cursorElement?.getBoundingClientRect();
        if(r&&Number.isFinite(r.top)){
          const scale=viewportRect.width/this.viewport.clientWidth||1;
          const x=this.viewport.scrollLeft+(r.left-viewportRect.left)/scale;
          const y=this.viewport.scrollTop+(r.top-viewportRect.top)/scale;
          this.positions.push({midi:midiSec,x,y,height:Math.max(1,r.height/scale),audio:0});
          if(y>lastY+32||!this.lines.length){
            this.lines.push({midi:midiSec,y:y,audio:0});
            lastY=y;
          }
        }
        cursor.next();
      }
      if(!this.timestamps.length)throw Error('MusicXML에서 음표 위치를 찾지 못했습니다.');
      cursor.reset();cursor.hide();
      this.index=0;
      this.cameraBaseWidth=Math.max(this.viewport.clientWidth,this.container.scrollWidth,this.cameraSpace?.scrollWidth||0);
      this.cameraBaseHeight=Math.max(this.viewport.clientHeight,this.container.scrollHeight,this.cameraSpace?.scrollHeight||0);
      this.buildEffectLayers();
      this.rebuildAudioAxis();
      this.prepareDrawing();
      this.setEffects({});
      this.seek(0,true);
      return this.timestamps.length;
    }
    updatePlaybackCursor(audioSeconds){
      if(!this.playbackCursor)return;
      if(this.effects.cursorVisible===false){this.playbackCursor.hidden=true;return;}
      const p=ScoreFollower.cursorAt(audioSeconds,this.positions,this.effects.cursorMotion);
      if(!p){this.playbackCursor.hidden=true;return;}
      // Position values are measured in score-scroll content coordinates;
      // the cursor DOM node is attached inside the child score container.
      const left=this.container.offsetLeft||0,top=this.container.offsetTop||0;
      this.playbackCursor.hidden=false;
      this.playbackCursor.style.left=`${(p.x-left).toFixed(2)}px`;
      this.playbackCursor.style.top=`${(p.y-top).toFixed(2)}px`;
      this.playbackCursor.style.height=`${p.height.toFixed(2)}px`;
    }
    findIndex(audioTime){
      const axis=this.audioTimestamps.length?this.audioTimestamps:this.timestamps;
      if(!axis.length)return 0;
      let lo=0,hi=axis.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(axis[mid]<=audioTime+1e-5)lo=mid+1;else hi=mid;}
      return clamp(lo-1,0,axis.length-1);
    }
    seek(audioSeconds,force=false){
      if(!this.osmd)return;
      const target=this.findIndex(audioSeconds);
      this.lastSeekTime=audioSeconds;
      // All note positions were sampled during load. Replaying the native
      // OSMD cursor per frame only introduced hard steps and wasted time.
      this.index=target;
      this.scrollAt(audioSeconds);
      this.updateDrawing(audioSeconds);
      this.updatePlaybackCursor(audioSeconds);
      this.updateNoteEffects(audioSeconds, target!==this._highlightIndex||force);
      this._highlightIndex=target;
      this.updateAmbient(audioSeconds);
    }
    static cameraCursorAt(t,positions){
      if(!positions?.length)return null;
      let lo=0,hi=positions.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(positions[mid].audio<=t+1e-7)lo=mid+1;else hi=mid;}
      const i=clamp(lo-1,0,positions.length-1),a=positions[i],b=positions[Math.min(i+1,positions.length-1)];
      if(a===b||!Number.isFinite(a.audio)||!Number.isFinite(b.audio)||b.audio<=a.audio)return {x:a.x,y:a.y};
      const sameSystem=Math.abs(b.y-a.y)<Math.max(24,Math.min(a.height||120,b.height||120)*.4)&&b.x>=a.x-6;
      if(!sameSystem)return {x:a.x,y:a.y};
      const p=smooth((t-a.audio)/(b.audio-a.audio));
      return {x:lerp(a.x,b.x,p),y:lerp(a.y,b.y,p)};
    }
    resolveCameraPoints(){
      const byKey=new Map();
      for(const note of [...this.noteTriggers,...this.tieContinuations])if(note.scoreKey)byKey.set(note.scoreKey,note);
      this.cameraPoints=this.cameraPointsRaw.map(point=>{
        const note=byKey.get(point.key);if(!note)return null;
        return Number.isFinite(note.noteX)&&Number.isFinite(note.noteY)?{...point,time:note.audio,x:note.noteX,y:note.noteY,beat:note.beat,pitch:note.pitch,measure:note.measure}:null;
      }).filter(Boolean).sort((a,b)=>a.time-b.time);
    }
    bindCameraPointTargets(){
      const editor=()=>window.ScoreCameraPointEditor;
      for(const note of [...this.noteTriggers,...this.tieContinuations]){
        if(!note.el||!note.scoreKey||note._cameraPointBound)continue;
        note._cameraPointBound=true;
        note.el.addEventListener('click',event=>{
          const tool=editor();if(!tool?.active?.())return;
          event.preventDefault();event.stopPropagation();
          tool.add({key:note.scoreKey,time:note.audio,beat:note.beat,pitch:note.pitch,measure:note.measure});
        });
        note.el.classList.toggle('camera-point-selectable',Boolean(editor()?.active?.()));
      }
    }
    setCameraPointPicking(active){
      for(const note of [...this.noteTriggers,...this.tieContinuations])note.el?.classList.toggle('camera-point-selectable',Boolean(active));
    }
    setCameraPoints(points){
      this.cameraPointsRaw=Array.isArray(points)?points:[];this.resolveCameraPoints();
    }
    prepareCameraAccents(){
      const groups=[];
      for(const note of this.noteTriggers){
        if(!Number.isFinite(note.audio))continue;
        const last=groups.at(-1);
        if(last&&note.audio-last.time<=.075&&note.systemKey===last.systemKey){last.velocity=Math.max(last.velocity,Number(note.velocity)||0);last.count++;}
        else groups.push({time:note.audio,systemKey:note.systemKey,velocity:Number(note.velocity)||0,count:1});
      }
      if(!groups.length){this.cameraAccents=[];return;}
      const velocities=groups.map(g=>g.velocity).sort((a,b)=>a-b),percentile=velocities[Math.min(velocities.length-1,Math.floor(velocities.length*.86))]||80,median=velocities[Math.floor(velocities.length*.5)]||80;
      const threshold=Math.max(78,percentile),hasVelocityContrast=percentile-median>=6,accents=[];
      for(let i=0;i<groups.length;i++){
        const group=groups[i],prior=groups.slice(Math.max(0,i-8),i).map(g=>g.velocity).sort((a,b)=>a-b),baseline=prior.length?prior[Math.floor(prior.length/2)]:threshold,jump=group.velocity-baseline;
        const loudPeak=hasVelocityContrast&&group.velocity>=threshold,suddenJump=group.velocity>=74&&jump>=24;
        if(!loudPeak&&!suddenJump&&group.count<5)continue;
        const previous=accents.at(-1),intensity=clamp(Math.max(loudPeak?(group.velocity-threshold+16)/42:0,(jump-10)/36,group.count>=5?.72:.4),.4,1);
        if(previous&&group.time-previous.time<1.15){if(intensity>previous.intensity+.12){previous.time=group.time;previous.velocity=group.velocity;previous.intensity=intensity;}continue;}
        accents.push({time:group.time,velocity:group.velocity,intensity});
      }
      this.cameraAccents=accents;
    }
    cameraPulseAt(t){
      const events=this.cameraAccents||[];let lo=0,hi=events.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(events[mid].time<=t)lo=mid+1;else hi=mid;}
      let intensity=0,ageOfPeak=0;
      for(let i=lo-1;i>=0&&t-events[i].time<1.45;i--){const age=t-events[i].time,attack=smooth(age/.18),env=age<.3?attack:1-smooth((age-.3)/1.25),amount=env*events[i].intensity;if(amount>intensity){intensity=amount;ageOfPeak=age;}}
      if(intensity<=.001)return {scale:1,x:0,y:0};
      const attack=smooth(ageOfPeak/.035),shakeEnv=ageOfPeak<.08?attack:1-smooth((ageOfPeak-.08)/.42);
      return {scale:1+intensity*.31,x:Math.sin(ageOfPeak*Math.PI*10.4)*intensity*11*shakeEnv,y:Math.sin(ageOfPeak*Math.PI*12.8+.8)*intensity*7*shakeEnv};
    }
    cameraPointAt(t){
      let best=null,amount=0,ageOfPeak=0,focusWeight=0;
      for(const point of this.cameraPoints){
        const age=t-point.time;if(age<0)continue;
        const duration=clamp(Number(point.duration)||1.6,.4,5),attack=smooth(age/.28);
        const env=age<.35?attack:1-smooth((age-.35)/duration);
        const strength=clamp((Number(point.zoom)||1.3)-1,.05,.6)*env;
        if(strength>amount){amount=strength;best=point;ageOfPeak=age;focusWeight=env;}
      }
      const follow=ScoreFollower.cameraCursorAt(t,this.positions);
      if(!best||amount<.001)return {scale:1,x:0,y:0,cursor:follow};
      const shake=clamp(Number(best.shake)||0,0,1),shakeEnv=ageOfPeak<.08?smooth(ageOfPeak/.035):1-smooth((ageOfPeak-.08)/.42);
      const phase=ageOfPeak*Math.PI*10.4;
      return {scale:1+amount,x:Math.sin(phase)*shake*11*shakeEnv,y:Math.sin(phase*1.23+.8)*shake*7*shakeEnv,cursor:follow?{x:lerp(follow.x,best.x,focusWeight),y:lerp(follow.y,best.y,focusWeight)}:{x:best.x,y:best.y},point:best};
    }
    updateDynamicCamera(t){
      const active=this.cameraMode==='points'||this.cameraMode==='dynamic';
      const pulse=this.cameraMode==='points'?this.cameraPointAt(t):this.cameraMode==='dynamic'?this.cameraPulseAt(t):{scale:1,x:0,y:0};
      const cursor=pulse.cursor||ScoreFollower.cameraCursorAt(t,this.positions)||{x:this.container.offsetLeft||0,y:this.container.offsetTop||0};
      const scale=pulse.scale;this.cameraScale=scale;this.cameraPivotX=cursor.x;this.cameraPivotY=cursor.y;
      if(this.container){
        const ox=this.container.offsetLeft||0,oy=this.container.offsetTop||0;
        this.container.style.transformOrigin=`${(cursor.x-ox).toFixed(2)}px ${(cursor.y-oy).toFixed(2)}px`;
        this.container.style.transform=active&& (scale!==1||pulse.x||pulse.y)
          ?`translate(${pulse.x.toFixed(2)}px,${pulse.y.toFixed(2)}px) scale(${scale.toFixed(4)})`:'';
      }
      if(this.cameraSpacer&&this.cameraBaseWidth&&this.cameraBaseHeight){
        const padX=active&&(scale>1.001||Math.abs(pulse.x)>.1)?28:0;
        const padY=active&&(scale>1.001||Math.abs(pulse.y)>.1)?20:0;
        this.cameraSpacer.style.width=Math.ceil(this.cameraBaseWidth*scale+padX)+'px';
        this.cameraSpacer.style.height=Math.ceil(this.cameraBaseHeight*scale+padY)+'px';
      }
      return {pulse,cursor,scale};
    }
    // Music score stays one vertically scrollable document. Scroll movement is
    // interpolated around system transitions (not page flips).
    scrollAt(t){
      const {pulse,cursor,scale}=this.updateDynamicCamera(t);
      if(this.cameraMode==='fixed')return;
      const dynamic=this.cameraMode==='points'||this.cameraMode==='dynamic';
      const maxX=Math.max(0,(this.cameraBaseWidth||this.viewport.scrollWidth)*scale-this.viewport.clientWidth+(dynamic&&(scale>1.001||Math.abs(pulse.x)>.1)?28:0));
      const maxY=Math.max(0,(this.cameraBaseHeight||this.viewport.scrollHeight)*scale-this.viewport.clientHeight+(dynamic&&(scale>1.001||Math.abs(pulse.y)>.1)?20:0));
      const pivotX=this.cameraPivotX??(this.container.offsetLeft||0),pivotY=this.cameraPivotY??(this.container.offsetTop||0);
      const screenX=x=>pivotX+(x-pivotX)*scale;
      const screenY=y=>pivotY+(y-pivotY)*scale;
      if(this.scrollMode==='horizontal'){
        if(!this._scoreContentWidth){
          const widths=this.container.querySelectorAll?Array.from(this.container.querySelectorAll('svg')).map(el=>el.getBoundingClientRect().width):[];
          this._scoreContentWidth=Math.max(this.container.scrollWidth,...widths);
        }
        const contentWidth=Math.max(this._scoreContentWidth,this.cameraBaseWidth||0)*scale;
        const anchorBase=clamp(Number(this.effects.scorePositionX??38)/100,.05,.95);
        const anchor=this.cameraMode==='cinematic'?clamp(anchorBase+.016*Math.sin(t*.13),.05,.95):anchorBase;
        this.viewport.scrollLeft=dynamic&&cursor
          ?clamp(screenX(cursor.x)-this.viewport.clientWidth*clamp(anchorBase,.32,.48),0,Math.max(maxX,contentWidth-this.viewport.clientWidth))
          :ScoreFollower.cameraX(t,this.positions,this.viewport.clientWidth,contentWidth,anchor);
        this.viewport.scrollTop=0;
        return;
      }
      if(!this.lines.length)return;
      if(this.scrollMode==='page'&&!dynamic){
        const c=this.osmd.cursor.cursorElement,pos=c?.getBoundingClientRect();
        if(pos){const vr=this.viewport.getBoundingClientRect();
          this.viewport.scrollTop=Math.max(0,this.viewport.scrollTop+pos.top-vr.top-this.viewport.clientHeight*.38);}
        return;
      }
      const maxScroll=dynamic?maxY:Math.max(0,this.container.scrollHeight-this.viewport.clientHeight);
      const scorePosY=clamp((Number(this.effects.scorePositionY)||12)/100,0,1);
      const focusY=dynamic?.48:(.16+scorePosY*.54);
      const target=l=>clamp((dynamic?screenY(l.y):l.y)-this.viewport.clientHeight*focusY,0,maxScroll);
      if(dynamic&&cursor){
        this.viewport.scrollLeft=clamp(screenX(cursor.x)-this.viewport.clientWidth*clamp(Number(this.effects.scorePositionX??38)/100,.32,.48),0,maxX);
      }else this.viewport.scrollLeft=0;
      let scroll=target(this.lines[0]);
      for(let i=1;i<this.lines.length;i++){
        const boundary=this.lines[i].audio,start=boundary-1.25,end=boundary+.2;
        if(t<start)break;
        if(t<end){scroll=lerp(target(this.lines[i-1]),target(this.lines[i]),smooth((t-start)/(end-start)));break;}
        scroll=target(this.lines[i]);
      }
      this.viewport.scrollTop=scroll;
    }
    clearActiveNodes(){
      for(const {el} of this.activeNodes){
        el.classList.remove('score-glowing','score-note-moving');
        el.style.removeProperty('--score-note-active');
        el.style.removeProperty('translate');
        el.style.removeProperty('scale');
        el.style.removeProperty('opacity');
        el.style.removeProperty('--score-glow-blur');
      }
      this.activeNodes=[];
    }
    eventLightColor(velocity){
      if(window.ScoreStudio?.noteLightColor)
        return window.ScoreStudio.noteLightColor(this.effects,velocity,this.colors().accent,this.velocityRange);
      return this.colors().accent;
    }
    activeTies(t){
      // Binary-search the note time window rather than walking all earlier
      // tie continuations on every 30fps export frame.
      const events=this.tieContinuations||[];
      const bound=t-(this.longestTie||0)-.001;
      let lo=0,hi=events.length;
      while(lo<hi){const m=(lo+hi)>>>1;if(events[m].audio<bound)lo=m+1;else hi=m;}
      const active=[];
      for(let i=lo;i<events.length&&events[i].audio<=t;i++)
        if(events[i].endAudio>=t)active.push(events[i]);
      return active;
    }
    colorActiveNodes(){
      this.activeNodes.forEach(({el,velocity})=>{
        el.style.setProperty('--score-note-active',this.eventLightColor(velocity));
      });
    }
    updateNoteEffects(t,changed){
      const effect=this.effects;
      // The active events live on the AUDIO axis, one event per physical key
      // attack. Therefore rolled chords twinkle in played order, not all at once.
      this.clearActiveNodes();
      if(this.overlay)this.overlay.replaceChildren();
      if(!effect.sparkle&&!effect.noteMotion)return;
      const events=this.noteTriggers;
      let lo=0,hi=events.length;
      while(lo<hi){const m=(lo+hi)>>>1;if(events[m].audio<t-1.05)lo=m+1;else hi=m;}
      // Ties continue across a bar without another MIDI attack: illuminate
      // the continuation head with the ORIGINAL velocity/color, not a burst.
      if(effect.sparkle){
        for(const hold of this.activeTies(t)){
          const el=hold.el;
          const remaining=clamp((hold.endAudio-t)/.28,0,1);
          el.classList.add('score-glowing');
          el.style.setProperty('--score-note-active',this.eventLightColor(hold.velocity));
          el.style.setProperty('--score-glow-blur',`${(1.8+3.2*remaining).toFixed(2)}px`);
          this.activeNodes.push({el,velocity:hold.velocity});
        }
      }
      const box=this.container.getBoundingClientRect();
      for(let i=lo;i<events.length&&events[i].audio<=t+.03;i++){
        const entry=events[i],elapsed=t-entry.audio;
        const dyn=ScoreFollower.dynamics(entry.velocity,elapsed,effect);
        if(!dyn.alive)continue;
        const el=entry.el;
        const noteLightColor=this.eventLightColor(entry.velocity);
        this.activeNodes.push({el,velocity:entry.velocity});
        el.classList.toggle('score-glowing',Boolean(effect.sparkle));
        el.classList.toggle('score-note-moving',Boolean(effect.noteMotion));
        if(effect.noteMotion){
          el.style.setProperty('translate',`${dyn.dx.toFixed(3)}px ${dyn.dy.toFixed(3)}px`);
          el.style.setProperty('scale',dyn.scale.toFixed(4));
        }
        el.style.setProperty('--score-note-active',noteLightColor);
        el.style.setProperty('--score-glow-blur',`${(1.5+dyn.intensity*5).toFixed(2)}px`);
        if(!effect.sparkle||!this.overlay)continue;
        // Recompute only when a note was not available at layout prepass.
        let cx=entry.noteX,cy=entry.noteY;
        if(!Number.isFinite(cx)||!Number.isFinite(cy)){
          const r=el.getBoundingClientRect();
          if(!r.width||!r.height)continue;
          const scale=this.viewport.getBoundingClientRect().width/this.viewport.clientWidth||1;
          cx=(r.left+r.width*.5-box.left)/scale;
          cy=(r.top+r.height*.5-box.top)/scale;
        }
        const aura=document.createElement('i');aura.className='note-aura';
        aura.style.left=`${cx}px`;aura.style.top=`${cy}px`;
        aura.style.width=aura.style.height=`${dyn.radius*2}px`;
        aura.style.opacity=String(dyn.opacity*.8);
        aura.style.setProperty('--score-accent',noteLightColor);
        this.overlay.appendChild(aura);
        // Expanding translucent ring: smooth, restrained, deterministic.
        const ring=document.createElement('i');ring.className='note-halo';
        ring.style.left=`${cx}px`;ring.style.top=`${cy}px`;
        ring.style.width=ring.style.height=`${18+dyn.progress*dyn.radius*2.1}px`;
        ring.style.opacity=String(dyn.opacity*(1-dyn.progress)*.68);
        ring.style.setProperty('--score-glow',noteLightColor);
        this.overlay.appendChild(ring);
        // An arpeggio leaves a short curved-feeling streak following each
        // individual note; no random numbers/real-time CSS clocks are used.
        const trails=Math.round(1+Math.min(2,dyn.intensity));
        for(let j=0;j<trails;j++){
          const trail=document.createElement('i');trail.className='note-trail';
          const phase=elapsed*13+j*2.4+entry.pitch*.15;
          trail.style.left=`${cx+Math.sin(phase)*13*dyn.progress}px`;
          trail.style.top=`${cy-7-22*dyn.progress-j*6}px`;
          trail.style.width=`${12+dyn.intensity*17}px`;
          trail.style.opacity=String(dyn.opacity*(.34-j*.075));
          trail.style.setProperty('--score-glow',noteLightColor);
          trail.style.transform=`translate(-50%,-50%) rotate(${-52+j*31}deg)`;
          this.overlay.appendChild(trail);
        }
        const count=Math.min(9,Math.max(1,Math.round(1+dyn.intensity*4)));
        for(let j=0;j<count;j++){
          const theta=j*2.399+entry.pitch*.37+elapsed*1.5;
          const radius=6+j*2.5+elapsed*20*dyn.intensity;
          const star=document.createElement('i');star.className='note-star';
          star.style.left=`${cx+Math.cos(theta)*radius}px`;
          star.style.top=`${cy+Math.sin(theta)*radius*.75-7*dyn.progress}px`;
          star.style.opacity=String(dyn.opacity*(.35+.65*Math.sin(elapsed*17+j*2)**2));
          star.style.setProperty('--score-accent',noteLightColor);
          star.style.transform=`translate(-50%,-50%) rotate(45deg) scale(${(.25+dyn.intensity*.58).toFixed(3)})`;
          this.overlay.appendChild(star);
        }
      }
    }
    updateAmbient(t){ return; }
  }
  window.ScoreFollower=ScoreFollower;
})();
