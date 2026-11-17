"""Chromium image test: drawing reveal tiles match a whole-viewport SVG raster."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
            args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
        page = await browser.new_page(viewport={'width':1280,'height':900})
        await page.set_content('''<style>*{box-sizing:border-box}#stage{position:relative;width:720px;height:420px}
        #win{position:absolute;top:0;left:0;width:720px;height:380px;overflow:auto}
        #svg{display:block;width:20000px;height:380px;max-width:none}</style>
        <div id="stage"><div id="win"><svg id="svg" xmlns="http://www.w3.org/2000/svg"
        width="20000" height="380" viewBox="0 0 20000 380">
        <rect width="20000" height="380" fill="#fefefe"/></svg></div></div>''')
        await page.evaluate('''() => {
           const svg=document.getElementById('svg'),ns='http://www.w3.org/2000/svg';
           for(let i=0;i<1600;i++){
             const p=document.createElementNS(ns,'circle');
             p.setAttribute('cx', i*12+3);p.setAttribute('cy',45+i%12*24);
             p.setAttribute('r',3);p.setAttribute('fill','#112a55');
             if(i%4===0)p.style.clipPath='inset(0 100% 0 0)';
             svg.appendChild(p);
           }
        }''')
        await page.add_script_tag(path=str(ROOT / 'static/gpu-composer.js'))
        result = await page.evaluate('''async () => {
          class Container{constructor(){this.children=[]}addChild(...xs){this.children.push(...xs)}removeChildren(){this.children=[]}}
          class Graphics{clear(){return this}rect(){return this}fill(){return this}}
          class Sprite{constructor(texture){this.texture=texture}destroy(){}}
          const PIXI={Container,Graphics,Sprite,Texture:{from(image){return {image,source:{update(){}}}}}};
          const app={canvas:document.createElement('canvas'),stage:new Container(),renderer:{width:720,height:420,
            gl:{MAX_TEXTURE_SIZE:0x0d33,getParameter(){return 4096}},resize(){}},render(){},destroy(){}};
          const settings={width:720,height:420,scoreVisible:true,scoreRegion:{cropTopPercent:0,panelColor:'#ffffff',panelOpacity:0},
            scene:{notationStyle:'classic'},effects:{drawScore:true,minimalMode:false,ink:'#111',paper:'#fefefe',staff:'#555',
            accent:'#00aaaa',backgroundUrl:'',minimalPalette:null}};
          const stage={viewport:document.getElementById('stage'),scoreWindow:document.getElementById('win'),meta:{has_score:true},
            settings,follower:{drawRevision:1,activeNodes:[{}]}};
          const composer=new window.ScoreGpuComposer._test.GPUComposer(app,PIXI,stage);composer.css='';
          const cases=[];
          for(const offset of [0,630,1111,3160]){
            document.querySelector('#win').scrollLeft=offset;
            stage.follower.drawRevision++;
            const data=await composer.compose(0);
            const region=stage.scoreWindow.getBoundingClientRect(),r=stage.scoreWindow.querySelector('svg').getBoundingClientRect();
            const v={left:region.left,top:region.top,right:region.right,bottom:Math.min(r.bottom,region.bottom),
               width:region.width,height:Math.min(r.bottom,region.bottom)-region.top};
            const image=await composer.getSvg(stage.scoreWindow.querySelector('svg'),stage,'',
              {full:r,visible:v,width:720,height:380},'ref:'+offset);
            const a=document.createElement('canvas'),b=document.createElement('canvas');
            a.width=b.width=720;a.height=b.height=380;
            a.getContext('2d').drawImage(image,0,0,720,380);
            const brush=b.getContext('2d');
            for(const sprite of composer.scoreGroup.children){
              if(sprite.texture?.image)brush.drawImage(sprite.texture.image,sprite.x,sprite.y,sprite.width,sprite.height);
            }
            const x=a.getContext('2d').getImageData(0,0,720,380).data;
            const y=brush.getImageData(0,0,720,380).data;
            let max=0,sum=0;for(let i=0;i<x.length;i++){const d=Math.abs(x[i]-y[i]);max=Math.max(max,d);sum+=d;}
            cases.push({offset,visibleTiles:data.visibleTiles,maxPixelDiff:max,meanChannelDiff:sum/x.length});
          }
          composer.close();return cases;
        }''')
        for case in result:
            print(case)
            assert case['meanChannelDiff']<0.01, 'cached reveal tiles differ substantially from whole viewport raster'
        print('PASS: tiled draw-score pixels match reference within subpixel edge antialiasing tolerance')
        await browser.close()

asyncio.run(main())
