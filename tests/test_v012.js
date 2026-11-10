const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = {window:{},document:{},console}; vm.createContext(context);
for(const name of ['score-core.js','studio-scene.js','stage-runtime.js'])
  vm.runInContext(fs.readFileSync('static/'+name,'utf8'),context,{filename:name});
const {ScoreStage} = context.window;
const base = {
 width:1080,height:1920,score_area_width:80,score_area_height:50,
 score_margin_top:15,score_margin_bottom:10,score_panel_color:'#102030',score_panel_opacity:0.65,
 layout_mode:'singleline',scene:{title:'Piano Nocturne',artist:'Composer',titleGap:95,showText:true}
};
const settings = ScoreStage.normalized(base);
assert.equal(settings.scoreRegion.widthPercent,80);
assert.equal(settings.scoreRegion.heightPercent,50);
assert.equal(settings.scoreRegion.panelColor,'#102030');
assert.equal(settings.scoreRegion.panelOpacity,.65);
const g=ScoreStage.Stage.scoreGeometry(settings);
assert.equal(g.width,864);
assert.equal(g.height,960);
assert.equal(g.top,1920*.15); // v0.14: no implicit title reservation
assert.ok(g.left>=0&&g.left+g.width<=base.width);
assert.ok(g.top+g.height<=base.height);
let tiny=ScoreStage.normalized({...base,score_area_height:100,score_margin_top:40,score_margin_bottom:40});
let t=ScoreStage.Stage.scoreGeometry(tiny);
assert.equal(t.top,1920*.40); // exact top margin, even with visible title
assert.ok(t.top+t.height<=tiny.height+0.00001);
assert.equal(ScoreStage.normalized({}).scoreRegion.panelOpacity,0);
assert.equal(ScoreStage.normalized({score_area_width:10,score_area_height:1000,score_panel_opacity:9}).scoreRegion.widthPercent,30);
assert.equal(ScoreStage.normalized({score_area_width:10,score_area_height:1000,score_panel_opacity:9}).scoreRegion.heightPercent,100);
assert.equal(ScoreStage.normalized({score_area_width:10,score_area_height:1000,score_panel_opacity:9}).scoreRegion.panelOpacity,1);
console.log('v0.12 geometry & overlay normalization test passed');
