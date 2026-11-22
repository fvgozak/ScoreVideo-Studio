import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const base=new URL('../static/',import.meta.url);
const get=path=>readFileSync(new URL(path,base),'utf8');
const fx=get('fx-groups.js'),app=get('app.js'),scene=get('studio-scene.js');
const ctx={window:{},console,globalThis:{}};
vm.runInNewContext(scene,ctx);
const studio=ctx.window.ScoreStudio;
assert.ok(studio);
const stops=['#3ac7db','#528fe9','#e3a1d6','#aa80e8'];
const params=studio.normalize({lightColorMode:'aurora',velocityScale:'relative',
  auroraLow:stops[0],auroraHigh:stops.at(-1),lightPaletteStops:stops});
assert.equal(params.lightPaletteStops.length,4);
const range={min:40,max:96};
const outputs=[40,58,77,96].map(v=>studio.noteLightColor(params,v,'#ffffff',range));
assert.equal(new Set(outputs).size,4,'four velocities need four distinct colors');
assert.equal(outputs[0].toLowerCase(),stops[0]);
assert.equal(outputs.at(-1).toLowerCase(),stops.at(-1));
const solid=studio.noteLightColor({...params,lightColorMode:'solid'},40,'#123456',range);
assert.equal(solid,'#123456','solid mode must be backward compatible');
const classic=studio.noteLightColor({lightColorMode:'aurora',velocityScale:'relative',
 auroraLow:'#111111',auroraHigh:'#eeeeee'},77,'#ffffff',range);
assert.match(classic,/^#[0-9a-f]{6}$/);
assert.ok(fx.includes('harmonicStops=Object.freeze({'));
for(const name of ['aurora','ocean','forest','moonlight','sunset','glacier'])
  assert.match(fx,new RegExp(`\\b${name}:\\['`));
assert.ok(app.includes('lightPaletteStops:$('),'score palette must reach export config');
assert.ok(app.includes('keyboard:{colorStops:keyboardStops'),'keyboard palette must reach export config');
assert.ok(app.includes('if(!Object.keys(data).length)applyNewProjectDefaults()'),
 'new defaults only for empty settings');
const defaults=app.match(/const NEW_PROJECT_DEFAULTS=Object\.freeze\((\{[\s\S]*?\})\);/);
assert.ok(defaults,'default settings map');
const settings=vm.runInNewContext('('+defaults[1]+')');
assert.equal(settings.layoutMode,'singleline');
assert.equal(settings.scoreAreaWidth,'100');
assert.equal(settings.scoreAreaHeight,'50');
assert.equal(settings.scoreMarginTop,'4');
assert.equal(settings.scorePanelColor,'#141a23');
assert.equal(settings.scorePanelOpacity,'55');
assert.equal(settings.paperColor,'#111722');
assert.equal(settings.inkColor,'#f5f6fc');
assert.equal(settings.staffColor,'#abb7c8');
assert.equal(settings.backgroundOpacity,'0.5');
assert.equal(settings.backgroundFit,'contain');
assert.equal(settings.velocityScale,'relative');
assert.ok(app.includes("localStorage.removeItem('scorevideo_studio_v05_settings')"),
 'reset project must start from defaults');
const stage=get('stage-runtime.js'),adapter=get('dynamic-fx/adapter.js'),dyn=get('dynamic-fx/dynamics.js');
assert.ok(stage.includes('lightPaletteStops:s.scene.lightPaletteStops'));
assert.ok(stage.includes('lightPaletteStops:next.scene.lightPaletteStops'));
assert.ok(adapter.includes('const declared=useScorePalette?scene.lightPaletteStops:keyboard.colorStops'));
assert.ok(dyn.includes('if(colors.length===2)'));
const dynamic=await import('data:text/javascript;base64,'+Buffer.from(dyn).toString('base64'));
for(const velocity of [40,45,55,65,77,84,96]){
  const scoreColor=studio.noteLightColor(params,velocity,'#ffffff',range);
  const gpuColor=dynamic.colorFromVelocity(velocity,{
    colorStops:stops.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)/255)),
    scoreAuroraLinked:true,useHarmonicStops:true,velocityScale:'relative',
    velocityRange:range,velocityContrast:1});
  for(let i=0;i<3;i++){
    const expected=parseInt(scoreColor.slice(1+2*i,3+2*i),16)/255;
    assert.ok(Math.abs(expected-gpuColor[i])<.006,`preview vs GPU mismatch v=${velocity} channel=${i}`);
  }
}
console.log('PASS harmony/singleline: four-stop color changes, legacy behavior, default stage, export parity wiring');
