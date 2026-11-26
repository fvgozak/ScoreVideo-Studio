const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let created=0,xml='';
class Sprite {constructor(texture){this.texture=texture;}destroy(){this.destroyed=true;}}
const context={window:{},performance:{now:()=>0},document:{},
 Blob:class{constructor(parts){this.value=parts.join('');}},URL:{createObjectURL(b){xml=b.value;created++;return 'blob:test';},revokeObjectURL(){}},
 Image:class{async decode(){this.naturalWidth=Number(xml.match(/width="(\d+)"/)[1]);this.naturalHeight=Number(xml.match(/height="(\d+)"/)[1]);}},
 XMLSerializer:class{serializeToString(n){return `<path ${Object.entries(n.attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}/>`;}},
 getComputedStyle(n){return {opacity:String(n.opacity??1),display:'inline',visibility:'visible',getPropertyValue(k){return {fill:'#efc2ff',stroke:'none','stroke-width':'1px'}[k]||'';}};}
};
vm.createContext(context);vm.runInContext(fs.readFileSync('static/gpu-composer.js','utf8'),context);
const {GPUComposer,normalizePath,headBox,MAX_EFFECT_ENTRIES,MAX_EFFECT_BYTES}=context.window.ScoreGpuComposer._test;
const app={canvas:{},stage:{addChild(){}},renderer:{},destroy(){}};
const PIXI={Container:class{addChild(){}},Graphics:class{},Sprite,Texture:{from:image=>({image,tintCache:{},destroy(){this.destroyed=true;}})}};
const c=new GPUComposer(app,PIXI,{});
function note(x,y){return {x,y,scale:1,opacity:1,localName:'path',matches(){return true;},getAttribute(k){return k==='d'?`M ${x} ${y} H ${x+16} V ${y+9} H ${x} Z`:null;},getScreenCTM(){return {a:this.scale,b:0,c:0,d:this.scale,e:100,f:150};},cloneNode(){return {attrs:{d:this.getAttribute('d')},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};}};}
function rect(h){return {x:h.x*h.scale+100,y:h.y*h.scale+150,width:16*h.scale,height:9*h.scale,raw:{left:h.x*h.scale+100,top:h.y*h.scale+150}};}
const notes=Array.from({length:100},(_,i)=>note(i*24,i%7*20));
(async()=>{
 assert.equal(normalizePath('M 100 200 C 102 201 105 209 107 210 Z').d,normalizePath('M 10 20 C 12 21 15 29 17 30 Z').d);
 assert.equal(normalizePath('M 2 2 A 5 5 0 1 0 8 8'),null);
 c.frameNumber=1;const n=notes[0];
 const first=await c.getHead(n,'#ff00ff',4,rect(n),1,1,'glow');
 assert.match(xml,/fill="#ffffff"/);assert.match(xml,/feGaussianBlur/);assert.match(xml,/feFlood flood-color="#ffffff"/);
 const second=await c.getHead(notes[1],'#0033cc',4,rect(notes[1]),1,1,'glow');
 assert.equal(first.image,second.image,'same translated shape shares image');assert.equal(created,1);
 const group={children:[],addChild(sprite){this.children.push(sprite);}};
 c.placeHead(first,rect(n),group);c.placeHead(second,rect(notes[1]),group);
 assert.notEqual(group.children[0],group.children[1]);assert.equal(group.children[0].texture,group.children[1].texture);
 assert.equal(group.children[0].tint,0xff00ff);assert.equal(group.children[1].tint,0x0033cc);
 const box=headBox(rect(n),first);assert.ok(box.x<rect(n).x&&box.width>rect(n).width);
 // 12,000 frames: variable scale, color, opacity, translated notes, blur.
 for(let i=0;i<12000;i++){
   c.frameNumber++;c.placed.length=0;group.children.length=0;
   for(let j=0;j<6;j++){
     const h=notes[(i+j)%notes.length];h.scale=0.85+0.3*(i%21)/20;h.opacity=.3+.7*(i%23)/22;
     const r=rect(h),color='#'+((i*17011+j*13009)&0xffffff).toString(16).padStart(6,'0');
     const tile=await c.getHead(h,color,(2+(i%7)/2)*h.scale,r,1,1,'glow');
     c.placeHead(tile,r,group);assert.equal(group.children[j].alpha,h.opacity);
   }
   c.pruneEffects();
 }
 assert.ok(c.headStats.decodes<=8,JSON.stringify(c.headStats));assert.equal(c.headStats.evictions,0);
 assert.ok(c.headMaskBytes<=MAX_EFFECT_BYTES);assert.ok(c.headPools.size<=8);assert.equal(c.headStats.geometryBuilds,100);
 for(const p of c.headPools.values())for(let i=0;i<100;i++)p.texture.tintCache[String(i)]={};
 c.pruneHeadTints();for(const p of c.headPools.values())assert.ok(Object.keys(p.texture.tintCache).length<=16);
 const report={...c.headStats,entries:c.headMasks.size,maskBytes:c.headMaskBytes};
 const pool=[...c.headPools.values()][0];c.close();assert.equal(pool.texture.destroyed,true);assert.ok(pool.sprites.every(s=>s.destroyed));assert.equal(c.headPools.size,0);
 console.log('PASS 12,000-frame mask stress / shared sprites / tint cap / cleanup',JSON.stringify(report));
})().catch(e=>{console.error(e);process.exitCode=1;});
