import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {Worker} from 'node:worker_threads';import vm from 'node:vm';
const root=process.argv[2]||'.';const source=fs.readFileSync(path.join(root,'static/melody-highlight.js'),'utf8'),workerSource=fs.readFileSync(path.join(root,'static/melody-worker.js'),'utf8');
let started=0,completed=0;
class BrowserWorker{
 constructor(url){assert.match(url,/melody-worker\.js/);started++;this.w=new Worker(`const {parentPort,workerData}=require('node:worker_threads');global.self=global;global.importScripts=()=>{(0,eval)(workerData.source)};global.postMessage=(data,transfer)=>parentPort.postMessage(data,transfer);(0,eval)(workerData.workerSource);parentPort.on('message',data=>global.onmessage({data}));`,{eval:true,workerData:{source,workerSource}});this.w.on('message',data=>{completed++;this.onmessage?.({data});});this.w.on('error',e=>this.onerror?.(e));}
 postMessage(data){this.w.postMessage(data);}
 terminate(){return this.w.terminate();}
}
// Expose the native typed array to the VM as the browser would for message events.
const window={Worker:BrowserWorker};vm.runInNewContext(source,{window,Float32Array,setTimeout,clearTimeout});const m=window.ScoreMelodyHighlight;
const notes=Array.from({length:1000},(_,i)=>({scoreKey:`n${i}`,audio:i*.15,endAudio:i*.15+(i%4?.08:.5),midi:i*.15,midiEnd:i*.15+(i%4?.08:.5),beat:i*.25,pitch:i%4?78+i%5:65+i%5,velocity:i%4?45:100,groupKey:'P1:1',voiceId:i%4?1:2,el:()=>{throw Error('DOM must not cross worker boundary');}}));
const cfg={enabled:true,sensitivity:65};
const engines=['v2a','v2b','v2c','v2d'];
const expected=Object.fromEntries(engines.map(algorithm=>[algorithm,JSON.stringify(m.analyze(notes,{...cfg,algorithm}))]));
// Simultaneous requests for different algorithms must not overwrite each other.
const jobs=engines.map(algorithm=>{const options={...cfg,algorithm};const a=m.prepare(notes,options),b=m.prepare(notes,options);assert.equal(a,b);return a;});
assert.equal(started,4);await Promise.all(jobs);assert.equal(completed,4);
for(const algorithm of [...engines].reverse().concat(engines)){
 const options={...cfg,algorithm};assert.equal(JSON.stringify(m.annotate(notes,options)),expected[algorithm],algorithm+' parity');await m.prepare(notes,options);m.annotate(notes,{...options,sensitivity:75});assert.equal(started,4);
}
console.log('PASS V2-A/B/C/D worker transport: actual worker, concurrent engines, transferable scores, DOM excluded, synchronous parity, coalesced jobs, separate caches');
