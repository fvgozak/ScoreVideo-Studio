const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('static/gpu-composer.js','utf8');
const xml=[];
const context={
  window:{ScoreStudio:{frame(_scene,t){return {glow:t>1?'#ffccaa':'#22ccee'};}}},
  document:{},
  Blob:class {constructor(parts){this.value=parts.join('');}},
  URL:{createObjectURL(blob){xml.push(blob.value);return 'blob:parity:'+xml.length;},revokeObjectURL(){}},
  Image:class {set src(value){this.url=value;}async decode(){}},
  XMLSerializer:class {serializeToString(node){return node.serialize?.()||'<g/>';}} ,
  getComputedStyle(){return {opacity:'.32'}},
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'gpu-composer.js'});
const Composer=context.window.ScoreGpuComposer._test.GPUComposer;
(async()=>{
 const c=Object.create(Composer.prototype);
 c.cursorCache=new Map();c.titleCache=new Map();
 c.headCache=new WeakMap();
 const attrs={fill:'none',stroke:'none'};
 const ellipse={getBBox(){return {x:0,y:0,width:12,height:7};},
   cloneNode(){return this;},matches(selector){return selector.includes('ellipse');},
   getAttribute(key){return attrs[key]||null;},setAttribute(key,value){attrs[key]=value;},
   serialize(){return `<ellipse fill="${attrs.fill}" stroke="${attrs.stroke}"/>`;}};
 const ellipseGlow=await c.getHead(ellipse,'#cbe9ff',3,{width:12,height:7});
 assert.ok(ellipseGlow?.pad>0);
 assert.match(xml.at(-1),/<ellipse fill="#cbe9ff" stroke="#cbe9ff"/,
   'active ellipse notehead should match preview color, including hollow attributes');
 const cursor=await c.getCursor('#ffccaa',3.3,90.8,7.2,3);
 assert.equal(cursor.pad,16);
 assert.match(xml.at(-1),/feGaussianBlur stdDeviation="3\.50"/);
 assert.match(xml.at(-1),/<rect[^>]*rx="3"/);
 assert.equal(cursor,await c.getCursor('#ffccaa',3.3,90.8,7.2,3), 'cursor sprite cache');
 const title=await c.getTitle('Small Morning',{
   color:'rgb(245,245,245)',fontSize:'42px',fontWeight:'650',fontFamily:'sans-serif',
   letterSpacing:'-1.4px',textShadow:'rgba(0, 0, 0, 0.14) 0px 2px 11px'
 },300,55);
 assert.ok(title.pad>=35,'title shadow must not be cropped');
 assert.match(xml.at(-1),/feDropShadow/,'CSS title shadow must be present');
 assert.match(xml.at(-1),/letter-spacing="-1.4px"/,'preserve CSS letter spacing');
 assert.match(xml.at(-1),/flood-opacity="0.14"/,'preserve shadow opacity');
 const sprites=new Map(),placements=[];
 c.getAtmosphereTiles=async()=>[{},{}];
 c.place=(image,rect,_group,alpha)=>{const sprite={};sprites.set(image,sprite);placements.push({image,rect,alpha,sprite});};
 c.spriteCache={get(image){return sprites.get(image)}};
 c.tint=Composer.prototype.tint;
 c.root={};
 await c.placeAtmosphere({layer:{atmosphere:{}},settings:{scene:{minimalMode:false,animateBackground:true}},follower:{colors(){return {glow:'#000000'}}}},2,1280,720);
 assert.equal(placements.length,2,'two CSS atmosphere gradient layers');
 assert.equal(placements[0].sprite.blendMode,'screen');
 assert.equal(placements[0].sprite.tint,0xffccaa);
 assert.ok(placements[0].rect.width>0&&placements[0].rect.height>0);
 assert.ok(placements[0].alpha>placements[1].alpha);
 // Browser z-index: atmosphere 1, keyboard 3, score 6, scene fx 8, titles 10.
 const atmosphereAt=source.indexOf('await this.placeAtmosphere(stage,time,w,h)');
 const pianoAt=source.indexOf('const piano=visibleCanvas(');
 const scoreAt=source.indexOf('if(settings.scoreVisible&&stage.meta.has_score!==false)');
 const sceneFxAt=source.indexOf("c.classList.contains('studio-fx-canvas')");
 const titleAt=source.indexOf("stage.viewport.querySelector('.studio-titles')");
 assert.ok(atmosphereAt>=0&&atmosphereAt<pianoAt&&pianoAt<scoreAt&&scoreAt<sceneFxAt&&sceneFxAt<titleAt);
 const cursorAt=source.indexOf('const tile=await this.getCursor(');
 const pixiAt=source.indexOf('for(const canvas of scoreEffects){');
 assert.ok(cursorAt<pixiAt,'cursor should be below Pixi score glow');
 assert.match(source,/this\.place\(tile\.image,\{x:box\.x-tile\.pad/);
 console.log('PASS atmosphere, subtitle/text shadow, cursor halo/caching, and DOM z-layer parity');
})().catch(e=>{console.error(e);process.exitCode=1;});
