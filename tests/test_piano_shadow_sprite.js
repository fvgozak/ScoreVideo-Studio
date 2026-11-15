const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

class FakeCanvas {
  constructor(width,height){this.width=width;this.height=height;}
  getContext(){return {fillRect(){}};}
}
const scope={window:{},OffscreenCanvas:FakeCanvas,performance:{now:()=>0}};
scope.window.OffscreenCanvas=FakeCanvas;
vm.createContext(scope);
vm.runInContext(fs.readFileSync('static/piano-shadow-sprite.js','utf8'),scope);
const Cache=scope.window.ScorePianoShadowSprite.ShadowSpriteCache;
const calls={direct:0,sprite:0};
const ctx={shadowBlur:30,shadowColor:'#68ddfa',fillStyle:'#ffffff',globalAlpha:.7,
  globalCompositeOperation:'lighter',fillRect(){calls.direct++;},drawImage(){calls.sprite++;}};
const cache=new Cache({maxEntries:2,maxBytes:1024*1024});
assert.equal(cache.draw(ctx,10.1,200,10,4),true);
assert.equal(cache.draw(ctx,10.4,200,10,4),true,'fractional position shares the same tile');
assert.equal(cache.stats().hits,1);
assert.equal(ctx.shadowBlur,30);
assert.equal(ctx.globalAlpha,.7);
ctx.shadowColor='#ff0000';cache.draw(ctx,10,200,10,4);
ctx.shadowColor='#00ff00';cache.draw(ctx,10,200,10,4);
assert.equal(cache.stats().entries,2);
assert.equal(cache.stats().evictions,1);
assert.ok(cache.stats().bytes<=cache.stats().maxBytes);
cache.enabled=false;cache.draw(ctx,10,200,10,4);
assert.equal(calls.direct,1,'disabled cache uses the original glow');
cache.clear();assert.equal(cache.stats().entries,0);
assert.equal(cache.stats().bytes,0);
const tiny=new Cache({maxBytes:1});
tiny.draw(ctx,10,200,10,4);
assert.equal(tiny.stats().entries,0,'oversized tiles are never allocated');
console.log('shared keyboard shadow cache, LRU limit, fallback, and state restoration verified');
