/* Independent MIDI-driven visual dynamics. No dependency on any renderer. */
export const DEFAULTS=Object.freeze({
  velocityLight:1.45,velocityContrast:1,particleLife:1.25,pedalResonance:1.6,
  releaseSeconds:0.68,curlStrength:1.05,densityAuto:true,densityResponse:0.8,
  densityWindowSec:10,densityShortWindowSec:2,densityFastWeight:0.35,densityAttack:0.45,densityRelease:2.3,
  particleDensity:1.0,glowBloom:.70,noteFallSeconds:2.8,
  noteBarMode:'fall',noteRiseSpeed:1,
  showNotes:true,showParticles:true,showGlow:true,showHitline:true,
  maxParticles:3300,colorMode:'aurora',audioReactive:false,masterGlow:1.0,
  cameraZoom:1.0,cameraTilt:.27,cameraFollow:true,cameraVerticalOffsetPct:0,
  aspectMode:'landscape',portraitAutoFrame:true,cameraLeadSeconds:5,cameraSmoothness:1,
});
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const mix=(a,b,t)=>a+(b-a)*t;
const smooth=x=>{x=clamp(x,0,1);return x*x*(3-2*x)};
export function velocity01(v){return clamp((v||0)/127,0,1)}
export function intensityFromVelocity(v,settings=DEFAULTS){
  const n=velocity01(v);
  return (0.14+2.2*Math.pow(n,1.55))*(settings.velocityLight??1.45);
}
const palettes={
  aurora:[[0.23,0.75,1],[0.5,0.35,1],[1,0.4,0.64],[1,0.81,0.43]],
  ember:[[0.32,0.52,0.9],[0.72,0.35,0.85],[1,0.34,0.32],[1,0.8,0.3]],
  glacier:[[0.22,0.46,1],[0.12,0.82,0.94],[0.64,0.94,1],[1,1,0.88]],
  forest:[[0.04,0.55,0.68],[0.25,0.8,0.66],[0.82,0.89,0.47],[1,0.91,0.58]],
};
export function colorFromVelocity(v,settings=DEFAULTS){
  const colors=settings.colorStops??palettes[settings.colorMode]??palettes.aurora;
  const range=settings.velocityRange;
  // A keyboard's own velocity-color toggle is independent from the global
  // score/motion reaction switch (which can be hidden in Advanced Settings).
  // Relative mode must normalize the note itself, not pre-normalize sampled
  // palette stops and then apply its raw 1..127 velocity a second time.
  const velocity=settings.velocityColor===false?96:Math.max(1,Math.min(127,Number(v)||1));
  let n=(velocity-1)/126;
  if(settings.velocityScale==='relative'&&Number.isFinite(range?.min)&&Number.isFinite(range?.max)){
    n=range.max>range.min?clamp((velocity-range.min)/(range.max-range.min),0,1):(64-1)/126;
  }
  const t=Math.pow(n,settings.velocityContrast??1);
  // Linked score Aurora uses the identical continuous two-color curve as
  // ScoreStudio. All other Dynamic FX palettes retain their original stops.
  if(settings.scoreAuroraLinked&&colors.length>=2){
    const f=Math.pow(t,1.05),last=colors[colors.length-1];
    if(colors.length===4&&settings.colorStops?.length===4&&settings.useHarmonicStops!==true){
      // Legacy 2-color projects expand endpoints to 4 for GPU only.
      return colors[0].map((c,k)=>mix(c,last[k],f));
    }
    if(colors.length===2)return colors[0].map((c,k)=>mix(c,last[k],f));
    const p=f*(colors.length-1),i=Math.min(colors.length-2,Math.floor(p));
    return colors[i].map((c,k)=>mix(c,colors[i+1][k],smooth(p-i)));
  }
  const pos=t*(colors.length-1),i=Math.min(colors.length-2,Math.floor(pos)),f=smooth(pos-i);
  return colors[i].map((c,k)=>mix(c,colors[i+1][k],f));
}
/**
 * Causal note-on activity (10-second base + 2-second change) determines flow. MIDI tempo is used
 * upstream only to turn ticks into seconds, never as an intensity multiplier.
 * A user may disable automatic density mapping to set a fixed curl strength.
 */
export function curlFromDensity(notesPerSecond,settings=DEFAULTS){
  if(!settings.densityAuto)return settings.curlStrength??1;
  const response=settings.densityResponse??.8;
  const normalized=smooth((Math.max(0,notesPerSecond)-.35)/7.0);
  return (settings.curlStrength??1)*(.25+response*1.85*normalized);
}
// Duration scales with performed velocity and the estimated damper-resonance
// envelope, not a claim of physical acoustic simulation. MIDI has no reverb audio.
export function particleLifetime({velocity,pedal=0,releaseAge=0,held=true},s=DEFAULTS){
  const v=velocity01(velocity),p=clamp(pedal/127,0,1);
  const sustain=p>=64?1:p*.65;
  const tail=held?1:Math.exp(-Math.max(0,releaseAge)/Math.max(.05,s.releaseSeconds));
  const base=(s.particleLife??1.25)*(.62+.66*v);
  return clamp(base*(1+(.85*(s.pedalResonance??1.6))*sustain)*(.85+.15*tail),.12,6.0);
}
export function voiceAmplitude(voice,time,s=DEFAULTS,pedal=0){
  const vel=velocity01(voice.velocity);
  if(voice.state==='held')return (.20+.80*vel);
  if(voice.state==='sustained'){
    // A damper pedal keeps the voice resonating, but it still decays.
    const age=Math.max(0,time-(voice.noteOffAt??time));
    const sustainTau=.9+(s.pedalResonance??1.6)*clamp(pedal/127,0,1)*1.15;
    return (.20+.80*vel)*(.2+.8*Math.exp(-age/sustainTau));
  }
  const age=Math.max(0,time-(voice.releasedAt??time));
  const pedalFactor=clamp(pedal/127,0,1);
  const release=(s.releaseSeconds??.68)*(1+pedalFactor*(s.pedalResonance??1.6)*1.4);
  return (.20+.80*vel)*Math.exp(-age/Math.max(.04,release));
}
export function resonanceEstimate(voice,time,pedal,s=DEFAULTS){
  const vel=velocity01(voice.velocity),p=clamp(pedal/127,0,1);
  const elapsed=Math.max(0,time-voice.startedAt);
  const onset=1+0.16*Math.exp(-elapsed*8);
  return clamp((.22+.78*vel)*(1+p*(s.pedalResonance??1.6)*.85)*onset,0,3.8);
}
export function paramsForEvent(ev,noteDensity,pedal,settings=DEFAULTS){
  return {light:intensityFromVelocity(ev.velocity,settings),
    color:colorFromVelocity(ev.velocity,settings),
    lifetime:particleLifetime({velocity:ev.velocity,pedal},settings),
    curl:curlFromDensity(noteDensity,settings)};
}
