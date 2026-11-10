const assert=require('node:assert/strict');
const fs=require('fs'),vm=require('node:vm');
const ctx={window:{},document:{}};
vm.createContext(ctx);
for (const file of ['static/studio-scene.js','static/stage-runtime.js','static/hex-colors.js']) {
  vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
}
const Stage=ctx.window.ScoreStage;
const Hex=ctx.window.ScoreHexControls;
const base={width:1080,height:1920,score_area_width:100,score_area_height:70,
  score_margin_top:0,score_margin_bottom:0,
  scene:{showText:true,title:'Large MusicXML title',artist:'Composer',titleGap:200}};
const normalized=Stage.normalized(base);
const geometry=Stage.Stage.scoreGeometry(normalized);
assert.equal(geometry.top,0,'0% margin must place the score at the stage top, even when title is visible');
assert.equal(geometry.left,0);
assert.equal(geometry.width,1080);
assert.equal(geometry.height,1344);
assert.equal(Stage.Stage.scoreGeometry(Stage.normalized({...base,score_margin_top:10})).top,192);
assert.equal(Stage.Stage.scoreGeometry(Stage.normalized({...base,score_area_height:100,score_margin_bottom:0})).height,1920);
assert.equal(Stage.Stage.scoreGeometry(Stage.normalized({...base,score_margin_top:15,score_margin_bottom:20,score_area_height:100})).height,1248);
assert.equal(Hex.normalizeHex('#abc'),'#AABBCC');
assert.equal(Hex.normalizeHex('abcdef'),'#ABCDEF');
assert.equal(Hex.normalizeHex('aBcDeF'),'#ABCDEF');
assert.equal(Hex.normalizeHex('#112233'),'#112233');
assert.equal(Hex.normalizeHex('rgb(255,0,0)'),null);
assert.equal(Hex.normalizeHex('#01234'),null);
console.log('v0.14 absolute margins and HEX color normalization pass');
