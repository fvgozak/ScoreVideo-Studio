const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
const context={window:{}, document:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('static/score-core.js','utf8'),context);
vm.runInContext(fs.readFileSync('static/studio-scene.js','utf8'),context);
const Follower=context.window.ScoreFollower;
const {selectHandTrails}=context.window.ScoreStudio;

// Line breaks never change which hand an engraved staff belongs to.
const events=[
 {staffId:1,instrumentRef:'piano',systemKey:0,localY:100,handHint:'upper'},
 {staffId:2,instrumentRef:'piano',systemKey:0,localY:260,handHint:'lower'},
 {staffId:1,instrumentRef:'piano',systemKey:1,localY:590,handHint:'upper'},
 {staffId:2,instrumentRef:'piano',systemKey:1,localY:740,handHint:'lower'},
];
Follower.assignHands(events);
assert.equal(events[2].hand,'upper');
assert.equal(events[1].hand,'lower');
const handBefore=events.map(e=>e.hand).join(',');
for(const e of events)e.localY+=400;
Follower.assignHands(events);
assert.equal(events.map(e=>e.hand).join(','),handBefore);

// When a note starts in the next printed row, its trail has no previous anchor.
const notes=[
 {hand:'upper',systemKey:0,audio:10,x:100,y:60,index:0},
 {hand:'upper',systemKey:0,audio:10.2,x:160,y:58,index:1},
 {hand:'lower',systemKey:0,audio:10.3,x:140,y:180,index:2},
 {hand:'upper',systemKey:1,audio:10.4,x:30,y:400,index:3},
 {hand:'lower',systemKey:1,audio:10.5,x:50,y:520,index:4}
];
const at1025=selectHandTrails(notes,10.25);
assert.equal(at1025.upper.length,2);
const at1045=selectHandTrails(notes,10.45);
assert.equal(at1045.upper.length,1); // no streak descending across rows
assert.equal(at1045.upper[0].systemKey,1);
const at106=selectHandTrails(notes,10.6);
assert.equal(at106.lower.length,1);
assert.equal(at106.lower[0].systemKey,1);

// An implausible jump in the same system also resets the path.
const far=[
 {hand:'upper',systemKey:0,audio:1,x:30,y:100,index:0},
 {hand:'upper',systemKey:0,audio:1.2,x:1000,y:90,index:1}
];
assert.equal(selectHandTrails(far,1.3,{maxDistance:300}).upper.length,1);
console.log('OSMD staff-stable hand mapping and cross-system trail reset tests passed');

const theme=require('../static/theme.js').ScoreTheme;
for(const color of ['#263249','#f8e4ba','#4587bc','#b04084']){
 const p=theme.palette(color);
 assert.match(p.trailUpper,/^#[0-9a-f]{6}$/);
 assert.match(p.trailLower,/^#[0-9a-f]{6}$/);
 assert.notEqual(p.trailUpper,p.trailLower);
 assert.equal(p.trailUpper,theme.trailPalette(color).trailUpper);
}
console.log('Automatic two-color theme trail palette tests passed');
