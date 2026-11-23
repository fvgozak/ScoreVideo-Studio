import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
require('../static/piano-fall.js');
const {assignStaffGroups,staffKeyboardColor}=globalThis.ScorePianoFall;
const palette={enabled:true,keyboard:true,colors:{'P1:1':'#66ccff','P1:2':'#ffaa66'}};
const notes=[
 {pitch:60,midiSecond:1,velocity:40,audio:1,endAudio:2,channel:0,track:0},
 {pitch:64,midiSecond:1.2,velocity:75,audio:1.2,endAudio:2.2,channel:0,track:0},
 {pitch:67,midiSecond:2,velocity:93,audio:2,endAudio:2.7,channel:0,track:0},
 {pitch:69,midiSecond:3,velocity:81,audio:3,endAudio:3.5,channel:0,track:0}
];
const triggers=[
 {soundingPitch:60,midi:1.001,groupKey:'P1:1'},
 {soundingPitch:64,midi:1.199,groupKey:'P1:2'},
 {soundingPitch:67,midi:2,groupKey:'P1:1'},
 {soundingPitch:67,midi:2.001,groupKey:'P1:2'},
];
assert.equal(assignStaffGroups(notes,triggers),3);
assert.deepEqual(notes.map(n=>n.staffKeys),[['P1:1'],['P1:2'],['P1:1','P1:2'],[]]);
for(const note of notes)note.staffColor=staffKeyboardColor(note,palette);
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const mixed=rgb('#66ccff').map((v,i)=>(v+rgb('#ffaa66')[i])/2);
const close=(a,b,label)=>{
 assert.equal(a?.length,3,label+' missing RGB');
 for(let i=0;i<3;i++)assert.ok(Math.abs(a[i]-b[i])<1e-5,`${label} RGB ${i}: ${a[i]} vs ${b[i]}`);
};
close(notes[0].staffColor,rgb('#66ccff'),'right hand');
close(notes[1].staffColor,rgb('#ffaa66'),'left hand');
close(notes[2].staffColor,mixed,'two hands on one pitch');
close(notes[3].staffColor,mixed,'unmatched note safe neutral');
assert.equal(staffKeyboardColor(notes[3],{...palette,keyboard:false}),null);

const source=file=>readFileSync(new URL('../static/'+file,import.meta.url),'utf8');
const studioCtx={window:{},console};
vm.runInNewContext(source('studio-scene.js'),studioCtx,{filename:'studio-scene.js'});
const adapter=source('dynamic-fx/adapter.js');
const ctx={console,ScoreStudio:studioCtx.window.ScoreStudio,DEFAULTS:{pedalResonance:1.6},
 normalizeBoundaryLight:x=>x,AdaptiveLighting:{loadBackdropImage:()=>Promise.resolve(null)}};
const stripped=adapter.replace(/^import .*?;\s*$/gm,'').replace('export class ScoreDynamicFX','class ScoreDynamicFX');
vm.runInNewContext(stripped+'\nglobalThis.Dynamic=ScoreDynamicFX;globalThis.songFrom=songFrom;',ctx,{filename:'adapter.js'});
const follower={effects:{staffColors:palette},tempoMap:[],audioDuration:4,
 colors(){return {accent:'#11ee11'}},velocityRange:{min:40,max:93}};
const fx=Object.create(ctx.Dynamic.prototype);
fx.settings={};fx.canvas={style:{}};fx.lightingEpoch=0;fx.lightingImage=null;fx.time=2;fx.noteSource=notes;
let clears=0;
fx.field={clear(){clears++}};
fx.engine={song:{events:notes.map((n,i)=>({type:'on',noteIndex:i,staffColor:null}))},
 notes:notes.map((n,i)=>({noteIndex:i,staffColor:null})),
 voices:notes.map((n,i)=>({noteIndex:i,staffColor:null}))};
const settings={gpuEffects:{groups:{keyboard:{colorPreset:'linked'}},keyboard:{paletteLink:true}},
 lightingScene:{lightColorMode:'aurora',lightColorPreset:'random'},light:true,enabled:true};
fx.configure(settings,follower);
assert.equal(fx.settings.staffKeyboardEnabled,true);
assert.equal(fx.settings.randomNoteColors,false,'staff colors must override linked Random');
for(let i=0;i<notes.length;i++){
 close(fx.engine.song.events[i].staffColor,notes[i].staffColor,'MIDI event '+i);
 close(fx.engine.notes[i].staffColor,notes[i].staffColor,'falling note '+i);
 close(fx.engine.voices[i].staffColor,notes[i].staffColor,'existing voice '+i);
}
assert.equal(clears,1,'old colored particle tails must be cleared on palette configure');
const song=ctx.songFrom({notes,pedalEvents:[]},follower,fx.settings.randomNoteColors);
const {MidiFXEngine,ParticleField}=await import('../static/dynamic-fx/engine.js');
const {DEFAULTS}=await import('../static/dynamic-fx/dynamics.js');
const engine=new MidiFXEngine(song,{...DEFAULTS,staffKeyboardEnabled:true,showParticles:true,particleDensity:1});
const field=new ParticleField(engine,engine.settings);
engine.onNote=voice=>field.onNote(voice);
engine.advance(3.1);
const lights=engine.keyLights();
for(const [i,note] of notes.entries()){
 const key=Array.from(lights.slice((note.pitch-21)*4,(note.pitch-21)*4+4));
 close(key.slice(0,3),note.staffColor,'physical key '+i);
 assert.ok(key[3]>0,'key must be lit for '+note.pitch);
}
assert.ok(field.particles.length>0,'particles emitted');
for(const p of field.particles){
 close(p.color,notes[p.noteIndex].staffColor,'particle '+p.noteIndex);
}
// Toggling off staff linkage restores ordinary Random behavior.
follower.effects.staffColors={...palette,keyboard:false};
fx.configure(settings,follower);
assert.equal(fx.settings.staffKeyboardEnabled,false);
assert.equal(fx.settings.randomNoteColors,true);
for(const [i,note] of notes.entries())close(fx.engine.voices[i].staffColor,
 rgb(ctx.ScoreStudio.randomNoteColor(note)),'random restored '+i);
// Even an explicit independent Random setting cannot silently override the
// 'keyboard same staff colors' checkbox while it remains enabled.
follower.effects.staffColors=palette;
const independent={...settings,gpuEffects:{groups:{keyboard:{colorPreset:'random'}},keyboard:{paletteLink:false}}};
fx.configure(independent,follower);
assert.equal(fx.settings.randomNoteColors,false);
close(fx.engine.voices[0].staffColor,notes[0].staffColor,'explicit staff link over independent random');
assert.ok(source('index.html').includes('/static/piano-fall.js?v=staffpriority1'));
assert.ok(source('render.html').includes('/static/piano-fall.js?v=staffpriority1'));
assert.ok(source('piano-fall.js').includes('/static/dynamic-fx/adapter.js?v=staffpriority1'));
assert.ok(source('score-core.js').includes('eventLightColor(velocity,entry=null)'));
console.log('PASS staff keyboard priority: score Random -> staff link, two hands, neutral fallback, active key RGB, falling notes, particles, saved settings untouched, editor/export cache');
