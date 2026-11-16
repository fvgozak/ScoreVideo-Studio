const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const scope={};
vm.runInNewContext(fs.readFileSync('static/studio-scene.js','utf8'),scope);
vm.runInNewContext(fs.readFileSync('static/pixi-fx.js','utf8'),scope);

const fx=scope.ScorePixiFx.normalizeEffects({preset:'dreamy'});
assert.equal(fx.bloom.on,true);
assert.equal(fx.outline.on,false);
assert.equal(scope.ScorePixiFx.normalizeEffects({preset:'custom',outline:{on:true,strength:2}}).outline.strength,2);
for(const name of ['aurora','starlight','goldenHall','dreamscape','minimalNoir']){
  const preset=scope.ScorePixiFx.cinematicPresets[name];
  assert.ok(preset,`${name} preset exists`);
  const restored=scope.ScorePixiFx.normalizeEffects(JSON.parse(JSON.stringify({preset:name,...preset})));
  assert.equal(restored.preset,name);
  assert.equal(restored.cinematic.strength,preset.cinematic.strength);
}
assert.equal(scope.ScorePixiFx.normalizeEffects({preset:'classic'}).cinematic.reaction,0);
assert.equal(scope.ScorePixiFx.cinematicPresets.aurora.trails.on,true);
assert.equal(scope.ScorePixiFx.cinematicPresets.starlight.burst.life,.23);
assert.equal(scope.ScorePixiFx.cinematicPresets.goldenHall.palette.glowColor,'#DDB969');
const colors=scope.ScoreStudio.recommendMinimalPalette('contrast',{
  paper:'#ffffff',ink:'#101010',accent:'#2299cc',glow:'#88ccff',white:'#f1f1f5',black:'#151821'});
assert.match(colors.note,/^#[0-9a-f]{6}$/);
assert.equal(scope.ScoreStudio.minimalPalette({mode:'single',note:'#123456'},colors).note,'#123456');
const makeRect=()=>({left:0,top:0,width:1000,height:500});
const viewport={clientWidth:1000,clientHeight:500,scrollLeft:0,scrollTop:0,getBoundingClientRect:makeRect};
const context=Object.fromEntries(['setTransform','clearRect','save','beginPath','rect','clip','restore'].map(name=>[name,()=>{}]));
const layer=Object.create(scope.ScoreStudio.LayerRenderer.prototype);
layer.viewport=viewport;layer.canvas={width:0,height:0,style:{}};layer.context=context;
layer.atmosphere={style:{}};layer.titleBox={style:{},querySelector:()=>({style:{}})};
layer.scene=scope.ScoreStudio.normalize({fxMode:'none',fxStrength:1,scoreImpactEnabled:false});
layer.gpuLayer={};
const follower={viewport,container:{getBoundingClientRect:makeRect},cameraScale:1,effects:{},
  noteTriggers:[0,.2,.4].map((audio,index)=>({audio,endAudio:audio+.1,noteX:100+index*30,
    noteY:100+index*5,velocity:96,pitch:60+index*2,beat:index,hand:'upper',systemKey:1,index})),
  colors:()=>({glow:'#68ddfa',paper:'#ffffff',ink:'#101010'}),audioDuration:30,timestamps:[0,30]};
layer.gpuEffects={trails:{on:false,strength:1,length:8,duration:1.3}};
layer.draw(.55,follower);
assert.equal(layer.gpuCommands.filter(command=>command.kind==='trailRibbon').length,0);
layer.gpuEffects.trails.on=true;
layer.draw(.55,follower);
assert.equal(layer.gpuCommands.filter(command=>command.kind==='trailRibbon').length,2);
console.log('GPU light presets, minimal palette, and Trail ON/OFF commands verified');
