import assert from 'node:assert/strict';
import {stageCamera, noteFallLane} from '../static/dynamic-fx/stageCamera.js';

for(const width of [3.9, 6.5, 9.5]){
  const camera=stageCamera(1080,1920,14.2,-.81,-2.27,{visibleWidth:width,tilt:.27});
  const lane=noteFallLane(camera,2.8,true,-.81);
  const cosTilt=1/Math.sqrt(1+camera.tilt*camera.tilt);
  // At exactly 'noteFallSeconds' before impact, the incoming bar's bottom
  // should be level with the upper edge of a vertical frame.
  const screenTop=camera.strikeScreenY-lane.speed*2.8*cosTilt/camera.visibleHeight;
  assert.ok(Math.abs(screenTop)<1e-10, `9:16 camera width ${width} spawns notes at y=0`);
  assert.ok(lane.roof>=-.81+lane.speed*2.8,'upper clipping roof must not crop notes early');
}
const landscape=stageCamera(1920,1080,14.2,-.81,-2.27,{tilt:.27});
const lane=noteFallLane(landscape,2.8,false,-.81);
assert.equal(lane.speed,5.1/2.8,'16:9 fall behavior must stay unchanged');
assert.equal(lane.roof,5.4);
console.log('Dynamic FX portrait full-height note fall tests passed');
