import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {colorFromVelocity} from '../static/dynamic-fx/dynamics.js';
import {MidiFXEngine,ParticleField} from '../static/dynamic-fx/engine.js';
import {ScoreDynamicFX} from '../static/dynamic-fx/adapter.js';
import {GEOMETRY_FRAG,SPRITE_FRAG} from '../static/dynamic-fx/shaders.js';

const sceneContext={};
vm.runInNewContext(fs.readFileSync(new URL('../static/studio-scene.js',import.meta.url),'utf8'),sceneContext);
const S=sceneContext.ScoreStudio;
const range={min:40,max:60};
const source={lightingScene:S.normalize({lightColorMode:'aurora',velocityScale:'relative',
  auroraLow:'#de54f2',auroraHigh:'#8ff637'}),
  gpuEffects:{groups:{keyboard:{colorPreset:'linked'}},keyboard:{paletteLink:true,velocityColor:true}},
  strength:.8,light:true,enabled:true};
const follower={velocityRange:range,effects:{velocityReactive:false,velocityScale:'relative'},
  colors:()=>({accent:'#ababab'}),eventLightColor:()=> '#ababab'};
const fx=Object.create(ScoreDynamicFX.prototype);
fx.settings={};fx.canvas={style:{}};fx.lightingEpoch=0;
fx.configure(source,follower);
assert.equal(fx.settings.scoreAuroraLinked,true);
assert.equal(fx.settings.velocityScale,'relative');
assert.deepEqual(fx.settings.velocityRange,range);
assert.equal(fx.settings.velocityColor,true);
// Hidden global velocity reaction is OFF, but the explicit keyboard toggle
// must still produce distinct colors at both ends of the MIDI range.
const low=colorFromVelocity(40,fx.settings),mid=colorFromVelocity(50,fx.settings);
const high=colorFromVelocity(60,fx.settings);
assert.notDeepEqual(low,high);
for(const [v,actual] of [[40,low],[50,mid],[60,high]]){
  const hex=S.noteLightColor(source.lightingScene,v,'#ababab',range);
  const expected=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  for(let k=0;k<3;k++)assert.ok(Math.abs(actual[k]-expected[k])<=1/255+.00001,
    `linked keyboard and score must agree at velocity ${v}, channel ${k}`);
}
const song={events:[{type:'on',time:.1,midi:60,velocity:40,channel:0},
  {type:'on',time:.1,midi:64,velocity:60,channel:0}],tempos:[],duration:2};
const engine=new MidiFXEngine(song,fx.settings);
engine.advance(.11);
const lights=engine.keyLights();
for(const [pitch,color] of [[60,low],[64,high]]){
  const base=(pitch-21)*4;
  for(let k=0;k<3;k++)assert.ok(Math.abs(lights[base+k]-color[k])<1e-6,
    'GPU keyboard shader input must receive the velocity color');
}
const particles=new ParticleField(engine,fx.settings);
particles.onNote(engine.voices[0]);particles.onNote(engine.voices[1]);
assert.ok(particles.particles.some(p=>p.color.every((n,k)=>Math.abs(n-low[k])<1e-6)));
assert.ok(particles.particles.some(p=>p.color.every((n,k)=>Math.abs(n-high[k])<1e-6)));
// Custom colors override linked colors; turning off the keyboard color toggle
// deliberately freezes the gradient without changing any other effect.
fx.configure({...source,gpuEffects:{groups:{keyboard:{colorPreset:'custom'}},
  keyboard:{paletteLink:false,colorLow:'#0000ff',colorHigh:'#ff0000',velocityColor:true}}},follower);
assert.equal(fx.settings.scoreAuroraLinked,false);
assert.ok(colorFromVelocity(40,fx.settings)[2]>colorFromVelocity(40,fx.settings)[0]);
assert.ok(colorFromVelocity(60,fx.settings)[0]>colorFromVelocity(60,fx.settings)[2]);
fx.settings.velocityColor=false;
assert.deepEqual(colorFromVelocity(40,fx.settings),colorFromVelocity(60,fx.settings));
fx.settings.velocityColor=true;
fx.settings.velocityScale='absolute';
assert.notDeepEqual(colorFromVelocity(40,fx.settings),colorFromVelocity(60,fx.settings));
assert.ok(GEOMETRY_FRAG.includes('col=mix(col,keyColor')&&SPRITE_FRAG.includes('tint=mix(vColor'),
  'keyboard surfaces and FX sprites must use MIDI-derived RGB');
console.log('Aurora colors verified: linked score palette, relative/absolute velocity, keyboard lights, particles, custom colors, disabled toggle');
