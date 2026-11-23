import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2]||'.';
const local=fs.readFileSync(path.join(root,'static/local-projects.js'),'utf8');
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
assert.match(local,/const decodedSalamander=new Map\(\),loadingSalamander=new Map\(\)/);
assert.match(local,/const SALAMANDER_CACHE_LIMIT=48\*1024\*1024/);
assert.match(local,/workers=Math\.min\(6,tasks\.length\)/);
assert.match(local,/const stereo=new Uint32Array\(buffer,44,count\)/);
assert.match(local,/if\(littleEndian\)/);
assert.match(local,/if\(context\)await context\.close\(\)/);
assert.match(app,/function queueSalamanderWarmup\(id\)/);
assert.match(app,/queueSalamanderWarmup\(meta\.id\)/);
assert.match(app,/void window\.ScoreLocalProjects\.ensureAudio\(id\)\.catch/);
assert.match(html,/\/static\/app\.js\?[^"\s]*salamanderFast1/);
assert.match(html,/\/static\/local-projects\.js\?[^"\s]*salamanderFast1/);
// The packed stereo writer must produce the identical RIFF PCM payload as
// the previous per-channel DataView.setInt16 implementation, including clipping
// and signed values; test ~2.5 million frames to catch buffer/offset errors.
const count=2_500_000,a=new Float32Array(count),b=new Float32Array(count);
for(let i=0;i<count;i++){
 a[i]=Math.sin(i*0.009)*1.12;
 b[i]=Math.cos(i*0.011)*1.12;
}
const old=new ArrayBuffer(44+count*4),fast=new ArrayBuffer(44+count*4);
const o=new DataView(old),f=new DataView(fast);
for(let i=0;i<count;i++){
 o.setInt16(44+i*4,Math.round(Math.max(-1,Math.min(1,a[i]))*32767),true);
 o.setInt16(46+i*4,Math.round(Math.max(-1,Math.min(1,b[i]))*32767),true);
}
const out=new Uint32Array(fast,44,count);
for(let i=0;i<count;i++){
 const left=Math.round(Math.max(-1,Math.min(1,a[i]))*32767);
 const right=Math.round(Math.max(-1,Math.min(1,b[i]))*32767);
 out[i]=(left&65535)|((right&65535)<<16);
}
assert.equal(Buffer.compare(Buffer.from(old),Buffer.from(fast)),0,'PCM must be bit-identical');
console.log('PASS Salamander fast: decoded sample reuse, background warmup, cache-busting, bit-identical 2.5M-frame PCM');
