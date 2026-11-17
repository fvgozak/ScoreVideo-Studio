"""Compare original drawScore SVG raster with two static raster layers + moving mask.

No GPU is needed for this pure image comparison; Pixi's masks are represented
with a Canvas2D clipping path to validate the intended image composition.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent

async def main():
  async with async_playwright() as p:
    browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
       args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
    page=await browser.new_page(viewport={'width':840,'height':540})
    await page.set_content('''<style>*{box-sizing:border-box}html,body{margin:0}#stage{width:700px;height:400px}
      #win{position:relative;width:700px;height:350px;overflow:hidden}#container{width:12000px;height:350px}
      svg{display:block;width:12000px;height:350px}</style>
      <div id="stage"><div id="win"><div id="container"><svg id="svg" xmlns="http://www.w3.org/2000/svg"
      width="12000" height="350" viewBox="0 0 12000 350"><rect x="0" y="195" width="12000" height="1" fill="#aaa" data-score-staff-line=""/></svg></div></div></div>''')
    await page.evaluate('''() => {
      window.items=[];const svg=document.getElementById('svg'),ns='http://www.w3.org/2000/svg';
      for(let i=0;i<1000;i++){
        const el=document.createElementNS(ns,'circle'),x=28+i*10;
        el.setAttribute('cx',x);el.setAttribute('cy',175+(i%5)*4);el.setAttribute('r','3');
        el.setAttribute('fill','#b1b1dc');el.setAttribute('data-score-draw-item','');
        svg.appendChild(el);items.push({el,right:x+3,revealed:false});
      }
    }''')
    await page.add_script_tag(path=str(ROOT/'static/gpu-composer.js'))
    result=await page.evaluate('''async () => {
      class Container{constructor(){this.children=[]}addChild(...c){this.children.push(...c)}removeChildren(){this.children=[]}}
      class Graphics{constructor(){this.rects=[]}clear(){this.rects=[];return this}rect(...r){this.rects.push(r);return this}fill(){return this}}
      class Sprite{constructor(texture){this.texture=texture}destroy(){}}
      const PIXI={Container,Graphics,Sprite,Texture:{from(image){return {image,source:{update(){}}}}}};
      const app={canvas:document.createElement('canvas'),stage:new Container(),renderer:{width:700,height:400,
        gl:{MAX_TEXTURE_SIZE:0x0d33,getParameter(){return 4096}},resize(){}},render(){},destroy(){}};
      const stage={viewport:document.getElementById('stage'),scoreWindow:document.getElementById('win'),meta:{has_score:true},
        settings:{width:700,height:400,scoreVisible:true,scoreRegion:{cropTopPercent:0,panelColor:'#111',panelOpacity:0},
          scene:{notationStyle:'classic'},effects:{drawScore:true,minimalMode:false,ink:'#ddd',paper:'#111',staff:'#aaa',
          accent:'#00aaaa',backgroundUrl:'',minimalPalette:null}},
        follower:{container:document.getElementById('container'),drawRevision:0,activeNodes:[],drawSystems:[{y:184,items,minLeft:0,maxRight:12000,revealRight:0}]}};
      const C=window.ScoreGpuComposer._test.GPUComposer,c=new C(app,PIXI,stage),svg=document.getElementById('svg');c.css='';
      const results=[];
      const create=()=>{let canvas=document.createElement('canvas');canvas.width=700;canvas.height=350;return canvas;};
      const drawSprites=(ctx,group)=>{for(const sprite of group.children){if(sprite.texture?.image){
        ctx.drawImage(sprite.texture.image,sprite.x,sprite.y,sprite.width,sprite.height);
      }}};
      for(const amount of [0,4,10,20,40,60]){
        for(let i=0;i<items.length;i++){
          items[i].revealed=i<amount;
          items[i].el.style.clipPath=`inset(0 ${i<amount?'0':'100'}% 0 0)`;
          items[i].el.style.webkitClipPath=items[i].el.style.clipPath;
        }
        stage.follower.drawRevision++;
        stage.follower.drawSystems[0].revealRight=amount?items[amount-1].right:0;
        const metrics=await c.compose(amount/30);
        const actual=create(),actualCtx=actual.getContext('2d');
        drawSprites(actualCtx,c.scoreGroup);
        const top=create(),topCtx=top.getContext('2d');
        drawSprites(topCtx,c.drawOverlayGroup);
        const masked=create(),maskedCtx=masked.getContext('2d');
        maskedCtx.save();maskedCtx.beginPath();for(const [x,y,w,h] of c.drawMask.rects)maskedCtx.rect(x,y,w,h);
        maskedCtx.clip();maskedCtx.drawImage(top,0,0);maskedCtx.restore();
        actualCtx.drawImage(masked,0,0);
        const rect=svg.getBoundingClientRect();const crop={full:rect,
          visible:{left:rect.left,top:rect.top,width:700,height:350},width:700,height:350};
        const image=await c.getSvg(svg,stage,'',crop,'ref:'+amount);
        const ref=create();ref.getContext('2d').drawImage(image,0,0,700,350);
        const a=actualCtx.getImageData(0,0,700,350).data,b=ref.getContext('2d').getImageData(0,0,700,350).data;
        let sum=0;for(let i=0;i<a.length;i++)sum+=Math.abs(a[i]-b[i]);
        results.push({amount,decodes:metrics.svgDecodes,meanAbsDiff:sum/a.length,maskCount:c.drawMask.rects.length});
      }
      c.close();return results;
    }''')
    print(result)
    assert all(x['meanAbsDiff']<0.2 for x in result),result
    assert all(x['decodes']==0 for x in result[1:]),result
    print('PASS: draw mask and live SVG render identical in representative simple-score frames')
    await browser.close()
asyncio.run(main())
