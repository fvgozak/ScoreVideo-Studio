const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},document:{},console};vm.createContext(context);
for(const name of ['score-core.js','studio-scene.js','theme.js','stage-runtime.js']){
  vm.runInContext(fs.readFileSync(`static/${name}`,'utf8'),context,{filename:name});
}
const {ScoreFollower:F,ScoreStudio:S,ScoreStage:T,ScoreTheme:Theme}=context.window;
const rules={SheetMaximumWidth:32767,RenderXMeasuresPerLineAkaSystem:8,NewSystemAtXMLNewSystemAttribute:true,NewSystemAtXMLNewPageAttribute:true,NewPageAtXMLNewPageAttribute:true,NewPartAndSystemAfterFinalBarline:true};
F.singleLineRules(rules);
assert.equal(rules.SheetMaximumWidth,1000000);
assert.equal(rules.RenderSingleHorizontalStaffline,true);
assert.equal(rules.RenderXMeasuresPerLineAkaSystem,0);
for(const key of ['NewSystemAtXMLNewSystemAttribute','NewSystemAtXMLNewPageAttribute','NewPageAtXMLNewPageAttribute','NewPartAndSystemAfterFinalBarline'])assert.equal(rules[key],false);
assert.equal(S.auroraColor(1,'#0000ff','#ff0000'),'#0000ff');
assert.equal(S.auroraColor(127,'#0000ff','#ff0000'),'#ff0000');
assert.equal(S.auroraColor(64,'#0000ff','#ff0000').startsWith('#'),true);
assert.ok(S.auroraPresets.polar);
const scene=S.normalize({fxMode:'aurora',font:'elegant',titleGap:135,auroraLow:'#123456',auroraHigh:'#ff1244'});
assert.equal(scene.fxMode,'bloom');assert.equal(scene.lightColorMode,'aurora');assert.equal(scene.font,'elegant');assert.equal(scene.titleGap,135);
assert.equal(scene.auroraLow,'#123456');assert.ok(S.FONT_STACKS.elegant);
const theme=Theme.palette('#496c84');assert.match(theme.auroraLow,/^#[a-f0-9]{6}$/);assert.notEqual(theme.auroraLow,theme.auroraHigh);
const basis={width:1080,height:1920,layout_mode:'singleline',score_position_y:70,scene:{title:'Ravel',titleGap:120,showText:true}};
const posA=T.Stage.scoreTopPadding(T.normalized(basis));
const posB=T.Stage.scoreTopPadding(T.normalized({...basis,score_position_y:0}));
assert.ok(posA>posB+300);
const pageA=T.Stage.scoreTopPadding(T.normalized({...basis,layout_mode:'page'}));
const pageB=T.Stage.scoreTopPadding(T.normalized({...basis,layout_mode:'page',score_position_y:0}));
assert.ok(pageA>pageB+300,'Y slider moves the score inside the page layout too');
assert.match(fs.readFileSync('static/stage.css','utf8'),/padding-top:\s*var\(--score-content-top, 0px\) !important/,
  'CSS must not override the Y slider padding');
assert.match(fs.readFileSync('static/score-core.js','utf8'),/setProperty\('--score-content-top'/);
assert.equal(T.Stage.scoreTopPadding(T.normalized({...basis,scene:{title:'Ravel',titleGap:200,showText:true}})),posA); // title spacing must not create a hidden margin
console.log('v0.11 single-line maximum, title gap, font and aurora palette tests passed');
