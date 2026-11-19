/** v27.3: per-staff score colors drive MIDI keyboard without reloading the renderer. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {MidiFXEngine,ParticleField} from '../static/dynamic-fx/engine.js';
import {ScoreDynamicFX} from '../static/dynamic-fx/adapter.js';
const root={};
runInNewContext(readFileSync('static/piano-fall.js','utf8'),{window:root,location:{search:''}},{filename:'piano-fall.js'});
const {PianoFall,assignStaffGroups,staffKeyboardColor}=root.ScorePianoFall;
const palette={enabled:true,keyboard:true,colors:{'P1:1':'#ff0000','P2:1':'#0000ff','P3:1':'#00ff00'}};
const sample=[
  {pitch:70,midiSecond:.5}, // written C5 -> sounding Bb4 (clarinet)
  {pitch:70,midiSecond:.5}, // same physical key, second instrument
  {pitch:72,midiSecond:.6},
  {pitch:48,midiSecond:.8},
  {pitch:65,midiSecond:1.5}, // unmatched MIDI
];
const score=[
  {pitch:72,soundingPitch:70,midi:.5,groupKey:'P2:1'},
  {pitch:70,soundingPitch:70,midi:.5,groupKey:'P3:1'},
  {pitch:72,soundingPitch:72,midi:.6,groupKey:'P1:1'},
  {pitch:48,soundingPitch:48,midi:.8,groupKey:'P3:1'},
];
assert.equal(assignStaffGroups(sample,score),4);
assert.deepEqual([...sample[0].staffKeys],['P2:1','P3:1']);
assert.deepEqual([...sample[1].staffKeys],['P2:1','P3:1']);
assert.deepEqual([...sample[2].staffKeys],['P1:1']);
assert.deepEqual([...sample[3].staffKeys],['P3:1']);
assert.deepEqual([...sample[4].staffKeys],[]);
assert.deepEqual([...staffKeyboardColor(sample[0],palette)],[0,.5,.5]);
assert.deepEqual([...staffKeyboardColor(sample[2],palette)],[1,0,0]);
assert.equal(staffKeyboardColor(sample[4],palette),null);
assert.equal(staffKeyboardColor(sample[2],{...palette,keyboard:false}),null);
// PianoFall's existing load maps note events once and preserves group ids.
const instance=Object.create(PianoFall.prototype);
instance.notes=[];instance.settings={portrait:false,offsetSec:0};
const follower={offsetSec:0,tempoMap:[{beat:0,tempo_us:500000}],cameraAccents:[],
  effects:{staffColors:palette},noteTriggers:score,
  noteEvents:sample.map((n,i)=>({pitch:n.pitch,second:n.midiSecond,end_second:n.midiSecond+.2,velocity:100,channel:i%2})),
  pedalEvents:[],midiToAudio:t=>t,beatToSeconds:b=>b/2,audioDuration:2};
instance.setFollower(follower);
assert.equal(instance.notes.length,5);
assert.equal(instance.notes[0].staffColorHex,'#008080');
assert.equal(instance.notes[2].staffColorHex,'#ff0000');
const song={events:[
  {type:'on',time:.5,midi:70,channel:0,track:0,velocity:96,noteIndex:0,staffColor:[0,0,1]},
  {type:'on',time:.5,midi:70,channel:1,track:1,velocity:96,noteIndex:1,staffColor:[1,0,0]},
  {type:'off',time:1,midi:70,channel:0,track:0,velocity:0,noteIndex:0},
  {type:'off',time:1,midi:70,channel:1,track:1,velocity:0,noteIndex:1}],tempos:[],duration:2};
const settings={velocityLight:1.4,staffKeyboardEnabled:true,velocityScale:'absolute',velocityColor:true,
  colorStops:[[0,1,0],[0,1,0],[0,1,0],[0,1,0]],particleDensity:1,showParticles:true,maxParticles:1000};
const engine=new MidiFXEngine(song,settings);const field=new ParticleField(engine,settings);
engine.onNote=v=>field.onNote(v);
engine.advance(.5);
assert.equal(engine.voices.length,2);
const i=(70-21)*4;
const lights=engine.keyLights();
assert.ok(lights[i]>.4&&lights[i]<.6,'red/blue simultaneous key should blend');
assert.ok(lights[i+2]>.4&&lights[i+2]<.6);
assert.ok(lights[i+1]<.01);
assert.ok(engine.notes.every(n=>n.noteIndex===0||n.noteIndex===1));
assert.ok(field.particles.length>0&&field.particles.every(p=>p.noteIndex!==undefined));
// Cheap live update with preserved engine/voice and particle objects.
const adapter=Object.create(ScoreDynamicFX.prototype);adapter.engine=engine;adapter.field=field;adapter.settings=settings;
const beforeEngine=adapter.engine,beforeVoice=engine.voices[0],beforeParticle=field.particles[0];
adapter.updateStaffColors([{staffColor:[0,1,0]},{staffColor:[0,1,0]}],palette);
assert.equal(adapter.engine,beforeEngine);
assert.equal(engine.voices[0],beforeVoice);
assert.equal(field.particles[0],beforeParticle);
assert.equal(engine.voices[0].staffColor[1],1);
assert.equal(engine.notes[0].staffColor[1],1);
assert.equal(field.particles[0].color[1],1);
assert.ok(engine.keyLights()[i+1]>.99,'palette switches instantly without engine reset');
adapter.updateStaffColors([{staffColor:null},{staffColor:null}],{...palette,keyboard:false});
assert.equal(settings.staffKeyboardEnabled,false);
assert.equal(engine.voices[0].staffColor,null);
assert.ok(engine.keyLights()[i+1]>.99,'disabled uses independent green keyboard palette');
assert.equal(engine.keyLights()[i],0);
console.log('v27.3 staff-to-keyboard color mapping, blend and live-toggle tests passed');
