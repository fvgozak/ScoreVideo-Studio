const assert=require('node:assert/strict');
const path=require('node:path');
const h=require(path.resolve(process.argv[2]||'.','static/palette-director.js'));
function pixels(spec){return Uint8ClampedArray.from(spec.flatMap(([hex,count,alpha=255])=>Array.from({length:count},()=>[...hex.match(/../g).map(x=>parseInt(x,16)),alpha]).flat()));}
const ocean=[['173F53',600],['4497A7',270],['B1D7DA',100],['E9EBE5',30]];
const forest=[['23482C',600],['78914C',270],['D0D8A0',100],['EEE8CA',30]];
const sunset=[['754654',600],['D08266',270],['F0C5A2',100],['332133',30]];
const neutral=[['202020',400],['BEBEBE',300],['FFFFFF',200],['000000',100]];
function test(spec){const rgba=pixels(spec),p=h.extractPixels(rgba);assert.deepEqual(p,h.extractPixels(rgba));assert.ok(p.length<=5);assert.ok(p.every(x=>spec.some(([hex,,a])=>x.hex==='#'+hex&&(a===undefined||a>=80))));assert.ok(p.every(x=>x.weight>0&&x.weight<=1));const res=h.recommend(p);assert.equal(res.schemes.length,4);for(const s of res.schemes){const c=s.colors;assert.equal(s.color_director_version,3);assert.deepEqual(h.harmonize(s),c);assert.ok(Object.values(c).every(x=>/^#[0-9A-F]{6}$/.test(x)));for(const [role,target] of [['ink',7],['staff',4.5],['accent',3],['glow',3]])assert.ok(h.contrast(c[role],c.paper)>=target,`${s.id} ${role} contrast`);}return res;}
const a=test(ocean),b=test(forest),c=test(sunset),n=test(neutral);
assert.equal(a.primary,'#173F53');assert.ok(n.palette.some(p=>p.hex==='#FFFFFF'));assert.ok(n.palette.some(p=>p.hex==='#000000'));
for(let i=0;i<4;i++){for(const role of ['paper','background','accent','glow'])assert.equal(new Set([a,b,c].map(r=>r.schemes[i].colors[role])).size,3);for(const hex of Object.values(n.schemes[i].colors))assert.equal(new Set(hex.slice(1).match(/../g)).size,1,'no invented hue for gray image');}
assert.deepEqual(h.extractPixels(pixels([['FFFFFF',100,0],['102938',30]])).map(p=>p.hex),['#102938']);
assert.throws(()=>h.extractPixels(pixels([['FFFFFF',10,0]])),/불투명/);
for(const hex of ['000000','FFFFFF','FF0000','00FF00','0000FF','808080','D5B3B8'])assert.equal(test([[hex,10]]).primary,'#'+hex);
const near=h.extractPixels(pixels([['D5B3B8',60],['D6B4B9',40],['D8B5BA',20]]));assert.equal(near.length,1);
// Deterministic gradient / varied RGB stress, bounded sample size.
const data=new Uint8ClampedArray(128*128*4);let seed=1;for(let i=0;i<data.length;i+=4){for(let j=0;j<3;j++){seed=(Math.imul(1664525,seed)+1013904223)>>>0;data[i+j]=seed>>>24;}data[i+3]=255;}
const start=performance.now(),p=h.extractPixels(data);assert.ok(p.length<=5);console.log('PASS: exact sampled colors, deterministic clustering, neutral/black/white, alpha, monochrome, close-color merge, 4 dynamic schemes and contrast; stress ms:',Math.round(performance.now()-start));
