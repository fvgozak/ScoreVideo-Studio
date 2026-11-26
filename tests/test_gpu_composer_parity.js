const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync('static/gpu-composer.js','utf8');
const context={window:{ScoreStudio:{frame(){return {glow:'#ffccaa'};}}},document:{},getComputedStyle(){return {opacity:'.32',display:'block',visibility:'visible',backgroundImage:'radial-gradient(at 32% 18%, rgba(255, 204, 170, .2), transparent 58%)'};}};
vm.createContext(context);vm.runInContext(source,context,{filename:'gpu-composer.js'});
const C=context.window.ScoreGpuComposer._test.GPUComposer;
(async()=>{
 const c=Object.create(C.prototype),calls=[];
 c.cursorCache=new Map();c.titleCache=new Map();c.effectTile=async(cache,key,xml,pad)=>{if(cache.has(key))return cache.get(key);const entry={image:{},pad,xml};cache.set(key,entry);return entry;};
 const cursor=await c.getCursor('#ffccaa',3.3,90.8,7.2,3);
 assert.equal(cursor.pad,16);assert.match(cursor.xml,/feGaussianBlur stdDeviation="3\.50"/);assert.match(cursor.xml,/<rect[^>]*rx="3"/);
 assert.equal(cursor,await c.getCursor('#ffccaa',3.3,90.8,7.2,3));
 const title=await c.getTitle('Small Morning',{color:'rgb(245,245,245)',fontSize:'42px',fontWeight:'650',fontFamily:'sans-serif',letterSpacing:'-1.4px',textShadow:'rgba(0, 0, 0, 0.14) 0px 2px 11px'},300,55);
 assert.ok(title.pad>=35);assert.match(title.xml,/feDropShadow/);assert.match(title.xml,/letter-spacing="-1.4px"/);assert.match(title.xml,/flood-opacity="0.14"/);
 c.getAtmosphereTiles=async()=>[{},{}];c.root={};c.spriteCache=new Map();
 c.place=(image,rect,group,alpha)=>{const sprite={};c.spriteCache.set(image,sprite);calls.push({rect,alpha,sprite});return sprite;};
 c.app={renderer:{gl:{}}};c.photo={};
 const stage={layer:{atmosphere:{}},settings:{scene:{minimalMode:false,animateBackground:true},effects:{paper:'#202238'}},follower:{colors(){return {glow:'#000000'};}}};
 await c.placeAtmosphere(stage,2,1280,720);assert.equal(calls.length,2);assert.equal(calls[0].sprite.blendMode,'screen');assert.equal(calls[0].sprite.tint,0xffccaa);
 assert.ok(calls[0].rect.width>0&&calls[0].alpha>calls[1].alpha);
 // Solid background uses mathematically equivalent tint, avoiding a screen blend state leak.
 c.photo=null;calls.length=0;await c.placeAtmosphere(stage,2,1280,720);assert.equal(calls.length,2);assert.ok(calls[0].sprite.tint>=0xffccaa);
 const order=['await this.placeAtmosphere(stage,time,w,h)','const piano=visibleCanvas(','if(settings.scoreVisible&&stage.meta.has_score!==false)','const headTile=await this.getHead(','const tile=await this.getCursor(','for(const canvas of scoreEffects){',"c.classList.contains('studio-fx-canvas')","stage.viewport.querySelector('.studio-titles')"].map(x=>source.indexOf(x));
 assert.ok(order.every((x,i)=>x>=0&&(!i||x>order[i-1])),order);
 assert.match(source,/const mirrored=this\.mirrorCanvas\(canvas\);\s*this\.place\(mirrored,this\.rectOf\(canvas,base,sx,sy\),this\.scoreGroup\)/);
 console.log('PASS title/cursor cache, CSS atmosphere blend, mirror and DOM layer order');
})().catch(e=>{console.error(e);process.exitCode=1;});
