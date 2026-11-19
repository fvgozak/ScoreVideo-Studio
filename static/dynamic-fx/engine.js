import {DEFAULTS,voiceAmplitude,particleLifetime,curlFromDensity,colorFromVelocity,intensityFromVelocity,resonanceEstimate} from './dynamics.js?v=aurora3';
import {createNoteOnIndex,noteActivityAt,smoothFlow} from './noteDensity.js?v=dynamic16h';

// ScoreMotion supplies already synchronized seconds and its own playback clock.
function bpmAtTime(song,time){
  let bpm=120;
  for(const tempo of song.tempos||[]){if(tempo.time>time+1e-7)break;bpm=tempo.bpm;}
  return bpm;
}

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function buildNoteRects(song){
  const stacks=new Map(),notes=[];
  const ordered=[...song.events].sort((a,b)=>a.time-b.time || (a.type==='off'?-1:a.type==='on'?1:0)-(b.type==='off'?-1:b.type==='on'?1:0));
  for(const e of ordered){
    if(e.type!=='on'&&e.type!=='off')continue;
    const key=`${e.track??0}/${e.channel}/${e.midi}`;
    if(e.type==='on'){
      if(!stacks.has(key))stacks.set(key,[]);
      const note={start:e.time,end:song.duration,midi:e.midi,velocity:e.velocity,channel:e.channel,noteIndex:e.noteIndex,staffColor:e.staffColor||null};
      notes.push(note);stacks.get(key).push(note);
    }else{
      const st=stacks.get(key);
      if(st?.length){const note=st.shift();note.end=Math.max(note.start+.05,e.time);}
    }
  }
  return notes;
}
export class MidiFXEngine{
  constructor(song,settings={...DEFAULTS}){
    this.settings=settings;this.load(song);this.onNote=()=>{};this.onRelease=()=>{};
  }
  load(song){this.song=song;this.notes=buildNoteRects(song);this.noteOnTimes=createNoteOnIndex(song);this.seek(0);}
  seek(time){
    this.time=0;this.cursor=0;this.voices=[];this.channels=new Uint8Array(16);
    this.lastVelocity=0;this.lastMidi=60;this.triggerCount=0;
    this.liveNoteTimes=[];this.flowLevel=curlFromDensity(0,this.settings);
    // t=0 must leave the first tick in the queue, so its attack fires on play.
    if(time>0)this.advance(clamp(time,0,this.song.duration),true);
    // Seeking is random access: use the actual density at the destination,
    // without simulating a fake long transition from the beginning.
    this.flowLevel=this.targetFlow();
  }
  activityAt(time=this.time){return noteActivityAt(this.noteOnTimes,time,{
    longWindow:this.settings.densityWindowSec,shortWindow:this.settings.densityShortWindowSec,
    fastWeight:this.settings.densityFastWeight,liveNoteTimes:this.liveNoteTimes
  })}
  densityAt(time=this.time){return this.activityAt(time).long}
  targetFlow(){return curlFromDensity(this.activityAt().rate,this.settings)}
  get bpm(){return bpmAtTime(this.song,this.time)}
  get pedal(){return Math.max(...this.channels)}
  pedalFor(channel){return this.channels[channel]||0}
  releaseVoice(v,time){v.state='released';v.releasedAt=time;this.onRelease?.(v)}
  processEvent(e,skipFX=false){
    const time=e.time,channel=e.channel??0;
    if(e.type==='pedal'){
      const previous=this.channels[channel];this.channels[channel]=e.value;
      if(previous>=64&&e.value<64){for(const v of this.voices)if(v.channel===channel&&v.state==='sustained')this.releaseVoice(v,time)}
    } else if(e.type==='on'){
      const v={id:++this.triggerCount,midi:e.midi,channel,velocity:e.velocity,startedAt:time,state:'held',releasedAt:null,noteOffAt:null,phase:0,track:e.track??0,noteIndex:e.noteIndex,staffColor:e.staffColor||null};
      this.voices.push(v);this.lastVelocity=e.velocity;this.lastMidi=e.midi;
      if(!skipFX)this.onNote?.(v);
    } else if(e.type==='off'){
      const v=this.voices.find(v=>v.midi===e.midi&&v.channel===channel&&v.state==='held');
      if(v){v.noteOffAt=time;if(this.channels[channel]>=64)v.state='sustained';else this.releaseVoice(v,time);}
    }
  }
  advance(target,skipFX=false){
    if(target<this.time-0.00001){this.seek(target);return;}
    const elapsed=Math.max(0,target-this.time);
    while(this.cursor<this.song.events.length&&this.song.events[this.cursor].time<=target+1e-7){
      this.processEvent(this.song.events[this.cursor++],skipFX);
    }
    this.time=target;
    this.flowLevel=smoothFlow(this.flowLevel,this.targetFlow(),elapsed,
      this.settings.densityAttack,this.settings.densityRelease);
    this.voices=this.voices.filter(v=>v.state!=='released'||target-(v.releasedAt??target)<8);
  }
  inject(midi,velocity=96,duration=.5){
    const time=this.time,channel=15;
    const v={id:++this.triggerCount,midi,channel,velocity,startedAt:time,state:'held',releasedAt:null,noteOffAt:null,liveOffTime:time+duration};
    this.voices.push(v);this.liveNoteTimes.push(time);this.lastVelocity=velocity;this.lastMidi=midi;this.onNote?.(v);return v;
  }
  updateLive(){for(const v of this.voices){if(v.state==='held'&&v.liveOffTime!==undefined&&this.time>=v.liveOffTime)this.releaseVoice(v,v.liveOffTime)}}
  keyLights(){
    const out=new Float32Array(88*4),intensity=new Float32Array(88);
    // Different instruments can sound the same physical key. In linked mode
    // blend their active colors by energy; keep the strongest key intensity.
    const linked=this.settings.staffKeyboardEnabled===true;
    const weights=linked?new Float32Array(88):null;
    for(const v of this.voices){
      if(v.midi<21||v.midi>108)continue;
      const amp=voiceAmplitude(v,this.time,this.settings,this.pedalFor(v.channel));
      if(amp<.004)continue;
      const idx=v.midi-21,level=intensityFromVelocity(v.velocity,this.settings)*amp;
      const c=v.staffColor||colorFromVelocity(v.velocity,this.settings);
      if(linked){
        weights[idx]+=level;
        for(let i=0;i<3;i++)out[idx*4+i]+=c[i]*level;
        intensity[idx]=Math.max(intensity[idx],level);
      }else if(level>=intensity[idx]){
        intensity[idx]=level;
        out.set([c[0],c[1],c[2],level],idx*4);
      }
    }
    if(linked)for(let i=0;i<88;i++)if(weights[i]>0){
      for(let channel=0;channel<3;channel++)out[i*4+channel]/=weights[i];
      out[i*4+3]=intensity[i];
    }
    return out;
  }
  keyPressTargets(){
    const out=new Float32Array(88);
    for(const voice of this.voices){
      if(voice.state!=='held'||voice.midi<21||voice.midi>108)continue;
      const index=voice.midi-21;
      out[index]=Math.max(out[index],.72+.28*Math.min(127,Math.max(1,voice.velocity))/127);
    }
    return out;
  }
  readout(){const activity=this.activityAt();return {bpm:this.bpm,pedal:this.pedal,velocity:this.lastVelocity,flow:this.flowLevel,
    densityCount:activity.long.count,shortCount:activity.short.count,notesPerSecond:activity.rate,
    longRate:activity.long.rate,shortRate:activity.short.rate,densityDelta:activity.delta,
    voices:this.voices.filter(v=>v.state!=='released').length}}
}

