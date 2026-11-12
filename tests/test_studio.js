const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ctx={window:{},document:{}};vm.createContext(ctx);
for(const script of ['static/studio-scene.js','static/stage-runtime.js'])vm.runInContext(fs.readFileSync(script,'utf8'),ctx);
const Studio=ctx.window.ScoreStudio, Stage=ctx.window.ScoreStage;
const meta={id:'123',background_filename:'bg.png'};
const options={width:1080,height:1920,paper_color:'#eeeedc',ink_color:'#334455',glow_color:'#77aaff',
 scroll_mode:'horizontal',scene:{template:'cinematic',fxMode:'trail',fxStrength:1.3,
 animateBackground:true,keyframes:[{time:0,color:'#151b32',glow:'#91d3ff'},
 {time:20,color:'#421e30',glow:'#f2ade6'}]}};
const v=Stage.normalized(options,meta);
assert.equal(v.width,1080);assert.equal(v.height,1920);
assert.equal(v.effects.paper,'#eeeedc');assert.equal(v.effects.backgroundUrl,'/api/projects/123/background?v=bg.png');
assert.equal(v.scene.fxMode,'trail');assert.equal(v.scene.animateBackground,true);
assert.equal(v.scrollMode,'horizontal');
const at10=Studio.frame(v.scene,10),a=Studio.frame(v.scene,10);
assert.equal(at10.color,a.color);assert.notEqual(at10.color,options.scene.keyframes[0].color);
assert.equal(Studio.random(12,7),Studio.random(12,7));
const middle=Stage.normalized({...options,scene:{template:'minimal',fxStrength:0}},meta);
assert.equal(middle.scene.fxStrength,0);
const pure=Stage.normalized({...options,scene:{template:'minimal'}},{id:'a'});
assert.equal(pure.effects.backgroundUrl,'');
console.log('Shared studio scene configuration and deterministic frame tests passed');
