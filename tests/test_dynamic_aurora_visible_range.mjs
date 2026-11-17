import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ScoreDynamicFX} from '../static/dynamic-fx/adapter.js';
import {MidiFXEngine,ParticleField} from '../static/dynamic-fx/engine.js';
import {colorFromVelocity} from '../static/dynamic-fx/dynamics.js';
import {LINE_FRAG} from '../static/dynamic-fx/shaders.js';

const range={min:64,max:80};
const settings={lightingScene:{lightColorMode:'aurora',velocityScale:'absolute'},
  gpuEffects:{groups:{keyboard:{colorPreset:'aurora'}},
    keyboard:{colorLow:'#3ac7db',colorHigh:'#aa80e8',velocityColor:true}},
  enabled:true,light:true,strength:1.1};
const follower={velocityRange:range,effects:{velocityReactive:false},colors:()=>({accent:'#ffffff'})};
const fx=Object.create(ScoreDynamicFX.prototype);
fx.settings={};fx.canvas={style:{}};fx.lightingEpoch=0;
fx.configure(settings,follower);
// Aurora keyboard uses the *song*'s actual velocity range by default even
// when the score still uses absolute 1..127 and global reaction is off.
assert.equal(fx.settings.velocityScale,'relative');
const lo=colorFromVelocity(64,fx.settings),hi=colorFromVelocity(80,fx.settings);
assert.ok(lo[0]<hi[0]&&lo[1]>hi[1], 'Aurora endpoints should differ visibly');
assert.ok(Math.hypot(...lo.map((x,i)=>x-hi[i]))>.25,'palette must span a visible range');
const song={events:[
  {type:'on',time:.1,midi:60,velocity:64,channel:0},
  {type:'on',time:.1,midi:76,velocity:80,channel:0}],tempos:[],duration:2};
const engine=new MidiFXEngine(song,fx.settings);
engine.advance(.11);
const lights=engine.keyLights();
for(const [pitch,c] of [[60,lo],[76,hi]]){
  const idx=(pitch-21)*4;
  for(let ch=0;ch<3;ch++)assert.ok(Math.abs(lights[idx+ch]-c[ch])<1e-6);
}
const field=new ParticleField(engine,fx.settings);
field.onNote(engine.voices[0]);field.onNote(engine.voices[1]);
assert.ok(field.particles.some(p=>p.color.every((c,i)=>Math.abs(c-lo[i])<1e-6)));
assert.ok(field.particles.some(p=>p.color.every((c,i)=>Math.abs(c-hi[i])<1e-6)));
// Absolute and follow-score remain opt-in, and the explicit OFF switch works.
fx.configure({...settings,gpuEffects:{...settings.gpuEffects,keyboard:{...settings.gpuEffects.keyboard,velocityScale:'absolute'}}},follower);
assert.equal(fx.settings.velocityScale,'absolute');
const compressedColorDiff=Math.hypot(...colorFromVelocity(64,fx.settings).map((v,i)=>v-colorFromVelocity(80,fx.settings)[i]));
assert.ok(compressedColorDiff<Math.hypot(...lo.map((x,i)=>x-hi[i])));
fx.configure({...settings,gpuEffects:{...settings.gpuEffects,keyboard:{...settings.gpuEffects.keyboard,velocityScale:'follow-score'}}},follower);
assert.equal(fx.settings.velocityScale,'absolute');
fx.settings.velocityColor=false;
assert.deepEqual(colorFromVelocity(64,fx.settings),colorFromVelocity(80,fx.settings));
assert.ok(LINE_FRAG.includes('uniform vec3 uColor'));
const renderer=fs.readFileSync(new URL('../static/dynamic-fx/renderer.js',import.meta.url),'utf8');
assert.ok(renderer.includes("gl.uniform3fv(gl.getUniformLocation(p.line,'uColor'),hitlineColor)"));
console.log('Aurora visible-range mapping / keyboard lights / particles / hitline color / mapping override: PASS');
