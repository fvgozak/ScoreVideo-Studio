import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stageCamera,noteFallLane,noteRiseLane,NOTE_BAR_Z} from '../static/dynamic-fx/stageCamera.js';
import {risingNoteRect} from '../static/dynamic-fx/note-bars.js';
const hit=-.81,front=-2.27;
const project=(camera,y)=>{const m=camera.matrix;return (1-(m[5]*y+m[9]*NOTE_BAR_Z+m[13]))/2;};
const base=stageCamera(1920,1080,14.2,hit,front,{tilt:.27});
console.log('Before: landscape leading edge at', (project(base,hit+5.1)*100).toFixed(2)+'% of frame height');
assert.ok(project(base,hit+5.1)>.1);
let count=0;
for(const [w,h] of [[1280,720],[1920,1080],[2560,1440],[3840,2160],[1080,1080],[720,1280],[1080,1920],[1440,2560]]){
 for(const tilt of [0,.27,.65])for(const zoom of [1,1.5,2.1])for(const verticalOffsetPct of [-20,0,20])for(const duration of [.5,2.8,5]){
  const opts={tilt,zoom,verticalOffsetPct};
  for(const visibleWidth of [undefined,3.9,6.5,9.5]){
   const camera=stageCamera(w,h,14.2,hit,front,{...opts,visibleWidth});
   const portrait=h>w*1.04;
   const lane=noteFallLane(camera,duration,portrait,hit);
   assert.ok(lane.speed>0);
   assert.ok(Math.abs(project(camera,hit+lane.speed*duration))<1e-7,`entry ${w}x${h}`);
   assert.ok(project(camera,lane.roof)<0,'roof remains above screen');
   assert.ok(project(camera,hit+lane.speed*(duration+.1))<0,'early candidate is offscreen');
   assert.ok(project(camera,hit+lane.speed*duration*.9)>0,'bar enters gradually');
   assert.ok(project(camera,hit+lane.speed*duration*.1)<project(camera,hit),'before impact');
   const prior=noteRiseLane(camera,duration,portrait,hit);
   const distance=portrait?camera.strikeScreenY*camera.visibleHeight*Math.sqrt(1+tilt*tilt):5.1;
   assert.ok(Math.abs(prior.speed-distance/duration)<1e-9);
   assert.ok(Math.abs(prior.roof-(portrait?hit+distance+.15:5.4))<1e-9);
   count++;
  }
 }
}
const read=f=>readFileSync(new URL('../static/'+f,import.meta.url),'utf8');
assert.match(read('dynamic-fx/renderer.js'),/z=NOTE_BAR_Z/);
assert.match(read('dynamic-fx/renderer.js'),/risingNoteRect\(n,tm,\{hitY:HIT_Y,roof:riseLane.roof,speed:riseSpeed\}\)/);
assert.match(read('dynamic-fx/renderer.js'),/HIT_Y\+\(n.start-tm\)\*speed/);
for(const f of ['index.html','render.html','piano-fall.js','dynamic-fx/adapter.js','dynamic-fx/renderer.js'])assert.ok(read(f).includes('fullHeightFall1'),f);
console.log(`PASS: ${count} viewport/tilt/zoom/offset/lead combinations, preserved rising lane and cache chain`);
