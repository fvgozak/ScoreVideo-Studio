import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { join } from 'node:path';
const base=process.argv[2]||'.';
await import('file://'+join(process.cwd(),base,'static/project-archive.js').replace(/\/+/g,'/'));
const Z=globalThis.ScoreProjectArchive;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const bytes of [Buffer.from(''),Buffer.from('abc'),crypto.randomBytes(17),crypto.randomBytes(64),crypto.randomBytes(1023),crypto.randomBytes(1024*1024+123)]){
  assert.equal((await Z.checksums(new Blob([bytes]))).sha256,hash(bytes),'stream SHA-256');
}
const midi=Buffer.from('4d546864000000060000000101e04d54726b0000000d00903c408360803c4000ff2f00','hex');
const wav=Buffer.from('524946462400000057415645666d74201000000001000100401f0000803e0000020010006461746100000000','hex');
const record={id:'a'.repeat(32),meta:{id:'a'.repeat(32),note_count:1,tempo_map:[{beat:0,tempo_us:500000,second:0}],note_events:[{beat:0,pitch:60,second:0}],audio_duration_sec:2,has_score:false,midi_name:'test.mid',audio_name:'test.wav',musicxml_title:'Test',generated_audio:false,generated_midi:false,sync:{method:'test',offset_sec:0.2}},
  midi:new File([midi],'test.mid',{type:'audio/midi'}),audio:new File([wav],'test.wav',{type:'audio/wav'}),score:null,background:new File([crypto.randomBytes(61)],'img.png',{type:'image/png'}),state:null};
const state={schema_version:1,project_name:'Example',settings:{controls:{layoutMode:'singleline',scoreParticlesOn:true,scoreColorPreset:'random',keyboardColorPreset:'linked'},staff_colors:{enabled:false,keyboard:false,colors:{}},export:{download_name:'example.mp4'}},timeline:{synchronization:{schema_version:1,midi_to_audio:record.meta.sync,manual_offsets:{score_offset_sec:0.1,piano_offset_sec:-0.1},user_locks:[],review_state:'valid'},camera:{schema_version:1,camera_points:[{key:'a',zoom:1.3}]}},preview:{playhead_sec:1.1}};
await import('file://'+join(process.cwd(),base,'static/project-io.js').replace(/\/+/g,'/'));
globalThis.ScoreLocalProjects={codec:{midiTiming:()=>({}),readScore:async f=>f.text(),decodeScore:()=>({})}};
const exported=await globalThis.ScoreProjectIO.exportProject(record,state),zip=await Z.inspect(exported.blob);
assert.equal(exported.manifest.schema_version,1);
assert.equal(zip.entries.size,7);
assert.equal((await zip.json('project.json')).settings.controls.scoreColorPreset,'random');
assert.deepEqual(Buffer.from(await (await zip.extract('assets/midi/midi-source.mid')).arrayBuffer()),midi);
const round=await globalThis.ScoreProjectIO.readArchive(exported.blob);
assert.equal(round.record.meta.sync.offset_sec,0.2);
assert.equal(round.record.state.settings.controls.layoutMode,'singleline');
assert.equal(round.record.state.timeline.camera.camera_points[0].zoom,1.3);
assert.equal(round.record.audio.size,wav.length);
const rerender=await globalThis.ScoreProjectIO.exportProject(round.record,round.record.state);
assert.equal(rerender.manifest.assets.entries['midi-main'].sha256,exported.manifest.assets.entries['midi-main'].sha256);
const bytes=new Uint8Array(await exported.blob.arrayBuffer());const damaged=bytes.slice();const signature=Buffer.from('MThd');const index=bytes.findIndex((b,i)=>b===signature[0]&&signature.every((x,j)=>bytes[i+j]===x));assert(index>0);damaged[index+1]^=1;
await assert.rejects(()=>globalThis.ScoreProjectIO.readArchive(new Blob([damaged])),/체크섬/);
const future=structuredClone(exported.manifest);future.schema_version=99;assert.throws(()=>Z.validateManifest(future),/최신/);
assert.equal(Z.safePath('../oops'),false);assert.equal(Z.safePath('/absolute'),false);assert.equal(Z.safePath('assets/score.musicxml'),true);
if(process.env.ZIP_TEST_OUTPUT)await fs.writeFile(process.env.ZIP_TEST_OUTPUT,new Uint8Array(await exported.blob.arrayBuffer()));
console.log('PASS project archive: SHA-256 streaming, ZIP round-trip, original assets, Random/particle settings, camera/sync, corruption, future schema, path guards');
