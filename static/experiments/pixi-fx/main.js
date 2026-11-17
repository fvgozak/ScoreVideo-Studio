/* ScoreVideo PixiJS FX lab: self-contained experimental renderer, not production code. */
const PIXI_MODULE = '/static/vendor/pixi-8.23.0.min.mjs';
const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const now = () => performance.now();
const state = { notes: [], duration: 197, sec: 104, playing: true, lastTick: 0, lastDraw: 0,
  mode: 'canvas', w: 1280, h: 720, density: 1, targetFps: 30, glow: true,
  particles: true, interval: [], cpu: [], activeCount: 0, drawing: false, loading: false,
  pixi: null, pixiError: '', benchmark: false };
const canvas = $('base'), base = canvas.getContext('2d', {alpha: false});
const effects = $('effects'), fx = effects.getContext('2d', {alpha: true});
const scene = $('scene');
function palette(pitch, velocity) {
  const i = (pitch * 31 + Math.floor(velocity / 19)) % 5;
  return ['#7edbff','#91e0c7','#f3d48b','#c9a9ff','#fb9c9f'][i];
}
function seed(a,b) {let x=Math.sin(a*79.1+b*89.2)*43758.5453;return x-Math.floor(x);}
function fmtTime(s){return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;}
function sortedPercentile(a,p){if(!a.length)return 0;const x=[...a].sort((a,b)=>a-b);return x[Math.min(x.length-1,Math.ceil(x.length*p)-1)];}
function average(a){return a.reduce((s,x)=>s+x,0)/Math.max(1,a.length);}
function setStatus(str){$('status').textContent=str;}
function setDimensions(w,h){
  state.w=w;state.h=h;
  canvas.width=w;canvas.height=h;effects.width=w;effects.height=h;
  scene.style.width=w+'px';scene.style.height=h+'px';
  // Render at the requested physical resolution, display scaled without resizing the GPU scene.
  const maxWidth=Math.max(160,$('viewWrap').clientWidth-28),maxHeight=720;
  const ratio=Math.min(1,maxWidth/w,maxHeight/h);
  scene.style.width=w*ratio+'px';scene.style.height=h*ratio+'px';
  for(const layer of [canvas,effects]){
    layer.style.width='100%';layer.style.height='100%';
  }
  if(state.pixi)state.pixi.resize(w,h);
  $('out').textContent='';
}
function noteXY(note,sec,w,h){
  const left=w*.30;
  const progress=(note.t-sec);
  // Music note engravings move horizontally over a stationary five-line staff.
  const x=left+progress*w*.235;
  const y=h*.52 - (note.p-60)*Math.min(3.1,h*.003);
  return {x,y};
}
function getVisible(sec){
  const out=[];
  for(const note of state.notes){
    if(note.t < sec-1.4)continue;
    if(note.t>sec+3.4)break;
    const g=noteXY(note,sec,state.w,state.h);
    if(g.x<-70||g.x>state.w+70)continue;
    out.push({...note,x:g.x,y:g.y});
  }
  return out;
}
function triggered(visible,sec){
  const out=[];
  for(const n of visible){
    const age=sec-n.t;
    if(age<0||age>1.3)continue;
    const envelope=Math.min(1,Math.exp(-age*3.4)*(0.4+n.v/127*.6));
    if(envelope<.008)continue;
    for(let i=0;i<state.density;i++){
      // Stress mode creates additional glow at nearby pitches, without retiming the MIDI.
      out.push({x:n.x+(i?((i%3)-1)*18:0),y:n.y+(i?Math.floor(i/3)*10:0),
        pitch:n.p,color:palette(n.p,n.v),energy:envelope,age,velocity:n.v,
        index:Math.round(n.t*1000)*3+i});
    }
  }
  return out;
}
function drawBase(visible){
  const w=state.w,h=state.h;
  base.clearRect(0,0,w,h);
  base.fillStyle='#111b2c';base.fillRect(0,0,w,h);
  const g=base.createLinearGradient(0,0,0,h);
  g.addColorStop(0,'#263349');g.addColorStop(1,'#0c121f');
  base.fillStyle=g;base.fillRect(0,0,w,h);
  const unit=Math.min(w,h);
  base.lineWidth=Math.max(1,unit*.0014);base.strokeStyle='#9eafc4';base.globalAlpha=.48;
  for(let y=-2;y<=2;y++){
    const yy=h*.52+y*unit*.015;
    base.beginPath();base.moveTo(0,yy);base.lineTo(w,yy);base.stroke();
  }
  base.globalAlpha=1;
  base.fillStyle='#d2e9ef';base.font=`${Math.max(15,unit*.024)}px Georgia`;
  base.fillText('Dream Journey  ·  GPU FX experiment',w*.045,h*.16);
  const keyTop=h*.83,keyH=h*.17;
  base.fillStyle='#182131';base.fillRect(0,keyTop,w,keyH);
  const whites=52,keyW=w/whites;
  for(let i=0;i<whites;i++){
    base.fillStyle=i%7===0?'#d4d7dc':'#e8eaeb';base.fillRect(i*keyW+1,keyTop+2,keyW-2,keyH-4);
  }
  const blackPc=new Set([1,3,6,8,10]);let whiteIdx=0;
  for(let pitch=21;pitch<=108;pitch++){
    if(!blackPc.has(pitch%12)){whiteIdx++;continue;}
    base.fillStyle='#151f2b';base.fillRect((whiteIdx-.39)*keyW,keyTop,keyW*.62,keyH*.64);
  }
  for(const n of visible){
    if(n.x<-25||n.x>w+25||n.y<-18||n.y>keyTop-15)continue;
    base.fillStyle='#f3f0e8';base.beginPath();base.ellipse(n.x,n.y,unit*.007,unit*.0044,-.2,0,Math.PI*2);base.fill();
    base.strokeStyle='#f3f0e8';base.lineWidth=unit*.0015;
    base.beginPath();base.moveTo(n.x+unit*.006,n.y);base.lineTo(n.x+unit*.006,n.y-unit*.027);base.stroke();
  }
  base.fillStyle='#a6e7f4';base.fillRect(w*.3,h*.34,1,h*.42);
}
function rgba(hex,alpha){return `rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${clamp(alpha,0,1)})`;}
function cpuDraw(hits){
  const w=state.w,h=state.h;
  fx.clearRect(0,0,w,h);if(!state.glow&&!state.particles)return;
  const unit=Math.min(w,h),radius=unit*.033;
  fx.save();fx.globalCompositeOperation='lighter';
  for(const n of hits){
    const {x,y,energy,color,age,index}=n;
    if(state.glow){
      const gradient=fx.createRadialGradient(x,y,0,x,y,radius);
      gradient.addColorStop(0,rgba(color,.52*energy));
      gradient.addColorStop(.22,rgba(color,.24*energy));
      gradient.addColorStop(.65,rgba(color,.06*energy));gradient.addColorStop(1,rgba(color,0));
      fx.fillStyle=gradient;fx.fillRect(x-radius,y-radius,radius*2,radius*2);
      const beam=fx.createLinearGradient(0,y-radius*1.6,0,y+10);
      beam.addColorStop(0,rgba(color,0));beam.addColorStop(.74,rgba(color,.14*energy));beam.addColorStop(1,rgba(color,.36*energy));
      fx.fillStyle=beam;fx.fillRect(x-4,y-radius*1.6,8,radius*1.6+10);
      fx.shadowColor=color;fx.shadowBlur=unit*.018;
      fx.fillStyle='#fff';fx.globalAlpha=Math.min(1,energy);
      fx.fillRect(x-4,y-1,8,3);
      fx.shadowBlur=0;fx.globalAlpha=1;
    }
    if(state.particles && age<.75){
      for(let i=0;i<9;i++){
        const a=seed(index,i)*Math.PI*2,drift=age*(15+seed(i,index)*32)*unit/720;
        const px=x+Math.cos(a)*drift,py=y+Math.sin(a)*drift*.65-age*unit*.03;
        fx.shadowBlur=unit*.007;fx.shadowColor=color;
        fx.fillStyle=i%4===0?'#ffffff':color;
        fx.globalAlpha=energy*(1-age/.75);
        fx.beginPath();fx.arc(px,py,Math.max(.7,unit*.0016),0,Math.PI*2);fx.fill();
      }
      fx.shadowBlur=0;fx.globalAlpha=1;
    }
  }
  fx.restore();
}
class PixiRenderer {
  constructor(PIXI,app,glow,beam,particle){
    this.PIXI=PIXI;this.app=app;this.container=new PIXI.Container();
    app.stage.addChild(this.container);
    this.glow=glow;this.beam=beam;this.particle=particle;
    this.pool=[];this.count=0;
  }
  static texture(PIXI,kind){
    const c=document.createElement('canvas');c.width=kind==='beam'?32:128;c.height=128;
    const g=c.getContext('2d'),w=c.width,h=c.height;
    if(kind==='beam'){
      const grad=g.createLinearGradient(0,0,0,h);
      grad.addColorStop(0,'rgba(255,255,255,0)');grad.addColorStop(.7,'rgba(255,255,255,.35)');grad.addColorStop(1,'rgba(255,255,255,.92)');
      g.fillStyle=grad;g.fillRect(0,0,w,h);
    }else{
      const radius=kind==='particle'?45:63;
      const grad=g.createRadialGradient(64,64,0,64,64,radius);
      grad.addColorStop(0,'rgba(255,255,255,1)');
      if(kind==='glow'){grad.addColorStop(.23,'rgba(255,255,255,.65)');grad.addColorStop(.67,'rgba(255,255,255,.12)');}
      grad.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=grad;g.fillRect(0,0,128,128);
    }
    return PIXI.Texture.from(c);
  }
  static async create(w,h){
    const PIXI=await import(PIXI_MODULE);
    const app=new PIXI.Application();
    await app.init({width:w,height:h,resolution:1,autoStart:false,backgroundAlpha:0,
      preference:'webgl',antialias:false,powerPreference:'high-performance'});
    app.ticker.stop();
    const g=PixiRenderer.texture(PIXI,'glow');
    const b=PixiRenderer.texture(PIXI,'beam');
    const p=PixiRenderer.texture(PIXI,'particle');
    return new PixiRenderer(PIXI,app,g,b,p);
  }
  resize(w,h){this.app.renderer.resize(w,h);}
  spawn(texture,x,y,w,h,alpha,tint){
    let s=this.pool[this.count];
    if(!s){s=new this.PIXI.Sprite(texture);s.anchor.set(.5);s.blendMode='add';this.pool.push(s);this.container.addChild(s);}
    if(s.texture!==texture)s.texture=texture;
    s.position.set(x,y);s.width=Math.max(.1,w);s.height=Math.max(.1,h);
    s.alpha=clamp(alpha,0,1);s.tint=tint;s.visible=true;
    this.count++;
  }
  draw(hits){
    this.count=0;
    const unit=Math.min(state.w,state.h),radius=unit*.033;
    for(const n of hits){
      const tint=Number.parseInt(n.color.slice(1),16);
      const {x,y,energy,age,index}=n;
      if(state.glow){
        this.spawn(this.glow,x,y,radius*2,radius*.72,energy*.55,tint);
        this.spawn(this.beam,x,y-radius*.7,9,radius*1.8,energy*.4,tint);
        this.spawn(this.particle,x,y,16,7,energy*.8,0xffffff);
      }
      if(state.particles&&age<.75){
        for(let i=0;i<9;i++){
          const a=seed(index,i)*Math.PI*2,drift=age*(15+seed(i,index)*32)*unit/720;
          const px=x+Math.cos(a)*drift,py=y+Math.sin(a)*drift*.65-age*unit*.03;
          this.spawn(this.particle,px,py,unit*.011,unit*.011,energy*(1-age/.75),i%4===0?0xffffff:tint);
        }
      }
    }
    for(let i=this.count;i<this.pool.length;i++)this.pool[i].visible=false;
    this.app.render();
  }
  dispose(){this.app.destroy(true,{children:true,texture:true,textureSource:true});}
}
async function ensurePixi(){
  if(state.pixi)return true;
  if(state.loading)return false;
  state.loading=true;setStatus('PixiJS 8.23.0 로컬 모듈과 WebGL 렌더러를 초기화하는 중…');
  try {
    const p=await PixiRenderer.create(state.w,state.h);
    state.pixi=p;
    p.app.canvas.style.position='absolute';p.app.canvas.style.inset='0';
    p.app.canvas.style.width='100%';p.app.canvas.style.height='100%';
    p.app.canvas.style.pointerEvents='none';
    p.app.canvas.style.zIndex='3';
    scene.appendChild(p.app.canvas);
    setStatus('PixiJS WebGL 실험 준비 완료. 미리보기는 현재 PixiJS 효과 렌더러를 사용합니다. MP4 출력과 연결하지 않았습니다.');
    return true;
  }catch(err){
    state.pixiError=String(err);
    setStatus('PixiJS 초기화 실패: '+state.pixiError+'\n로컬 모듈과 브라우저 WebGL 지원을 확인하세요. Canvas2D로 복귀합니다.');
    $('mode').value='canvas';state.mode='canvas';return false;
  }finally{state.loading=false;}
}
function updateCanvasVisibility(){
  effects.style.visibility=state.mode==='canvas'?'visible':'hidden';
  if(state.pixi)state.pixi.app.canvas.style.visibility=state.mode==='pixi'?'visible':'hidden';
}
function displayMetrics(){
  if(!state.interval.length)return;
  $('fpsVal').textContent=average(state.interval.map(x=>1000/x)).toFixed(1);
  $('msVal').textContent=sortedPercentile(state.cpu,.95).toFixed(2)+' ms';
  $('noteVal').textContent=String(state.activeCount);
  $('timeVal').textContent=fmtTime(state.sec);
}
function drawFrame(sec){
  const visible=getVisible(sec),hits=triggered(visible,sec);
  drawBase(visible);
  const begin=now();
  if(state.mode==='pixi'&&state.pixi){state.pixi.draw(hits);}
  else cpuDraw(hits);
  const elapsed=now()-begin;
  state.cpu.push(elapsed);
  if(state.cpu.length>150)state.cpu.shift();
  state.activeCount=hits.length;
}
function tick(timestamp){
  if(!state.benchmark){
    const elapsed=state.lastTick?Math.min(.15,(timestamp-state.lastTick)/1000):0;
    state.lastTick=timestamp;
    if(state.playing)state.sec=(state.sec+elapsed)%state.duration;
    if(timestamp-state.lastDraw>=1000/state.targetFps-1.2){
      if(state.lastDraw){state.interval.push(timestamp-state.lastDraw);if(state.interval.length>60)state.interval.shift();}
      state.lastDraw=timestamp;
      drawFrame(state.sec);
      if(state.interval.length%10===0)displayMetrics();
    }
  }
  requestAnimationFrame(tick);
}
async function benchmark(){
  if(state.benchmark)return;
  state.benchmark=true;$('bench').disabled=true;
  try{
    const frames=180,fps=30,startSec=Math.min(104,state.duration-8);
    const times=[],start=now();
    for(let i=0;i<frames;i++){
      const t=startSec+i/fps;
      const before=now();drawFrame(t);times.push(now()-before);
      if(i%8===0)await new Promise(resolve=>requestAnimationFrame(resolve));
    }
    const total=now()-start;
    const result={renderer:state.mode,resolution:`${state.w}x${state.h}`,density:state.density,
      effects:{glow:state.glow,particles:state.particles},frames,avgCallMs:+average(times).toFixed(2),
      p95CallMs:+sortedPercentile(times,.95).toFixed(2),p99CallMs:+sortedPercentile(times,.99).toFixed(2),
      wallMs:+total.toFixed(0),throughputIncludingYield:+(frames/total*1000).toFixed(1)};
    $('out').textContent=JSON.stringify(result,null,2)+'\n\n주의: WebGL 제출 시간은 GPU 완료 시간이 아닙니다. 실제 표시 프레임과 함께 비교하세요.';
  }finally{state.benchmark=false;$('bench').disabled=false;state.lastTick=0;state.lastDraw=0;state.interval.length=0;}
}
$('mode').addEventListener('change',async e=>{
  const mode=e.target.value;
  state.mode=mode;
  if(mode==='pixi'&&!await ensurePixi())state.mode='canvas';
  updateCanvasVisibility();state.cpu.length=0;state.interval.length=0;
});
$('resolution').addEventListener('change',e=>{
  const [w,h]=e.target.value.split('x').map(Number);setDimensions(w,h);updateCanvasVisibility();
});
$('density').addEventListener('change',e=>{state.density=Number(e.target.value);});
$('fps').addEventListener('change',e=>{state.targetFps=Number(e.target.value);});
$('glow').addEventListener('change',e=>{state.glow=e.target.checked;});
$('particles').addEventListener('change',e=>{state.particles=e.target.checked;});
$('play').addEventListener('click',()=>{state.playing=!state.playing;$('play').textContent=state.playing?'일시정지':'재생';});
$('reset').addEventListener('click',()=>{state.sec=0;state.lastTick=0;state.lastDraw=0;state.interval.length=0;state.cpu.length=0;});
$('bench').addEventListener('click',benchmark);
window.addEventListener('resize',()=>setDimensions(state.w,state.h));
try{
  const response=await fetch('./dream-journey-notes.json');
  if(!response.ok)throw Error('MIDI JSON HTTP '+response.status);
  const data=await response.json();
  state.notes=data.notes;state.duration=data.duration;
  setDimensions(1280,720);
  setStatus(`${data.title}\n${state.notes.length}개 MIDI 타건 · ${fmtTime(state.duration)}\n현재 Canvas2D 기준 모드. GPU 모드를 선택하면 PixiJS를 로드합니다.`);
  requestAnimationFrame(tick);
}catch(err){setStatus('실험 MIDI 로드 실패: '+err);}
