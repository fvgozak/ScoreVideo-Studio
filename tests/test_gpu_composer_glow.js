const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/gpu-composer.js','utf8');
let xml='',created=0;
const context={window:{},document:{},
  Blob:class {constructor(parts){this.value=parts.join('');}},
  URL:{createObjectURL(blob){xml=blob.value;created++;return `blob:scoremotion:${created}`;},revokeObjectURL(){}},
  Image:class {set src(value){this.url=value;}async decode(){}},
  XMLSerializer:class {serializeToString(){return '<g><path d="M0 0 H16 V9 H0 Z" fill="#c0ffee"/></g>';}}
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'gpu-composer.js'});
const Composer=context.window.ScoreGpuComposer._test.GPUComposer;
const compositor=Object.create(Composer.prototype);
compositor.headCache=new WeakMap();
const head={getBBox(){return {x:0,y:0,width:16,height:9};},cloneNode(){return {matches(){return false;},querySelectorAll(){return [{getAttribute(){return 'none';},setAttribute(){}}];}};}};
(async()=>{
  const rect={x:100,y:150,width:16,height:9};
  const withGlow=await compositor.getHead(head,'#efc2ff',3.2,rect);
  assert.equal(withGlow.pad,11,'a 3px halo needs 11px exterior padding');
  assert.match(xml,/feGaussianBlur/,'the raster needs an SVG gaussian silhouette halo');
  assert.match(xml,/width="38" height="31"/,'the bitmap must contain the whole padded glow');
  assert.match(xml,/viewBox="-11 -11 38 31"/,'the source bbox must expand with padding');
  const cached=await compositor.getHead(head,'#efc2ff',3.4,rect);
  assert.equal(cached,withGlow,'nearby blur samples should share the same cached image');
  assert.equal(created,1,'cache hit must avoid rebuilding SVG');
  const withoutGlow=await compositor.getHead(head,'#efc2ff',0,rect);
  assert.equal(withoutGlow.pad,1,'minimal notes should keep only anti-aliasing padding');
  assert.doesNotMatch(xml,/feGaussianBlur/,'non-glowing notes must not acquire a halo');
  const scoreDrawIndex=source.indexOf('const headTile=await this.getHead(');
  const glowDrawIndex=source.indexOf('for(const canvas of scoreEffects){');
  assert.ok(glowDrawIndex>scoreDrawIndex,'Pixi bloom must be above noteheads, matching DOM z-index');
  console.log('GPU score glow parity: SVG silhouette halo, padding, quantized caching, minimal path and layer order verified');
})().catch(error=>{console.error(error);process.exitCode=1;});
