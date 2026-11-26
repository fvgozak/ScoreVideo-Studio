import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
const root=process.argv[2]||'.',read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ctx={window:{},Uint8Array,DataView};vm.runInNewContext(read('static/melody-highlight.js'),ctx);vm.runInNewContext(read('static/local-project-codec.js'),ctx);
const m=ctx.window.ScoreMelodyHighlight,codec=ctx.window.ScoreLocalCodec;
const cfg={enabled:true,sensitivity:65,melodyGain:170,otherGain:25},engines=['v1','v2a','v2b','v2c','v2d'];
const notes=[],add=(key,beat,pitch,dur,velocity,groupKey,voiceId)=>notes.push({scoreKey:key,beat,audio:beat*.5,endAudio:beat*.5+dur,midi:beat*.5,midiEnd:beat*.5+dur,pitch,velocity,groupKey,voiceId});
for(let b=0;b<16;b++){
 for(let t=0;t<4;t++)add(`a${b}-${t}`,b*2+t*.5,48+[0,7,4,7][t]+(b%4===3?2:0),.21,85,'LH',1);
 for(let t=0;t<2;t++)add(`m${b}-${t}`,b*2+t,72+[0,2,4,5,4,2,0,-2,1,3,6,4,2,1,-1,0][b]+t,.46,90,'RH',1);
}
function evaluate(list,algorithm,prefix='m'){
 const r=m.analyze(list,{...cfg,algorithm});let tp=0,fp=0,fn=0;
 for(const n of list){const positive=n.scoreKey.startsWith(prefix),pred=r.byKey[n.scoreKey].role==='melody';if(positive&&pred)tp++;if(!positive&&pred)fp++;if(positive&&!pred)fn++;}
 return {tp,fp,fn,f1:2*tp/(2*tp+fp+fn||1)};
}
const results=Object.fromEntries(engines.map(a=>[a,evaluate(notes,a)]));
assert.ok(results.v2b.fp<results.v2a.fp,'B reduces repeated broken-chord false positives');
for(const a of ['v2b','v2c','v2d'])assert.ok(results[a].tp>=28&&results[a].fp<=8,`${a}: ${JSON.stringify(results[a])}`);
console.log('Synthetic Alberti fixture:',JSON.stringify(results));
// A single repeating melodic voice must not be suppressed just for repetition.
const solo=Array.from({length:32},(_,i)=>({scoreKey:`m${i}`,groupKey:'LH',beat:i,audio:i*.5,endAudio:i*.5+.47,pitch:50+[0,2,4,2][i%4],velocity:83}));
for(const a of ['v2b','v2c','v2d'])assert.ok(evaluate(solo,a).tp>=28,`solo ostinato ${a}`);
// Graph preference is global continuity, not the strongest note at each onset.
const graph=[],base=new Map();for(let i=0;i<12;i++){
 const n={scoreKey:`m${i}`,audio:i*.4,endAudio:i*.4+.36,pitch:60+i%4,beat:i,groupKey:'inner',velocity:90};
 const x={scoreKey:`x${i}`,audio:i*.4,endAudio:i*.4+.1,pitch:i%2?85:40,beat:i,groupKey:'other',velocity:100};
 graph.push(n,x);base.set(n,.68);base.set(x,.72);
}
const routed=m.pathScores(graph,base);assert.ok(graph.filter(n=>n.scoreKey.startsWith('m')&&routed.get(n)>.68).length>=10);assert.ok(graph.filter(n=>n.scoreKey.startsWith('x')&&routed.get(n)<.72).length>=10);
const octave=[{scoreKey:'top',audio:0,endAudio:.5,pitch:72,beat:0,groupKey:'RH',velocity:100},{scoreKey:'oct',audio:0,endAudio:.5,pitch:60,beat:0,groupKey:'LH',velocity:95}];const octaveBase=new Map([[octave[0],.82],[octave[1],.70]]);assert.ok(m.pathScores(octave,octaveBase).get(octave[1])>.70,'octave doubling preserved');
// Inferred voices without XML voice labels; original objects/voice IDs untouched.
const inner=[];for(let i=0;i<16;i++)for(const [name,p,d,v] of [['low',48+i%3,.43,60],['m',62+[0,2,4,5,3,2,0,1][i%8],.47,110],['high',80+i%3,.09,40]])inner.push({scoreKey:`${name}${i}`,groupKey:'same',beat:i,audio:i*.5,endAudio:i*.5+d,pitch:p,velocity:v});
const voices=m.inferVoices(inner);assert.equal(new Set(voices.values()).size,3);for(const prefix of ['low','m','high'])assert.equal(new Set(inner.filter(n=>n.scoreKey.startsWith(prefix)).map(n=>voices.get(n))).size,1);
assert.ok(evaluate(inner,'v2d').tp>=14);assert.ok(inner.every(n=>n.voiceId===undefined));
for(const a of engines){
 const options={...cfg,algorithm:a};const direct=JSON.stringify(m.analyze(notes,options)),cached=m.annotate(notes,options);assert.equal(JSON.stringify(cached),direct);assert.equal(m.annotate(notes,{...options,melodyGain:200}),cached);
 const strict=m.annotate(notes,{...options,sensitivity:95});assert.ok(strict.melody<=cached.melody);
 const manual=m.analyze(notes,{...options,overrides:{'a0-0':'melody','m0-0':'ornament'}});assert.equal(manual.byKey['a0-0'].role,'melody');assert.equal(manual.byKey['m0-0'].role,'ornament');
 m.restoreState(options);const saved=JSON.parse(JSON.stringify({schema_version:1,extensions:{melody_highlight:m.getState()}}));m.setProject('next');m.restoreState(saved.extensions.melody_highlight);assert.equal(m.getState().algorithm,a);
 if(a!=='v1'){const shifted=notes.map(n=>({...n,audio:n.audio*2+100,endAudio:n.endAudio*2+100}));assert.equal(JSON.stringify(m.analyze(shifted,options)),direct,'MIDI clock invariant '+a);}
}
assert.equal(m.normalize({algorithm:'future'}).algorithm,'v1');
for(const a of ['v2b','v2c','v2d'])assert.ok(read('static/index.html').includes(`value="${a}"`));assert.ok(!read('static/index.html').includes('id="melodyEditMode"'));
// Real bundled MIDI smoke test; no human labels, not an accuracy benchmark.
const midi=codec.midiTiming(new Uint8Array(fs.readFileSync(path.join(root,'examples/dream-journey/dream-journey.mid'))));
const actual=midi.note_events.map((n,i)=>({scoreKey:`n${i}`,audio:n.second,endAudio:n.end_second,midi:n.second,midiEnd:n.end_second,beat:n.beat,pitch:n.pitch,velocity:n.velocity,groupKey:`channel:${n.channel}`}));
for(const algorithm of engines){const start=performance.now(),r=m.analyze(actual,{...cfg,algorithm});assert.equal(r.total,actual.length);assert.ok(Object.values(r.byKey).every(x=>Number.isFinite(x.confidence)&&x.confidence>=0&&x.confidence<=1));console.log(`Dream Journey MIDI smoke ${algorithm}: ${r.total} notes, ${r.melody} selected, ${(performance.now()-start).toFixed(1)}ms`);}
const large=Array.from({length:20000},(_,i)=>({scoreKey:`p${i}`,audio:i*.055,endAudio:i*.055+.2,beat:i*.125,pitch:50+i%24,velocity:60+i%50,groupKey:i%2?'RH':'LH'}));
for(const algorithm of ['v2b','v2c','v2d']){const start=performance.now();const r=m.analyze(large,{...cfg,algorithm});const ms=performance.now()-start;assert.equal(r.total,large.length);assert.ok(ms<15000,`${algorithm}: ${ms}ms`);console.log(`20k synthetic ${algorithm}: ${ms.toFixed(1)}ms`);}
console.log('PASS V2-B/C/D: entropy, graph, octave, inferred voices, cache, legacy, sync, real MIDI smoke');
