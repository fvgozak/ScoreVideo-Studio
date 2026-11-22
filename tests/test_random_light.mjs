import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const get=name=>readFileSync(new URL(`../static/${name}`,import.meta.url),'utf8');
const sceneContext={window:{},console};
vm.runInNewContext(get('studio-scene.js'),sceneContext,{filename:'studio-scene.js'});
const studio=sceneContext.window.ScoreStudio;
const noteA={pitch:60,midi:1.125,velocity:35,audio:7.33};
const notePiano={pitch:60,midiSecond:1.125,velocity:100,audio:7.34};
const randomScene=studio.normalize({lightColorMode:'aurora',lightColorPreset:'random'});
assert.equal(randomScene.lightColorPreset,'random');
assert.match(studio.randomNoteColor(noteA),/^#[a-f0-9]{6}$/i);
assert.equal(studio.randomNoteColor(noteA),studio.randomNoteColor(notePiano),
 'score and piano must use pre-sync MIDI time/pitch for same note color');
assert.equal(studio.noteLightColor(randomScene,35,'#ffffff',null,noteA),
 studio.noteLightColor(randomScene,110,'#ffffff',null,noteA),'velocity must not change random hue');
assert.equal(studio.randomNoteColor(noteA),studio.randomNoteColor(noteA),'stable when seeking');
const spread=new Set(Array.from({length:96},(_,i)=>studio.randomNoteColor({pitch:i+20,midi:i/13})));
assert.ok(spread.size>=9,'random mode should span multiple hues');
assert.equal(studio.noteLightColor({lightColorMode:'solid',lightColorPreset:'random'},75,'#456789',null,noteA),'#456789');
const aurora=studio.normalize({lightColorMode:'aurora',lightPaletteStops:['#3ac7db','#528fe9','#e3a1d6','#aa80e8']});
assert.equal(studio.noteLightColor(aurora,64,'#123456',{min:1,max:127}),
  studio.noteLightColor(aurora,64,'#123456',{min:1,max:127},noteA),
  'preexisting harmonic preset must not depend on note identity');
const score=get('score-core.js'),keyboard=get('piano-fall.js'),adapter=get('dynamic-fx/adapter.js'),app=get('app.js'),fx=get('fx-groups.js'),stage=get('stage-runtime.js');
assert.ok(fx.includes('<option value="random">랜덤 · 음표마다 다양한 색상</option>'));
assert.ok(fx.includes("chosen==='random'?randomSwatches"));
assert.ok(app.includes("lightColorPreset:$('scoreColorPreset').value"));
assert.ok(stage.includes('lightColorPreset:s.scene.lightColorPreset'));
assert.ok(stage.includes('lightColorPreset:next.scene.lightColorPreset'));
assert.ok(score.includes('this.velocityRange,entry)'));
assert.ok(score.includes('this.minimalColor(entry.velocity,entry)'));
assert.ok(keyboard.includes("keyboardPreset==='random'"));
assert.ok(keyboard.includes('this.follower.eventLightColor(note.velocity,note)'));
assert.ok(adapter.includes('randomNoteColors'));
for(const page of ['index.html','render.html']){
 const html=get(page);
 const expected={'score-core.js':'random1','studio-scene.js':'scoreparticles1','piano-fall.js':'randomkey2','stage-runtime.js':'random1'};
 for(const [src,version] of Object.entries(expected))
  assert.ok(html.includes(`/static/${src}?v=${version}`),`export and preview cache: ${page}/${src}`);
}
// Exercise the actual GPU song adapter without a browser/WebGL context.
const fxCtx={ScoreStudio:studio,console,AdaptiveLighting:{}};
const adapterPrelude=adapter.replace(/^import .*?;\s*$/gm,'').split('export class ScoreDynamicFX')[0];
vm.runInNewContext(adapterPrelude+'\nglobalThis.songFrom=songFrom;',fxCtx,{filename:'adapter.js'});
const midiNotes=[{pitch:60,audio:7.34,endAudio:8,velocity:38,midiSecond:1.125},
  {pitch:64,audio:7.7,endAudio:8.2,velocity:38,midiSecond:1.5}];
const mockFollower={tempoMap:[],audioDuration:8.2};
const randomEvents=fxCtx.songFrom({notes:midiNotes,pedalEvents:[]},mockFollower,true).events.filter(e=>e.type==='on');
assert.equal(randomEvents.length,2);
for(let i=0;i<randomEvents.length;i++){
 const expected=studio.randomNoteColor(midiNotes[i]);
 for(let c=0;c<3;c++)assert.ok(Math.abs(randomEvents[i].staffColor[c]-parseInt(expected.slice(1+c*2,3+c*2),16)/255)<.000001);
}
const plainEvents=fxCtx.songFrom({notes:midiNotes,pedalEvents:[]},mockFollower,false).events.filter(e=>e.type==='on');
assert.ok(plainEvents.every(e=>e.staffColor===null),'legacy normal colors must remain unchanged');
console.log('PASS random light: independent score/keyboard option, deterministic per-note colors, score⇔MIDI agreement, WebGL event colors, cache + legacy');
