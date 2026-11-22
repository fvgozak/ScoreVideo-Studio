#!/usr/bin/env node
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const root = process.argv[2] || '.';
const source = fs.readFileSync(path.join(root,'static/app.js'),'utf8');
const a = source.indexOf('async function applyPaletteScheme(scheme,primary){');
const b = source.indexOf("$('paletteImageFile').addEventListener(", a);
assert(a!==-1 && b>a, 'applyPaletteScheme region');
const functionText = source.slice(a,b);
assert(!functionText.includes('ScoreImagePaletteUI.chips('), 'recommended scheme should never rewrite extracted chips');
assert(source.includes('ScoreImagePaletteUI.chips(result.palette)'), 'extraction chips must remain');
assert(source.includes('ScoreImagePaletteUI.schemes(result.schemes'), 'recommendations must remain');
const controls = Object.create(null);
const $ = id => controls[id] ||= {value:'#334455', checked:id.startsWith('paletteApply'), textContent:'추출된 대표 색상'};
let chipCount=0, queues=0, eventCount=0, messages=0;
const context = {
  $, project:{id:'demo',background_filename:'image.png'}, pendingBackgroundFile:null,
  recommendMinimalColors:()=>{}, queueApply:()=>queues++, paletteMessage:()=>messages++,
  CustomEvent:class {constructor(name,opts){this.type=name;this.detail=opts.detail}},
  document:{dispatchEvent:event=>{if(event.type==='score-palette-applied')eventCount++}},
  window:{ScoreFxGroups:{syncLightingUi(){},syncBoundaryUi(){},syncCustomColors(){}},ScoreImagePaletteUI:{chips(){chipCount++}}},
  console, Math, Number, Boolean, Object
};
vm.createContext(context);
vm.runInContext(functionText+'\nglobalThis.schemeFn=applyPaletteScheme;',context);
$('paletteColorsTitle').textContent='추출된 대표 색상';
(async()=>{
  await context.schemeFn({id:'paper',name:'Gallery Paper',panel_opacity:.7,colors:{
    paper:'#ffffff',ink:'#111111',staff:'#333333',accent:'#0088cc',glow:'#ffaa11',
    cursor:'#223344',trail_upper:'#1199aa',trail_lower:'#ffaa22',
    aurora_low:'#3355aa',aurora_high:'#ff5566',panel:'#aabbcc',background:'#112233'
  }},'#0088cc');
  assert.equal(chipCount,0,'extracted chips changed');
  assert.equal($('paletteColorsTitle').textContent,'추출된 대표 색상','extracted palette title changed');
  assert.equal($('inkColor').value,'#111111','scheme failed to apply');
  assert.equal($('keyboardColorLow').value,'#3355aa','keyboard color link failed');
  assert.equal(queues,1,'preview not updated');
  assert.equal(eventCount,1,'scheme event not dispatched');
  console.log('PASS: extracted palette stays unchanged; design, keyboard, preview update normally');
})().catch(e=>{console.error(e);process.exit(1)});
