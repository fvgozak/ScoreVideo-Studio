const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const c = {window:{},document:{},console};
vm.createContext(c);
for(const name of ['score-core.js','studio-scene.js','stage-runtime.js'])
  vm.runInContext(fs.readFileSync('static/'+name,'utf8'),c,{filename:name});
const S = c.window.ScoreStudio;
const Stage = c.window.ScoreStage;
for(const fxMode of ['bloom','glitter','trail','resonance','none']) {
  const s=S.normalize({fxMode,lightColorMode:'aurora',auroraPreset:'polar'});
  assert.equal(s.fxMode,fxMode);
  assert.equal(s.lightColorMode,'aurora');
  assert.equal(S.noteLightColor(s,1,'#ffffff'),'#419dff');
  assert.equal(S.noteLightColor(s,127,'#ffffff'),'#ff5268');
  assert.notEqual(S.noteLightColor(s,64,'#ffffff'),'#419dff');
  assert.equal(S.noteLightColor(S.normalize({...s,lightColorMode:'solid'}),127,'#123456'),'#123456');
}
const legacy=S.normalize({fxMode:'aurora',auroraPreset:'sunset'});
assert.equal(legacy.fxMode,'bloom');
assert.equal(legacy.lightColorMode,'aurora');
const out=Stage.normalized({scene:{fxMode:'trail',lightColorMode:'aurora',auroraLow:'#0000ff',auroraHigh:'#ff0000'}});
assert.equal(out.scene.fxMode,'trail');
assert.equal(out.scene.lightColorMode,'aurora');
const F=c.window.ScoreFollower;
const follower=Object.create(F.prototype);
follower.effects={lightColorMode:'aurora',auroraLow:'#0000ff',auroraHigh:'#ff0000'};
follower.colors=()=>({accent:'#808080'});
assert.equal(follower.eventLightColor(1),'#0000ff');
assert.equal(follower.eventLightColor(127),'#ff0000');

// Exercise the actual draw routine with a recorder canvas. Each renderer
// path must consume the same velocity-derived colors, including two-color
// hand trails, independently of which style was selected.
function mockContext() {
 const calls={gradient:[],radial:[],strokes:[],fills:[]};
 const ctx={calls,
  save(){},restore(){},beginPath(){},rect(){},clip(){},clearRect(){},fillRect(){},
  moveTo(){},quadraticCurveTo(){},lineTo(){},ellipse(){},arc(){},bezierCurveTo(){},
  setTransform(){},
  createRadialGradient(){const stops=[];calls.radial.push(stops);return {addColorStop(t,v){stops.push([t,v]);}};},
  createLinearGradient(){const stops=[];calls.gradient.push(stops);return {addColorStop(t,v){stops.push([t,v]);}};},
  stroke(){calls.strokes.push(this.strokeStyle);},
  fill(){calls.fills.push(this.fillStyle);}
 };
 return ctx;
}
const dummyLabel=()=>({style:{},textContent:''});
const rect=(x,y)=>({left:x,top:y,width:5,height:5});
for(const mode of ['bloom','glitter','trail','resonance']){
 const ctx=mockContext();
 const renderer=Object.create(S.LayerRenderer.prototype);
 renderer.viewport={clientWidth:100,clientHeight:100,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})};
 renderer.context=ctx;
 renderer.resize=()=>({w:100,h:100});
 renderer.canvas={style:{}};
 renderer.atmosphere={style:{}};
 renderer.titleBox={style:{},querySelector:dummyLabel};
 renderer.scene=S.normalize({fxMode:mode,lightColorMode:'aurora',auroraLow:'#0000ff',auroraHigh:'#ff0000',fxStrength:1});
 const events=[
   {audio:0.05,velocity:1,hand:'upper',systemKey:'sys-0',el:{getBoundingClientRect:()=>rect(20,20)}},
   {audio:0.20,velocity:127,hand:'upper',systemKey:'sys-0',el:{getBoundingClientRect:()=>rect(40,30)}}
 ];
 const follower={viewport:renderer.viewport,noteTriggers:events,effects:{velocityReactive:true},colors:()=>({paper:'#f5f5f5',ink:'#333333',glow:'#ffffff'}),audioDuration:3};
 renderer.draw(0.3,follower);
 if(mode==='trail'){
   assert.ok(ctx.calls.gradient.some(stops=>stops[0][1]==='#0000ff' && stops[1][1]==='#ff0000'), 'Aurora trail must blend per-note color');
 } else if(mode==='glitter'||mode==='resonance'){
   assert.ok(ctx.calls.strokes.includes('#0000ff'));
   assert.ok(ctx.calls.strokes.includes('#ff0000'));
 }else{
   assert.ok(ctx.calls.radial.some(stops=>stops.some(v=>String(v[1]).startsWith('#0000ff'))));
   assert.ok(ctx.calls.radial.some(stops=>stops.some(v=>String(v[1]).startsWith('#ff0000'))));
 }
}
const impactCtx=mockContext();
const impactRenderer=Object.create(S.LayerRenderer.prototype);
impactRenderer.viewport={clientWidth:100,clientHeight:100,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})};
impactRenderer.context=impactCtx;impactRenderer.resize=()=>({w:100,h:100});
impactRenderer.canvas={style:{}};impactRenderer.atmosphere={style:{}};
impactRenderer.titleBox={style:{},querySelector:dummyLabel};
impactRenderer.scene=S.normalize({fxMode:'none',fxStrength:0,scoreImpactEnabled:true,scoreImpactStrength:2});
const impactFollower={viewport:impactRenderer.viewport,noteTriggers:[{audio:0,velocity:110,pitch:72,noteX:30,noteY:30,endAudio:.5,el:{getBoundingClientRect:()=>rect(30,30)}}],
  effects:{velocityReactive:true},colors:()=>({paper:'#10151f',ink:'#ffffff',glow:'#68ddfa'}),audioDuration:2};
impactRenderer.draw(.05,impactFollower);
assert.ok(impactCtx.calls.radial.length>0,'score impact remains visible even when other scene effects are off');
impactRenderer.scene=S.normalize({fxMode:'none',fxStrength:0,scoreImpactEnabled:false});
const radialCount=impactCtx.calls.radial.length;
impactRenderer.draw(.05,impactFollower);
assert.equal(impactCtx.calls.radial.length,radialCount,'score impact switch disables its own light');
console.log('Independent light-color control: Aurora x Bloom/Glitter/Trail/Resonance, legacy migration and per-note colors verified');
