const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const context={window:{},document:{}};
vm.createContext(context);
for(const file of ['studio-scene.js','stage-runtime.js'])
  vm.runInContext(fs.readFileSync(`static/${file}`,'utf8'),context,{filename:file});

const Scene=context.window.ScoreStudio;
const Stage=context.window.ScoreStage;
for(const style of ['classic','modern','jazz','manuscript']){
  assert.equal(Scene.normalize({notationStyle:style}).notationStyle,style);
  assert.equal(Stage.normalized({scene:{notationStyle:style}}).scene.notationStyle,style);
}
assert.equal(Scene.normalize({notationStyle:'unknown'}).notationStyle,'classic');

const index=fs.readFileSync('static/index.html','utf8');
const app=fs.readFileSync('static/app.js','utf8');
const css=fs.readFileSync('static/stage.css','utf8');
const render=fs.readFileSync('static/render.html','utf8');
assert(index.indexOf('id="notationStyle"')>index.indexOf('data-editor-panel="score"'));
assert(index.indexOf('id="notationStyle"')<index.indexOf('data-editor-panel="design"'));
for(const style of ['classic','modern','jazz','manuscript']){
  assert(index.includes(`value="${style}"`));
  if(style!=='classic')assert(css.includes(`[data-notation-style="${style}"]`));
}
assert(app.includes("'notationStyle'"),'style persists in project and named presets');
assert(app.includes("notationStyle:$('notationStyle').value"),'style enters preview/export config');
assert(render.includes('/static/stage.css'),'MP4 uses the same notation CSS');

const stage=Object.create(Stage.Stage.prototype);
stage.meta={has_score:true};
stage.settings=Stage.normalized({scene:{notationStyle:'jazz'}});
stage.scoreWindow={style:{setProperty(){}},dataset:{},hidden:false};
stage.scorePanel={style:{}};
stage.setupWindow=()=>{};
stage.applyScoreWindow();
assert.equal(stage.scoreWindow.dataset.notationStyle,'jazz');
console.log('Notation presets normalize, persist, and style the shared preview/MP4 score');
