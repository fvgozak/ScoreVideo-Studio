import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.argv[2]||'.';
const src=fs.readFileSync(path.join(root,'static/local-projects.js'),'utf8');
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
assert.match(src, /async function ensureAudio\(id\)/);
assert.match(src, /Promise\.allSettled\(Array\.from\(\{length:workers\}/, 'sample loading is bounded and parallel');
assert.match(app, /await ensureLocalAudioReady\(projectId\);/);
assert.match(app, /await ensureLocalAudioReady\(project\.id\);await audio\.play\(\);/);
assert.match(app, /audio\.removeAttribute\('src'\);audio\.load\(\);/);
assert.match(app, /const recorder=webmRecorder=/);
const rows=new Map();
let renders=0;
const db={
  objectStoreNames:{contains:()=>true},
  transaction(){
    const tx={oncomplete:null,onerror:null};
    tx.objectStore=(name)=>({
      put:(record)=>{rows.set(name+':'+record.id,record);queueMicrotask(()=>tx.oncomplete?.());},
      get:(id)=>({result:rows.get(name+':'+id)}),
      delete:(id)=>{rows.delete(name+':'+id);queueMicrotask(()=>tx.oncomplete?.());}
    });
    return tx;
  }
};
const indexedDB={open(){const req={result:db};queueMicrotask(()=>req.onsuccess?.());return req;}};
class FakeAudioContext{async close(){}}
class FakeOfflineAudioContext{
  constructor(channels,length){this.length=length;}
  async startRendering(){renders++;return {length:this.length,getChannelData:()=>new Float32Array(this.length)};}
}
const timing={midi_duration_sec:1,note_events:[],tempo_map:[{bpm:120}],note_count:0};
const sandbox={
  window:null,
  location:{search:'?browser-local',href:'http://127.0.0.1/static/index.html?browser-local',origin:'http://127.0.0.1',protocol:'http:',hostname:'127.0.0.1'},
  URL,URLSearchParams,Response,Request,File,Blob,FormData,crypto,indexedDB,
  AudioContext:FakeAudioContext,OfflineAudioContext:FakeOfflineAudioContext,
  fetch:async()=>{throw Error('No samples expected for empty-note test');},
  console,queueMicrotask,setTimeout,clearTimeout,Map,Set,Promise,Float32Array,ArrayBuffer,DataView,Date,Error,Math,Number,JSON,
  SCOREMOTION_LOCAL_ONLY:true,
  ScoreLocalCodec:{midiTiming:()=>timing,readScore:async()=>'<score-partwise/>',decodeScore:()=>({title:'Test'}),selectPerformance:(xml)=>({xml,parsed:{title:'Test'},alignment:null,repeat_info:{mode:'none'}})}
};
sandbox.window=sandbox;
vm.runInNewContext(src,sandbox,{filename:'local-projects.js'});
const local=sandbox.ScoreLocalProjects;
assert.equal(local.enabled,true);
const midi=new File([new Uint8Array(100)],'test.mid',{type:'audio/midi'});
const meta=await local.createProject({midi});
assert.equal(meta.generated_audio,true);
assert.equal(meta.audio_duration_sec,4);
assert.equal(renders,0,'project creation must not render WAV');
let record=await local.openProject(meta.id);
assert.ok(record.audio==null,'project saved immediately without WAV');
assert.equal(local.assetUrl(meta.id,'audio'),'');
// Portable archive must work even before a single audio sample was synthesised.
await import(pathToFileURL(path.resolve(root,'static/project-archive.js')).href);
await import(pathToFileURL(path.resolve(root,'static/project-io.js')).href);
const portableState={schema_version:1,project_name:'Test',settings:{controls:{aspectRatio:'16:9'}},
  timeline:{synchronization:{schema_version:1,manual_offsets:{score_offset_sec:0,piano_offset_sec:0},user_locks:[]},
    camera:{schema_version:1,camera_points:[]}}};
const {manifest,blob}=await globalThis.ScoreProjectIO.exportProject(record,portableState);
assert.equal(manifest.schema_version,1);
assert.equal(manifest.assets.bindings.audio,null);
assert.equal(manifest.extensions.audio_mode,'generate-from-midi');
assert.ok(blob.size>0,'archive exists without audio');
const [wav1,wav2]=await Promise.all([local.ensureAudio(meta.id),local.ensureAudio(meta.id)]);
assert.equal(wav1,wav2,'concurrent callers share synthesis');
assert.equal(renders,1,'only one offline synthesis');
assert.equal(wav1.name,'Salamander Grand Piano.wav');
assert.ok(wav1.size>44);
assert.ok(local.assetUrl(meta.id,'audio').startsWith('blob:'));
record=await local.openProject(meta.id);
assert.equal(record.audio.size,wav1.size,'generated WAV persisted for reuse');
await local.ensureAudio(meta.id);
assert.equal(renders,1,'repeated play/export must use stored WAV');
console.log('PASS lazy audio: instant project creation, no WAV before use, single-flight generation, IndexedDB reuse, playback+export gating');
