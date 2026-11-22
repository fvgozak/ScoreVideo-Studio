import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const base=resolve(process.argv[2]||'.');
await import(pathToFileURL(resolve(base,'static/project-archive.js')).href);
await import(pathToFileURL(resolve(base,'static/project-io.js')).href);
const z=globalThis.ScoreProjectArchive,io=globalThis.ScoreProjectIO;
const midi=Buffer.from('4d546864000000060000000101e04d54726b0000000d00903c408360803c4000ff2f00','hex');
const wav=Buffer.from('524946462400000057415645666d74201000000001000100401f0000803e0000020010006461746100000000','hex');
const goodXml=`<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><note><rest/><duration>1</duration></note></measure></part></score-partwise>`;
const badXml=`<?xml version="1.0"?><!DOCTYPE score-partwise [<!ENTITY x SYSTEM "file:///etc/passwd">]><score-partwise>&x;</score-partwise>`;
const badExternal=`<?xml version="1.0"?><!DOCTYPE score-partwise SYSTEM "https://attacker.invalid/malicious.dtd"><score-partwise/>`;
const parsed=[];let regenerated=0;
globalThis.ScoreLocalProjects={codec:{midiTiming:()=>({note_events:[{pitch:60,velocity:70,second:0,end_second:.5}],midi_duration_sec:.5}),readScore:async f=>f.text(),decodeScore:s=>{assert(!s.includes('<!DOCTYPE'));assert(!s.includes('<!ENTITY'));parsed.push(s);return{};}},
  generateAudio:async timing=>{assert(Array.isArray(timing.note_events));regenerated++;return new File([wav],'Salamander Grand Piano.wav',{type:'audio/wav'});},validateAudio:async()=>3.0};
function record({withScore=true,generated=true,source=goodXml}={}){
 const id='b'.repeat(32);
 return {id,meta:{id,local_project:true,has_score:withScore,generated_audio:generated,generated_midi:false,tempo_map:[{beat:0,second:0,tempo_us:500000}],note_events:[{beat:0,pitch:60,second:0}],note_count:1,audio_duration_sec:3,
   score_name:withScore?'Waltz in WaterLight.musicxml':'',musicxml_title:'Waltz in WaterLight',midi_name:'test.mid',audio_name:generated?'Salamander Grand Piano':'Recording.wav',sync:null},
 midi:new File([midi],'test.mid',{type:'audio/midi'}),audio:new File([wav],generated?'Salamander Grand Piano.wav':'Recording.wav',{type:'audio/wav'}),
 score:withScore?source:null,scoreOriginal:withScore?new File([source],'Waltz in WaterLight.musicxml',{type:'application/xml'}):null};
}
const state={schema_version:1,project_name:'Waltz in WaterLight',settings:{controls:{aspectRatio:'9:16',scoreColorPreset:'random',scoreParticlesOn:true},staff_colors:{enabled:false,keyboard:false,colors:{}},export:{download_name:''}},timeline:{synchronization:{schema_version:1,manual_offsets:{score_offset_sec:0.35,piano_offset_sec:-0.1},user_locks:[],review_state:'valid'},camera:{schema_version:1,camera_points:[]}}};
// No user-provided audio -> output archive contains no WAV bytes.
const g=record(),pack=await io.exportProject(g,state),bundle=await z.inspect(pack.blob);
assert.equal(pack.manifest.assets.bindings.audio,null);
assert.equal(pack.manifest.extensions.audio_mode,'generate-from-midi');
assert(!Array.from(bundle.entries.keys()).some(x=>x.startsWith('assets/audio/')));
assert.equal((await bundle.json('derived/analysis.json')).meta.generated_audio,true);
assert.equal((await bundle.json('project.json')).settings.controls.aspectRatio,'9:16');
const original=await bundle.extract('assets/score/score-source.musicxml');assert.equal(await original.text(),goodXml,'uploaded MusicXML unchanged');
const loaded=await io.readArchive(pack.blob);
assert.equal(regenerated,1,'audio generated on load');
assert.equal(loaded.record.audio.size,wav.length);
assert.equal(loaded.record.meta.generated_audio,true);
assert.equal(loaded.record.state.timeline.synchronization.manual_offsets.score_offset_sec,0.35);
assert(!loaded.record.score.includes('<!DOCTYPE'),'playback XML stripped of external DTD reference');
assert(parsed.length>=2,'both original and playback XML validated');
// Save a loaded generated project: no unneeded WAV introduced into ZIP.
const again=await io.exportProject(loaded.record,loaded.record.state);
assert.equal(again.manifest.assets.bindings.audio,null);
const g2=record({withScore:false});const synthMidi=await io.exportProject(g2,state);
assert.equal((await io.readArchive(synthMidi.blob)).record.meta.generated_audio,true);
// User-provided audio must stay byte-identical and never reencode.
const upload=record({generated:false}),uploadPack=await io.exportProject(upload,state);
assert(uploadPack.manifest.assets.bindings.audio);
const raw=await (await z.inspect(uploadPack.blob)).extract('assets/audio/audio-source.wav');
assert.deepEqual(Buffer.from(await raw.arrayBuffer()),wav);
await io.readArchive(uploadPack.blob);assert.equal(regenerated,2,'no regeneration for user-uploaded WAV');
// Never classify a normal MusicXML DTD as an external entity attack.
assert(!io.normalizeMusicXML(goodXml).includes('<!DOCTYPE'));
for(const source of [badXml,badExternal,`<!DOCTYPE score-partwise [ ]><score-partwise/>`]){
 assert.throws(()=>io.normalizeMusicXML(source),/(엔티티|DTD)/);
 const r=record({generated:false,source});
 const malicious=await io.exportProject(r,state);
 await assert.rejects(()=>io.readArchive(malicious.blob),/(엔티티|DTD)/);
}
// Verify actual browser filename helper, not just an independently reimplemented rule.
const script=await fs.readFile(resolve(base,'static/app.js'),'utf8');
const begin=script.indexOf(' function portableFilename(name)'),finish=script.indexOf(' function refreshPortableAssets()',begin);
assert(begin>0&&finish>begin,'archive naming function must exist');
const archiveFilename=new Function('meta','controls','override',`const $=()=>null;${script.slice(begin,finish)};return portableArchiveName({meta},{settings:{controls}},override);`);
assert.equal(archiveFilename({has_score:true,score_name:'Light on Water.musicxml',midi_name:'performance.mid'},{aspectRatio:'9:16'},''),'Light on Water (9x16).scoremotion');
assert.equal(archiveFilename({has_score:true,score_name:'Étude.mxl'},{aspectRatio:'custom',customAspectWidth:'1080',customAspectHeight:'1920'},''),'Étude (1080x1920).scoremotion');
assert.equal(archiveFilename({has_score:false,midi_name:'Only MIDI.mid'},{aspectRatio:'16:9'},''),'Only MIDI (16x9).scoremotion');
assert.equal(archiveFilename({has_score:true,score_name:'Original.musicxml'},{aspectRatio:'1:1'},'Copy A'),'Copy A (1x1).scoremotion');
assert.equal(io.normalizeMusicXML('<score-partwise/>'),'<score-partwise/>');
console.log('PASS optional audio & MusicXML DTD: generated WAV omitted, regenerated on import, upload preserved, native DTD allowed, ENTITY/external blocked');
