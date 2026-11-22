import assert from 'node:assert/strict';
import {Mp4Diagnostics} from '../static/offline/mp4-diagnostics.js';

// Samples must be counted independently from source.add() promises. A cap on
// the latter does not protect an asynchronous hardware encoder's own queue.
{
  const diag=new Mp4Diagnostics();
  let peak=0;
  const output=[];
  let active=false;
  const input=[];
  async function encoderWorker(){
    if(active)return;
    active=true;
    while(input.length){
      const id=input.shift();
      await new Promise(resolve=>setTimeout(resolve,1));
      diag.videoPacket({timestamp:id/60,byteLength:2400});
      output.push(id);
    }
    active=false;
  }
  const total=180,limit=8;
  for(let id=0;id<total;id++){
    await diag.waitForEncoderRoom(limit);
    diag.videoSample({timestamp:id/60});
    peak=Math.max(peak,diag.unencodedFrames);
    input.push(id);
    void encoderWorker();
  }
  while(diag.unencodedFrames)await new Promise(resolve=>setTimeout(resolve,2));
  assert.ok(peak<=limit,`pending encoder samples exceeded ${limit}: ${peak}`);
  assert.deepEqual(output,Array.from({length:total},(_,id)=>id),'all packets emitted in order');
  assert.equal(diag.unencodedFrames,0);
  assert.equal(diag.snapshot().peakUnencodedFrames,peak);
  assert.equal(diag.snapshot().videoPackets,total);
}
// A stalled encoder must terminate with a visible error instead of hanging forever.
{
  const diag=new Mp4Diagnostics();
  diag.videoSample({timestamp:0});
  await assert.rejects(diag.waitForEncoderRoom(1,{timeoutMs:15}),/encoder stalled/);
  assert.equal(diag._encoderRoomWaiters.size,0);
  const controller=new AbortController();
  const waiting=diag.waitForEncoderRoom(1,{signal:controller.signal});
  controller.abort();
  await assert.rejects(waiting,/Cancelled/);
  assert.equal(diag._encoderRoomWaiters.size,0);
}
console.log('PASS encoded packet backpressure: bounded backlog, full frame order, timeout and cancellation');
