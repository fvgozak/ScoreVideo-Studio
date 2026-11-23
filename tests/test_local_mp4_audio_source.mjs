// Focused runtime test for the browser-only /api/projects/:id/audio fallback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=process.argv[2]||'.';
const src=fs.readFileSync(path.join(root,'static/offline/offline-audio.js'),'utf8');
const start=src.indexOf('export async function decodeProjectAudio(');
const stop=src.indexOf('\nexport function createAacSource(',start);
assert(start>0 && stop>start,'decodeProjectAudio function not found');
assert(!src.includes("if(meta.local_project&&!localUrl)throw Error('로컬 오디오 파일이 없습니다.')"), 'obsolete local URL guard still exists');
const functionBody=src.slice(start,stop).replace('export async function','async function');
let calls=[];
let input=new Uint8Array([1,2,3,4]).buffer;
let responseOk=true;
class FakeAudioContext {
 constructor(opts){assert.equal(opts.sampleRate,48000);}
 async decodeAudioData(bytes){assert.equal(bytes.byteLength,4);return {duration:1,sampleRate:48000,numberOfChannels:2};}
 async close(){}
}
const sandbox={
  window:{ScoreBrowserSalamander:null},
  performance:{now:()=>101},
  AudioContext:FakeAudioContext,
  fetch:async (url,opts)=>{calls.push({url,opts});return {ok:responseOk,status:404,arrayBuffer:async()=>input};},
  Error, encodeURIComponent, Uint8Array,
};
vm.createContext(sandbox);
vm.runInContext(functionBody+'\nthis.decode=decodeProjectAudio;',sandbox);
const signal=new AbortController().signal;
const id='0123456789abcdef0123456789abcdef';
const localMeta={id,local_project:true,audio_filename:'audio.wav',generated_audio:true};
const first=await sandbox.decode(localMeta,signal);
assert.equal(first.inputBytes,4);
assert.equal(calls[0].url,`/api/projects/${id}/audio`);
assert.equal(calls[0].opts.signal,signal);
assert.equal(first.buffer.duration,1);
assert.equal(calls.length,1);
const imported=await sandbox.decode({...localMeta,generated_audio:false,audio_filename:'original.mp3'},signal);
assert.equal(imported.inputBytes,4);
assert.equal(calls.length,2);
const remote=await sandbox.decode({...localMeta,local_project:false},signal);
assert.equal(remote.inputBytes,4);
assert.equal(calls.length,3);
const legacy=await sandbox.decode({...localMeta,local_audio_url:'blob:http://example.test/audio'},signal);
assert.equal(legacy.inputBytes,4);
assert.equal(calls.at(-1).url,'blob:http://example.test/audio');
sandbox.window.ScoreBrowserSalamander={get:()=>({blob:{arrayBuffer:async()=>input}})};
await sandbox.decode(localMeta,signal);
assert.equal(calls.length,4,'legacy active sample should be used');
sandbox.window.ScoreBrowserSalamander=null;
responseOk=false;
await assert.rejects(()=>sandbox.decode(localMeta,signal),/Source audio unavailable \(HTTP 404\)/);
console.log('PASS local MP4 audio: generated/uploaded/imported -> browser local API, remote/legacy preserved, missing audio fails clearly');
