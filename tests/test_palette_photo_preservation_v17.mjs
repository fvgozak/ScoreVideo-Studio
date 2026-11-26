import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../static/app.js',import.meta.url),'utf8');
const start=source.indexOf(' async function applyPaletteScheme(scheme,primary){');
const end=source.indexOf(" $('paletteImageFile').addEventListener",start);
assert.ok(start>=0&&end>start);
const controls=new Map();
const $=id=>{if(!controls.has(id))controls.set(id,{value:'',checked:false});return controls.get(id);};
const ctx={window:{ScoreFxGroups:{syncLightingUi(){},syncBoundaryUi(){}},ScoreImagePaletteUI:{chips(){}}},
  $ ,project:null,pendingBackgroundFile:null,queueApply(){},recommendMinimalColors(){},paletteMessage(){},
  document:{dispatchEvent(){}},CustomEvent:class{}};
vm.createContext(ctx);
vm.runInContext(source.slice(start,end),ctx);
const colors={paper:'#F6F6F4',background:'#E4E0D2',ink:'#242119',staff:'#5F5845',
 accent:'#479CDC',glow:'#51ACEC',cursor:'#479CDC',panel:'#F8F8F6',
 aurora_low:'#659DD3',aurora_high:'#F09638'};
$('backgroundOpacity').value='.7';
$('scorePanelOpacity').value='55';
ctx.project={id:'test',background_filename:'cover.png'};
for(const [id,alpha] of [['paper',.82],['muted',.76],['dark',.72]]){
 await ctx.applyPaletteScheme({id,name:id,colors,panel_opacity:alpha},'#479CDC');
 assert.equal($('scorePanelOpacity').value,'55',`${id} should preserve manual panel opacity`);
 assert.equal($('backgroundOpacity').value,'.7','preserve user photo opacity');
}
// Also recognize a just-selected but not-yet-uploaded image.
ctx.project={id:'test',background_filename:''};
ctx.pendingBackgroundFile={name:'new.png'};
await ctx.applyPaletteScheme({id:'paper',name:'Gallery Paper',colors,panel_opacity:.82});
assert.equal($('scorePanelOpacity').value,'55','preserve panel opacity while photo upload is pending');
// Applying a scheme must also leave a manually chosen panel opacity alone without a photo.
ctx.pendingBackgroundFile=null;
await ctx.applyPaletteScheme({id:'paper',name:'Gallery Paper',colors,panel_opacity:.82});
assert.equal($('scorePanelOpacity').value,'55','preserve panel opacity without photo');
console.log('PASS v17: palette schemes preserve manual panel and photo opacity');
