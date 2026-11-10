/* ScoreVideo Studio scene graph: deterministic time -> visual state. No wall-clock timers. */
(function (root) {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const validColor=(v,def)=>/^#[0-9a-fA-F]{6}$/.test(v||'')?v:def;
  const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
  const hex=arr=>'#'+arr.map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
  const mix=(a,b,f)=>hex(rgb(a).map((n,i)=>lerp(n,rgb(b)[i],clamp(f,0,1))));
  const ease=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
  const FONT_STACKS={
    sans:'-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Arial, sans-serif',
    serif:'Georgia, "Times New Roman", serif',
    elegant:'Didot, "Bodoni MT", Georgia, serif',
    rounded:'"Arial Rounded MT Bold", "Trebuchet MS", sans-serif',
    mono:'Menlo, Monaco, monospace',
    korean:'"Apple SD Gothic Neo", "Noto Sans KR", sans-serif'
  };
  const auroraPresets={
    polar:{label:'Polar · 푸른빛 → 붉은빛',low:'#419dff',high:'#ff5268'},
    sunset:{label:'Sunset · 청록 → 주황',low:'#39cbd6',high:'#ff9044'},
    orchid:{label:'Orchid · 남보라 → 분홍',low:'#6778f2',high:'#ff73bc'},
    forest:{label:'Forest · 청록 → 황금',low:'#2bbdaa',high:'#f6b84e'}
  };
  function auroraColor(velocity,low,high){
    return mix(validColor(low,'#419dff'), validColor(high,'#ff5268'),
      Math.pow(clamp((Number(velocity)-1)/126,0,1),1.05));
  }
  function normalizedVelocity(velocity,scale='absolute',range=null){
    const v=clamp(Number(velocity)||1,1,127);
    if(scale!=='relative'||!range||!Number.isFinite(range.min)||!Number.isFinite(range.max))return v;
    const spread=range.max-range.min;
    // Equal velocities: neutral middle color, not a forced red or blue.
    return spread>0?1+126*clamp((v-range.min)/spread,0,1):64;
  }
  function noteLightColor(scene,velocity,solidColor,range=null){
    return scene.lightColorMode==='aurora'
      ?auroraColor(normalizedVelocity(velocity,scene.velocityScale,range),scene.auroraLow,scene.auroraHigh):solidColor;
  }
  const presets={
    illustrated:{label:'Illustrated Story',cameraMode:'follow',fxMode:'glitter',fxStrength:0.8,color:'#f0e8d6',glow:'#e3bd70',texture:'paper'},
    cinematic:{label:'Cinematic Score',cameraMode:'cinematic',fxMode:'trail',fxStrength:1.15,color:'#151b32',glow:'#91d3ff',texture:'grain'},
    minimal:{label:'Minimal Score',cameraMode:'follow',fxMode:'bloom',fxStrength:.45,color:'#f5f1e7',glow:'#b2a1dc',texture:'paper'}
  };
  function normalize(value={}){
    const x=(value&&typeof value==='object')?value:{};
    const template=presets[x.template]?x.template:'minimal',base=presets[template];
    const cameraMode=['follow','cinematic','fixed'].includes(x.cameraMode)?x.cameraMode:base.cameraMode;
    // Backward compatibility: older drafts saved Aurora as a stand-alone FX.
    // Migrate them to Bloom + independent velocity-color reaction.
    const legacyAurora=x.fxMode==='aurora';
    const fxMode=['bloom','glitter','trail','resonance','none'].includes(x.fxMode)?x.fxMode:(legacyAurora?'bloom':base.fxMode);
    const lightColorMode=x.lightColorMode==='aurora'||(x.lightColorMode==null&&legacyAurora)?'aurora':'solid';
    let keyframes=(Array.isArray(x.keyframes)?x.keyframes:[]).slice(0,40)
      .map(p=>({time:clamp(Number(p.time)||0,0,3600),color:validColor(p.color,base.color),glow:validColor(p.glow,base.glow)}))
      .sort((a,b)=>a.time-b.time);
    if(!keyframes.length||keyframes[0].time>0)keyframes.unshift({time:0,color:base.color,glow:base.glow});
    const auroraPreset=auroraPresets[x.auroraPreset] ? x.auroraPreset : (x.auroraPreset==='theme'||x.auroraPreset==='custom'?x.auroraPreset:'polar');
    const auroraDefault=auroraPresets[auroraPreset]||auroraPresets.polar;
    const font=FONT_STACKS[x.font]?x.font:'sans';
    return {template,cameraMode,fxMode,lightColorMode,velocityScale:x.velocityScale==='relative'?'relative':'absolute',animateBackground:Boolean(x.animateBackground),fxStrength:clamp(Number(x.fxStrength??base.fxStrength)||0,0,2),
      title:String(x.title||'').slice(0,120),artist:String(x.artist||'').slice(0,120),
      credit:String(x.credit||'').slice(0,200),showText:x.showText!==false,
      font,titleGap:clamp(Number(x.titleGap??65),0,320),
      auroraPreset,auroraLow:validColor(x.auroraLow,auroraDefault.low),auroraHigh:validColor(x.auroraHigh,auroraDefault.high),
      trailUpper:validColor(x.trailUpper, '#7ed8ff'), trailLower:validColor(x.trailLower, '#f2d16f'),
      keyframes};
  }
  function frame(scene,t){
    const s=normalize(scene),points=s.keyframes;
    if(t<=points[0].time)return {...points[0]};
    for(let i=1;i<points.length;i++){
      const p=points[i],a=points[i-1];
      if(t<=p.time){const amount=ease((t-a.time)/Math.max(.00001,p.time-a.time));
        return {color:mix(a.color,p.color,amount),glow:mix(a.glow,p.glow,amount),time:t};}
    }
    return {...points[points.length-1]};
  }
  // Fully deterministic PRNG for each note particle. Works for random-order renders.
  function random(noteIndex,particleIndex){
    let x=(Math.imul(noteIndex+17,1664525)^Math.imul(particleIndex+51,1013904223))|0;
    x^=x>>>16;x=Math.imul(x,2246822519);x^=x>>>13;x=Math.imul(x,3266489917);x^=x>>>16;
    return (x>>>0)/4294967296;
  }
  // A trail follows only the current graphical system for each hand.
  // Never connect the final note of one printed row to the first of the next.
  // The result depends only on note events and the requested frame time.
  function selectHandTrails(events,now,opts={}){
    const recentWindow=Number(opts.windowSec)||1.3;
    const maxGap=Number(opts.maxGapSec)||.85;
    const maxDistance=Number(opts.maxDistance)||350;
    const result={upper:[],lower:[]};
    for(const hand of ['upper','lower']){
      const notes=events.filter(e=>e.hand===hand&&Number.isFinite(e.audio)&&e.audio<=now+.015&&e.audio>=now-recentWindow)
        .sort((a,b)=>a.audio-b.audio||a.index-b.index);
      if(!notes.length)continue;
      // Only the newest system for this hand is allowed to emit a trail.
      const system=notes[notes.length-1].systemKey;
      const same=notes.filter(e=>e.systemKey===system);
      let path=[same[0]];
      for(let i=1;i<same.length;i++){
        const a=same[i-1],b=same[i];
        const gap=b.audio-a.audio;
        const distance=Math.hypot(b.x-a.x,b.y-a.y);
        if(gap>maxGap||distance>maxDistance){path=[b];continue;}
        path.push(b);
      }
      result[hand]=path;
    }
    return result;
  }
  // In Aurora mode, individual MIDI attacks carry their own colors. The
  // continuous light trail blends from one note's color into the next without
  // joining separate hands/systems (handled by selectHandTrails).
  function drawTrailChain(ctx,items,solidColor,gradientMode=false){
    if(items.length<2)return;
    ctx.save();
    ctx.lineWidth=2.1;ctx.shadowBlur=15;ctx.lineCap='round';ctx.lineJoin='round';
    if(!gradientMode){
      ctx.beginPath();ctx.moveTo(items[0].x,items[0].y);
      for(let i=1;i<items.length;i++){
        const a=items[i-1],b=items[i];
        const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-(6+Math.min(22,Math.abs(a.y-b.y)*.18));
        ctx.quadraticCurveTo(mx,my,b.x,b.y);
      }
      const power=items.reduce((m,v)=>Math.max(m,v.decay*v.power),0);
      ctx.strokeStyle=solidColor;ctx.globalAlpha=clamp(power*.82,0,1);
      ctx.shadowColor=solidColor;ctx.stroke();
    }else{
      for(let i=1;i<items.length;i++){
        const a=items[i-1],b=items[i];
        const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-(6+Math.min(22,Math.abs(a.y-b.y)*.18));
        const gradient=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
        gradient.addColorStop(0,a.color);gradient.addColorStop(1,b.color);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(mx,my,b.x,b.y);
        ctx.strokeStyle=gradient;ctx.shadowColor=b.color;
        ctx.globalAlpha=clamp(Math.max(a.decay*a.power,b.decay*b.power)*.82,0,1);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  class LayerRenderer{
    constructor(viewport){
      this.viewport=viewport;
      this.canvas=document.createElement('canvas');this.canvas.className='studio-fx-canvas';
      this.canvas.setAttribute('aria-hidden','true');viewport.appendChild(this.canvas);
      this.context=this.canvas.getContext('2d',{alpha:true});
      this.atmosphere=document.createElement('div');this.atmosphere.className='studio-atmosphere';
      this.titleBox=document.createElement('div');this.titleBox.className='studio-titles';
      this.titleBox.innerHTML='<div class="studio-title"></div><div class="studio-artist"></div><div class="studio-credit"></div>';
      viewport.appendChild(this.atmosphere);viewport.appendChild(this.titleBox);
      this.scene=normalize({});
    }
    setScene(value){this.scene=normalize(value);}
    resize(){
      const w=Math.max(1,this.viewport.clientWidth),h=Math.max(1,this.viewport.clientHeight),dpr=1;
      const dw=Math.round(w*dpr),dh=Math.round(h*dpr);
      if(this.canvas.width!==dw||this.canvas.height!==dh){this.canvas.width=dw;this.canvas.height=dh;}
      this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
      this.context.setTransform(dpr,0,0,dpr,0,0);return {w,h};
    }
    draw(t,follower){
      if(!this.context)return;
      const {w,h}=this.resize(),ctx=this.context,s=this.scene,p=frame(s,t),strength=s.fxStrength;
      if(!s.animateBackground)p.glow=follower.colors().glow;
      const sx=this.viewport.scrollLeft,sy=this.viewport.scrollTop;
      for(const elem of [this.canvas,this.titleBox,this.atmosphere])elem.style.transform=`translate(${sx}px, ${sy}px)`;
      if(follower.bgLayer){follower.bgLayer.style.transform=`translate(${sx}px, ${sy}px)`;if(s.animateBackground)follower.bgLayer.style.backgroundColor=p.color;else follower.bgLayer.style.backgroundColor=follower.colors().paper;}
      if(follower.glitterLayer)follower.glitterLayer.style.transform=`translate(${sx}px, ${sy}px)`;
      this.atmosphere.style.background=`radial-gradient(ellipse at ${25+Math.sin(t*.09)*17}% 18%, ${p.glow}35, transparent 58%), radial-gradient(ellipse at 85% 87%, ${p.glow}22, transparent 60%)`;
      this.atmosphere.style.opacity=s.template==='cinematic'?'.32':s.template==='illustrated'?'.1':'.035';
      this.titleBox.style.fontFamily=FONT_STACKS[s.font];
      this.titleBox.querySelector('.studio-title').textContent=s.title;
      this.titleBox.querySelector('.studio-artist').textContent=s.artist;
      this.titleBox.querySelector('.studio-credit').textContent=s.credit;
      const duration=Number(follower.audioDuration)||Number(follower.timestamps.at(-1))||30;
      const intro=clamp(Math.min(t/1.1,(6.3-t)/1.1),0,1);
      const outro=clamp(Math.min((t-(duration-5))/1.4,(duration-t)/1.4),0,1);
      this.titleBox.querySelector('.studio-title').style.opacity=s.showText?String(ease(intro)):0;
      this.titleBox.querySelector('.studio-artist').style.opacity=s.showText?String(ease(intro)):0;
      this.titleBox.querySelector('.studio-credit').style.opacity=s.showText?String(ease(outro)):0;
      this.titleBox.style.color=s.animateBackground?(s.template==='cinematic'?'#fffdf7':'#303039'):follower.colors().ink;
      ctx.clearRect(0,0,w,h);
      if(s.fxMode==='none'||strength<=0)return;
      // Light and particles belong to the score window, not to the entire video.
      // The clipping rectangle is in unscaled stage coordinates.
      const target=follower.viewport.getBoundingClientRect();
      const stageBounds=this.viewport.getBoundingClientRect();
      const stageScale=stageBounds.width/this.viewport.clientWidth||1;
      const cropX=(target.left-stageBounds.left)/stageScale;
      const cropY=(target.top-stageBounds.top)/stageScale;
      const cropW=target.width/stageScale,cropH=target.height/stageScale;
      ctx.save();ctx.beginPath();ctx.rect(cropX,cropY,cropW,cropH);ctx.clip();
      const events=follower.noteTriggers||[];
      let low=0,high=events.length;
      while(low<high){const mid=(low+high)>>>1;if(events[mid].audio<t-1.8)low=mid+1;else high=mid;}
      const visible=[],view=this.viewport.getBoundingClientRect(),scale=view.width/this.viewport.clientWidth||1;
      const containerBox=follower.container?.getBoundingClientRect?.()||null;
      const containerX=containerBox?(containerBox.left-view.left)/scale:NaN;
      const containerY=containerBox?(containerBox.top-view.top)/scale:NaN;
      for(let i=low;i<events.length&&events[i].audio<=t+.015;i++){
        const e=events[i],age=t-e.audio;
        if(age<0||age>1.8)continue;
        let x=containerX+e.noteX,y=containerY+e.noteY;
        if(!Number.isFinite(x)||!Number.isFinite(y)){
          const rect=e.el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
          x=(rect.left+rect.width/2-view.left)/scale;
          y=(rect.top+rect.height/2-view.top)/scale;
        }
        if(x<-70||x>w+70||y<-70||y>h+70)continue;
        const velocity=(follower.effects.velocityReactive===false?78:e.velocity)/127;
        const power=clamp((.24+.76*velocity**1.25)*strength,0,2);
        const decay=Math.exp(-age*(s.fxMode==='trail'?1.9:3.4));
        const solidColor=s.fxMode==='trail'?(e.hand==='lower'?s.trailLower:s.trailUpper):p.glow;
        const lightColor=noteLightColor(s,e.velocity,solidColor,follower.velocityRange);
        visible.push({x,y,age,power,decay,index:i,hand:e.hand||'upper',systemKey:e.systemKey,audio:e.audio,color:lightColor});
        if(s.fxMode!=='trail')this.drawBloom(ctx,x,y,decay*power,lightColor,14+power*23);
        if(s.fxMode==='resonance')this.drawRing(ctx,x,y,age,power,lightColor);
        if(s.fxMode==='glitter'||s.fxMode==='trail')this.drawGlitter(ctx,x,y,age,power,lightColor,i);
      }
      // A tie continuation is not a new attack: inherit its preceding note's
      // velocity color with gentle sustained illumination only (no particles).
      for(const hold of (follower.activeTies?.(t)||follower.tieContinuations||[])){
        if(t<hold.audio||t>hold.endAudio)continue;
        let x=containerX+hold.noteX,y=containerY+hold.noteY;
        if(!Number.isFinite(x)||!Number.isFinite(y)||x<-60||x>w+60||y<-60||y>h+60)continue;
        const color=noteLightColor(s,hold.velocity,p.glow,follower.velocityRange);
        const remain=clamp((hold.endAudio-t)/.28,0,1);
        this.drawBloom(ctx,x,y,Math.min(.48,.21+hold.velocity/127*.22)*remain*strength,color,12+hold.velocity/127*12);
      }
      if(s.fxMode==='trail'){
        const trails=selectHandTrails(visible,t,{windowSec:1.3,maxGapSec:.85,maxDistance:Math.max(160,Math.min(w*.38,480))});
        const colorGradient=s.lightColorMode==='aurora';
        drawTrailChain(ctx,trails.upper,s.trailUpper,colorGradient);
        drawTrailChain(ctx,trails.lower,s.trailLower,colorGradient);
        for(const e of visible)this.drawBloom(ctx,e.x,e.y,e.decay*e.power*.7,e.color,14+e.power*17);
      }
      ctx.restore();
    }
    drawBloom(ctx,x,y,intensity,color,size){
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=clamp(intensity*.82,0,.95);
      const g=ctx.createRadialGradient(x,y,0,x,y,size);
      g.addColorStop(0,'#ffffff');g.addColorStop(.08,color);g.addColorStop(.35,color+'65');g.addColorStop(1,color+'00');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    drawRing(ctx,x,y,age,power,color){
      ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.globalAlpha=clamp(Math.exp(-age*2.5)*power*.65,0,1);
      ctx.shadowColor=color;ctx.shadowBlur=7;
      ctx.beginPath();ctx.ellipse(x,y,7+age*58,5+age*44,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    drawGlitter(ctx,x,y,age,power,color,index){
      for(let i=0;i<9;i++){
        const theta=random(index,i)*Math.PI*2,spd=11+random(index,i+31)*32;
        const radius=spd*age,px=x+Math.cos(theta)*radius,py=y+Math.sin(theta)*radius*.8-age*7;
        const opacity=clamp(Math.exp(-age*3.2)*power*(.35+random(index,i+13)*.65),0,1);
        const size=.6+random(index,i+7)*1.6;
        ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=opacity;ctx.lineWidth=.8;
        ctx.shadowColor=color;ctx.shadowBlur=4;
        ctx.beginPath();ctx.moveTo(px-size*1.8,py);ctx.lineTo(px+size*1.8,py);
        ctx.moveTo(px,py-size*1.8);ctx.lineTo(px,py+size*1.8);ctx.stroke();ctx.restore();
      }
    }
  }
  root.ScoreStudio={presets,FONT_STACKS,auroraPresets,auroraColor,normalizedVelocity,noteLightColor,normalize,frame,mix,random,selectHandTrails,LayerRenderer};
})(typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined')module.exports=globalThis.ScoreStudio;
