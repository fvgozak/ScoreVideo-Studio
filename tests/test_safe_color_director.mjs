import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(process.argv[2]||process.cwd());
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const app=read('static/app.js'),fx=read('static/fx-groups.js'),index=read('static/index.html');
const module={exports:{}};
vm.runInNewContext(read('static/palette-director.js'),{module,globalThis:{}},{timeout:2000});
const helper=module.exports;
const functionStart=' async function applyPaletteScheme(scheme,primary){';
const functionEnd=" $('paletteImageFile').addEventListener('change',()=>{";
const body=app.slice(app.indexOf(functionStart),app.indexOf(functionEnd,app.indexOf(functionStart)));
assert(body.includes('SCOREMOTION_COLOR_DIRECTOR_SAFE_V2'),'new scoped palette function loaded');
assert(!body.includes('ScoreImagePaletteUI.chips'),'image extraction swatches must stay put');
for(const id of ['paletteApplyScore','paletteApplyGlow','paletteApplyKeyboard','paletteApplyBackground']){
  assert(index.includes(`id="${id}"`),`missing control ${id}`);
  assert(app.includes(`'${id}'`),`missing persistence ${id}`);
}
assert(index.indexOf('/static/palette-director.js')<index.indexOf('/static/app.js'),'load palette module before app');
const colors={paper:'#F5EEE8',background:'#202935',ink:'#211E1C',staff:'#4D555D',accent:'#509AA2',glow:'#85CEE6',cursor:'#509AA2',trail_upper:'#4F9EA6',trail_lower:'#E1AD84',aurora_low:'#6A9BE8',aurora_high:'#E8A66A',panel:'#F0EEE6'};
const scheme={id:'dark',name:'Midnight',colors,panel_opacity:.72};
const allIds=[...new Set([...app.matchAll(/\$\('([A-Za-z][A-Za-z\d]+)'\)/g)].map(x=>x[1]))];
const selectIds=['paletteApplyScore','paletteApplyGlow','paletteApplyKeyboard','paletteApplyBackground'];
const baseline={};for(const id of allIds)baseline[id]={type:'text',value:'#334455',checked:false};
for(const id of selectIds)baseline[id].checked=true;
baseline.keyboardLightingMode.value='manual';
baseline.keyboardColorPreset.value='custom';
baseline.scoreColorPreset.value='warm';
baseline.keyboardFxPreset.value='burst';
baseline.scoreFxPreset.value='resonance';
baseline.fxMode.value='trail';
baseline.lightColorMode.value='solid';
baseline.inverted.checked=true;
baseline.keyboardBaseBrightness.value='1.0';
baseline.scorePanelOpacity.value='41';
baseline.animateBackground.checked=false;
baseline.keyboardPaletteLink.checked=false;
baseline.keyboardTemperatureSync.checked=false;
baseline.minimalNoteColor.value='#334455';
const cloning=()=>Object.fromEntries(Object.entries(baseline).map(([key,value])=>[key,{...value}]));
async function execute(scope,linked=false){
 const values=cloning();
 for(const [id,enabled] of Object.entries(scope))values['paletteApply'+id].checked=enabled;
 if(linked){values.keyboardPaletteLink.checked=true;values.keyboardColorPreset.value='linked';values.keyboardColorLow.value='#667788';values.keyboardColorHigh.value='#99AABB';}
 let renders=0,events=[],ui=0,message='';
 const context={$:id=>{assert(values[id],`unknown node: ${id}`);return values[id]},
   window:{ScorePaletteDirector:helper,ScoreFxGroups:{syncLightingUi(){ui++},syncCustomColors(){ui++},syncPreview(){ui++}}},
   document:{dispatchEvent(e){events.push(e)}},
   CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail}},
   project:{id:'test'},pendingBackgroundFile:null,
   queueApply(){renders++},paletteMessage(s){message=s}};
 vm.runInNewContext(body+'\nglobalThis.apply=applyPaletteScheme;',context,{timeout:2000});
 await context.apply(scheme,'#AABBCC');
 return {values,events,renders,ui,message};
}
const owned={
 Score:['paperColor','inkColor','staffColor','accentColor','scorePanelColor'],
 Glow:['glowColor','trailUpperColor','trailLowerColor','auroraLow','auroraHigh'],
 Keyboard:['keyboardPaletteLink','keyboardColorPreset','keyboardColorLow','keyboardColorHigh','keyboardLightingMode','keyboardBaseBrightness','keyboardLightingSensitivity','keyboardBrightnessOffset','keyboardWhiteBrightness','keyboardBlackBrightness','keyboardReflectionStrength'],
 Background:['sceneStartColor','sceneEndColor']
};
const neverTouched=['scoreFxPreset','keyboardFxPreset','fxMode','lightColorMode','inverted','scoreColorPreset','scorePanelOpacity','animateBackground','keyboardTemperatureSync','minimalNoteColor','gpuPreset','pianoLight','keyboardParticleDensity','backgroundOpacity','backgroundFit','backgroundPosX','backgroundPosY'];
for(let bits=0;bits<16;bits++){
 const scope={Score:!!(bits&1),Glow:!!(bits&2),Keyboard:!!(bits&4),Background:!!(bits&8)};
 const {values,events,renders}=await execute(scope);
 for(const id of neverTouched)assert.deepEqual(values[id],baseline[id],`combo ${bits} unexpectedly touched ${id}`);
 for(const [s,ids] of Object.entries(owned))if(!scope[s])for(const id of ids){
   assert.deepEqual(values[id],baseline[id],`combo ${bits} / scope OFF ${s} mutated ${id}`);
 }
 if(bits===0){assert.equal(events.length,0,'all off event');assert.equal(renders,0,'all off render');for(const id of Object.keys(baseline))if(!selectIds.includes(id))assert.deepEqual(values[id],baseline[id],'all off must be no-op for '+id);}
 else{assert.equal(events.length,1,'one event');assert.equal(renders,1,'one apply');}
 if(scope.Keyboard){
  assert.equal(values.keyboardLightingMode.value,'auto-offset',`combo ${bits}: keyboard mode`);
  assert.equal(values.keyboardBaseBrightness.value,'0.75',`combo ${bits}: keyboard brightness`);
  assert.equal(values.keyboardWhiteBrightness.value,'0.9');
  assert.equal(values.keyboardBlackBrightness.value,'0.8');
  assert.equal(values.keyboardReflectionStrength.value,'1.2');
 }
}
// For a linked keyboard excluded from the recommendation, do not detach or recolor it,
// and do not change the linked Aurora endpoints. Other score glow colors still change.
const linkedOff=await execute({Score:false,Glow:true,Keyboard:false,Background:false},true);
assert.equal(linkedOff.values.keyboardPaletteLink.checked,true);
assert.equal(linkedOff.values.keyboardColorPreset.value,'linked');
assert.equal(linkedOff.values.auroraLow.value,baseline.auroraLow.value);
assert.equal(linkedOff.values.auroraHigh.value,baseline.auroraHigh.value);
const linkedOn=await execute({Score:false,Glow:true,Keyboard:true,Background:false},true);
assert.equal(linkedOn.values.keyboardPaletteLink.checked,true);
assert.notEqual(linkedOn.values.auroraLow.value,baseline.auroraLow.value);
const keyboardOnlyLinked=await execute({Score:false,Glow:false,Keyboard:true,Background:false},true);
assert.equal(keyboardOnlyLinked.values.keyboardPaletteLink.checked,false);
assert.equal(keyboardOnlyLinked.values.keyboardColorPreset.value,'custom');

