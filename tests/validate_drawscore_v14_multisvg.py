"""Actual Chromium SVG raster regression: multiple OSMD page SVGs, short staves, late glyphs.

Expected: all staff strokes remain visible before playback; every nonstaff
primitive including far notes/beam/slurs is cursor-masked on every page SVG.
Static raster tiles must not re-decode when cursor moves.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent.parent

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'])
  page=await browser.new_page(viewport={'width':900,'height':540})
  await page.set_content('''<style>*{box-sizing:border-box}body{margin:0;background:#000}#stage{position:relative;width:720px;height:420px}
  #win{position:absolute;left:0;top:0;width:720px;height:380px;overflow:hidden}
  #container{display:flex;width:720px;height:380px}svg{flex:none;display:block;width:360px;height:380px}</style>
  <div id="stage"><div id="win"><div id="container">
  <svg xmlns="http://www.w3.org/2000/svg" width="360" height="380" viewBox="0 0 360 380">
    <g class="staffline"><g class="vf-measure">
      <path d="M 0 140 H 84" fill="none" stroke="#acc6e4"/>
      <path d="M 0 148 H 84" fill="none" stroke="#acc6e4"/>
      <path d="M 0 156 H 84" fill="none" stroke="#acc6e4"/>
      <path d="M 0 164 H 84" fill="none" stroke="#acc6e4"/>
      <path d="M 0 172 H 84" fill="none" stroke="#acc6e4"/>
      <rect x="84" y="140" width="1" height="32" fill="#fff"/>
      <path d="M 84 140 H 360" fill="none" stroke="#acc6e4"/>
      <path d="M 84 148 H 360" fill="none" stroke="#acc6e4"/>
      <path d="M 84 156 H 360" fill="none" stroke="#acc6e4"/>
      <path d="M 84 164 H 360" fill="none" stroke="#acc6e4"/>
      <path d="M 84 172 H 360" fill="none" stroke="#acc6e4"/>
      <rect x="122" y="199" width="13" height="11" fill="#e7e8ef"/>
      <path d="M 120 200 H 149" stroke="#fff" stroke-width="3"/>
    </g></g>
  </svg>
  <svg xmlns="http://www.w3.org/2000/svg" width="360" height="380" viewBox="0 0 360 380">
    <g class="staffline"><g class="vf-measure">
      <path d="M 0 140 H 90" fill="none" stroke="#acc6e4"/>
      <path d="M 0 148 H 90" fill="none" stroke="#acc6e4"/>
      <path d="M 0 156 H 90" fill="none" stroke="#acc6e4"/>
      <path d="M 0 164 H 90" fill="none" stroke="#acc6e4"/>
      <path d="M 0 172 H 90" fill="none" stroke="#acc6e4"/>
      <path d="M 90 140 H 360" fill="none" stroke="#acc6e4"/>
      <path d="M 90 148 H 360" fill="none" stroke="#acc6e4"/>
      <path d="M 90 156 H 360" fill="none" stroke="#acc6e4"/>
      <path d="M 90 164 H 360" fill="none" stroke="#acc6e4"/>
      <path d="M 90 172 H 360" fill="none" stroke="#acc6e4"/>
      <rect x="165" y="199" width="14" height="11" fill="#e7e8ef"/>
      <path d="M 160 215 C 170 180 200 180 230 215" stroke="#fff" stroke-width="2" fill="none"/>
    </g></g>
  </svg></div></div></div>''')
  await page.add_script_tag(path=str(ROOT/'static/score-core.js'))
  await page.add_script_tag(path=str(ROOT/'static/gpu-composer.js'))
  result=await page.evaluate('''async () => {
    const cEl=document.getElementById('container'),view=document.getElementById('stage');
    const f={container:cEl,viewport:view,noteTriggers:[{systemKey:0,noteY:205,audio:0},{systemKey:0,noteY:204,audio:1}]};
    window.ScoreFollower.prototype.prepareDrawing.call(f);
    const staff= cEl.querySelectorAll('[data-score-staff-line]').length;
    const drawable=cEl.querySelectorAll('[data-score-draw-item]').length;
    const Container=class{constructor(){this.children=[];this.mask=null}addChild(...a){this.children.push(...a)}removeChildren(){this.children=[]}};
    const Graphics=class{constructor(){this.rects=[]}clear(){this.rects=[];return this}rect(...a){this.rects.push(a);return this}fill(){return this}};
    const Sprite=class{constructor(t){this.texture=t}destroy(){}};
    const PIXI={Container,Graphics,Sprite,Texture:{from(image){return {image,source:{update(){}}}}}};
    const app={canvas:document.createElement('canvas'),stage:new Container(),renderer:{width:720,height:420,gl:{MAX_TEXTURE_SIZE:0x0d33,getParameter(){return 2048}},resize(){}},render(){},destroy(){}};
    const settings={width:720,height:420,scoreVisible:true,
      scoreRegion:{cropTopPercent:0,panelColor:'#000000',panelOpacity:0},scene:{notationStyle:'classic'},
      effects:{drawScore:true,minimalMode:false,backgroundUrl:'',paper:'#000000',ink:'#eeeeee',staff:'#acc6e4',accent:'#2ec9d3'}};
    const stage={viewport:view,scoreWindow:document.getElementById('win'),meta:{has_score:true},settings,
      follower:{...f,drawSystems:f.drawSystems,activeNodes:[]}};
    const compositor=new window.ScoreGpuComposer._test.GPUComposer(app,PIXI,stage);
    compositor.css='';
    const drawCanvas=(cutoff) => {
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=420;
      const ctx=canvas.getContext('2d');
      for(const obj of compositor.scoreGroup.children)if(obj.texture?.image)ctx.drawImage(obj.texture.image,obj.x,obj.y,obj.width,obj.height);
      const top=document.createElement('canvas');top.width=720;top.height=420;
      const topCtx=top.getContext('2d');
      for(const obj of compositor.drawOverlayGroup.children)if(obj.texture?.image)topCtx.drawImage(obj.texture.image,obj.x,obj.y,obj.width,obj.height);
      ctx.save();ctx.beginPath();for(const a of compositor.drawMask.rects)ctx.rect(...a);ctx.clip();ctx.drawImage(top,0,0);ctx.restore();
      const at=(x,y)=>Array.from(ctx.getImageData(x,y,1,1).data);
      return {staffA:at(40,140),staffB:at(400,140),lateA:at(127,204),lateB:at(172+360,204),slurB:at(195+360,195)};
    };
    f.drawSystems[0].revealRight=60;
    const firstMetrics=await compositor.compose(0);const first=drawCanvas(60);
    f.drawSystems[0].revealRight=150;
    const secondMetrics=await compositor.compose(1);const second=drawCanvas(150);
    f.drawSystems[0].revealRight=600;
    const thirdMetrics=await compositor.compose(2);const third=drawCanvas(600);
    const out={staff,drawable,items:f.drawSystems[0].items.length,first,second,third,decodes:[firstMetrics.svgDecodes,secondMetrics.svgDecodes,thirdMetrics.svgDecodes],maskCount:compositor.drawMask.rects.length};
    compositor.close();return out;
  }''')
  print(result)
  assert result['staff']==20, 'All 20 per-measure short/long staff strokes must be permanent'
  assert result['drawable']>=4, 'Notes, beam, slur and barline classified as draw items'
  for state in ['first','second','third']:
   assert result[state]['staffA'][0]>=100 and result[state]['staffB'][0]>=100, (state,result[state])
  assert result['first']['lateA'][0]<5 and result['first']['lateB'][0]<5, 'Unplayed notes should stay hidden'
  assert result['second']['lateA'][0]>=100 and result['second']['lateB'][0]<5, 'First page revealed but second still hidden'
  assert result['third']['lateB'][0]>=100, 'Second page note must eventually appear'
  assert result['decodes']==[4,0,0], 'Rasters should stay cached despite reveal progression'
  print('PASS multi-SVG staff-only/static glyph GPU mask and cache regression')
  await browser.close()
asyncio.run(main())
