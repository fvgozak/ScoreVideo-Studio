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
  function pitchLightProfile(pitch){
    // Low notes have a broad halo; high notes have a tighter, brighter core.
    // This changes geometry only: Aurora hue still depends on MIDI velocity.
    const highness=clamp((Number(pitch)-21)/87,0,1);
    return {spread:lerp(1.65,.65,highness),focus:lerp(.78,1.3,highness)};
  }
  const presets={
    illustrated:{label:'Illustrated Story',cameraMode:'follow',fxMode:'glitter',fxStrength:0.8,color:'#f0e8d6',glow:'#e3bd70',texture:'paper'},
    cinematic:{label:'Cinematic Score',cameraMode:'cinematic',fxMode:'trail',fxStrength:1.15,color:'#151b32',glow:'#91d3ff',texture:'grain'},
    minimal:{label:'Minimal Score',cameraMode:'follow',fxMode:'bloom',fxStrength:.45,color:'#f5f1e7',glow:'#b2a1dc',texture:'paper'}
  };
  function normalize(value={}){
    const x=(value&&typeof value==='object')?value:{};
    const template=presets[x.template]?x.template:'minimal',base=presets[template];
    const cameraMode=['follow','cinematic','points','fixed'].includes(x.cameraMode)?x.cameraMode:base.cameraMode;
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
    const notationStyle=['classic','modern','jazz','manuscript'].includes(x.notationStyle)?x.notationStyle:'classic';
    return {template,cameraMode,fxMode,lightColorMode,velocityScale:x.velocityScale==='relative'?'relative':'absolute',animateBackground:Boolean(x.animateBackground),fxStrength:clamp(Number(x.fxStrength??base.fxStrength)||0,0,4),
      scoreImpactEnabled:x.scoreImpactEnabled!==false,scoreImpactStrength:clamp(Number(x.scoreImpactStrength??1.4)||0,0,4),
      title:String(x.title||'').slice(0,120),artist:String(x.artist||'').slice(0,120),
      credit:String(x.credit||'').slice(0,200),showText:x.showText!==false,
      font,notationStyle,titleGap:clamp(Number(x.titleGap??65),0,320),
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
      // Score alignment gives simultaneous chord tones the same written beat,
      // even when the MIDI rolls their attacks. Keep only the top voice for
      // each chord anchor, then pin the trail to the highest note still held.
      const anchors=[];
      for(let i=0;i<notes.length;){
        const first=notes[i],group=[first];let j=i+1;
        while(j<notes.length&&notes[j].systemKey===first.systemKey&&(
          Number.isFinite(first.beat)&&Number.isFinite(notes[j].beat)
            ?Math.abs(notes[j].beat-first.beat)<1e-5&&notes[j].audio-first.audio<=.6
            :notes[j].audio-first.audio<=.06)){group.push(notes[j]);j++;}
        const pitched=group.filter(e=>Number.isFinite(e.pitch));
        anchors.push(pitched.length?pitched.reduce((top,e)=>e.pitch>top.pitch?e:top):group[group.length-1]);
        i=j;
      }
      // Only the newest system for this hand is allowed to emit a trail.
      const system=anchors[anchors.length-1].systemKey;
      let same=anchors.filter(e=>e.systemKey===system);
      const sounding=notes.filter(e=>e.systemKey===system&&Number.isFinite(e.pitch)
        &&Number.isFinite(e.endAudio)&&e.audio<=now+.015&&e.endAudio>now);
      if(sounding.length){
        const top=sounding.reduce((best,e)=>e.pitch>best.pitch?e:best);
        // While a high chord tone sustains, lower inner voices must not pull
        // the current light anchor downward as their attacks arrive.
        same=same.filter(e=>e.audio<=top.audio+.015&&e.pitch>=top.pitch);
        const endpoint={...top,audio:now};
        if(same.length&&same[same.length-1].index===top.index)same[same.length-1]=endpoint;
        else same.push(endpoint);
      }
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
    ctx.lineCap='round';ctx.lineJoin='round';
    if(!gradientMode){
      const power=items.reduce((m,v)=>Math.max(m,v.decay*v.power),0);
      for(const pass of [{width:3.6,blur:9,alpha:.16},{width:1.25,blur:2.5,alpha:.78}]){
        ctx.beginPath();ctx.moveTo(items[0].x,items[0].y);
        for(let i=1;i<items.length;i++){
          const a=items[i-1],b=items[i];
          const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-(6+Math.min(22,Math.abs(a.y-b.y)*.18));
          ctx.quadraticCurveTo(mx,my,b.x,b.y);
        }
        ctx.lineWidth=pass.width;ctx.shadowBlur=pass.blur;ctx.strokeStyle=solidColor;ctx.shadowColor=solidColor;
        ctx.globalAlpha=clamp(power*pass.alpha,0,1);ctx.stroke();
      }
    }else{
      for(let i=1;i<items.length;i++){
        const a=items[i-1],b=items[i];
        const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-(6+Math.min(22,Math.abs(a.y-b.y)*.18));
        const gradient=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
        gradient.addColorStop(0,a.color);gradient.addColorStop(1,b.color);
        for(const pass of [{width:3.6,blur:9,alpha:.16},{width:1.25,blur:2.5,alpha:.78}]){
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(mx,my,b.x,b.y);
          ctx.lineWidth=pass.width;ctx.shadowBlur=pass.blur;ctx.strokeStyle=gradient;ctx.shadowColor=b.color;
          ctx.globalAlpha=clamp(Math.max(a.decay*a.power,b.decay*b.power)*pass.alpha,0,1);ctx.stroke();
        }
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
      const sceneFxOn=s.fxMode!=='none'&&strength>0;
      const scoreImpactOn=s.scoreImpactEnabled&&s.scoreImpactStrength>0;
      if(!sceneFxOn&&!scoreImpactOn)return;
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
      const cameraScale=Number(follower.cameraScale)||1;
      for(let i=low;i<events.length&&events[i].audio<=t+.015;i++){
        const e=events[i],age=t-e.audio;
        if(age<0||age>1.8)continue;
        let x=containerX+e.noteX*cameraScale,y=containerY+e.noteY*cameraScale;
        if(!Number.isFinite(x)||!Number.isFinite(y)){
          const rect=e.el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
          x=(rect.left+rect.width/2-view.left)/scale;
          y=(rect.top+rect.height/2-view.top)/scale;
        }
        if(x<-70||x>w+70||y<-70||y>h+70)continue;
        const velocity=(follower.effects.velocityReactive===false?78:e.velocity)/127;
        const power=clamp((.24+.76*velocity**1.25)*strength,0,4);
        const decay=Math.exp(-age*(s.fxMode==='trail'?1.9:3.4));
        const solidColor=s.fxMode==='trail'?(e.hand==='lower'?s.trailLower:s.trailUpper):p.glow;
        const lightColor=noteLightColor(s,e.velocity,solidColor,follower.velocityRange);
        const pitchLight=pitchLightProfile(e.pitch);
        const duration=Math.max(.08,(Number(e.endAudio)||e.audio+.4)-e.audio);
        const impact=root.ScorePianoFall?.impactEnvelope(age,duration,velocity)
          ??Math.exp(-age*7.5)*velocity;
        visible.push({x,y,age,power,decay,index:i,hand:e.hand||'upper',systemKey:e.systemKey,audio:e.audio,endAudio:e.endAudio,beat:e.beat,pitch:e.pitch,color:lightColor});
        if(sceneFxOn&&s.fxMode!=='trail')this.drawBloom(ctx,x,y,Math.max(decay,impact)*power*pitchLight.focus,lightColor,(14+power*23)*pitchLight.spread);
        if(scoreImpactOn)this.drawScoreImpact(ctx,x,y,age,s.scoreImpactStrength,follower.eventLightColor?.(e.velocity)||lightColor,e);
        for(const extra of e.fallbackHeads||[]){
          const extraX=containerX+extra.noteX*cameraScale,extraY=containerY+extra.noteY*cameraScale;
          if(!Number.isFinite(extraX)||!Number.isFinite(extraY))continue;
          if(sceneFxOn&&s.fxMode!=='trail')this.drawBloom(ctx,extraX,extraY,Math.max(decay,impact)*power*pitchLight.focus,lightColor,(14+power*23)*pitchLight.spread);
          if(scoreImpactOn)this.drawScoreImpact(ctx,extraX,extraY,age,s.scoreImpactStrength,follower.eventLightColor?.(e.velocity)||lightColor,e);
        }
        if(sceneFxOn&&s.fxMode==='resonance')this.drawRing(ctx,x,y,age,power,lightColor);
        if(sceneFxOn&&s.fxMode==='glitter')this.drawGlitter(ctx,x,y,age,power,lightColor,i);
      }
      // A tie continuation is not a new attack: inherit its preceding note's
      // velocity color with gentle sustained illumination only (no particles).
      for(const hold of (sceneFxOn?(follower.activeTies?.(t)||follower.tieContinuations||[]):[])){
        if(t<hold.audio||t>hold.endAudio)continue;
        let x=containerX+hold.noteX*cameraScale,y=containerY+hold.noteY*cameraScale;
        if(!Number.isFinite(x)||!Number.isFinite(y)||x<-60||x>w+60||y<-60||y>h+60)continue;
        const color=noteLightColor(s,hold.velocity,p.glow,follower.velocityRange);
        const remain=clamp((hold.endAudio-t)/.28,0,1);
        this.drawBloom(ctx,x,y,Math.min(.48,.21+hold.velocity/127*.22)*remain*strength,color,12+hold.velocity/127*12);
      }
      if(sceneFxOn&&s.fxMode==='trail'){
        const trails=selectHandTrails(visible,t,{windowSec:1.3,maxGapSec:.85,maxDistance:Math.max(160,Math.min(w*.38,480))});
        const colorGradient=s.lightColorMode==='aurora';
        drawTrailChain(ctx,trails.upper,s.trailUpper,colorGradient);
        drawTrailChain(ctx,trails.lower,s.trailLower,colorGradient);
        for(const path of [trails.upper,trails.lower]){
          const tip=path.at(-1);if(!tip)continue;
          // Keep the light attached to the highest sounding note, but shape
          // the tip as a narrow flare instead of a large circular bloom.
          this.drawGlitter(ctx,tip.x,tip.y,tip.age,tip.power,tip.color,tip.index);
          this.drawTrailTip(ctx,tip.x,tip.y,tip.decay*tip.power,tip.color);
        }
      }
      ctx.restore();
    }
    drawTrailTip(ctx,x,y,intensity,color){
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=clamp(intensity*.34,0,.8);
      ctx.shadowColor=color;ctx.shadowBlur=5;ctx.fillStyle=color;
      ctx.beginPath();ctx.ellipse(x,y,7,2.2,-.12,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    drawBloom(ctx,x,y,intensity,color,size){
      // Keep note light attached to the engraving: a restrained, shallow
      // ellipse without the white-hot center that made notes look like orbs.
      ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=clamp(intensity*.4,0,.9);
      const radius=Math.max(5,size*.68),g=ctx.createRadialGradient(x,y,0,x,y,radius);
      g.addColorStop(0,color+'75');g.addColorStop(.32,color+'48');g.addColorStop(1,color+'00');
      ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,size*.82,Math.max(3,size*.26),-.12,0,Math.PI*2);ctx.fill();ctx.restore();
    }
    drawScoreImpact(ctx,x,y,age,strength,color,note){
      // Use the SAME raster effect as the piano key, scaled to a notehead.
      // This keeps bloom, beam, reflection, white flash and sparks identical.
      if(root.ScorePianoFall?.drawImpactLight&&Number.isFinite(note.audio)){
        root.ScorePianoFall.drawImpactLight(ctx,note,{x:x-5,w:10},note.audio+age,
          {impact:y,keyHeight:24,whiteWidth:10,black:false,strength,color});
        return;
      }
      // Fallback for older standalone scene consumers without the piano layer.
      const energy=(root.ScorePianoFall?.impactEnvelope(age,Math.max(.08,(note.endAudio||note.audio+.4)-note.audio),note.velocity/127)||Math.exp(-age*7.5))*strength;
      if(energy<=.006)return;
      const paint=alpha=>color+Math.round(clamp(alpha,0,1)*255).toString(16).padStart(2,'0');
      ctx.save();ctx.globalCompositeOperation='lighter';
      const radius=10+8*Math.min(1,energy);
      const bloom=ctx.createRadialGradient(x,y,1,x,y,radius);
      bloom.addColorStop(0,paint(.4*energy));bloom.addColorStop(.38,paint(.16*energy));bloom.addColorStop(1,paint(0));
      ctx.fillStyle=bloom;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
      const beam=ctx.createLinearGradient(0,y-20,0,y+5);
      beam.addColorStop(0,paint(0));beam.addColorStop(.65,paint(.12*energy));beam.addColorStop(1,paint(.32*energy));
      ctx.fillStyle=beam;ctx.fillRect(x-2,y-20,4,25);
      ctx.globalAlpha=clamp(.35+.55*energy,0,1);ctx.fillStyle=color;
      ctx.shadowColor=color;ctx.shadowBlur=5+8*Math.min(1,energy);
      ctx.beginPath();ctx.ellipse(x,y,3.5+Math.min(1,energy)*2,1.6+Math.min(1,energy),-.12,0,Math.PI*2);ctx.fill();
      ctx.shadowBlur=0;ctx.globalAlpha=1;
      if(age<.72){
        const seed=(index,salt)=>root.ScorePianoFall?.sparkleSeed(note,index,salt)??random(note.pitch||0,index+salt);
        const fade=(1-age/.72)**1.6*Math.min(1,energy);
        for(let index=0;index<7;index++){
          const dx=(seed(index,0)-.5)*(12+age*14);
          const rise=3+seed(index,17)*8+age*(8+seed(index,31)*17);
          const radius=.35+seed(index,53)*.7;
          ctx.globalAlpha=fade*(.35+seed(index,71)*.55);
          ctx.fillStyle=index%3===0?'#ffffff':color;
          ctx.beginPath();ctx.arc(x+dx,y-rise,radius,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.restore();
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
  root.ScoreStudio={presets,FONT_STACKS,auroraPresets,auroraColor,normalizedVelocity,noteLightColor,pitchLightProfile,normalize,frame,mix,random,selectHandTrails,LayerRenderer};
})(typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined')module.exports=globalThis.ScoreStudio;
