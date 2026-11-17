"""Browser integration smoke: single-line drawing uses one-time static rasters."""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parent.parent

async def main():
    async with async_playwright() as p:
        browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,
            args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
        page=await browser.new_page(viewport={'width':900,'height':550})
        await page.set_content('''<style>html,body{margin:0}#stage{position:relative;width:720px;height:420px}
        #win{position:absolute;top:0;left:0;width:720px;height:380px;overflow:auto}
        #container{width:15000px;height:380px}#svg{display:block;width:15000px;height:380px;max-width:none}</style>
        <div id="stage"><div id="win"><div id="container"><svg id="svg" xmlns="http://www.w3.org/2000/svg"
        width="15000" height="380" viewBox="0 0 15000 380">
        <rect x="0" y="180" width="15000" height="1" fill="#ddd"/>
        </svg></div></div></div>''')
        await page.evaluate('''() => {
            let svg=document.getElementById('svg'),ns='http://www.w3.org/2000/svg';
            window.drawItems=[];
            for(let i=0;i<1500;i++){
              const n=document.createElementNS(ns,'circle');
              n.setAttribute('cx',i*10+5);n.setAttribute('cy',170+(i%3)*6);
              n.setAttribute('r',3);n.setAttribute('fill','#ddd');
              n.setAttribute('data-score-draw-item','');svg.appendChild(n);
              drawItems.push({el:n,right:i*10+8,revealed:false});
            }
          }''')
        await page.add_script_tag(path=str(ROOT/'static/gpu-composer.js'))
        result=await page.evaluate('''async () => {
          class Container{constructor(){this.children=[];this.mask=null;}addChild(...xs){this.children.push(...xs)}removeChildren(){this.children=[]}}
          class Graphics{constructor(){this.rects=[]}clear(){this.rects=[];return this}rect(...x){this.rects.push(x);return this}fill(){return this}}
          class Sprite{constructor(texture){this.texture=texture}destroy(){}}
          const PIXI={Container,Graphics,Sprite,Texture:{from(image){return {image,source:{update(){}}}}}};
          const app={canvas:document.createElement('canvas'),stage:new Container(),renderer:{width:720,height:420,
            gl:{MAX_TEXTURE_SIZE:0x0d33,getParameter(){return 4096}},resize(){}},render(){},destroy(){}};
          const settings={width:720,height:420,scoreVisible:true,scoreRegion:{cropTopPercent:0,panelColor:'#111111',panelOpacity:0},
            scene:{notationStyle:'classic'},effects:{drawScore:true,minimalMode:false,ink:'#dddddd',paper:'#111111',staff:'#666',
            accent:'#00aaaa',backgroundUrl:'',minimalPalette:null}};
          const stage={viewport:document.getElementById('stage'),scoreWindow:document.getElementById('win'),meta:{has_score:true},settings,
            follower:{container:document.getElementById('container'),drawRevision:1,
              drawSystems:[{y:170,items:window.drawItems,minLeft:0,maxRight:15000,revealRight:20}],activeNodes:[]}};
          const C=window.ScoreGpuComposer._test.GPUComposer,c=new C(app,PIXI,stage);c.css='';
          const frames=[];
          for(let frame=0;frame<10;frame++){
            document.getElementById('win').scrollLeft=frame*10;
            for(let j=0;j<=frame*9;j++)drawItems[j].revealed=true;
            stage.follower.drawSystems[0].revealRight=frame*90+20;
            stage.follower.drawRevision++;
            let t=performance.now(),m=await c.compose(frame/30);
            frames.push({frame,ms:performance.now()-t,decodes:m.svgDecodes,hits:m.tileCacheHits,
              masks:c.drawMask.rects.length,staff:c.scoreGroup.children.length,
              full:c.drawOverlayGroup.children.length});
          }
          c.close();return frames;
        }''')
        print(result)
        assert result[0]['decodes']==2,result
        assert sum(r['decodes'] for r in result[1:])==0,result
        assert all(r['full']>0 and r['masks']==1 for r in result),result
        print('PASS: GPU mask updates without SVG cloning/redecoding for every drawRevision')
        await browser.close()

asyncio.run(main())
