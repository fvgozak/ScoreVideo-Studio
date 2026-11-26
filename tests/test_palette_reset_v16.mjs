import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../static/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../static/index.html',import.meta.url),'utf8');
function section(begin,end){
  const from=source.indexOf(begin),to=source.indexOf(end,from);
  assert.ok(from>=0&&to>from,`source section ${begin}`);
  return source.slice(from,to);
}
const names=new Set(['paperColor','inkColor','staffColor','accentColor','glowColor','cursorColor',
  'trailUpperColor','trailLowerColor','auroraLow','auroraHigh','scorePanelColor','themeColor',
  'sceneStartColor','sceneEndColor','sceneStartGlow','sceneEndGlow','auroraPreset','lightColorMode',
  'inverted','backgroundOpacity','scorePanelOpacity','keyboardColorLow','keyboardColorHigh',
  'keyboardColorPreset','keyboardPaletteLink','keyboardVelocityColor','keyboardTemperatureSync',
  'keyboardBoundaryColorMode','keyboardLightingMode','keyboardFxPreset','scoreColorPreset',
  'animateBackground']);
const controls=new Map([...names].map(id=>[id,{value:'',checked:false}]));
const $=id=>{if(!controls.has(id))controls.set(id,{value:'',checked:false});return controls.get(id);};
for(const id of ['paperColor','inkColor','staffColor','accentColor','glowColor','cursorColor'])$(id).value='#777777';
$('backgroundOpacity').value='.5';
for(const id of ['paletteApplyScore','paletteApplyGlow','paletteApplyKeyboard','paletteApplyBackground'])$(id).checked=true;
let applyCount=0,chips=[],eventDetail=null,lightingCount=0,boundaryCount=0;
const window={ScoreFxGroups:{syncLightingUi(){lightingCount++;},syncBoundaryUi(){boundaryCount++;},syncCustomColors(){}},
  ScoreImagePaletteUI:{chips(items){chips=items;}}};
const ctx={window,$,project:null,pendingBackgroundFile:null,
  queueApply(){applyCount++;},recommendMinimalColors(){},paletteMessage(){},
  CustomEvent:class{constructor(name,options){this.type=name;this.detail=options.detail;}},
  document:{dispatchEvent(event){eventDetail=event.detail;}}};
vm.createContext(ctx);
vm.runInContext(section(' async function applyPaletteScheme(scheme,primary){'," $('paletteImageFile').addEventListener"),ctx);
const colors={paper:'#f1f2f3',ink:'#101010',staff:'#343434',accent:'#a04b31',
  glow:'#f2a47b',cursor:'#e09040',background:'#201918',panel:'#f1f2f3',
  aurora_low:'#de8b63',aurora_high:'#f4cd85',trail_upper:'#ca713d',trail_lower:'#ffe3a3'};
await ctx.applyPaletteScheme({name:'Warm Piano',colors,panel_opacity:.65},'#112233');
assert.equal($('themeColor').value,'','theme selection stays independent of a recommendation');
assert.equal($('sceneStartColor').value,colors.background);
assert.equal($('sceneEndColor').value,colors.background);
assert.equal($('keyboardColorLow').value,colors.aurora_low);
assert.equal($('keyboardColorHigh').value,colors.aurora_high);
assert.equal($('keyboardPaletteLink').checked,false);
assert.equal($('keyboardTemperatureSync').checked,false,'keep manual temperature setting');
assert.equal($('keyboardBoundaryColorMode').value,'','keep manual boundary setting');
assert.equal($('scoreColorPreset').value,'','keep score preset');
assert.equal($('lightColorMode').value,'','keep glow mode');
assert.equal(chips.length,0,'recommendation does not replace source image chips');
assert.equal(eventDetail.aurora_low,colors.aurora_low);
assert.equal(applyCount,1);assert.equal(lightingCount,1);assert.equal(boundaryCount,0);
ctx.project={id:'photo-project',background_filename:'background.png'};
$('keyboardTemperatureSync').checked=false;
$('keyboardBoundaryColorMode').value='custom';
await ctx.applyPaletteScheme({name:'Photo',colors,panel_opacity:.55},'#456789');
assert.equal($('keyboardTemperatureSync').checked,false,'existing photo: preserve manual light setting');
assert.equal($('keyboardBoundaryColorMode').value,'custom','existing photo: preserve boundary choice');
assert.ok(!html.includes('id="texture"'),'deprecated background pattern must not be shown');
assert.ok(!html.includes('background-pattern.js'),'deprecated pattern module must not load');

// Run the real reset callback against a stand-in browser state.
const picked=new Map(['score','midi','audio'].map(id=>[id,{value:`A.${id}`,files:[{name:`A.${id}`}] }]));
const labels=new Map(['scoreName','midiName','audioName'].map(id=>[id,{textContent:id}]));
const all=new Map([...picked,...labels]);
all.set('uploadForm',{reset(){for(const item of picked.values()){item.value='';item.files=[];}}});
all.set('backgroundFile',{value:'old-background'});all.set('paletteImageFile',{value:'old-artwork'});
all.set('uploadButton',{disabled:false});
let resetCallback=null,paused=false,removedSrc=false,loaded=false,reloaded=false;
const browserLocal=new Map([['scorevideo_last_project','A-project']]);
const resetContext={
  lastProjectKey:'scorevideo_last_project',
  window:{location:{reload(){reloaded=true;}}},
  document:{},
  localStorage:{removeItem(key){browserLocal.delete(key);}},
  $:id=>{if(id==='resetProjectFilesButton')return{addEventListener(_name,fn){resetCallback=fn;}};return all.get(id);},
  renderUiActive:false,offlineActive:false,webmRecorder:null,
  liveSampler:null,pausePreview(){paused=true;},
  audio:{pause(){paused=true;},removeAttribute(key){if(key==='src')removedSrc=true;},load(){loaded=true;}},
  message(){},
};
vm.createContext(resetContext);
vm.runInContext(section(" const inputIds=['score','midi','audio']",' const persistent='),resetContext);
vm.runInContext(section(" $('resetProjectFilesButton').addEventListener", " $('uploadForm').addEventListener('submit'"),resetContext);
assert.equal(typeof resetCallback,'function');
resetCallback();
assert.equal(browserLocal.has('scorevideo_last_project'),false);
assert.ok([...picked.values()].every(item=>item.value===''&&item.files.length===0));
assert.equal(all.get('backgroundFile').value,'');
assert.equal(all.get('paletteImageFile').value,'');
assert.ok(paused&&removedSrc&&loaded&&reloaded);
// A completed import also clears selections before users begin the next song.
assert.match(source,/await loadProject\(data\);[\s\S]{0,300}clearUploadInputs\(\)/);
console.log('PASS palette controls, manual settings, removed background pattern, A-song audio isolation and reset');