// Existing listener cannot mutate score preset, keyboard link or unselected colors.
const hStart="  document.addEventListener('score-palette-applied',event=>{const c=event.detail||{};";
const hEnd='  syncPreview();syncLightingUi();syncCustomColors();syncBoundaryUi();syncNoteBarUi();';
const handler=fx.slice(fx.indexOf(hStart),fx.indexOf(hEnd,fx.indexOf(hStart)));
assert(handler.includes('SCOREMOTION_COLOR_DIRECTOR_SAFE_V2'));
assert(fx.includes('if(options.syncKeyboard!==false)syncLinkedKeyboard();'),'FX preview must optionally preserve a keyboard-excluded palette');
let previewOptions=null;let writes=0;
vm.runInNewContext(handler,{document:{addEventListener(_type,handler){handler({detail:{scope:{score:false,glow:false,keys:false,background:true},projectId:'test'}})}},
  localStorage:{setItem(){writes++}},syncPreview(opts){previewOptions=opts},syncCustomColors(){}},{timeout:2000});
assert.equal(writes,0,'background-only recommendation cannot rewrite project score palette');
assert.equal(previewOptions?.syncKeyboard,false,'palette event must not resync excluded keyboard');
console.log('PASS: 16 scope combinations; 4 keyboard brightness variants; linked/off behavior; effect modes preserved; all OFF is no-op');
