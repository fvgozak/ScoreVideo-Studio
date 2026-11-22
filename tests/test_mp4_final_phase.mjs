import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {VideoEncodeQueue} from '../static/offline/video-encode-queue.js';
import {Mp4Diagnostics} from '../static/offline/mp4-diagnostics.js';

const pause=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
class MockOutput {
  constructor({target}){this.target=target;}
  addVideoTrack(){}
  async start(){}
  async finalize(){await pause(35);this.target.buffer=new Uint8Array(8192);}
  async cancel(){}
}
class MockCanvasSource {
  constructor(canvas,config){this.config=config;this.calls=[];}
  add(timestamp,duration){this.calls.push([timestamp,duration]);return pause(1);}
  close(){}
}
class MockQuality {constructor(value){this.value=value;}}
class MockTarget {constructor(){this.buffer=new Uint8Array(0);}}
const canvas=()=>({width:0,height:0,getContext:()=>({fillRect(){},set fillStyle(value){}})});
const sandbox={
  window:{__offlineResult:null,__offlineProgress:null,__offlineLastProgress:null},
  document:{createElement:()=>canvas()},
  VideoEncoder:{isConfigSupported:async()=>({supported:true})},
  Output:MockOutput,Mp4OutputFormat:class{},BufferTarget:MockTarget,StreamTarget:class{},CanvasSource:MockCanvasSource,
  Quality:MockQuality,VideoEncodeQueue,Mp4Diagnostics,NullTarget:class{},
  decodeProjectAudio:async()=>{throw Error('audio not expected');},
  createAacSource:()=>{},encodeAudioSamples:()=>{},
  performance:{now:()=>Date.now(),memory:{usedJSHeapSize:0}},
  AbortController,Blob,Uint8Array,Number,Math,Object,Array,Error,Promise,console,
  setTimeout,clearTimeout,crypto:globalThis.crypto
};
const js=fs.readFileSync(new URL('../static/offline/offline.js',import.meta.url),'utf8')
  .replace(/^import .*;\s*$/gm,'');
vm.runInNewContext(js,sandbox,{filename:'offline.js'});
const monitor=setInterval(()=>{
  const phase=sandbox.window.__offlineProgress?.phase;
  if(phase)sandbox.window.__phases??=new Set();
  if(phase)sandbox.window.__phases.add(phase);
},3);
try {
  const result=await sandbox.window.ScoreOfflinePrototype.run('simple',{
    fps:30,seconds:1.2,audioMode:'none',storage:'memory',maxEncodeInFlight:2
  });
  assert.equal(result.frames,36);
  assert.equal(result.bytes,8192);
  assert.equal(result.encoderAcceleration,'prefer-hardware');
  assert.equal(result.mp4Diagnostics.canvasSubmitCount,36);
  assert.equal(result.videoDrainMs>=0,true);
  assert.equal(result.readFileMs>=0,true);
  assert.equal(sandbox.window.__offlineLastProgress.phase,'completed');
  assert.ok(result.finalStagesMs['draining-video']>=0);
  assert.ok(result.finalStagesMs['finalizing-mp4']>=0);
  assert.ok(sandbox.window.__phases.has('finalizing-mp4'));
  assert.equal(sandbox.window.__offlineProgress,null);
  assert.ok(sandbox.window.__offlineResult instanceof Blob);
  await sandbox.window.ScoreOfflinePrototype.release();
  assert.equal(sandbox.window.__offlineResult,null);
  const ignored=await sandbox.window.ScoreOfflinePrototype.run('simple',{
    fps:10,seconds:0.5,audioMode:'none',storage:'discard',maxEncodeInFlight:2
  });
  assert.equal(ignored.frames,5);
  assert.equal(sandbox.window.__offlineResult,null);
  assert.equal(ignored.storage,'discard');
  assert.ok(sandbox.window.__offlineLastMetrics.mp4Diagnostics);
  await sandbox.window.ScoreOfflinePrototype.release();
  console.log('PASS MP4 phases: video drain, finalization, file creation, encoder preference, release');
} finally {clearInterval(monitor);}
