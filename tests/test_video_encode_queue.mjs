import assert from 'node:assert/strict';
import {VideoEncodeQueue} from '../static/offline/video-encode-queue.js';

const deferred=()=>{let resolve,reject;const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});return {promise,resolve,reject};};

// Capture must happen synchronously (like CanvasSource -> new VideoSample(canvas)).
// The encoder can still complete asynchronously, while the next scene draws.
{
  const calls=[];let currentFrame=0,active=0,peak=0;
  const gates=[];
  const queue=new VideoEncodeQueue({add(time,duration){
    const gate=deferred();gates.push(gate);
    calls.push({frame:currentFrame,time,duration});
    active++;peak=Math.max(peak,active);
    return gate.promise.finally(()=>{active--;});
  }},{maxInFlight:2});
  currentFrame=0;const first=queue.add(0,1/30,0);
  assert.equal(calls[0].frame,0,'first frame must be captured before async await');
  gates[0].resolve();await first;
  for(let i=1;i<3;i++){
    currentFrame=i;
    const pending=queue.add(i/30,1/30,i);
    if(i===1)await pending;
    else{
      assert.equal(calls.length,3);
      gates[1].resolve();await pending;
    }
  }
  currentFrame=3;
  const waiting=queue.add(3/30,1/30,3);
  assert.equal(calls.length,3,'no third outstanding sample is allowed');
  gates[2].resolve();await waiting;
  gates[3].resolve();await queue.drain();
  assert.deepEqual(calls.map(x=>x.frame),[0,1,2,3]);
  assert.deepEqual(calls.map(x=>x.time),[0,1/30,2/30,3/30]);
  assert.ok(calls.every(x=>x.duration===1/30));
  assert.equal(queue.peakInFlight,2);
  assert.equal(peak,2);
  assert.equal(queue.inFlight,0);
}

// Serial fallback preserves the original one-frame-at-a-time behavior.
{
  const gates=[],source={add(){const gate=deferred();gates.push(gate);return gate.promise;}};
  const queue=new VideoEncodeQueue(source,{maxInFlight:1});
  const first=queue.add(0,1,0);gates[0].resolve();await first;
  const second=queue.add(1,1,1);assert.equal(gates.length,2);
  gates[1].resolve();await second;await queue.drain();
  assert.equal(queue.peakInFlight,1);
}

// Rejection from encoder must propagate without an unhandled rejection.
{
  const gates=[],queue=new VideoEncodeQueue({add(){const g=deferred();gates.push(g);return g.promise;}},{maxInFlight:2});
  const first=queue.add(0,1,0);gates[0].resolve();await first;
  await queue.add(1,1,1);
  await queue.add(2,1,2);
  const next=queue.add(3,1,3); // third outstanding frame must wait for frame 1
  gates[1].reject(new Error('encoder lost'));
  await assert.rejects(next,/encoder lost/);
  gates[2].resolve();await queue.settle();
  assert.equal(queue.inFlight,0);
  assert.equal(queue.pending.length,0);
}

console.log('PASS bounded video queue: snapshots, ordering, backpressure, fallback, encoder errors');
