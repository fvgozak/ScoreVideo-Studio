import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
const root=path.resolve(process.argv[2]||process.cwd());
const helperSrc=fs.readFileSync(path.join(root,'static/palette-director.js'),'utf8');
const module={exports:{}};vm.runInNewContext(helperSrc,{module,globalThis:{}});
const director=module.exports;
const lightSrc=fs.readFileSync(path.join(root,'static/dynamic-fx/adaptive-lighting.js'));
const {keyboardMaterialAt}=await import('data:text/javascript;base64,'+lightSrc.toString('base64'));
const outputs={};
for(const name of ['paper','dark','muted','vivid']){
 const x=director.keyboardLighting(name);
 const lighting={mode:x.mode,baseBrightness:x.baseBrightness,sensitivity:x.sensitivity,
  offset:x.brightnessOffset,whiteBrightness:x.whiteBrightness,blackBrightness:x.blackBrightness,
  reflectionStrength:x.reflectionStrength,temperatureSync:false,panelOpacity:0,scoreVisible:true};
 outputs[name]=keyboardMaterialAt(2,{time:2,width:1920,height:1080,backgroundAlpha:0,
  effects:{paper:'#222222',staff:'#777777',backgroundOpacity:0},lighting,
  scene:{animateBackground:false}});
}
assert(outputs.dark.white<outputs.muted.white,'dark should be dimmer than muted');
assert(outputs.muted.white<outputs.paper.white,'paper should be brighter than muted');
assert(outputs.vivid.white<outputs.paper.white,'V3.1 vivid should not overpower paper');
assert(outputs.vivid.white>outputs.dark.white,'vivid should retain more light than midnight');
assert(outputs.dark.reflection>outputs.muted.reflection);
console.log('PASS: actual adaptive-lighting keyboard material changes with selected design',JSON.stringify(Object.fromEntries(Object.entries(outputs).map(([k,v])=>[k,{white:v.white,black:v.black,reflection:v.reflection}]))));
