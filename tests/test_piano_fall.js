const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{},document:{}};
vm.createContext(context);
for(const name of ['studio-scene.js','piano-fall.js','stage-runtime.js'])
  vm.runInContext(fs.readFileSync(`static/${name}`,'utf8'),context,{filename:name});
const {PianoFall,keyLayout,noteGeometry,fallSpeed,impactEnvelope,drawImpactLight}=context.window.ScorePianoFall;
const {Stage,normalized}=context.window.ScoreStage;
assert.equal(keyLayout.keys.length,88);
assert.equal(keyLayout.whiteCount,52);
assert.equal(keyLayout.keys[0].pitch,21);
assert.equal(keyLayout.keys.at(-1).pitch,108);
const onset=noteGeometry({audio:2,endAudio:3},2,600,100);
assert.equal(onset.bottom,600,'bar must touch the keyboard exactly on MIDI note-on');
assert.equal(onset.top,500);
assert.equal(noteGeometry({audio:2,endAudio:3},2-3.2,600,fallSpeed(600)).bottom,0,
  'falling bar must enter at the absolute top of the stage');
assert.ok(impactEnvelope(0,.5,1)>impactEnvelope(.12,.5,1));
assert.ok(impactEnvelope(.12,.5,1)>impactEnvelope(.7,.5,1));
assert.equal(impactEnvelope(-.01,.5,1),0);
assert.equal(impactEnvelope(.86,.5,1),0);
assert.ok(impactEnvelope(.05,.5,1)>impactEnvelope(.05,.5,.3));
const calls={radial:0,linear:0,sparks:[]};
const lightContext={
 save(){},restore(){},beginPath(){},fill(){},fillRect(){},arc(x,y,r){calls.sparks.push([x,y,r]);},
 createRadialGradient(){calls.radial++;return {addColorStop(){}};},
 createLinearGradient(){calls.linear++;return {addColorStop(){}};}
};
drawImpactLight(lightContext,{pitch:60,audio:2,endAudio:2.5,velocity:120},
  {x:50,w:12},2,{impact:600,keyHeight:110,whiteWidth:12,black:false,strength:1.4,color:'#68ddfa'});
assert.equal(calls.radial,1,'impact uses Lumenote-style center bloom');
assert.equal(calls.linear,2,'impact includes a beam and key reflection');
assert.equal(calls.sparks.length,7,'impact includes seven deterministic sparks');
const firstSparks=JSON.stringify(calls.sparks);
calls.sparks=[];
drawImpactLight(lightContext,{pitch:60,audio:2,endAudio:2.5,velocity:120},
  {x:50,w:12},2,{impact:600,keyHeight:110,whiteWidth:12,black:false,strength:1.4,color:'#68ddfa'});
assert.equal(JSON.stringify(calls.sparks),firstSparks,'seeking back to a note reproduces the same particles');
const options=normalized({piano_enabled:true,piano_light:true,piano_light_strength:2.7});
assert.equal(options.piano.enabled,true);
assert.equal(options.piano.light,true);
assert.equal(options.piano.strength,2.7);
assert.equal(normalized({piano_enabled:false,piano_light:false}).piano.enabled,false);
const piano=Object.create(PianoFall.prototype);
piano.setFollower({noteEvents:[
  {pitch:60,velocity:100,beat:2,second:1,end_second:1.6},
  {pitch:60,velocity:50,beat:4,second:2,end_second:2.2},
  {pitch:12,velocity:80,beat:5,second:3,end_second:4}],
  beatToSeconds:beat=>beat/2,midiToAudio:second=>second+.25});
assert.equal(piano.notes.length,2);
assert.equal(piano.notes[0].audio,1.25);
assert.ok(Math.abs(piano.notes[0].endAudio-1.85)<1e-10);
assert.equal(piano.notes[1].audio,2.25,'repeated notes remain separate attacks');
let scoreSeeks=0,scoreDraws=0,pianoDraws=0;
const stage=Object.create(Stage.prototype);
stage.follower={seek:()=>scoreSeeks++};
stage.layer={draw:()=>scoreDraws++};
stage.piano={draw:()=>pianoDraws++};
stage.seek(2);
assert.equal(scoreSeeks,1);
assert.equal(scoreDraws,1);
assert.equal(pianoDraws,1,'score and piano lights render on the same time axis');
for(const page of ['index.html','render.html'])
  assert.match(fs.readFileSync(`static/${page}`,'utf8'),/piano-fall\.js/);
console.log('88-key MIDI fall, impact timing, shared preview/export stage verified');
