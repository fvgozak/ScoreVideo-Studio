"""GPU pixel smoke test for the true keyboard edge, if WebGL2 is available."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import subprocess, json, shutil
root=Path(__file__).resolve().parents[1]
raw=subprocess.check_output(['node','--input-type=module','-e',
    "import * as s from './static/dynamic-fx/shaders.js'; console.log(JSON.stringify({vert:s.BOUNDARY_VERT,frag:s.BOUNDARY_FRAG}));"],cwd=root,text=True)
shaders=json.loads(raw)
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),
        args=['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    page=browser.new_page()
    page.set_content('<html><body><canvas id="c" width="540" height="960"></canvas></body></html>')
    data=page.evaluate('''({vert,frag})=>{
      const gl=document.querySelector('canvas').getContext('webgl2',{preserveDrawingBuffer:true});
      if(!gl)return {error:'WebGL2 unavailable'};
      function shader(type,source){
        const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);
        if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));
        return sh;
      }
      const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vert));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,frag));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);gl.viewport(0,0,540,960);gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
      const loc=n=>gl.getUniformLocation(program,n),set=(n,v)=>gl.uniform1f(loc(n),v);
      set('uCenterY',-.70);set('uHalfHeight',82);gl.uniform2f(loc('uResolution'),540,960);
      gl.uniform2f(loc('uKeyboardRange'),.03,.97);set('uStrength',1.3);
      set('uThickness',2);set('uReaction',1);set('uScale',1);set('uSpeed',1);
      gl.uniform3fv(loc('uColorLow'),[.12,.45,1]);gl.uniform3fv(loc('uColorHigh'),[.93,.27,.58]);
      gl.uniform1i(loc('uPulseCount'),2);
      gl.uniform2fv(loc('uPulses[0]'),new Float32Array([.5,1,.54,.7,...Array(12).fill(0)]));
      set('uEmissionMode',0);
      const pixel=(x,y)=>{const a=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,a);return [...a]};
      const results={};
      const centerY=Math.round((-.70+1)*960/2);
      for(let style=1;style<=8;style++){
        const frames=[];
        for(const time of [0,1.7]){
          gl.clearColor(.015,.025,.03,1);gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1i(loc('uStyle'),style);set('uTime',time);
          gl.drawArrays(gl.TRIANGLES,0,6);
          frames.push({center:pixel(270,centerY),above:pixel(270,centerY+11),edge:pixel(1,centerY),error:gl.getError()});
        }
        results[style]=frames;
      }
      return results;
    }''',shaders)
    print('GPU:',data)
    if 'error' in data:
        print('SKIP:',data['error'])
    else:
        assert len(data)==8
        for style,frames in data.items():
            assert all(f['error']==0 for f in frames), (style,frames)
            assert sum(frames[0]['center'][:3])>sum(frames[0]['edge'][:3])+10,(style,frames)
        # Aurora, ripple and electric vary with MIDI transport time.
        for style in ('2','7','8'):
            a,b=data[style]
            assert a['center']!=b['center'] or a['above']!=b['above'],style
        print('PASS animated GPU rim at actual lower-screen keyboard Y')
    browser.close()
