import {KEYBOARD,keyPosition} from './engine.js?v=aurora3';
import {stageCamera,noteFallLane} from './stageCamera.js?v=keyboard24';
import {normalizeNoteBarMode,risingNoteRect} from './note-bars.js?v=19';
import {PortraitLookaheadController} from './lookaheadCamera.js?v=dynamic16h';
import {colorFromVelocity} from './dynamics.js?v=aurora3';
import {buildKeyboard,HIT_Y,FRONT_Y} from './keyboardMesh.js?v=dynamic16h';
import * as S from './shaders.js?v=boundary8';
import {normalizeBoundaryLight,boundaryGeometry,boundaryPulses} from './boundary-light.js?v=boundary8';

function makeProgram(gl,v,f){
  function shader(type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh)+'\n'+src);return sh}
  const program=gl.createProgram(),vert=shader(gl.VERTEX_SHADER,v),frag=shader(gl.FRAGMENT_SHADER,f);
  gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
  gl.deleteShader(vert);gl.deleteShader(frag);return program;
}
function attrib(gl,location,size,stride,offset){gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,stride*4,offset*4)}
function meshBuffer(gl,data,stride,layouts,usage){
  const vao=gl.createVertexArray(),buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
  gl.bufferData(gl.ARRAY_BUFFER,data,usage??gl.STATIC_DRAW);
  for(const [loc,size,offset] of layouts)attrib(gl,loc,size,stride,offset);
  gl.bindVertexArray(null);
  return {vao,buffer,count:data.length/stride,stride};
}
function updateBuffer(gl,mesh,data){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);mesh.count=data.length/mesh.stride;}
function createTarget(gl,w,h,depth=false){
  const fbo=gl.createFramebuffer(),tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0);
  let rb=null;if(depth){rb=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,rb);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,w,h);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,rb);}
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('WebGL 프레임버퍼 생성 실패');
  let msaaFbo=null,msaaColor=null,msaaDepth=null,samples=0;
  // WebGL canvas antialias:true does NOT antialias an ordinary offscreen FBO.
  // Draw into a multisampled renderbuffer and resolve it into the scene texture.
  if(depth){
    samples=w*h>1920*1080?0:Math.min(4,Number(gl.getParameter(gl.MAX_SAMPLES))||0);
    if(samples>=2){
      msaaFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,msaaFbo);
      msaaColor=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,msaaColor);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,gl.RGBA8,w,h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,msaaColor);
      msaaDepth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,msaaDepth);
      gl.renderbufferStorageMultisample(gl.RENDERBUFFER,samples,gl.DEPTH_COMPONENT24,w,h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,msaaDepth);
      if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE){
        throw Error('WebGL MSAA 프레임버퍼 생성 실패');
      }
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);return {fbo,tex,rb,w,h,msaaFbo,msaaColor,msaaDepth,samples};
}
function disposeTarget(gl,t){if(!t)return;gl.deleteFramebuffer(t.fbo);gl.deleteTexture(t.tex);
  if(t.rb)gl.deleteRenderbuffer(t.rb);
  if(t.msaaFbo)gl.deleteFramebuffer(t.msaaFbo);
  if(t.msaaColor)gl.deleteRenderbuffer(t.msaaColor);
  if(t.msaaDepth)gl.deleteRenderbuffer(t.msaaDepth);
}
function bindTexture(gl,p,name,tex,slot=0){gl.activeTexture(gl.TEXTURE0+slot);gl.bindTexture(gl.TEXTURE_2D,tex);gl.uniform1i(gl.getUniformLocation(p,name),slot)}
function addNote(out,x,lo,hi,width,c){
  const x0=x-width/2,x1=x+width/2,z=.095;
  for(const [px,py,u,v] of [[x0,lo,0,0],[x1,lo,1,0],[x1,hi,1,1],[x0,lo,0,0],[x1,hi,1,1],[x0,hi,0,1]])out.push(px,py,z,...c,u,v);
}
function addLine(){const y=HIT_Y,z=.44;const width=KEYBOARD.totalWidth/2+.12;const out=[];
  for(const [x,dy,u,v] of [[-width,-.09,0,0],[width,-.09,1,0],[width,.09,1,1],[-width,-.09,0,0],[width,.09,1,1],[-width,.09,0,1]])out.push(x,y+dy,z,u,v);
  return new Float32Array(out);
}
export class DynamicFXRenderer{
 constructor(canvas,settings){this.canvas=canvas;this.settings=settings;
  // The final shader writes *straight* RGB + alpha. With the browser's
  // default premultipliedAlpha:true, bright RGB behind a small alpha is
  // incorrectly treated as premultiplied and bleaches photos underneath.
  // Explicitly choose straight-alpha compositing for this full-stage layer.
  const gl=canvas.getContext('webgl2',{alpha:true,premultipliedAlpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  if(!gl)throw Error('WebGL2를 지원하는 Chrome 또는 Safari가 필요합니다');
  this.gl=gl;this.programs={
   bg:makeProgram(gl,S.FULLSCREEN_VERT,S.BACKGROUND_FRAG),
   geometry:makeProgram(gl,S.GEOMETRY_VERT,S.GEOMETRY_FRAG),
   notes:makeProgram(gl,S.NOTE_VERT,S.NOTE_FRAG),
   sprites:makeProgram(gl,S.SPRITE_VERT,S.SPRITE_FRAG),
   line:makeProgram(gl,S.LINE_VERT,S.LINE_FRAG),
   boundary:makeProgram(gl,S.BOUNDARY_VERT,S.BOUNDARY_FRAG),
   bright:makeProgram(gl,S.FULLSCREEN_VERT,S.BRIGHT_FRAG),
   blur:makeProgram(gl,S.FULLSCREEN_VERT,S.BLUR_FRAG),
   copy:makeProgram(gl,S.FULLSCREEN_VERT,S.COPY_FRAG),
   compose:makeProgram(gl,S.FULLSCREEN_VERT,S.COMPOSITE_FRAG),
  };
  this.boundaryLoc=Object.fromEntries(['uCenterY','uHalfHeight','uResolution','uKeyboardRange',
    'uStyle','uStrength','uThickness','uReaction','uScale','uColorLow','uColorHigh',
    'uEmissionMode','uTime','uSpeed','uPulseCount','uPulses[0]'].map(name=>
      [name,gl.getUniformLocation(this.programs.boundary,name)]));
  this.key=meshBuffer(gl,buildKeyboard(),8,[[0,3,0],[1,3,3],[2,1,6],[3,1,7]]);
  this.notes=meshBuffer(gl,new Float32Array(),8,[[0,3,0],[1,3,3],[2,2,6]],gl.DYNAMIC_DRAW);
  this.sprites=meshBuffer(gl,new Float32Array(),10,[[0,3,0],[1,3,3],[2,1,6],[3,1,7],[4,1,8],[5,1,9]],gl.DYNAMIC_DRAW);
  this.line=meshBuffer(gl,addLine(),5,[[0,3,0],[1,2,3]]);
  this.keyX=new Float32Array(KEYBOARD.keys.map(k=>k.x));
  this.keyPress=new Float32Array(88);
  this.cameraFocusX=0;this.lookahead=new PortraitLookaheadController();this.lastFraming=null;this.lastCameraTime=0;this.screen=null;this.emission=null;this.a=null;this.b=null;this.c=null;this.d=null;this.frameCount=0;this.gl.enable(gl.BLEND);
 }
 resize(){const gl=this.gl,canvas=this.canvas,rect=canvas.getBoundingClientRect();
  // The ScoreMotion stage has the exact export dimensions, including 4K.
  // Preview uses a CSS transform, so boundingClientRect is display size only.
  const w=Math.max(32,Math.round(canvas.clientWidth||rect.width));
  const h=Math.max(32,Math.round(canvas.clientHeight||rect.height));
  if(w>gl.getParameter(gl.MAX_TEXTURE_SIZE)||h>gl.getParameter(gl.MAX_TEXTURE_SIZE))
    throw Error(`WebGL2 render target cannot fit ${w}×${h}`);
  if(w===canvas.width&&h===canvas.height)return;
  canvas.width=w;canvas.height=h;
  disposeTarget(gl,this.screen);disposeTarget(gl,this.emission);disposeTarget(gl,this.a);disposeTarget(gl,this.b);disposeTarget(gl,this.c);disposeTarget(gl,this.d);
  this.screen=createTarget(gl,w,h,true);this.emission=createTarget(gl,w,h);this.a=createTarget(gl,Math.max(1,w>>1),Math.max(1,h>>1));this.b=createTarget(gl,Math.max(1,w>>1),Math.max(1,h>>1));
  this.c=createTarget(gl,Math.max(1,w>>2),Math.max(1,h>>2));this.d=createTarget(gl,Math.max(1,w>>2),Math.max(1,h>>2));
 }
 resetCamera(){this.cameraFocusX=0;this.lookahead.reset();this.lastFraming=null;this.lastCameraTime=0;}
 // The same small GPU ribbon is drawn into the scene and bloom emission
 // targets, so preview, seeking and MP4 export use identical pixels.
 drawBoundary(camera,keyLights,w,h,time,emission=false){
  const settings=normalizeBoundaryLight(this.settings.boundaryLight);
  if(settings.styleId===0||settings.strength<=0)return;
  const g=boundaryGeometry(camera,w,h,KEYBOARD.totalWidth,HIT_Y,.038);
  if(g.right<=g.left)return;
  const gl=this.gl,loc=this.boundaryLoc;
  const colors=this.settings.colorStops||[];
  const hex=settings.color;
  const custom=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const low=settings.colorMode==='custom'?custom:(colors[0]||[.3,.7,.9]);
  const high=settings.colorMode==='custom'?custom:(colors.at(-1)||low);
  const pulses=[3,7,8].includes(settings.styleId)
    ?boundaryPulses(keyLights,this.keyX,camera):{count:0,values:new Float32Array(16)};
  gl.useProgram(this.programs.boundary);
  gl.uniform1f(loc.uCenterY,g.y);gl.uniform1f(loc.uHalfHeight,g.halfHeight);
  gl.uniform2f(loc.uResolution,w,h);gl.uniform2f(loc.uKeyboardRange,g.left,g.right);
  gl.uniform1i(loc.uStyle,settings.styleId);gl.uniform1f(loc.uStrength,settings.strength);
  gl.uniform1f(loc.uThickness,settings.thickness);gl.uniform1f(loc.uReaction,settings.reaction);
  gl.uniform1f(loc.uScale,g.scale);gl.uniform3fv(loc.uColorLow,low);gl.uniform3fv(loc.uColorHigh,high);
  gl.uniform1f(loc.uEmissionMode,emission?1:0);
  gl.uniform1f(loc.uTime,time);gl.uniform1f(loc.uSpeed,settings.speed);
  gl.uniform1i(loc.uPulseCount,pulses.count);gl.uniform2fv(loc['uPulses[0]'],pulses.values);
  gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA,settings.styleId===6&&!emission?gl.ONE_MINUS_SRC_ALPHA:gl.ONE);
  gl.bindVertexArray(null);gl.drawArrays(gl.TRIANGLES,0,6);
 }

 frame(engine,field,deltaSeconds=0){
  this.resize();const gl=this.gl,p=this.programs,w=this.canvas.width,h=this.canvas.height;
  const dt=Math.min(.12,Math.max(0,deltaSeconds));
  const zoom=this.settings.cameraZoom||1;
  let focus=0;
  if(zoom>1.01 && this.settings.cameraFollow){
    let weighted=0,total=0;
    for(const v of engine.voices){
      const key=keyPosition(v.midi);
      if(!key)continue;
      const age=Math.max(0,engine.time-v.startedAt);
      const relevance=(v.state==='held'?1:.50)*Math.exp(-age/3.6)*(.25+v.velocity/127);
      if(relevance>.025){weighted+=key.x*relevance;total+=relevance;}
    }
    if(total>0)focus=weighted/total;
  }
  const portrait=h>w*1.04;
  const predictive=portrait&&this.settings.portraitAutoFrame;
  if(!predictive&&this.lastFraming){this.lookahead.reset();this.lastFraming=null;}
  const frame=predictive?this.lookahead.update(engine.notes,engine.voices,engine.time,
    this.settings.cameraLeadSeconds??5,w/h,dt,KEYBOARD.totalWidth,this.settings.cameraSmoothness??1):null;
  const smoothing=1-Math.exp(-dt*2.0);
  if(!predictive)this.cameraFocusX+=(focus-this.cameraFocusX)*smoothing;
  const camera=stageCamera(w,h,KEYBOARD.totalWidth,HIT_Y,FRONT_Y,
    frame?{visibleWidth:frame.visibleWidth,tilt:this.settings.cameraTilt,focusX:frame.focusX,
      verticalOffsetPct:this.settings.cameraVerticalOffsetPct}:
      {zoom,tilt:this.settings.cameraTilt,focusX:this.cameraFocusX,
        verticalOffsetPct:this.settings.cameraVerticalOffsetPct});
  this.lastFraming=frame;
  this.lastCamera=camera;
  const VP=camera.matrix;
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.screen.msaaFbo||this.screen.fbo);
  gl.viewport(0,0,w,h);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
  gl.useProgram(p.bg);gl.uniform1f(gl.getUniformLocation(p.bg,'uTime'),engine.time);
  gl.uniform2f(gl.getUniformLocation(p.bg,'uResolution'),w,h);
  gl.uniform1f(gl.getUniformLocation(p.bg,'uBackgroundAlpha'),this.settings.backgroundAlpha??.94);
  gl.uniform3fv(gl.getUniformLocation(p.bg,'uPaletteColor'),this.settings.backgroundColor||[0,0,0]);
  gl.uniform1f(gl.getUniformLocation(p.bg,'uPaletteBackground'),this.settings.paletteBackground?1:0);
  gl.uniform1i(gl.getUniformLocation(p.bg,'uTextureMode'),this.settings.textureMode||0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const keyLights=engine.keyLights(),pressTargets=engine.keyPressTargets();
  // Unlike the old fixed cyan hitline, the strike line reflects the current
  // MIDI velocity colors. Multiple simultaneous notes mix by light energy.
  const hitlineColor=[0,0,0];let hitlineEnergy=0;
  for(let i=0;i<88;i++){
    const offset=i*4,energy=Math.max(0,keyLights[offset+3]);
    if(energy<.05)continue;
    for(let c=0;c<3;c++)hitlineColor[c]+=keyLights[offset+c]*energy;
    hitlineEnergy+=energy;
  }
  if(hitlineEnergy>.001){for(let c=0;c<3;c++)hitlineColor[c]/=hitlineEnergy;}
  else hitlineColor.splice(0,3,.35,.75,.98);
  const pressStep=Math.min(.05,dt);
  for(let i=0;i<88;i++){
    const target=pressTargets[i];
    const tau=target>this.keyPress[i]?.024:.075;
    this.keyPress[i]+=(target-this.keyPress[i])*(1-Math.exp(-pressStep/tau));
  }
  gl.useProgram(p.geometry);gl.uniformMatrix4fv(gl.getUniformLocation(p.geometry,'uVP'),false,VP);
  gl.uniform4fv(gl.getUniformLocation(p.geometry,'uKeyLight[0]'),this.settings.showGlow?keyLights:new Float32Array(88*4));
  gl.uniform1fv(gl.getUniformLocation(p.geometry,'uKeyPress[0]'),this.keyPress);
  gl.uniform1fv(gl.getUniformLocation(p.geometry,'uKeyX[0]'),this.keyX);
  gl.uniform1f(gl.getUniformLocation(p.geometry,'uGlowGain'),this.settings.masterGlow);
  gl.uniform1f(gl.getUniformLocation(p.geometry,'uTime'),engine.time);
  gl.uniform1f(gl.getUniformLocation(p.geometry,'uCustomKeys'),this.settings.keyColors?1:0);
  gl.uniform3fv(gl.getUniformLocation(p.geometry,'uWhiteKey'),this.settings.keyColors?.white||[.876,.868,.848]);
  gl.uniform3fv(gl.getUniformLocation(p.geometry,'uBlackKey'),this.settings.keyColors?.black||[.022,.027,.038]);
  const material=this.material||{white:1,black:1,reflection:1,tint:[1,1,1]};
  gl.uniform1f(gl.getUniformLocation(p.geometry,'uWhiteBrightness'),material.white);
  gl.uniform1f(gl.getUniformLocation(p.geometry,'uBlackBrightness'),material.black);
  gl.uniform1f(gl.getUniformLocation(p.geometry,'uReflectionGain'),material.reflection);
  gl.uniform3fv(gl.getUniformLocation(p.geometry,'uSurfaceTint'),material.tint);
  gl.bindVertexArray(this.key.vao);gl.drawArrays(gl.TRIANGLES,0,this.key.count);
  // Note bars use only absolute MIDI time: export, scrubbing and preview
  // produce the same shapes. Rise starts at note-on and leaves a moving tail
  // after note-off; no per-frame animation state is accumulated.
  const noteMode=normalizeNoteBarMode(this.settings.noteBarMode);
  const noteBarData=[];
  if(this.settings.showNotes&&noteMode!=='off'){
   const fallSeconds=Math.max(.1,Number(this.settings.noteFallSeconds)||2.8);
   const {speed,roof}=noteFallLane(camera,fallSeconds,portrait,HIT_Y);
   const riseSpeed=speed*Math.max(.35,Math.min(2,Number(this.settings.noteRiseSpeed)||1));
   const riseTravel=(roof-HIT_Y)/riseSpeed;
   const drawFall=noteMode==='fall'||noteMode==='both';
   const drawRise=noteMode==='rise'||noteMode==='both';
   const tm=engine.time;
   for(const n of engine.notes){
    const fallVisible=drawFall&&n.start<=tm+fallSeconds+.1&&n.end>=tm-.05;
    const riseVisible=drawRise&&n.start<=tm&&n.end+riseTravel>=tm;
    if(!fallVisible&&!riseVisible)continue;
    const k=keyPosition(n.midi);if(!k)continue;
    const color=colorFromVelocity(n.velocity,this.settings);
    if(fallVisible){
     const lo=Math.max(HIT_Y+.04,HIT_Y+(n.start-tm)*speed);
     const hi=Math.min(roof,HIT_Y+(n.end-tm)*speed);
     if(hi>lo+.018)addNote(noteBarData,k.x,lo,hi,k.width*(k.black?.83:.82),color);
    }
    if(riseVisible){
     const shape=risingNoteRect(n,tm,{hitY:HIT_Y,roof,speed:riseSpeed});
     if(shape){
       // A narrower core helps visually distinguish simultaneously falling
       // and rising bars without painting a bright rectangular glow.
       const factor=noteMode==='both'?.58:.82;
       addNote(noteBarData,k.x,shape.lo,shape.hi,k.width*factor,color);
     }
    }
   }
  }
  // Clear stale geometry when switching to Off or switching projects.
  updateBuffer(gl,this.notes,new Float32Array(noteBarData));
  if(this.notes.count){
   gl.useProgram(p.notes);gl.uniformMatrix4fv(gl.getUniformLocation(p.notes,'uVP'),false,VP);
   gl.uniform1f(gl.getUniformLocation(p.notes,'uEmissionMode'),0);
   gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
   gl.bindVertexArray(this.notes.vao);gl.drawArrays(gl.TRIANGLES,0,this.notes.count);
  }
  if(this.settings.showHitline&&normalizeBoundaryLight(this.settings.boundaryLight).styleId===0){
   gl.useProgram(p.line);gl.uniformMatrix4fv(gl.getUniformLocation(p.line,'uVP'),false,VP);
   gl.uniform1f(gl.getUniformLocation(p.line,'uIntensity'),.6);
   gl.uniform3fv(gl.getUniformLocation(p.line,'uColor'),hitlineColor);
   gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
   gl.bindVertexArray(this.line.vao);gl.drawArrays(gl.TRIANGLES,0,this.line.count);
  }
  this.drawBoundary(camera,keyLights,w,h,engine.time,false);
  const effects=[];
  if(this.settings.showParticles){effects.push(...field.vertexData())}
  if(this.settings.showGlow){
   const lights=keyLights;
   for(let i=0;i<88;i++){
    const amount=lights[i*4+3],k=KEYBOARD.keys[i];if(amount<.015)continue;
    const energy=Math.min(1,amount/2.8);
    // Two controlled scales: tight impact halo + broad low-alpha haze.
    // The old 130-170px sprite and unbounded alpha caused white clipping.
    const glowSize=this.settings.glowSize??1;
    effects.push(k.x,HIT_Y+.02,.61,lights[i*4],lights[i*4+1],lights[i*4+2],.30+.60*energy,(44+23*energy)*glowSize,3,0);
    effects.push(k.x,HIT_Y+.025,.57,lights[i*4],lights[i*4+1],lights[i*4+2],.10+.14*energy,(98+28*energy)*glowSize,2,0);
    const press=this.keyPress[i];
    if(press>.015)effects.push(k.x,k.black?HIT_Y-.65:FRONT_Y+.24,k.black?.29:.17,
      lights[i*4],lights[i*4+1],lights[i*4+2],.18+.55*press,24+12*press,3,0);
   }
  }
  updateBuffer(gl,this.sprites,new Float32Array(effects));
  gl.useProgram(p.sprites);gl.uniformMatrix4fv(gl.getUniformLocation(p.sprites,'uVP'),false,VP);
  gl.uniform1f(gl.getUniformLocation(p.sprites,'uPixelScale'),h/800);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
  gl.bindVertexArray(this.sprites.vao);gl.drawArrays(gl.POINTS,0,this.sprites.count);
  gl.bindVertexArray(null);gl.disable(gl.BLEND);gl.depthMask(true);
  if(this.screen.msaaFbo){
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.screen.msaaFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.screen.fbo);
    gl.blitFramebuffer(0,0,w,h,0,0,w,h,gl.COLOR_BUFFER_BIT,gl.NEAREST);
  }
  // Selective bloom: render ONLY luminous objects to a separate emissive
  // texture. Extracting brightness from the combined scene made the ivory
  // keyboard bloom like a white rectangle and washed out all surface detail.
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.emission.fbo);gl.viewport(0,0,w,h);
  gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.DEPTH_TEST);gl.depthMask(false);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
  if(this.settings.showNotes&&this.notes.count){
    gl.useProgram(p.notes);gl.uniformMatrix4fv(gl.getUniformLocation(p.notes,'uVP'),false,VP);
    gl.uniform1f(gl.getUniformLocation(p.notes,'uEmissionMode'),1);
    gl.bindVertexArray(this.notes.vao);gl.drawArrays(gl.TRIANGLES,0,this.notes.count);
  }
  if(this.settings.showHitline&&normalizeBoundaryLight(this.settings.boundaryLight).styleId===0){
    gl.useProgram(p.line);gl.uniformMatrix4fv(gl.getUniformLocation(p.line,'uVP'),false,VP);
    gl.uniform1f(gl.getUniformLocation(p.line,'uIntensity'),.43);
   gl.uniform3fv(gl.getUniformLocation(p.line,'uColor'),hitlineColor);
    gl.bindVertexArray(this.line.vao);gl.drawArrays(gl.TRIANGLES,0,this.line.count);
  }
  this.drawBoundary(camera,keyLights,w,h,engine.time,true);
  if(this.sprites.count){
    gl.useProgram(p.sprites);gl.uniformMatrix4fv(gl.getUniformLocation(p.sprites,'uVP'),false,VP);
    gl.uniform1f(gl.getUniformLocation(p.sprites,'uPixelScale'),h/800);
    gl.bindVertexArray(this.sprites.vao);gl.drawArrays(gl.POINTS,0,this.sprites.count);
  }
  gl.bindVertexArray(null);gl.disable(gl.BLEND);gl.depthMask(true);
  // Bright pass, separable Gaussian blur and final tone mapping.
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.a.fbo);gl.viewport(0,0,this.a.w,this.a.h);
  gl.useProgram(p.bright);bindTexture(gl,p.bright,'uTexture',this.emission.tex);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.b.fbo);gl.useProgram(p.blur);
  const bloomRadius=this.settings.bloomRadius??1;
  bindTexture(gl,p.blur,'uTexture',this.a.tex);gl.uniform2f(gl.getUniformLocation(p.blur,'uStep'),bloomRadius/this.a.w,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.a.fbo);bindTexture(gl,p.blur,'uTexture',this.b.tex);
  gl.uniform2f(gl.getUniformLocation(p.blur,'uStep'),0,bloomRadius/this.a.h);gl.drawArrays(gl.TRIANGLES,0,3);
  // Wide, low-frequency bloom branch keeps particles atmospheric without
  // excessively widening the sharp flash core at the note-on point.
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.c.fbo);gl.viewport(0,0,this.c.w,this.c.h);
  gl.useProgram(p.copy);bindTexture(gl,p.copy,'uTexture',this.a.tex);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.d.fbo);gl.useProgram(p.blur);
  bindTexture(gl,p.blur,'uTexture',this.c.tex);gl.uniform2f(gl.getUniformLocation(p.blur,'uStep'),bloomRadius/this.c.w,0);
  gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.c.fbo);bindTexture(gl,p.blur,'uTexture',this.d.tex);
  gl.uniform2f(gl.getUniformLocation(p.blur,'uStep'),0,bloomRadius/this.c.h);gl.drawArrays(gl.TRIANGLES,0,3);
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,w,h);
  gl.useProgram(p.compose);bindTexture(gl,p.compose,'uScene',this.screen.tex,0);
  bindTexture(gl,p.compose,'uBloom',this.a.tex,1);
  bindTexture(gl,p.compose,'uWideBloom',this.c.tex,2);
  gl.uniform1f(gl.getUniformLocation(p.compose,'uBloomIntensity'),this.settings.glowBloom);
  gl.drawArrays(gl.TRIANGLES,0,3);
  this.frameCount++;
 }
 snapshot(){return new Promise(resolve=>this.canvas.toBlob(resolve,'image/png'))}
 dispose(){
  const gl=this.gl;
  for(const target of [this.screen,this.emission,this.a,this.b,this.c,this.d])disposeTarget(gl,target);
  for(const mesh of [this.key,this.notes,this.sprites,this.line]){gl.deleteBuffer(mesh.buffer);gl.deleteVertexArray(mesh.vao);}
  for(const program of Object.values(this.programs))gl.deleteProgram(program);
 }
}
