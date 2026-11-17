/**
 * Independently written portrait camera planner for ScoreMotion Dynamic FX.
 * Only the camera looks ahead: audio, particles and note-density FX remain causal.
 *
 * Goals: continuous motion and zoom, stable framing at phrase boundaries,
 * using a five-second lookahead without teleporting the viewpoint. A soft
 * anticipation band begins moving the camera *before* a distant note crosses
 * the five-second window boundary. Camera state is independent of framerate.
 */
import {keyPosition} from './engine.js?v=aurora3';

const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

/** Note-ons in [time, time+horizon] and any notes still sounding. */
export function upcomingNoteSpan(notes,now,horizonSeconds=5,voices=[]){
  const time=Math.max(0,Number(now)||0);
  const horizon=clamp(Number(horizonSeconds)||5,.5,15);
  let minX=Infinity,maxX=-Infinity,minMidi=128,maxMidi=0,count=0;
  const add=midi=>{
    const key=keyPosition(midi);
    if(!key)return;
    minX=Math.min(minX,key.x-key.width*.5);
    maxX=Math.max(maxX,key.x+key.width*.5);
    minMidi=Math.min(minMidi,midi);
    maxMidi=Math.max(maxMidi,midi);
    count++;
  };
  for(const n of notes??[]){
    if(!Number.isFinite(n.start)||!Number.isFinite(n.end))continue;
    if(n.start>=time-1e-6&&n.start<=time+horizon+1e-6){add(n.midi);continue;}
    if(n.start<time&&n.end>=time-1e-6)add(n.midi);
  }
  for(const v of voices??[]){
    if(v.state==='held'||v.state==='sustained')add(v.midi);
  }
  if(!count)return null;
  return {minX,maxX,minMidi,maxMidi,count,horizon,rangeWidth:maxX-minX};
}

/**
 * Warm-up target during up to three seconds *before* a note enters the
 * five-second window. The note position is blended with ease-out,
 * so even a distant note moves the target continuously at the boundary.
 * It never changes the official 5-second note range reported in `span`.
 */
export function anticipatoryNoteSpan(notes,time,horizon,hardSpan,anchorX=0,preRoll=3){
  const lead=Math.max(.2,preRoll);
  const anchor=Number.isFinite(anchorX)?anchorX:0;
  const baseMin=hardSpan?.minX??anchor,baseMax=hardSpan?.maxX??anchor;
  let minX=hardSpan?baseMin:Infinity,maxX=hardSpan?baseMax:-Infinity,count=hardSpan?.count??0;
  const start=Math.max(0,time)+horizon,end=start+lead;
  const noteCenter=(baseMin+baseMax)*.5;
  for(const n of notes??[]){
    if(!Number.isFinite(n.start)||n.start<=start||n.start>end)continue;
    const key=keyPosition(n.midi);
    if(!key)continue;
    const fraction=clamp((end-n.start)/lead,0,1);
    const factor=1-(1-fraction)*(1-fraction);
    const x=noteCenter+(key.x-noteCenter)*factor;
    // No hard notes: blend the entire virtual key toward its destination.
    // Keeping the old anchor as a range endpoint caused zoom pumping exactly
    // when the new note crossed the five-second boundary.
    minX=Math.min(minX,x-key.width*.5);
    maxX=Math.max(maxX,x+key.width*.5);
    count++;
  }
  if(!count)return hardSpan;
  return {minX,maxX,rangeWidth:maxX-minX,count,
    minMidi:hardSpan?.minMidi??0,maxMidi:hardSpan?.maxMidi??0,horizon};
}

/** Fit a range with padding and a minimum practical width on a 9:16 canvas. */
export function targetPortraitFrame(span,keyboardWidth,aspect){
  if(!span)return null;
  const ratio=clamp(Number(aspect)||9/16,.35,.98);
  const minimumWidth=Math.max(3.9,6.2*ratio);
  const maximumWidth=keyboardWidth+.95;
  const padding=clamp(.42+span.rangeWidth*.07,.42,.68);
  const width=clamp(span.rangeWidth+2*padding,minimumWidth,maximumWidth);
  const travelLimit=Math.max(0,keyboardWidth/2+.38-width/2);
  const focusX=clamp((span.minX+span.maxX)*.5,-travelLimit,travelLimit);
  return {focusX,visibleWidth:width,padding,minimumWidth,maximumWidth,span};
}

