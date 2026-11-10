const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const scope={window:{}};
vm.createContext(scope);
vm.runInContext(fs.readFileSync('static/score-core.js','utf8'),scope);
vm.runInContext(fs.readFileSync('static/studio-scene.js','utf8'),scope);
vm.runInContext(fs.readFileSync('static/stage-runtime.js','utf8'),scope);
const F=scope.window.ScoreFollower;
const norm=scope.window.ScoreStage.normalized;
const notes=[
 {audio:0,x:0,y:100,height:90},
 {audio:1,x:100,y:100,height:90},
 {audio:3,x:210,y:100,height:90}, // two seconds of holding
 {audio:3.5,x:30,y:500,height:90}, // new line, must not cross diagonally
 {audio:4,x:120,y:500,height:90},
];
assert.equal(F.cursorAt(0,notes).x,0);
assert.equal(F.cursorAt(.3,notes,'smooth').x,0,'hold until near next note');
const mid=F.cursorAt(.82,notes,'smooth');
assert(mid.x>0&&mid.x<100,'smooth move near next attack');
assert.equal(F.cursorAt(.82,notes,'step').x,0,'step mode remains at prior note');
assert.equal(F.cursorAt(1,notes).x,100);
assert.equal(F.cursorAt(2,notes).x,100,'fermata should not drift');
assert.equal(F.cursorAt(3.3,notes,'smooth').y,100,'new system never diagonally sweeps');
assert.equal(F.cursorAt(3.5,notes,'smooth').y,500,'move to new system exactly on attack');
assert.equal(F.cursorAt(4,notes).x,120);
assert.equal(F.cursorAt(0,[], 'smooth'),null);
const noCursor=norm({cursor_visible:false,cursor_motion:'smooth'});
assert.equal(noCursor.effects.cursorVisible,false);
assert.equal(noCursor.effects.cursorMotion,'smooth');
assert.equal(norm({cursor_visible:true,cursor_motion:'step'}).effects.cursorMotion,'step');
assert.equal(norm({cursor_motion:'oops'}).effects.cursorMotion,'smooth');
console.log('v0.14 smooth cursor, rests/fermata, page changes, off switch and settings tested');
