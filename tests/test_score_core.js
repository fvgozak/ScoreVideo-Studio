const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('static/score-core.js','utf8'),context);
const Follower=context.window.ScoreFollower;
const f=new Follower({tempoMap:[{beat:0,second:0,tempo_us:500000},{beat:8,second:4,tempo_us:666667}]});
assert.equal(f.beatToSeconds(4),2);
assert.equal(f.beatToSeconds(8),4);
assert(Math.abs(f.beatToSeconds(12)-6.666668)<.00001);
f.timestamps=[0,.5,1,1.5,2];
assert.equal(f.findIndex(0),0);
assert.equal(f.findIndex(.99),1);
assert.equal(f.findIndex(99),4);
const g=new Follower({tempoMap:[{beat:0,second:0,tempo_us:500000}],noteEvents:[
 {beat:0,pitch:60,velocity:20},{beat:0,pitch:64,velocity:100},
 {beat:1,pitch:67,velocity:127},{beat:1.25,pitch:69,velocity:60}]});
assert.equal(g.getVelocity(0,60),20);
assert.equal(g.getVelocity(0,64),100);
assert.equal(g.getVelocity(1,67),127);
assert.equal(g.getVelocity(2,60),null);
const low=Follower.dynamics(20,.05,{motionStrength:1});
const high=Follower.dynamics(120,.05,{motionStrength:1});
assert(high.alive&&low.alive);
assert(high.opacity>low.opacity);
assert(high.scale>low.scale);
assert(Math.abs(high.dy)>Math.abs(low.dy));
assert.equal(Follower.dynamics(120,.05,{motionStrength:0}).scale,1);
const flatHigh=Follower.dynamics(120,.05,{velocityReactive:false,motionStrength:1});
const flatLow=Follower.dynamics(20,.05,{velocityReactive:false,motionStrength:1});
assert.equal(flatHigh.scale,flatLow.scale);
assert.deepEqual(Follower.dynamics(90,.15,{motionStrength:1}), Follower.dynamics(90,.15,{motionStrength:1}));
console.log('ScoreFollower JS timing and velocity effects tests passed');

const T=require('../static/theme.js').ScoreTheme;
for(const hex of ['#1b293f','#eed2a5','#ff5fa1','#4466aa']){
 const p=T.palette(hex);
 for(const key of ['paper','staff','note','accent','glow','cursor'])assert.match(p[key],/^#[0-9a-f]{6}$/);
 assert.notEqual(p.paper,p.note);
}
const h=new Follower({tempoMap:[{beat:0,second:0,tempo_us:500000}],scrollMode:'horizontal'});
h.positions=[{midi:0,audio:0,x:50},{midi:1,audio:1,x:150},{midi:2,audio:2,x:350}];
h.container={scrollWidth:1000,style:{}};h.viewport={clientWidth:200,scrollLeft:0};h.index=1;
h.scrollAt(1.5);
assert.equal(h.viewport.scrollLeft,174); // cursor=250, 38% of 200 =76
h.index=0;h.scrollAt(0);
assert.equal(h.viewport.scrollLeft,0);
assert.equal(T.palette('#223344').paper,T.palette('#223344').paper);
// Arpeggio: one written chord, three distinct key attacks 0ms / 100ms / 240ms.
// The visual note events must inherit these real event times, not the chord stamp.
const rolled=new Follower({tempoMap:[{beat:0,second:0,tempo_us:500000}],
 noteEvents:[{beat:2,pitch:60,velocity:40,second:1},
             {beat:2.2,pitch:64,velocity:75,second:1.1},
             {beat:2.48,pitch:67,velocity:120,second:1.24}]});
const used=new Set();
const attackTimes=[60,64,67].map(p=>rolled.matchAttack(2,p,used).second);
assert.equal(attackTimes[0],1);
assert.equal(attackTimes[1],1.1);
assert.equal(attackTimes[2],1.24);
assert.equal(used.size,3);
assert.equal(rolled.matchAttack(2,64,used),null);
// Camera positions do not jump when crossing a beat boundary.
const points=[{audio:0,x:80},{audio:1,x:180},{audio:2,x:320}];
const v1=Follower.cameraX(1-1e-5,points,100,1000,.38);
const v2=Follower.cameraX(1+1e-5,points,100,1000,.38);
assert(Math.abs(v1-v2)<.01);
assert.equal(Follower.cameraX(2,points,100,1000,.38),282);
assert.equal(Follower.cameraX(100,points,100,200,.38),100);
assert.equal(Follower.dynamics(90,-.04,{motionStrength:1}).alive,false);
console.log('v0.4 rolled-chord attacks and camera continuity tests passed');

const fermata=new Follower({
 tempoMap:[{beat:0,second:0,tempo_us:500000}],
 scoreAlignment:{anchors:[{beat:0,second:0},{beat:1,second:.5},
                          {beat:2,second:2.5},{beat:3,second:3}],
 note_matches:[{beat:2,pitch:64,second:2.5,velocity:116}]},
});
assert.equal(fermata.beatToSeconds(2),1); // WRONG old theoretical clock
assert.equal(fermata.scoreBeatToMidi(2),2.5); // CORRECT actual MIDI note-on
fermata.timestamps=[0,.5,2.5,3];
fermata.lines=[{midi:0},{midi:.5},{midi:2.5},{midi:3}];
fermata.positions=[{midi:0},{midi:.5},{midi:2.5},{midi:3}];
fermata.measureStarts=[{midi:0},{midi:2.5}];
fermata.noteTriggers=[{midi:2.5,velocity:116}];
fermata.rebuildAudioAxis();
assert.deepEqual(Array.from(fermata.audioTimestamps),[0,.5,2.5,3]);
assert.equal(fermata.findIndex(1.5),1);  // hold on fermata until 2.5s
assert.equal(fermata.findIndex(2.5),2);
assert.equal(fermata.measureStarts[1].audio,2.5);
assert.equal(fermata.noteTriggers[0].audio,2.5);
console.log('Fermata timing drives cursor, measure jumps, camera and effects');
