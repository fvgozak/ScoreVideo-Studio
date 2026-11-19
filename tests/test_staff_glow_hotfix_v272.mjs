/** Regression for v27.1 color-picker freeze, undefined now, and Canvas state leak. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const scene=readFileSync('static/studio-scene.js','utf8');
const runtime=readFileSync('static/stage-runtime.js','utf8');
const app=readFileSync('static/app.js','utf8');
const html=readFileSync('static/index.html','utf8');
const scope={window:{},document:{}};
runInNewContext(scene,scope,{filename:'studio-scene.js'});
runInNewContext(runtime,scope,{filename:'stage-runtime.js'});
const {ScoreStudio,ScoreStage}=scope.window;
let depth=0,maxDepth=0;
const ctx={
 save(){depth++;maxDepth=Math.max(depth,maxDepth);},restore(){depth--;assert.ok(depth>=0);},
 beginPath(){},rect(){},clip(){},clearRect(){},setTransform(){},
};
const rect=(x=0,y=0,w=1280,h=720)=>({left:x,top:y,width:w,height:h});
const viewport={clientWidth:1280,clientHeight:720,scrollLeft:0,scrollTop:0,getBoundingClientRect:()=>rect()};
const layer=Object.create(ScoreStudio.LayerRenderer.prototype);
layer.viewport=viewport;
layer.canvas={style:{},width:1280,height:720};
layer.context=ctx;
layer.titleBox={style:{},querySelector:()=>({style:{},textContent:''})};
layer.atmosphere={style:{}};
layer.scene=ScoreStudio.normalize({template:'cinematic',fxMode:'trail',fxStrength:1.2,
 scoreImpactEnabled:false,trailLength:12,trailBrightness:1,trailDuration:1.3});
layer.gpuLayer={};
layer.gpuEffects={trails:{on:true,length:12,duration:1.3,strength:1.0}};
const head=(x,y)=>({getBoundingClientRect:()=>rect(x,y,12,8)});
const events=[];
for(const [groupKey,hand,base,color] of [['P1:1','upper',100,'#ff0000'],['P2:1','lower',300,'#00ff00'],['P3:1','lower',530,'#0000ff']]){
 for(let j=0;j<3;j++)events.push({audio:.35+j*.2,endAudio:.42+j*.2,velocity:100,
   pitch:60+j,index:events.length,groupKey,hand,systemKey:'system1',beat:j,
   headEl:head(base+j*15,300+j*5),noteX:base+j*15,noteY:300+j*5});
}
events.sort((a,b)=>a.audio-b.audio||a.index-b.index);
const palette={'P1:1':'#ff0000','P2:1':'#00ff00','P3:1':'#0000ff'};
const follower={
 viewport,container:{getBoundingClientRect:()=>rect()},noteTriggers:events,
 timestamps:[0,2],audioDuration:2,cameraScale:1,cameraAccents:[],
 effects:{velocityReactive:true,staffColors:{enabled:true,colors:palette}},
 colors(){return {paper:'#080808',ink:'#fff',accent:'#eee',glow:'#bbb'};},
 eventLightColor(_velocity,note){return palette[note.groupKey];},
 activeTies(){return [];},
};
for(let i=0;i<40;i++){
 layer.draw(1,follower);
 assert.equal(depth,0,'Canvas save()/restore() must stay balanced every frame');
}
assert.ok(layer.gpuCommands.some(c=>c.kind==='trailRibbon'),'staff trails should render');
assert.deepEqual(new Set(layer.gpuCommands.filter(c=>c.kind==='trailTip').map(c=>c.color)),
 new Set(Object.values(palette)),'all 3 instruments retain independent trail colors');
assert.ok(maxDepth<=1,'no graphics-state stack buildup');
const savedEventLight=follower.eventLightColor;
follower.eventLightColor=()=>{throw Error('deliberate drawing fault');};
assert.throws(()=>layer.draw(1,follower),/deliberate drawing fault/);
assert.equal(depth,0,'exceptions must not leak the Canvas state stack');
follower.eventLightColor=savedEventLight;
layer.draw(1,follower);
assert.equal(depth,0,'next preview frame can recover');

let refreshed=0,seek=0,otherSettings=0,recolored=0;
const stage=Object.create(ScoreStage.Stage.prototype);
stage.settings=ScoreStage.normalized({staff_colors:{enabled:false,colors:{}}},{id:'a',has_score:true});
stage.follower={effects:{},colorActiveNodes(){recolored++;}};
stage.seek=()=>{seek++;};
stage.load=()=>{refreshed++;};
stage.piano={setSettings(){otherSettings++;}};
stage.setStaffColors({enabled:true,colors:{'P1:1':'#ff0033','P2:1':'#aaff22'}},{redraw:false});
assert.equal(stage.settings.effects.staffColors.colors['P1:1'],'#ff0033');
assert.equal(stage.follower.effects.staffColors.colors['P2:1'],'#aaff22');
assert.equal(seek,0,'playing preview relies on its regular frame update');
stage.setStaffColors({enabled:true,colors:{'P1:1':'#cc1122'}},{redraw:true});
assert.equal(seek,1,'paused preview redraws once');
assert.equal(recolored,2);
assert.equal(refreshed,0,'OSMD must not reload for a palette change');
assert.equal(otherSettings,0,'piano renderer must not reinitialize for a palette change');
assert.match(app,/staffColorsRaf=requestAnimationFrame\(/);
assert.doesNotMatch(app,/scoremotion:staffcolorschange'[^;]*queueApply\(/);
assert.match(html,/studio-scene\.js\?v=staff27b/);
console.log('PASS staff-color GPU trails, Canvas state cleanup, 3 groups, light update and cache bust');
