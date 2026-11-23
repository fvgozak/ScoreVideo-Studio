import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const file=p=>readFileSync(new URL('../static/'+p,import.meta.url),'utf8');
const sceneCtx={window:{},console};
vm.runInNewContext(file('studio-scene.js'),sceneCtx,{filename:'studio-scene.js'});
const studio=sceneCtx.window.ScoreStudio;
const adapter=file('dynamic-fx/adapter.js');
const ctx={ScoreStudio:studio,console,
  DEFAULTS:{pedalResonance:1.6},
  normalizeBoundaryLight:x=>x,
  AdaptiveLighting:{loadBackdropImage:()=>Promise.resolve(null)}};
const noImports=adapter.replace(/^import .*?;\s*$/gm,'').replace('export class ScoreDynamicFX','class ScoreDynamicFX');
vm.runInNewContext(noImports+'\nglobalThis.SD=ScoreDynamicFX;globalThis.songFrom=songFrom;',ctx,{filename:'adapter.js'});
const notes=[
  {pitch:60,midiSecond:1.125,audio:1.26,endAudio:2.75,velocity:35,staffColor:[1,0,0]},
  {pitch:72,midiSecond:1.5,audio:1.66,endAudio:2.9,velocity:91,staffColor:[1,0,0]},
];
const follower={effects:{staffColors:{enabled:true,keyboard:true,colors:{}}},tempoMap:[],audioDuration:3};
function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)}
function close(a,b){assert.equal(a?.length,3);for(let i=0;i<3;i++)assert.ok(Math.abs(a[i]-b[i])<1e-6,`channel ${i}: ${a[i]} != ${b[i]}`)}
function makeFx(){const fx=Object.create(ctx.SD.prototype);fx.settings={};fx.canvas={style:{}};fx.lightingEpoch=0;fx.lightingImage=null;fx.noteSource=notes;fx.time=8;let clears=0;fx.field={clear(){clears++}};return [fx,()=>clears]}
const [fx,clears]=makeFx();
fx.engine={song:{events:[{type:'on',noteIndex:0,staffColor:[1,0,0]},{type:'on',noteIndex:1,staffColor:[1,0,0]}]},notes:[{noteIndex:0},{noteIndex:1}],voices:[{noteIndex:0},{noteIndex:1}]};
const linkedRandom={gpuEffects:{groups:{keyboard:{colorPreset:'linked'}},keyboard:{paletteLink:true}},lightingScene:{lightColorMode:'aurora',lightColorPreset:'random'},enabled:true,light:true};
assert.doesNotThrow(()=>fx.configure(linkedRandom,follower),'palette change must not reference undefined `piano`');
assert.equal(fx.settings.randomNoteColors,false);assert.equal(clears(),1);assert.equal(fx.time,null);
for(let i=0;i<notes.length;i++){
 const expected=[1,0,0];
 close(Array.from(fx.engine.song.events[i].staffColor),expected);
 close(Array.from(fx.engine.notes[i].staffColor),expected);
 close(Array.from(fx.engine.voices[i].staffColor),expected);
}
const independentRandom={gpuEffects:{groups:{keyboard:{colorPreset:'random'}},keyboard:{paletteLink:false}},lightingScene:{lightColorMode:'aurora',lightColorPreset:'aurora'},enabled:true,light:true};
assert.doesNotThrow(()=>fx.configure(independentRandom,follower));assert.equal(fx.settings.randomNoteColors,false);
// Explicit staff-color sync outranks independent Random too. Turn sync off to opt into Random.
follower.effects.staffColors.keyboard=false;
assert.doesNotThrow(()=>fx.configure(independentRandom,follower));assert.equal(fx.settings.randomNoteColors,true);
const ordinary={gpuEffects:{groups:{keyboard:{colorPreset:'linked'}},keyboard:{paletteLink:true}},lightingScene:{lightColorMode:'aurora',lightColorPreset:'ocean'},enabled:true,light:true};
follower.effects.staffColors.keyboard=true;
assert.doesNotThrow(()=>fx.configure(ordinary,follower));assert.equal(fx.settings.randomNoteColors,false);
for(let i=0;i<notes.length;i++)close(Array.from(fx.engine.voices[i].staffColor),[1,0,0]);
const randomEvents=ctx.songFrom({notes,pedalEvents:[]},follower,true).events.filter(e=>e.type==='on');
for(let i=0;i<notes.length;i++)close(Array.from(randomEvents[i].staffColor),rgb(studio.randomNoteColor(notes[i])));
const usualEvents=ctx.songFrom({notes,pedalEvents:[]},follower,false).events.filter(e=>e.type==='on');
for(let i=0;i<notes.length;i++)close(Array.from(usualEvents[i].staffColor),[1,0,0]);
// Execute the REAL Dynamic FX MIDI engine: verify physical key RGB and particle RGB,
// not merely the adapter's inputs. Both voices intentionally have clashing red staff colors.
const {MidiFXEngine,ParticleField}=await import('../static/dynamic-fx/engine.js');
const {DEFAULTS:ENGINE_DEFAULTS}=await import('../static/dynamic-fx/dynamics.js');
const engineSettings={...ENGINE_DEFAULTS,staffKeyboardEnabled:true,showParticles:true,particleDensity:1,velocityLight:1.4};
const realEngine=new MidiFXEngine(ctx.songFrom({notes,pedalEvents:[]},follower,true),engineSettings);
const realParticles=new ParticleField(realEngine,engineSettings);
realEngine.onNote=voice=>realParticles.onNote(voice);
realEngine.advance(1.8);
const lights=realEngine.keyLights();
for(const note of notes){
 const offset=(note.pitch-21)*4,light=Array.from(lights.slice(offset,offset+4));
 close(light.slice(0,3),rgb(studio.randomNoteColor(note)));
 assert.ok(light[3]>0,`physical MIDI key ${note.pitch} must glow`);
}
assert.ok(realParticles.particles.length>0,'random-colored GPU particles must spawn');
for(const particle of realParticles.particles){
 const note=notes[particle.noteIndex];assert.ok(note);
 close(Array.from(particle.color),rgb(studio.randomNoteColor(note)));
}
assert.ok(adapter.includes('this.noteSource=piano.notes'));
assert.ok(adapter.includes('this.updateStaffColors(this.noteSource'));
assert.ok(!adapter.includes('this.engine&&piano.notes'),'undefined piano must not reappear in configure');
assert.ok(file('piano-fall.js').includes('/static/dynamic-fx/adapter.js?v=staffpriority1'));
for(const page of ['index.html','render.html'])assert.ok(file(page).includes('/static/piano-fall.js?v=staffpriority1'));
console.log('PASS random-keyboard regression: configure(), linked/independent Random, MIDI note colors, staff-color priority, restore, preview/export cache');
