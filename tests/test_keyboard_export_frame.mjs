import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {stageCamera} from '../static/dynamic-fx/stageCamera.js';
import {FRONT_Y,HIT_Y} from '../static/dynamic-fx/keyboardMesh.js';

// In the default camera the playable front edge, not the decorative case,
// is anchored close to the video bottom in both landscape and portrait.
// Camera movement controls keys, strike line and note bars together.
const keyboardWidth=13.4;
for(const [w,h] of [[1080,1920],[2160,3840],[720,1280],[1920,1080]]){
  for(const visibleWidth of [3.9,5.5,7,13.4])for(const tilt of [0,.27,.62]){
    const camera=stageCamera(w,h,keyboardWidth,HIT_Y,FRONT_Y,{visibleWidth,tilt});
    const pxY=y=>{
      const v=camera.matrix;
      return (1-(v[5]*y+v[9]*.038+v[13]))/2;
    };
    const strike=pxY(HIT_Y),front=pxY(FRONT_Y);
    assert.ok(strike>0&&strike<.99,`strike line in frame ${w}x${h}: ${strike}`);
    assert.ok(Math.abs(front-.991)<.00001,`white-key front is bottom-anchored ${w}x${h}: ${front}`);
    assert.ok(front>strike&&front<1,`white keys in frame ${w}x${h}: ${front}`);
    assert.ok(Math.abs(camera.frontScreenY-front)<.00001);
    for(const offset of [-12,5]){
      const shifted=stageCamera(w,h,keyboardWidth,HIT_Y,FRONT_Y,{visibleWidth,tilt,verticalOffsetPct:offset});
      const projected=y=>{const matrix=shifted.matrix;return (1-(matrix[5]*y+matrix[9]*.038+matrix[13]))/2;};
      const delta=offset/100;
      assert.ok(Math.abs(projected(FRONT_Y)-front-delta)<.00001,`front offset ${w}x${h}: ${offset}`);
      assert.ok(Math.abs(projected(HIT_Y)-strike-delta)<.00001,`strike offset ${w}x${h}: ${offset}`);
    }
  }
}
// Cross-component invariant: the *full-stage WebGL canvas* gets mapped to the
// exact MP4 resolution, independent of a preview CSS rect. Legacy bottom-
// anchored canvases retain their measured placement.
const src=readFileSync(new URL('../static/gpu-composer.js',import.meta.url),'utf8');
const ctx={window:{},console};vm.runInNewContext(src,ctx);
const {pianoLayerBox}=ctx.window.ScoreGpuComposer._test;
const viewport={};const rect={x:80,y:300,width:720,height:420};
const dynamic={parentElement:viewport,classList:{contains:name=>name==='piano-dynamic-canvas'}};
const legacy={parentElement:viewport,classList:{contains:()=>false}};
const dynamicBox=pianoLayerBox(dynamic,viewport,1080,1920,rect);
assert.equal(dynamicBox.x,0);assert.equal(dynamicBox.y,0);
assert.equal(dynamicBox.width,1080);assert.equal(dynamicBox.height,1920);
assert.equal(pianoLayerBox(legacy,viewport,1080,1920,rect),rect);
assert.match(src,/Keyboard WebGL size mismatch/);
assert.match(src,/Keyboard Dynamic FX canvas is hidden or missing/);
console.log('PASS landscape/Shorts keyboard bottom anchor and vertical offset, compositor stage-space mapping and export guards');
