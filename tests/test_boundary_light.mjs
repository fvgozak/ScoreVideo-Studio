import assert from 'node:assert/strict';
import {normalizeBoundaryLight,boundaryGeometry,boundaryPulses,BOUNDARY_STYLES} from '../static/dynamic-fx/boundary-light.js';
import {stageCamera} from '../static/dynamic-fx/stageCamera.js';
import {readFileSync} from 'node:fs';
assert.equal(Object.keys(BOUNDARY_STYLES).length,9);
assert.equal(normalizeBoundaryLight({}).style,'none'); // older projects retain hitline
for(const style of Object.keys(BOUNDARY_STYLES)){
  assert.equal(normalizeBoundaryLight({style}).style,style);
}
assert.deepEqual({thickness:normalizeBoundaryLight({thickness:99}).thickness,
 strength:normalizeBoundaryLight({strength:99}).strength,
 speed:normalizeBoundaryLight({speed:99}).speed}, {thickness:5,strength:2,speed:2.5});
assert.equal(normalizeBoundaryLight({style:'not-real',color:'bad'}).style,'none');
assert.equal(normalizeBoundaryLight({color:'bad'}).color,'#73c9ed');
assert.equal(normalizeBoundaryLight({speed:null}).speed,0);
assert.equal(normalizeBoundaryLight({}).speed,1);
for(const [w,h,vis] of [[1080,1920,5.5],[2160,3840,5.5],[1920,1080,14.2],[1080,1080,14.2]]){
 for(const tilt of [0,.27,.62]){
  const camera=stageCamera(w,h,14.2,-.81,-2.27,{visibleWidth:vis,tilt});
  const geometry=boundaryGeometry(camera,w,h,14.2);
  const actualKeyCrownY=camera.matrix[5]*-.81+camera.matrix[9]*.038+camera.matrix[13];
  assert.ok(Math.abs(geometry.y-actualKeyCrownY)<1e-6,'shader ribbon must track true key top');
  // The old sign error moved the stripe to the opposite side of the frame.
  assert.ok(geometry.y<-.35,'boundary must be in lower part of canvas');
  assert.ok(geometry.left>=0&&geometry.right<=1&&geometry.right>geometry.left);
  assert.ok(geometry.halfHeight>=10);
 }
}
const camera=stageCamera(1080,1920,14.2,-.81,-2.27,{visibleWidth:5.5,focusX:0});
const lights=new Float32Array(88*4),keyX=new Float32Array(88);
for(let i=0;i<88;i++)keyX[i]=(i-43.5)*.16;
lights[43*4+3]=2.4;lights[44*4+3]=1.9;
const pulses=boundaryPulses(lights,keyX,camera);
assert.equal(pulses.count,2);
assert.ok(pulses.values[1]>pulses.values[3]);
assert.equal(boundaryPulses(new Float32Array(88*4),keyX,camera).count,0);
const shader=readFileSync(new URL('../static/dynamic-fx/shaders.js', import.meta.url),'utf8');
assert.ok(shader.includes('uTime')&&shader.includes('uSpeed'));
assert.ok(shader.includes('uStyle==7')&&shader.includes('uStyle==8'));
assert.ok(shader.includes('float drop=')&&shader.includes('float branch='));
const renderer=readFileSync(new URL('../static/dynamic-fx/renderer.js', import.meta.url),'utf8');
assert.ok(renderer.includes('this.drawBoundary(camera,keyLights,w,h,engine.time,false)'));
assert.ok(renderer.includes('this.drawBoundary(camera,keyLights,w,h,engine.time,true)'));
assert.ok(renderer.includes('const pulses=[3,7,8].includes(settings.styleId)'));
assert.equal((renderer.match(/if\(this\.settings\.showHitline&&normalizeBoundaryLight\(this\.settings\.boundaryLight\)\.styleId===0\)/g)||[]).length,2);
console.log('PASS keyboard edge camera projection, 8 animated/preset styles, MIDI pulses and duplicate-line prevention');
