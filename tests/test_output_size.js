const assert=require('node:assert/strict');
const size=require('../static/output-size.js');

for(const [aspect,hd,full] of [
  ['16:9',[1280,720],[1920,1080]],['9:16',[720,1280],[1080,1920]],
  ['1:1',[720,720],[1080,1080]],['4:5',[720,900],[1080,1350]],
  ['3:4',[720,960],[1080,1440]],['4:3',[960,720],[1440,1080]],
  ['21:9',[1680,720],[2520,1080]],
]){
  for(const [quality,expected] of [[720,hd],[1080,full]]){
    const actual=size.size(aspect,quality);
    assert.deepEqual([actual.width,actual.height],expected);
    assert.equal(Math.min(actual.width,actual.height),quality);
    assert.equal(actual.width%2,0);
    assert.equal(actual.height%2,0);
  }
}
assert.deepEqual(size.migrate('2560x1080'),{aspect:'21:9',quality:1080});
assert.deepEqual(size.migrate('1080x1350'),{aspect:'4:5',quality:1080});
assert.deepEqual(size.migrate('1280x720'),{aspect:'16:9',quality:720});
console.log('Output dimensions and legacy preset migration passed');
