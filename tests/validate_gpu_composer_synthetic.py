"""Self-contained browser smoke test for the GPU compositor without a server."""
from playwright.sync_api import sync_playwright
from pathlib import Path
import os
import base64
from PIL import Image
from io import BytesIO
root=Path(__file__).resolve().parent.parent/'static'
module='data:text/javascript;base64,'+base64.b64encode((root/'vendor/pixi-8.23.0.min.mjs').read_bytes()).decode()
composer=(root/'gpu-composer.js').read_text().replace("const MODULE='/static/vendor/pixi-8.23.0.min.mjs';",f'const MODULE={module!r};')
css=(root/'stage.css').read_text()
with sync_playwright() as p:
 options={'headless':True, 'args':['--disable-dev-shm-usage','--enable-webgl']}
 if os.getenv('CHROMIUM_PATH'):options['executable_path']=os.environ['CHROMIUM_PATH']
 elif Path('/usr/bin/chromium').exists():options['executable_path']='/usr/bin/chromium'
 b=p.chromium.launch(**options)
 page=b.new_page(viewport={'width':640,'height':360},device_scale_factor=1)
 page.on('pageerror',lambda err: print('JS ERROR:',err))
 page.set_content('''<!doctype html><style>body{margin:0}#viewport{width:640px;height:360px;background:#202238;position:relative}.score-window{position:absolute;left:35px;top:45px;width:540px;height:200px;border-radius:8px;overflow:hidden;z-index:6}.score-panel{position:absolute;inset:0;background:#132;opacity:.2}.score-playback-cursor{position:absolute;left:200px;top:20px;height:120px;width:3px;border-radius:3px;opacity:.72;background:#22ccee;--playback-cursor-glow:7px;transform:translateX(-50%);box-shadow:0 0 7px #22ccee}.studio-atmosphere{position:absolute;inset:0;z-index:1;opacity:.32;mix-blend-mode:screen;background:radial-gradient(ellipse at 32% 18%, #dd99ff35, transparent 58%),radial-gradient(ellipse at 85% 87%, #dd99ff22,transparent 60%)}.studio-fx-canvas{position:absolute;inset:0;z-index:8}.studio-titles{position:absolute;inset:0;z-index:10;color:white;text-align:center;text-shadow:0 2px 11px rgba(0,0,0,.14)}.studio-title{font:650 28px/1.18 sans-serif;letter-spacing:-.8px;width:100%;}</style><div id="viewport" class="video-stage"><div class="studio-atmosphere"></div><div class="score-window"><div class="score-panel"></div><svg xmlns="http://www.w3.org/2000/svg" width="540" height="200" viewBox="0 0 540 200" style="position:absolute;inset:0"><g class="vf-notehead score-glowing" style="--score-glow-blur:4px;--score-note-active:#e8b0ff" transform="translate(110 90)"><ellipse cx="0" cy="0" rx="9" ry="5" fill="#e8b0ff" transform="rotate(-20)"/></g><g class="vf-stem"><path d="M 114 88 V 25" stroke="white" fill="none"/></g></svg><canvas class="score-pixi-score" width="540" height="200" style="position:absolute;inset:0;z-index:2"></canvas><div class="score-playback-cursor"></div></div><canvas class="studio-fx-canvas" width="640" height="360"></canvas><div class="studio-titles"><div class="studio-title" style="opacity:1">SYNTHETIC TEST</div></div></div>''')
 page.add_script_tag(content=composer)
 page.evaluate('''() => {const cvs=document.querySelector('.studio-fx-canvas'),ctx=cvs.getContext('2d');ctx.fillStyle='#00ff33';ctx.fillRect(590,260,30,30);const score=document.querySelector('.score-pixi-score'),sctx=score.getContext('2d');sctx.save();sctx.translate(200,90);sctx.scale(1.9,.75);const glow=sctx.createRadialGradient(0,0,1,0,0,72);glow.addColorStop(0,'rgba(210,145,255,.9)');glow.addColorStop(.35,'rgba(210,145,255,.55)');glow.addColorStop(1,'rgba(210,145,255,0)');sctx.fillStyle=glow;sctx.fillRect(-72,-72,144,144);sctx.restore();}''')
 result=page.evaluate('''async css => {
   const viewport=document.getElementById('viewport'),scoreWindow=viewport.querySelector('.score-window');
   window.ScoreStudio={frame(){return {glow:'#dd99ff'}}};
   const follower={bgLayer:{style:{backgroundColor:'#202238'}},colors(){return {glow:'#dd99ff',ink:'#ffffff',accent:'#e8b0ff'}},activeNodes:[{el:scoreWindow.querySelector('.vf-notehead'),velocity:100,age:.1,seed:0}],playbackCursor:scoreWindow.querySelector('.score-playback-cursor'),drawSystems:[]};
   const settings={width:640,height:360,scoreVisible:true,effects:{paper:'#202238',ink:'#ffffff',staff:'#ffffff',accent:'#e8b0ff',glow:'#dd99ff',backgroundUrl:'',minimalMode:false,inverted:false,drawScore:false},scene:{minimalMode:false,animateBackground:false,notationStyle:'classic'},scoreRegion:{cropTopPercent:0,panelColor:'#112233',panelOpacity:.2}};
   const stage={viewport,scoreWindow,meta:{has_score:true},settings,layer:{atmosphere:viewport.querySelector('.studio-atmosphere')},piano:null,follower};
   const c=window.c=await ScoreGpuComposer._test.GPUComposer.create(stage,640,360); c.css=css;
   const report=await c.compose(2);return {report,uri:c.canvas.toDataURL('image/png')};
 }''',css)
 png=base64.b64decode(result['uri'].split(',',1)[1]);img=Image.open(BytesIO(png)).convert('RGB');out=root.parent/'artifacts'/'preview-export-parity';out.mkdir(parents=True,exist_ok=True);img.save(out/'synthetic_gpu.png')
 print('SYNTHETIC pixels:', { 'fx': img.getpixel((600,270)), 'background':img.getpixel((5,350)), 'score':img.getpixel((200,130)), 'halo_center':img.getpixel((235,135)), 'halo_side':img.getpixel((325,135))},'svg decodes',result['report']['svgDecodes'])
 assert img.getpixel((600,270))[1] > 100,'scene fx layer failed'
 assert img.getpixel((325,135))[0] > 35,'elliptical score glow lost during transfer'
 page.evaluate('c.close()');b.close()