/**
 * Critically-damped spring, adapted from the standard second-order response
 * formula. Does not jump or overshoot when the target changes. Unlike a
 * one-pole lerp, it preserves velocity between target changes (C1 motion).
 */
export function dampedStep(current,velocity,target,deltaSeconds,smoothSeconds){
  const dt=clamp(Number(deltaSeconds)||0,0,.1);
  if(dt===0)return {value:current,velocity};
  const omega=2/Math.max(.05,smoothSeconds);
  const x=omega*dt;
  const decay=1/(1+x+.48*x*x+.235*x*x*x);
  const change=current-target;
  const temp=(velocity+omega*change)*dt;
  const nextVelocity=(velocity-omega*temp)*decay;
  const next=target+(change+temp)*decay;
  if((target-current>0)===(next>target))return {value:target,velocity:0};
  return {value:next,velocity:nextVelocity};
}

export class PortraitLookaheadController{
  constructor(){this.reset();}
  reset(){
    this.focusX=null;this.visibleWidth=null;
    this.panVelocity=0;this.zoomVelocity=0;
    this.lastTime=null;this.lastAspect=null;this.lastSpan=null;this.idleAnchor=null;
  }
  update(notes,voices,time,horizon,aspect,dt,keyboardWidth,smoothness=1){
    const now=Math.max(0,Number(time)||0);
    const lookahead=clamp(Number(horizon)||5,.5,15);
    const aspectChanged=this.lastAspect!==null&&Math.abs(aspect-this.lastAspect)>.04;
    const seekedBack=this.lastTime!==null&&now<this.lastTime-.05;
    if(aspectChanged||seekedBack)this.reset();
    this.lastTime=now;this.lastAspect=aspect;
    const span=upcomingNoteSpan(notes,now,lookahead,voices);
    const preRoll=clamp(lookahead*.6,2,3.0);
    if(span)this.idleAnchor=null;
    else if(this.idleAnchor===null)this.idleAnchor=this.focusX??0;
    const preview=anticipatoryNoteSpan(notes,now,lookahead,span,
      this.idleAnchor??this.focusX??0,preRoll);
    const desired=targetPortraitFrame(preview,keyboardWidth,aspect);
    const minWidth=Math.max(3.9,6.2*clamp(aspect,.35,.98));
    const maxWidth=keyboardWidth+.95;
    if(!desired){
      this.lastSpan=null;
      if(this.visibleWidth===null)return null;
      this.panVelocity=0;this.zoomVelocity=0;
      return {focusX:this.focusX,visibleWidth:this.visibleWidth,span:null,
        lookaheadSeconds:lookahead,held:true,anticipationSeconds:preRoll};
    }
    if(this.visibleWidth===null){
      // Initial positioning / explicit seek: no animation from an unrelated song.
      this.focusX=desired.focusX;
      this.visibleWidth=desired.visibleWidth;
      this.panVelocity=0;this.zoomVelocity=0;
    }else{
      const smoothing=clamp(Number(smoothness)||1,.35,2.5);
      const step=clamp(dt,0,.08);
      const pan=dampedStep(this.focusX,this.panVelocity,desired.focusX,step,.68*smoothing);
      this.focusX=pan.value;this.panVelocity=pan.velocity;
      const zoomTime=(desired.visibleWidth>this.visibleWidth?.43:1.40)*smoothing;
      // Log-space zoom is perceptually consistent across 1.0× and 3.0× crops.
      const z=dampedStep(Math.log(this.visibleWidth),this.zoomVelocity,
        Math.log(desired.visibleWidth),step,zoomTime);
      this.visibleWidth=clamp(Math.exp(z.value),minWidth,maxWidth);
      this.zoomVelocity=z.velocity;

      // Do not teleport or snap the zoom when a future note crosses the
      // five-second horizon. Spring motion and early preview guide the
      // camera continuously. In extreme passages, some notes several
      // seconds in the future may temporarily lie outside the frame;
      // avoiding visible teleports takes priority.
      // Keep the camera within the real keyboard's practical travel range.
      const travelLimit=Math.max(0,keyboardWidth/2+.38-this.visibleWidth/2);
      const bounded=clamp(this.focusX,-travelLimit,travelLimit);
      if(bounded!==this.focusX){this.focusX=bounded;this.panVelocity=0;}
    }
    this.lastSpan=span;
    return {focusX:this.focusX,visibleWidth:this.visibleWidth,span,
      lookaheadSeconds:lookahead,held:false,anticipationSeconds:preRoll};
  }
}
