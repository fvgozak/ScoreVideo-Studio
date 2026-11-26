import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
const root=process.argv[2]||'.';const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ctx={window:{}};vm.runInNewContext(read('static/melody-highlight.js'),ctx);const m=ctx.window.ScoreMelodyHighlight;
const cfg={enabled:true,algorithm:'v2a',sensitivity:65,melodyGain:170,otherGain:25};
const notes=[];const add=(key,beat,pitch,dur,vel,staff,voice=1)=>notes.push({scoreKey:key,beat,audio:beat*.5,endAudio:beat*.5+dur,midi:beat*.5,midiEnd:beat*.5+dur,pitch,velocity:vel,groupKey:staff,voiceId:voice});
for(let b=0;b<8;b++){
 add(`b${b}`,b*3,48+(b%2)*2,.95,125,'LH');
 for(let t=1;t<=2;t++)for(const p of [55,60,64])add(`c${b}-${t}-${p}`,b*3+t,p,.33,95,'LH');
 for(let t=0;t<3;t++)add(`m${b}-${t}`,b*3+t,72+[0,2,4,5,4,2,0,-2][b]+t,.47,85,'RH');
}
const v1=m.analyze(notes,{...cfg,algorithm:'v1'});const v2=m.analyze(notes,cfg);
const count=(prefix,role)=>notes.filter(n=>n.scoreKey.startsWith(prefix)&&n.melodyHighlight.role===role).length;
assert.equal(count('b','ornament'),8);assert.equal(count('c','ornament'),48);assert.ok(count('m','melody')>=20,`melody ${count('m','melody')}`);
console.log('Synthetic waltz V1/V2-A melody count',v1.melody,v2.melody,'V2-A true melody',count('m','melody'));
const lh=Array.from({length:12},(_,i)=>({scoreKey:`l${i}`,beat:i,audio:i*.5,endAudio:i*.5+.48,pitch:45+[0,2,4,2][i%4],velocity:80,groupKey:'LH'}));
assert.ok(m.analyze(lh,cfg).melody>=10,'independent left-hand melody');
const flourishes=Array.from({length:80},(_,i)=>({scoreKey:`f${i}`,audio:i*.14,endAudio:i*.14+(i%5===0?.8:.07),beat:i*.25,pitch:i%5===0?70:80+i%3,velocity:i%5===0?112:38,groupKey:'RH'}));
const f=m.analyze(flourishes,cfg);assert.ok(f.byKey.f0.confidence>f.byKey.f1.confidence);assert.ok(f.melody>=10&&f.ornament>=50,`flourishes ${f.melody}/${f.ornament}`);
// Explicit XML voice metadata separates a lower melody from upper short ornaments on the same staff.
const inner=[];for(let i=0;i<16;i++){
 inner.push({scoreKey:`i${i}`,audio:i*.5,endAudio:i*.5+.46,beat:i,pitch:62+[0,2,3,5][i%4],velocity:100,groupKey:'RH',voiceId:2});
 for(let j=0;j<3;j++)inner.push({scoreKey:`o${i}-${j}`,audio:i*.5+j*.14,endAudio:i*.5+j*.14+.065,beat:i+j/3,pitch:79+j,velocity:35,groupKey:'RH',voiceId:1});
}
m.analyze(inner,cfg);assert.ok(inner.filter(n=>n.scoreKey.startsWith('i')&&n.melodyHighlight.role==='melody').length>=13);assert.ok(inner.filter(n=>n.scoreKey.startsWith('o')&&n.melodyHighlight.role==='ornament').length>=40);
const a=m.annotate(notes,cfg);assert.equal(m.annotate(notes,{...cfg,melodyGain:200}),a,'gain-only change must not reanalyze');
const b=m.annotate(notes,{...cfg,algorithm:'v1'});assert.notEqual(a,b);assert.equal(JSON.stringify(b),JSON.stringify(v1));
const c=m.annotate(notes,cfg);assert.equal(JSON.stringify(c),JSON.stringify(v2));
const strict=m.annotate(notes,{...cfg,sensitivity:95});assert.ok(strict.melody<=c.melody);
const manual=m.analyze(notes,{...cfg,overrides:{b0:'melody','m0-0':'ornament'}});assert.equal(manual.byKey.b0.role,'melody');assert.equal(manual.byKey['m0-0'].role,'ornament');
assert.equal(m.normalize({}).algorithm,'v1');assert.equal(m.normalize({algorithm:'unknown'}).algorithm,'v1');
m.restoreState(cfg);const saved=JSON.parse(JSON.stringify({schema_version:1,extensions:{melody_highlight:m.getState()}}));m.setProject('new');assert.equal(m.getState().algorithm,'v1');m.restoreState(saved.extensions.melody_highlight);assert.equal(m.getState().algorithm,'v2a');
// Sync changes must not change V2-A confidence if the source MIDI axis remains fixed.
const shifted=notes.map(n=>({...n,audio:100+n.audio*2,endAudio:100+n.endAudio*2}));assert.equal(JSON.stringify(m.analyze(shifted,cfg)),JSON.stringify(v2));
const perf=Array.from({length:20000},(_,i)=>({scoreKey:`p${i}`,groupKey:i%2?'RH':'LH',audio:i*.055,endAudio:i*.055+.2,beat:i*.125,pitch:50+i%24,velocity:60+i%50}));
const start=performance.now();m.analyze(perf,cfg);const ms=performance.now()-start;assert.ok(ms<5000,`${ms}ms`);
for(const f of ['static/index.html','static/render.html'])assert.ok(read(f).includes('melodyBeta1&accomp1&perceptual1'));
assert.ok(read('static/score-core.js').includes('await window.ScoreMelodyHighlight?.prepare?.'));assert.ok(!read('static/index.html').includes('id="melodyEditMode"'));assert.ok(read('static/melody-worker.js').includes('perceptualScores'));
console.log(`PASS V2-A: synthetic waltz, LH melody, inner voice, ornaments, cache, project compatibility, MIDI sync invariance; 20k notes ${ms.toFixed(1)}ms`);
