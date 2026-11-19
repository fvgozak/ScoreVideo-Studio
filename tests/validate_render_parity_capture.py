"""Browser integration smoke: zip is valid; A/B and C/no-glow metrics detect loss;
state + output-resolution setup restored. Uses synthetic 2D glow, NOT Pixi WebGL."""
from pathlib import Path
import io, json, zipfile, base64
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
with sync_playwright() as p:
    chromium={'headless':True}
    if Path('/usr/bin/chromium').exists():chromium['executable_path']='/usr/bin/chromium'
    browser=p.chromium.launch(**chromium)
    page=browser.new_page(viewport={'width':640,'height':480})
    page.goto('about:blank?render_debug=1')
    page.set_content('<html><body><audio id="audioPlayer"></audio><select id="fps"><option>30</option></select></body></html>')
    page.evaluate('''() => {
      const paint=(canvas)=>{const c=canvas.getContext('2d');c.clearRect(0,0,64,48);c.save();c.translate(22,24);c.scale(2,.5);const g=c.createRadialGradient(0,0,1,0,0,18);g.addColorStop(0,'rgba(190,100,255,1)');g.addColorStop(1,'rgba(190,100,255,0)');c.fillStyle=g;c.fillRect(-18,-18,36,36);c.restore();};
      const src=document.createElement('canvas');src.width=64;src.height=48;src.className='score-pixi-score';document.body.append(src);
      const stage={scoreGpu:{app:{canvas:src,renderer:{type:1}}},settings:{width:640,height:480,gpuEffects:{glow:{halo:{radius:1}}}},viewport:{clientWidth:640,clientHeight:480},time:1.5,seek(t){this.time=t;paint(src)}};
      window.testStage=stage;stage.seek(1.5);
      const events=[];window.testEvents=events;
      window.__scoreVideoDebug={getStage:()=>stage,config(){return {width:1280,height:720}},async prepareExportStage(dimensions){events.push('prepare');stage.settings.width=dimensions?.width||1280;stage.settings.height=dimensions?.height||720;},async restorePreviewStage(){events.push('restore');stage.settings.width=640;stage.settings.height=480;}};
      window.ScoreWebmRecorder={async createDiagnosticComposer(stage){
         const out=document.createElement('canvas');out.width=stage.settings.width;out.height=stage.settings.height;
         const ctx=out.getContext('2d'),mirror=document.createElement('canvas');mirror.width=64;mirror.height=48;const mc=mirror.getContext('2d');
         const map=new WeakMap();map.set(src,{canvas:mirror});
         return {canvas:out,canvasMirrors:map,
           async compose(){mc.clearRect(0,0,64,48);mc.drawImage(src,0,0);ctx.fillStyle='#101525';ctx.fillRect(0,0,out.width,out.height);if(src.style.display!=='none')ctx.drawImage(mirror,out.width*.15,out.height*.25,out.width*.3,out.height*.35);return {scoreGlowTransferInfo:{mode:'test'}};},
           close(){events.push('close');}
         };
      }};
    }''')
    page.add_script_tag(path=str(ROOT/'static/render-parity-diagnostic.js'))
    result=page.evaluate('''async()=>{
      const data=await ScoreRenderParity.capture({seconds:2.5,fps:30});
      const buf=new Uint8Array(await data.blob.arrayBuffer());
      let s='';for(let i=0;i<buf.length;i+=8192)s+=String.fromCharCode(...buf.slice(i,i+8192));
      return {zip:btoa(s),events:window.testEvents,stage:{w:window.testStage.settings.width,t:window.testStage.time},report:data.report};
    }''')
    z=zipfile.ZipFile(io.BytesIO(base64.b64decode(result['zip'])))
    expected={'A_pixi_original.png','B_2d_mirror.png','C_gpu_composite.png','C_no_glow.png','C_glow_difference_x3.png','report.json','README.txt'}
    assert expected==set(z.namelist()),z.namelist()
    report=json.loads(z.read('report.json'))
    assert abs(report['frameTimeSeconds']-2.5)<.001
    assert report['originalVsMirror']['rgbaMae']==0,report['originalVsMirror']
    assert report['original']['alphaMassEstimate']>0
    assert report['gpuGlowContribution']['changedPixels']>1000
    assert report['mp4'] is None
    assert result['stage']=={'w':640,'t':1.5},result['stage']
    assert result['events']==['prepare','close','restore'],result['events']
    assert page.locator('#renderParityPanel').count()==1
    assert page.locator('[data-parity="pair"]').count()==1
    paired=page.evaluate('''async()=>{
      const {blob,report}=await ScoreRenderParity.captureResolutionPair({seconds:2.5,fps:30,qualities:[48,72]});
      const raw=new Uint8Array(await blob.arrayBuffer());let binary='';
      for(let i=0;i<raw.length;i+=8192)binary+=String.fromCharCode(...raw.slice(i,i+8192));
      return {zip:btoa(binary),report,restored:[window.testStage.settings.width,window.testStage.settings.height,window.testStage.time]};
    }''')
    zp=zipfile.ZipFile(io.BytesIO(base64.b64decode(paired['zip'])))
    assert {'48p_diagnostic.zip','72p_diagnostic.zip','resolution_comparison.json','README_4K.txt'}==set(zp.namelist()),zp.namelist()
    outer=json.loads(zp.read('resolution_comparison.json'))
    assert outer['sameFrameTime'] and len(outer['profiles'])==2
    assert outer['profiles'][0]['dimensions']=={'width':86,'height':48}
    assert outer['profiles'][1]['dimensions']=={'width':128,'height':72}
    assert all(x['gpuGlowContribution']['changedPixels']>0 for x in outer['profiles'])
    assert paired['restored']==[640,480,1.5]
    for name in ('48p_diagnostic.zip','72p_diagnostic.zip'):
        nested=zipfile.ZipFile(io.BytesIO(zp.read(name)))
        assert {'A_pixi_original.png','B_2d_mirror.png','C_gpu_composite.png'}.issubset(nested.namelist())
    mp4=ROOT/'review'/'parity_test.mp4'
    if mp4.exists():
        frame=page.evaluate('''async b64=>{
          const raw=atob(b64),arr=new Uint8Array(raw.length);for(let i=0;i<arr.length;i++)arr[i]=raw.charCodeAt(i);
          const result=await ScoreRenderParity.capture({seconds:2.5,fps:30,mp4:new File([arr],'synthetic.mp4',{type:'video/mp4'})});
          return {mp4:result.report.mp4,events:window.testEvents};
        }''',base64.b64encode(mp4.read_bytes()).decode())
        assert frame['mp4']['dimensionsMatch'],frame['mp4']
        assert frame['mp4']['gpuVsMp4']['comparable']
        assert frame['events'][-3:]==['prepare','close','restore'],frame['events']
    print('PASS ZIP CRC, file manifest, alpha readback, A->B equality, C bloom contribution, optional D MP4 decode, frame time, export stage restoration, debug panel')
    browser.close()
