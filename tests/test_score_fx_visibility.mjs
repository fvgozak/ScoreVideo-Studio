import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
const root=process.argv[2] || '.';
const read=f=>readFileSync(resolve(root,f),'utf8');
const ctx={console,Math,Set,Map,Number,Array,Object,Date};
vm.runInNewContext(read('static/studio-scene.js'),ctx,{filename:'studio-scene.js'});
vm.runInNewContext(read('static/stage-runtime.js'),ctx,{filename:'stage-runtime.js'});
const {LayerRenderer}=ctx.ScoreStudio;
const {Stage,normalized}=ctx.ScoreStage;

function makeRenderer(){
  const calls={clear:0};
  const context={
    clearRect(){calls.clear++}, setTransform(){},
    save(){throw Error('score effect must not draw while score is hidden')},
  };
  const canvas={className:'',style:{},width:640,height:360,setAttribute(){},getContext(){return context}};
  const titleKids=new Map(['studio-title','studio-artist','studio-credit'].map(v=>['.'+v,{style:{},textContent:''}]));
  const title={className:'',style:{},innerHTML:'',querySelector(k){return titleKids.get(k)}};
  const atmosphere={className:'',style:{}};
  const viewport={clientWidth:640,clientHeight:360,scrollLeft:0,scrollTop:0,appendChild(){}};
  let index=0;
  const document={createElement(tag){return tag==='canvas'?canvas:[atmosphere,title][index++]}};
  return {canvas,context,title,atmosphere,viewport,document,calls};
}
const f=makeRenderer();
ctx.document=f.document;
const r=new LayerRenderer(f.viewport);
r.scoreVisible=false;
r.setScene({fxMode:'bloom',fxStrength:1,showText:true,title:'Test Title'});
assert.equal(r.canvas.style.display,'none','changing score FX presets cannot re-enable a hidden score canvas');
r.draw(1,{colors(){return {paper:'#111111',glow:'#aaaaaa',ink:'#ffffff'}},audioDuration:10,noteTriggers:[{audio:1,pitch:60}],viewport:f.viewport});
assert.ok(f.calls.clear>0,'old glow pixels must be cleared');
assert.equal(f.title.querySelector('.studio-title').textContent,'Test Title','title stays available when score is hidden');
assert.equal(r.canvas.style.display,'none');
r.scoreVisible=true;
r.setScene({fxMode:'bloom'});
assert.equal(r.canvas.style.display,'','score effects may become visible when score is enabled again');

const stage=Object.create(Stage.prototype);
const layer={scene:{minimalMode:false},canvas:{style:{},width:500,height:300},context:{clearRect(){layer.clearCount=(layer.clearCount||0)+1}},gpuCommands:[{kind:'note'}]};
stage.settings=normalized({score_visible:false});stage.layer=layer;
stage.follower={glitterLayer:{style:{}}};
stage.applyScoreVisibility();
assert.equal(layer.scoreVisible,false);
assert.equal(layer.canvas.style.display,'none');
assert.equal(layer.gpuCommands.length,0,'stale glow GPU commands removed');
assert.equal(layer.clearCount,1);
assert.equal(stage.follower.glitterLayer.style.display,'none');
stage.settings=normalized({score_visible:true});
stage.applyScoreVisibility();
assert.equal(layer.scoreVisible,true);
assert.equal(layer.canvas.style.display,'');
assert.equal(stage.follower.glitterLayer.style.display,'');

const runtime=read('static/stage-runtime.js');
const scene=read('static/studio-scene.js');
assert.match(runtime,/if\(!this\.settings\.scoreVisible\|\|!gpu\|\|!this\.follower\)return/,'Pixi score rendering must honor hidden layer');
assert.match(scene,/if\(s\.minimalMode\|\|this\.scoreVisible===false\)return/);
for(const page of ['static/index.html','static/render.html']){
 const html=read(page);
 for(const f of ['stage-runtime','studio-scene']){
  const pattern=new RegExp(`/static/${f}\\.js\\?v=scorehide1`,'g');
  assert.equal([...html.matchAll(pattern)].length,1,`${page}: must use patched ${f} script`);
 }
}
console.log('PASS score visibility: no orphan score glow, title retained, canvas cleared, GPU commands stopped, restore and editor/export cache parity');
