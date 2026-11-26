import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=process.argv[2]||'.';
const code=fs.readFileSync(path.join(root,'static/melody-highlight.js'),'utf8');
const context={window:{}};vm.runInNewContext(code,context);
const mod=context.window.ScoreMelodyHighlight;
assert.ok(mod,'module not exposed');
const notes=[];
for(let i=0;i<80;i++){
  // Dense soft flourishes with accented, long, non-top-voice melodic notes.
  notes.push({scoreKey:`m${i}`,audio:i*.14,endAudio:i*.14+(i%5===0?.8:.07),beat:i*.25,pitch:i%5===0?70:80+i%3,velocity:i%5===0?112:38,groupKey:'RH'});
}
let analysis=mod.analyze(notes,{enabled:true,sensitivity:60,melodyGain:180,otherGain:10});
assert.equal(analysis.total,80);assert.ok(analysis.melody>0&&analysis.ornament>0,'must distinguish melodically salient and ornamental notes');
assert.ok(notes[0].melodyHighlight.confidence>notes[1].melodyHighlight.confidence,'accented sustained note must outrank short high flourish');
assert.equal(mod.gain(notes[0],{enabled:false}),1);
assert.equal(mod.gain(notes[0],{enabled:true,melodyGain:180,otherGain:10}),notes[0].melodyHighlight.role==='melody'?1.8:.1);
analysis=mod.analyze(notes,{enabled:true,sensitivity:95,overrides:{m1:'melody',m0:'ornament'}});
assert.equal(analysis.byKey.m1.role,'melody');assert.equal(analysis.byKey.m0.role,'ornament');
assert.ok(analysis.byKey.m1.manual&&analysis.byKey.m0.manual);
const future=mod.normalize({enabled:true,sensitivity:1000,otherGain:-4,overrides:{m1:'melody',BAD:'unknown'}});
assert.equal(future.sensitivity,95);assert.equal(future.otherGain,0);
assert.equal(future.overrides.m1,'melody');assert.equal(future.overrides.BAD,undefined);
mod.setProject('a');mod.update({enabled:true,sensitivity:80});mod.setRole('m12','melody');
const snapshot=mod.getState();assert.equal(snapshot.overrides.m12,'melody');
mod.setProject('b');assert.equal(mod.getState().enabled,false);assert.deepEqual(Object.keys(mod.getState().overrides),[]);
mod.restoreState(snapshot);assert.equal(mod.getState().overrides.m12,'melody');
for(const file of ['index.html','render.html']){
 const html=fs.readFileSync(path.join(root,'static',file),'utf8');
 assert.ok(html.includes('/static/melody-highlight.js?v=melodyBeta1'),'module must be available in both preview and render');
 assert.ok(html.includes('score-core.js?v=')&&html.includes('&melodyBeta1'),'versioned script cache');
}
const index=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
assert.ok(index.includes('id="melodyEnabled"')&&index.includes('id="melodyAlgorithm"')&&!index.includes('id="melodyEditMode"'));
const stage=fs.readFileSync(path.join(root,'static/stage-runtime.js'),'utf8');
assert.ok(stage.includes('melodyHighlight:s.melody_highlight'));
const follower=fs.readFileSync(path.join(root,'static/score-core.js'),'utf8');
assert.ok(follower.includes('ScoreMelodyHighlight?.annotate')&&follower.includes('melodyGain<=0'));
const scene=fs.readFileSync(path.join(root,'static/studio-scene.js'),'utf8');
assert.ok(scene.includes('const melodyGain=root.ScoreMelodyHighlight?.gain')&&scene.includes('if(melodyGain<=0)continue'));
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
assert.ok(app.includes('melody_highlight:window.ScoreMelodyHighlight?.getState')&&app.includes('melody_highlight:window.ScoreMelodyHighlight?.getState'));
assert.ok(app.includes('state.extensions?.melody_highlight'));
console.log('PASS melody beta: event salience, high-note ornaments, overrides, per-project isolation, preview/export, archive extension');