function hash(n){let a=Math.sin(n*127.1+37.719)*43758.5453123;return a-Math.floor(a)}
// Analytic 2-D divergence-free curl of a scalar stream function.
// ψ(x,y,t) = Σ aᵢ sin(kᵢx+ωᵢt) sin(lᵢy−νᵢt)
// velocity = (∂ψ/∂y, −∂ψ/∂x); distinct from other project sources.
export function curlField(x,y,t,amount){
  const modes=[[.62,1.31,.55,.31,.47],[1.18,.74,.21,.45,.21],[2.22,1.85,.28,.73,.065]];
  let vx=0,vy=0;
  for(const [kx,ky,wx,wy,a] of modes){
    const A=kx*x+wx*t,B=ky*y-wy*t;
    vx+=a*ky*Math.sin(A)*Math.cos(B);
    vy-=a*kx*Math.cos(A)*Math.sin(B);
  }
  return [vx*amount,vy*amount];
}
export class ParticleField{
  constructor(engine,settings){this.engine=engine;this.settings=settings;this.particles=[];this.counter=0;this.accum=0;this.seed=1;}
  random(){this.seed=(1664525*this.seed+1013904223)>>>0;return this.seed/4294967296;}
  clear(){this.particles=[];this.accum=0;this.seed=1;}
  onNote(v){
    const burst=Math.floor((7+23*v.velocity/127)*this.settings.particleDensity);
    for(let i=0;i<burst;i++)this.spawn(v,true);
  }
  spawn(v,burst=false){
    if(!this.settings.showParticles)return;
    const pos=keyPosition(v.midi);if(!pos)return;
    const pedal=this.engine.pedalFor(v.channel);
    const t=this.engine.time;
    const life=particleLifetime({velocity:v.velocity,pedal,held:v.state!=='released',releaseAge:0},this.settings)
      *(this.settings.audioReactive?1+.45*(this.audioRms||0):1);
    const a=this.random(),b=this.random(),c=this.random();
    const kind=a<.11?2:a<.23?1:0;
    const color=v.staffColor||colorFromVelocity(v.velocity,this.settings);
    const side=(b-.5)*pos.width*.8;
    const speed=.6+c*1.25; // Launch speed is independent of BPM.
    const p={x:pos.x+side,y:-.84+this.random()*.06,z:.33+this.random()*.11,
      vx:(this.random()-.5)*.28,vy:speed,vz:0,
      life:life*(.72+this.random()*.75),age:0,alpha:(.34+.6*this.random())*(.55+v.velocity/180),
      color,noteIndex:v.noteIndex,kind,size:(kind===2?29+this.random()*32:kind===1?15+this.random()*15:3.5+this.random()*8)*(this.settings.particleSize??1),
      seed:this.random()*100, origin:pos.x,weight:burst?1.25:1};
    if(this.particles.length>=this.settings.maxParticles)this.particles.shift();
    this.particles.push(p);
  }
  update(dt,audioRms=0){
    this.audioRms=audioRms;
    if(!this.settings.showParticles){this.clear();return;}
    if(dt<=0)return;
    dt=Math.min(dt,.05);
    const flow=this.engine.flowLevel;
    for(const v of this.engine.voices){
      const pedal=this.engine.pedalFor(v.channel);
      const amp=voiceAmplitude(v,this.engine.time,this.settings,pedal);
      if(amp<.018)continue;
      const vel=v.velocity/127;
      const resonance=resonanceEstimate(v,this.engine.time,pedal,this.settings);
      const emission=(12+33*vel)*amp*resonance*this.settings.particleDensity;
      // Per-voice fractional emission is stable across frame rates.
      v.phase=(v.phase||0)+dt*emission;
      const count=Math.min(30,Math.floor(v.phase));v.phase-=count;
      for(let i=0;i<count;i++)this.spawn(v);
    }
    const output=[];
    for(const p of this.particles){
      p.age+=dt;
      if(p.age>=p.life)continue;
      const [cx,cy]=curlField(p.x*1.1,p.y*1.1,p.seed*.01+this.engine.time*.53,flow);
      const follow=1-Math.exp(-dt*3.5);
      p.vx+=(cx*.43-p.vx*.09)*follow;
      const attract=(p.origin-p.x)*.06;
      p.vx+=(attract)*dt;
      p.x+=p.vx*dt;
      p.y+=(p.vy+cy*.18)*dt;
      p.z+=Math.sin(p.seed+p.age*2)*dt*.008;
      output.push(p);
    }
    this.particles=output;
  }
  // Interleaved x,y,z,r,g,b,alpha,size,kind normalized lifetime/age
  vertexData(){
    const a=new Float32Array(this.particles.length*10);
    for(let i=0;i<this.particles.length;i++){
      const p=this.particles[i],n=p.age/p.life;
      const fade=Math.pow(1-n,1.4)*Math.min(1,p.age/.12);
      const audioGain=this.settings.audioReactive?1+.8*(this.audioRms||0):1;
      a.set([p.x,p.y,p.z,...p.color,Math.min(2,p.alpha*fade*p.weight*audioGain),p.size,p.kind,n],i*10);
    }
    return a;
  }
}
export function keyboardLayout(){
  const keys=[];const whiteWidth=.237,blackWidth=.145;
  let nWhite=0;
  for(let midi=21;midi<=108;midi++){
    const black=[1,3,6,8,10].includes(midi%12);
    if(!black)nWhite++;
  }
  const totalWidth=nWhite*whiteWidth;
  let whiteIndex=0;
  for(let midi=21;midi<=108;midi++){
    const black=[1,3,6,8,10].includes(midi%12);
    let x=0;
    if(black){x=-totalWidth/2+whiteIndex*whiteWidth;}
    else{x=-totalWidth/2+(whiteIndex+.5)*whiteWidth;whiteIndex++;}
    keys.push({midi,black,x,width:black?blackWidth:whiteWidth*.956,length:black?.90:1.46});
  }
  return {keys,totalWidth};
}
export const KEYBOARD=keyboardLayout();
export function keyPosition(midi){return KEYBOARD.keys[midi-21]??null}
