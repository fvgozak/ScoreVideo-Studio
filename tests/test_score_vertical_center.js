const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const scope={window:{}};
vm.createContext(scope);
vm.runInContext(fs.readFileSync('static/score-core.js','utf8'),scope);
const F=scope.window.ScoreFollower;
const offset=F.engravingVerticalOffset;

assert.equal(offset(600,{top:100,bottom:300}),100);
assert.equal(offset(600,{top:290,bottom:1190}),-275);
assert.equal(offset(260,{top:70,bottom:450},{centerOverflow:true}),-130);
assert.equal(offset(260,{top:70,bottom:450}),-62);
for(const invalid of [null,{}, {top:100,bottom:100},{top:NaN,bottom:200}])
  assert.equal(offset(600,invalid),0);

const follower=new F({tempoMap:[{beat:0,second:0,tempo_us:500000}],
  effects:{scoreTopPadding:0},scrollMode:'horizontal'});
follower.viewport={clientHeight:600};
follower.container={style:{marginTop:'0px'}};
follower.measureEngravingBounds=()=>({top:350,bottom:450});
follower.centerEngraving();
assert.equal(follower.container.style.marginTop,'-100px');
follower.centerEngraving();
assert.equal(follower.container.style.marginTop,'-100px');
follower.effects.scoreTopPadding=120;
follower.centerEngraving();
assert.equal(follower.container.style.marginTop,'20px');
follower.scrollMode='vertical';
follower.centerEngraving();
assert.equal(follower.container.style.marginTop,'0px');
assert.equal(follower.scoreVerticalLayout,null);
const src=fs.readFileSync('static/score-core.js','utf8');
assert.match(src,/this\.scrollMode==='horizontal'\?'0px':`\$\{topPad\}px`/);
assert.match(src,/if\(this\.scrollMode==='horizontal'\)this\.centerEngraving\(\)/);
console.log('Score single-line centering and page-view preservation tests passed');
