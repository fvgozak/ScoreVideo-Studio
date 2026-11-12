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
const sharedSync={noteEvents:[{pitch:60,velocity:100,beat:2,second:1,end_second:1.6}],
  offsetSec:.2,beatToSeconds:beat=>beat/2,midiToAudio:second=>second+.5+.2};
piano.settings={offsetSec:.7};piano.setFollower(sharedSync);
assert.ok(Math.abs(piano.notes[0].audio-2.2)<1e-10,'piano trim is relative to shared auto sync, not score trim');
sharedSync.offsetSec=.9;sharedSync.midiToAudio=second=>second+.5+.9;
piano.setFollower(sharedSync);
assert.ok(Math.abs(piano.notes[0].audio-2.2)<1e-10,'changing the score trim must not move the piano');
assert.equal(normalized({piano_offset_sec:-.45}).piano.offsetSec,-.45);
assert.equal(normalized({piano_offset_sec:99}).piano.offsetSec,5);
assert.match(fs.readFileSync('static/index.html','utf8'),/id="pianoOffset"/);
assert.match(fs.readFileSync('static/app.js','utf8'),/piano_offset_sec:pianoOffset\(\)/);
assert.match(fs.readFileSync('static/app.js','utf8'),/closest\?\.\('input,select,textarea,/,
  'global seek shortcuts must not swallow fine-tune slider arrow keys');
const scoreSparks=[];
const scoreImpactContext={...lightContext,ellipse(){},arc(x,y,r){scoreSparks.push([x,y,r]);}};
const scoreImpact=context.window.ScoreStudio.LayerRenderer.prototype.drawScoreImpact;
const engraved={pitch:60,audio:2,endAudio:2.5,velocity:120};
scoreImpact(scoreImpactContext,50,80,0,.9,'#68ddfa',engraved);
assert.equal(scoreSparks.length,7,'score note receives the same seven-spark attack motion');
const engravedSparks=JSON.stringify(scoreSparks);scoreSparks.length=0;
scoreImpact(scoreImpactContext,50,80,0,.9,'#68ddfa',engraved);
assert.equal(JSON.stringify(scoreSparks),engravedSparks);
const applyOrder=[];
const runtime=Object.create(Stage.prototype);
runtime.settings=normalized({offset_sec:0,piano_offset_sec:0});
runtime.meta={};runtime.applyScoreWindow=()=>{};runtime.seek=()=>{};
runtime.follower={setEffects(){},setOffset(value){applyOrder.push(['score',value]);},setCameraPoints(){}};
runtime.piano={setSettings(value){applyOrder.push(['piano-settings',value.offsetSec]);},
  setFollower(){applyOrder.push(['piano-events']);}};
runtime.layer={setScene(){}};
runtime.setSettings({offset_sec:.1,piano_offset_sec:.25});
assert.equal(JSON.stringify(applyOrder),JSON.stringify([
  ['score',.1],['piano-settings',.25],['piano-events']
]));
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
const stageCss=fs.readFileSync('static/stage.css','utf8');
const pianoDepth=Number(stageCss.match(/\.piano-fall-canvas\{[^}]*z-index:(\d+)/)[1]);
const scoreDepth=Number(stageCss.match(/\.score-window\{[^}]*z-index:(\d+)/)[1]);
const noteLightDepth=Number(stageCss.match(/\.studio-fx-canvas\{[^}]*z-index:(\d+)/)[1]);
assert.ok(pianoDepth<scoreDepth&&scoreDepth<noteLightDepth,
  'falling notes stay behind the score while score-note lights remain above it');
console.log('88-key MIDI fall, impact timing, shared preview/export stage verified');
