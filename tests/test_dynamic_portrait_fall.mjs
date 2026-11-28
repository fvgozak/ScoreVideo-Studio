import assert from 'node:assert/strict';
import {stageCamera,noteFallLane,noteRiseLane,NOTE_BAR_Z} from '../static/dynamic-fx/stageCamera.js';
for(const [w,h,width] of [[1080,1920,3.9],[1080,1920,6.5],[1080,1920,9.5],[1920,1080,undefined]]){
 const camera=stageCamera(w,h,14.2,-.81,-2.27,{visibleWidth:width,tilt:.27});
 const lane=noteFallLane(camera,2.8,h>w,-.81),m=camera.matrix;
 const screenTop=(1-(m[5]*(-.81+lane.speed*2.8)+m[9]*NOTE_BAR_Z+m[13]))/2;
 assert.ok(Math.abs(screenTop)<1e-8,`${w}x${h} camera width ${width} spawns at y=0`);
 assert.ok(lane.roof>=-.81+lane.speed*2.8);
 if(w>h){const rise=noteRiseLane(camera,2.8,false,-.81);assert.equal(rise.speed,5.1/2.8);assert.equal(rise.roof,5.4);}
}
console.log('PASS: Dynamic FX portrait and landscape full-height note fall');
