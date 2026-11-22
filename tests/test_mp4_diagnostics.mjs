import assert from 'node:assert/strict';
import {Mp4Diagnostics} from '../static/offline/mp4-diagnostics.js';

// Check real StreamTarget compatibility: it sends random-access write chunks
// to a WritableStream. Instrumentation must preserve position, bytes and order.
let clock=0;
const d=new Mp4Diagnostics({now:()=>clock});
const chunks=[];let closed=false;
const native={
  async write(chunk){clock+=7;chunks.push({type:chunk.type,position:chunk.position,data:[...chunk.data]});},
  async close(){clock+=4;closed=true;},
  async abort(){}
};
const writer=d.instrumentOpfs(native).getWriter();
await writer.write({type:'write',position:0,data:new Uint8Array([1,2,3])});
await writer.write({type:'write',position:1,data:new Uint8Array([4,5])});
await writer.close();
assert.deepEqual(chunks,[
  {type:'write',position:0,data:[1,2,3]},
  {type:'write',position:1,data:[4,5]}
]);
assert.equal(closed,true);
assert.equal(d.snapshot().opfsWriteCount,2);
assert.equal(d.snapshot().opfsWriteMs,14);
assert.equal(d.snapshot().opfsCloseMs,4);
assert.equal(d.snapshot().opfsMaxWriteMs,7);
assert.equal(d.opfsWrittenBytes,5);

d.videoSample({timestamp:0.1});clock+=12;
d.videoPacket({timestamp:0.1,byteLength:32768});
assert.equal(d.snapshot().videoPackets,1);
assert.equal(d.snapshot().encoderPacketDelayMs100,12);
assert.equal(d.snapshot().pendingPacketSamples,0);
// Bounded state: thousands of input samples must not grow the pending map.
for(let i=0;i<2000;i++)d.videoSample({timestamp:i/30});
assert.ok(d.sampleTimes.size<=512);
console.log('PASS MP4 diagnostics: OPFS stream semantics, counts, timing, bounded packet state');
