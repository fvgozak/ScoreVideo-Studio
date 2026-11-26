import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
const root=process.argv[2]||'.';
const code=fs.readFileSync(path.join(root,'static/melody-highlight.js'),'utf8');
const ctx={window:{}};vm.runInNewContext(code,ctx);
const engine=ctx.window.ScoreMelodyHighlight;
assert.ok(engine?.analyze);
const settings={enabled:true,sensitivity:65,melodyGain:170,otherGain:20};
function waltz(){
 const notes=[];
 for(let bar=0;bar<8;bar++){
   const base=bar*3;
   const bass=bar%2?45:48;
   notes.push({scoreKey:`bass-${bar}`,groupKey:'LH',handHint:'lower',staffId:1,measure:bar+1,
     beat:base,audio:base*.44,pitch:bass,velocity:120,endAudio:base*.44+.88});
   for(const shift of [1,2])for(const pitch of [55,60,64]){
     const beat=base+shift;
     notes.push({scoreKey:`chord-${bar}-${shift}-${pitch}`,groupKey:'LH',handHint:'lower',staffId:1,measure:bar+1,
       beat,audio:beat*.44,pitch,velocity:95,endAudio:beat*.44+.35});
   }
   // An independent RH melody continues through the accompaniment.
   for(const step of [0,1]){
     const time=base+step;
     notes.push({scoreKey:`mel-${bar}-${step}`,groupKey:'RH',handHint:'upper',staffId:0,measure:bar+1,
       beat:time,audio:time*.44,pitch:72+(bar%3)+step,velocity:115,endAudio:time*.44+.84});
   }
 }
 return notes;
}
const notes=waltz();
const result=engine.analyze(notes,settings);
const bass=notes.filter(n=>n.scoreKey.startsWith('bass-'));
const chords=notes.filter(n=>n.scoreKey.startsWith('chord-'));
const rh=notes.filter(n=>n.scoreKey.startsWith('mel-'));
const suppressedBass=bass.filter(n=>n.melodyHighlight.role==='ornament').length;
const suppressedChords=chords.filter(n=>n.melodyHighlight.role==='ornament').length;
assert.equal(suppressedBass,8,'all clearly repeated oom-pah bass hits must be accompaniment');
assert.ok(suppressedChords>=40,'repeating chord strikes should not be accented as melody');
assert.ok(rh.filter(n=>n.melodyHighlight.role==='melody').length>=10,'independent upper melody remains eligible');
const isolated=[];
for(let i=0;i<12;i++)isolated.push({scoreKey:`left-mel-${i}`,groupKey:'LH',handHint:'lower',staffId:1,
  beat:i,audio:i*.6,pitch:45+(i%4)*2,velocity:115,endAudio:i*.6+1.05});
engine.analyze(isolated,settings);
assert.ok(isolated.filter(n=>n.melodyHighlight.role==='melody').length>=6,
 'melodic left-hand line cannot be suppressed purely because of staff or register');
const overridden=engine.analyze(notes,{...settings,overrides:{'bass-0':'melody','mel-0-0':'ornament'}});
assert.equal(overridden.byKey['bass-0'].role,'melody');
assert.equal(overridden.byKey['bass-0'].manual,true);
assert.equal(overridden.byKey['mel-0-0'].role,'ornament');
assert.equal(engine.gain(bass[0],{...settings,overrides:{'bass-0':'melody'}}),1.7);
for(const name of ['index.html','render.html']){
 const html=fs.readFileSync(path.join(root,'static',name),'utf8');
 assert.ok(html.includes('/static/melody-highlight.js?v=melodyBeta1&accomp1'),name+' must bust melody analysis cache');
}
const original=Array.from({length:11000},(_,i)=>({scoreKey:`p${i}`,groupKey:i%2?'RH':'LH',
  audio:i*.055,endAudio:i*.055+.2,beat:i*.125,pitch:50+i%24,velocity:60+i%50}));
const start=performance.now();engine.analyze(original,settings);
const ms=performance.now()-start;
assert.ok(ms<5000,`11k-note analysis too slow: ${ms.toFixed(1)}ms`);
console.log(`PASS melody accompaniment: oom-pah bass ${suppressedBass}/8, chords ${suppressedChords}/${chords.length}, true LH melody, manual overrides, preview/export cache, 11k notes ${ms.toFixed(1)}ms`);
