import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const box={window:{},console};
vm.runInNewContext(read('static/studio-scene.js'),box,{filename:'studio-scene.js'});
vm.runInNewContext(read('static/pixi-fx.js'),box,{filename:'pixi-fx.js'});
const {ScoreStudio,ScorePixiFx}=box.window;
const defaultScene=ScoreStudio.normalize({});
assert.equal(defaultScene.scoreParticles.on,false,'Old projects must remain particle-free');
const scene=ScoreStudio.normalize({fxMode:'none',scoreImpactEnabled:false,scoreParticles:{on:true,style:'dust',count:12,size:.8,speed:34,life:.75,brightness:1.2},lightColorMode:'aurora',lightColorPreset:'random'});
assert.equal(scene.scoreParticles.on,true);
assert.equal(scene.scoreParticles.count,12);
assert.equal(ScoreStudio.normalize({scoreParticles:{on:true,style:'xxx',count:999,life:40}}).scoreParticles.count,24);
assert.equal(ScoreStudio.normalize({scoreParticles:{on:true,style:'xxx',count:999,life:40}}).scoreParticles.life,1.5);

const ctx=new Proxy({}, {get:(_key,name)=>() =>{}});
const rect=(left,top,width,height)=>({left,top,width,height});
const stage={clientWidth:960,clientHeight:540,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>rect(0,0,960,540)};
const head={getBoundingClientRect:()=>rect(290,125,14,10)};
const note={audio:1,midi:1.12,pitch:64,velocity:102,noteX:297,noteY:130,headEl:head,el:head,endAudio:1.5,hand:'upper',beat:2};
const layer=Object.create(ScoreStudio.LayerRenderer.prototype);
Object.assign(layer,{viewport:stage,context:ctx,canvas:{style:{}},atmosphere:{style:{}},titleBox:{style:{},querySelector:()=>({style:{},textContent:''})},gpuLayer:{},gpuEffects:{trails:{on:false}},scene,resize:()=>({w:960,h:540})});
const follower={noteTriggers:[note],viewport:stage,container:{getBoundingClientRect:()=>rect(0,0,960,540)},cameraAccents:[],cameraScale:1,
 effects:{velocityReactive:true,staffColors:{enabled:false}},colors:()=>({glow:'#5ac8ad',ink:'#ffffff',paper:'#111722'}),timestamps:[0,30],audioDuration:30,velocityRange:{min:40,max:120}};
layer.draw(1.1,follower);
const commands=layer.gpuCommands.filter(c=>c.kind==='scoreParticleBurst');
assert.equal(commands.length,1,'Score particle events must emit with regular score FX disabled');
const emitted=commands[0];
assert.equal(emitted.space,'stage');
assert.equal(emitted.color,ScoreStudio.randomNoteColor(note),'Particle hue must track score Random light hue');
assert.ok(Math.abs(emitted.x-297)<1 && Math.abs(emitted.y-130)<1,'Particle origin must be the notehead');
assert.equal(emitted.particleSettings.count,12);
layer.draw(1.1,follower);
assert.equal(JSON.stringify(layer.gpuCommands.filter(c=>c.kind==='scoreParticleBurst')),JSON.stringify(commands),'Seek/frame order must not change particle commands');
layer.draw(1.9,follower);
assert.equal(layer.gpuCommands.filter(c=>c.kind==='scoreParticleBurst').length,0,'Expired particles must vanish');
layer.scene=ScoreStudio.normalize({fxMode:'none',scoreImpactEnabled:false,scoreParticles:{on:false}});
layer.draw(1.1,follower);
assert.equal(layer.gpuCommands.filter(c=>c.kind==='scoreParticleBurst').length,0,'Disable must suppress emissions');

// Exercise the real Pixi particle calculation without creating WebGL devices.
const fx=ScorePixiFx.normalizeEffects({cinematic:{on:false,strength:0},stardust:{on:false},burst:{on:false}});
function render(mode,age=.15){
 const sprites=[];const stub={pixelScale:1,particleCount:0,particle(shape,x,y,size,alpha,color,rotation){sprites.push({shape,x,y,size,alpha,color,rotation});this.particleCount++;}};
 ScorePixiFx.Layer.prototype.burst.call(stub,{...emitted,age,particleSettings:{...emitted.particleSettings,style:mode}},fx,true);
 return sprites;
}
const dust=render('dust');const dust2=render('dust');
assert.ok(dust.length>=4,'GPU particle emission must produce visible particles with global burst OFF');
assert.deepEqual(dust,dust2,'GPU particle placement must be reproducible');
assert.ok(dust.every(p=>p.color===emitted.color),'Every score particle follows the score note hue');
const rise=render('rise');const spark=render('spark');
assert.ok(rise.every(p=>p.shape===0||p.shape===1));
assert.ok(spark.every(p=>p.shape===1||p.shape===2));
assert.ok(render('dust',.85).length===0,'Particles disappear at their exact lifetime');
assert.ok(render('dust',.4)[0].alpha<dust[0].alpha,'Particles fade as they age');

const fxSource=read('static/fx-groups.js'),app=read('static/app.js'),html=read('static/index.html'),exportHtml=read('static/render.html');
assert.ok(fxSource.includes("['particles','Particle Glow']"));
for(const id of ['scoreParticlesOn','scoreParticleStyle','scoreParticleCount','scoreParticleSize','scoreParticleSpeed','scoreParticleLife','scoreParticleBrightness']){
 assert.ok(fxSource.includes(`id="${id}"`),`Missing UI ${id}`);
 assert.ok(app.includes(`'${id}'`),`Missing persistence ${id}`);
}
assert.ok(app.includes('scoreParticles:{on:'));
for(const f of [html,exportHtml]){
 assert.ok(f.includes('/static/studio-scene.js?v=scoreparticles1'));
 assert.ok(f.includes('/static/pixi-fx.js?v=scoreparticles1'));
}
for(const locale of ['ko','en','ja']){
 const data=JSON.parse(read(`static/locales/${locale}.json`));
 for(const key of ['effects.scoreParticlesOn','effects.scoreParticlePreset','effects.scoreParticleCount','effects.scoreParticleStyle','effects.scoreParticleLife','effects.scoreParticleBrightness']) assert.ok(data.messages[key],`${locale} missing ${key}`);
}
console.log('PASS score particles: score event -> Pixi masks, deterministic note colors, three styles, on/off, lifetime, preview/export wiring, 3 locales');
