import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let clones=0,decodes=0,transientCleanups=0;
const transient={
  classList:{remove(...names){assert.ok(names.includes('score-glowing'));transientCleanups++;}},
  style:{removeProperty(name){assert.ok(['translate','scale','--score-minimal-color'].includes(name));}}
};
const svg={
  getAttribute(name){return ({width:'500',height:'300',viewBox:null})[name]??null;},
  cloneNode(deep){
    assert.equal(deep,true);clones++;
    return {
      style:{setProperty(){}},setAttribute(){},insertBefore(){},
      querySelectorAll(selector){
        assert.match(selector,/score-glowing/);
        return [transient];
      }
    };
  }
};
class FakeImage{
  naturalWidth=500;naturalHeight=300;
  async decode(){decodes++;}
}
const context={
  window:{},Image:FakeImage,
  document:{createElementNS(){return {textContent:''};}},
  Blob:class{constructor(args){assert.equal(args.length,1);}},
  URL:{createObjectURL(){return 'blob:test'},revokeObjectURL(){}},
  XMLSerializer:class{serializeToString(){return '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300"/>'}}
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('static/gpu-composer.js','utf8'),context);
const Composer=context.window.ScoreGpuComposer._test.GPUComposer;
const stage={settings:{scene:{notationStyle:'classic'},effects:{
  drawScore:true,minimalMode:false,minimalPalette:null,accent:'#42d3e0',ink:'#fff',paper:'#111',staff:'#666',inverted:false
}},follower:{activeNodes:[{}],drawRevision:9}};
const app={canvas:{},stage:{addChild(){}},renderer:{},render(){}};
const PIXI={Container:class{addChild(){}},Graphics:class{},Sprite:class{}};
const composer=new Composer(app,PIXI,stage);
composer.frameNumber=1;
let a=await composer.getSvg(svg,stage,'');
assert.equal(decodes,1);
assert.equal(clones,1);
composer.frameNumber=2;
let b=await composer.getSvg(svg,stage,'');
assert.equal(b,a,'active noteheads must not invalidate the engraving raster');
assert.equal(decodes,1);
assert.equal(clones,1);
stage.follower.activeNodes=[{},{}];
composer.frameNumber=3;
let c=await composer.getSvg(svg,stage,'');
assert.equal(c,a);
assert.equal(decodes,1);
composer.frameNumber=4;
stage.follower.drawRevision=10;
let d=await composer.getSvg(svg,stage,'');
assert.notEqual(d,a,'newly revealed glyph must update the cached SVG');
assert.equal(decodes,2);
assert.equal(clones,2);
assert.equal(transientCleanups,2);
// A separate tile at the same reveal revision reuses its own bitmap too.
const crop={full:{left:0,top:0,width:500,height:300},visible:{left:0,top:0,width:250,height:300},width:250,height:300};
composer.frameNumber=5;
await composer.getSvg(svg,stage,'',crop,'0:0');
composer.frameNumber=6;
await composer.getSvg(svg,stage,'',crop,'0:0');
assert.equal(decodes,3);
stage.settings.effects.drawScore=false;
composer.frameNumber=7;
await composer.getSvg(svg,stage,'');
assert.equal(decodes,4,'switching drawing mode changes the signature');
console.log('PASS: drawScore animated active notes retain cached SVGs until drawRevision changes; static and tile reuse');
