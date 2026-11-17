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
  const minimalColors=new Map();
  const lightness=color=>rgb(color).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;})
    .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{const x=lightness(a),y=lightness(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  function minimalActiveColor(accent,base,paper,velocity,scale='absolute',range=null){
    accent=validColor(accent,'#2ec9d3');base=validColor(base,'#181b22');paper=validColor(paper,'#fffdf6');
    const level=Math.round(clamp((normalizedVelocity(velocity,scale,range)-1)/126,0,1)*15);
    const key=[accent,base,paper,level].join('|');
    if(minimalColors.has(key))return minimalColors.get(key);
    let target=accent;
    // Keep the selected hue, but make the active state legible on its paper
    // and different from the resting note/key even for monochrome palettes.
    const opposite=contrast(base,paper)>1.5?base:(lightness(paper)>.5?'#111820':'#f7f8f4');
    for(let i=0;i<5&&contrast(target,paper)<3;i++)target=mix(target,opposite,.22);
    if(contrast(target,base)<1.35)target=mix(target,paper,.38);
    const color=mix(base,target,.62+level/15*.36);
    if(minimalColors.size>512)minimalColors.clear();
    minimalColors.set(key,color);return color;
  }
  function recommendMinimalPalette(mode,colors){
    const paper=validColor(colors.paper,'#fffdf6'),ink=validColor(colors.ink,'#181b22');
    const accent=validColor(colors.accent,'#2ec9d3'),glow=validColor(colors.glow,accent);
    const white=validColor(colors.white,'#f1f1f5'),black=validColor(colors.black,'#151821');
    if(mode==='harmony')return {note:mix(accent,glow,.32),white:mix(white,accent,.16),black:mix(black,glow,.22),pedal:mix(accent,glow,.55)};
    if(mode==='contrast'){
      const strong=lightness(paper)>.5?mix(ink,accent,.28):mix('#ffffff',accent,.35);
      return {note:strong,white:mix(white,strong,.18),black:mix(black,strong,.32),pedal:strong};
    }
    if(mode==='velocity')return {note:accent,white,black,pedal:glow};
    return {note:accent,white,black,pedal:accent};
  }
  function minimalPalette(value={},fallback={}){
    const mode=['single','harmony','contrast','velocity'].includes(value?.mode)?value.mode:'single';
    const recommended=recommendMinimalPalette(mode,fallback);
    return {mode,...Object.fromEntries(['note','white','black','pedal'].map(name=>
      [name,validColor(value?.[name],recommended[name])]))};
  }
  function minimalNoteAccent(palette,velocity,scale,range,low,high){
    return palette?.mode==='velocity'
      ?auroraColor(normalizedVelocity(velocity,scale,range),low,high)
      :palette?.note;
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
    return {template,cameraMode,fxMode,lightColorMode,velocityScale:x.velocityScale==='relative'?'relative':'absolute',minimalMode:Boolean(x.minimalMode),animateBackground:Boolean(x.animateBackground),fxStrength:clamp(Number(x.fxStrength??base.fxStrength)||0,0,4),
      scoreImpactEnabled:x.scoreImpactEnabled!==false,scoreImpactStrength:clamp(Number(x.scoreImpactStrength??1.4)||0,0,4),
      title:String(x.title||'').slice(0,120),artist:String(x.artist||'').slice(0,120),
      credit:String(x.credit||'').slice(0,200),showText:x.showText!==false,
      font,notationStyle,titleGap:clamp(Number(x.titleGap??65),0,320),
      auroraPreset,auroraLow:validColor(x.auroraLow,auroraDefault.low),auroraHigh:validColor(x.auroraHigh,auroraDefault.high),
      trailUpper:validColor(x.trailUpper, '#7ed8ff'), trailLower:validColor(x.trailLower, '#f2d16f'),
      trailLength:clamp(Number(x.trailLength??8),2,16),
      trailBrightness:clamp(Number(x.trailBrightness??1),0,2),
      trailThickness:clamp(Number(x.trailThickness??1),.5,3),
      trailDuration:clamp(Number(x.trailDuration??1.3),.3,3),
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
  // Read the final screen-space notehead position after scrolling, zoom and
  // CSS camera transforms, then convert to a target canvas's logical pixels.
  function gpuScorePoint(element,target){
    if(!element?.getBoundingClientRect||!target)return null;
    const note=element.getBoundingClientRect(),box=target.getBoundingClientRect();
    if(!note.width&&!note.height)return null;
    if(!box.width||!box.height||!target.clientWidth||!target.clientHeight)return null;
    return {x:(note.left+note.width*.5-box.left)*target.clientWidth/box.width,
      y:(note.top+note.height*.5-box.top)*target.clientHeight/box.height};
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
  function drawTrailChain(ctx,items,solidColor,gradientMode=false,brightness=1,thickness=1){
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
        ctx.lineWidth=pass.width*thickness;ctx.shadowBlur=pass.blur*thickness;ctx.strokeStyle=solidColor;ctx.shadowColor=solidColor;
        ctx.globalAlpha=clamp(power*pass.alpha*brightness,0,1);ctx.stroke();
      }
    }else{
      for(let i=1;i<items.length;i++){
        const a=items[i-1],b=items[i];
        const mx=(a.x+b.x)/2,my=(a.y+b.y)/2-(6+Math.min(22,Math.abs(a.y-b.y)*.18));
        const gradient=ctx.createLinearGradient(a.x,a.y,b.x,b.y);
        gradient.addColorStop(0,a.color);gradient.addColorStop(1,b.color);
        for(const pass of [{width:3.6,blur:9,alpha:.16},{width:1.25,blur:2.5,alpha:.78}]){
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(mx,my,b.x,b.y);
          ctx.lineWidth=pass.width*thickness;ctx.shadowBlur=pass.blur*thickness;ctx.strokeStyle=gradient;ctx.shadowColor=b.color;
          ctx.globalAlpha=clamp(Math.max(a.decay*a.power,b.decay*b.power)*pass.alpha*brightness,0,1);ctx.stroke();
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
    setScene(value){
      this.scene=normalize(value);
      this.canvas.style.display=this.scene.minimalMode?'none':'';
      if(this.scene.minimalMode)this.context.clearRect(0,0,this.canvas.width,this.canvas.height);
    }
    resize(){
      const w=Math.max(1,this.viewport.clientWidth),h=Math.max(1,this.viewport.clientHeight),dpr=1;
      const dw=Math.round(w*dpr),dh=Math.round(h*dpr);
      if(this.canvas.width!==dw||this.canvas.height!==dh){this.canvas.width=dw;this.canvas.height=dh;}
      this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
      this.context.setTransform(dpr,0,0,dpr,0,0);return {w,h};
    }
    draw(t,follower){
      if(!this.context)return;
      const s=this.scene,{w,h}=s.minimalMode?{w:this.viewport.clientWidth,h:this.viewport.clientHeight}:this.resize();
      const ctx=this.context,p=frame(s,t),strength=s.fxStrength;
      if(!s.animateBackground)p.glow=follower.colors().glow;
      const sx=this.viewport.scrollLeft,sy=this.viewport.scrollTop;
      for(const elem of [this.canvas,this.titleBox,this.atmosphere])elem.style.transform=`translate(${sx}px, ${sy}px)`;
      if(follower.bgLayer){follower.bgLayer.style.transform=`translate(${sx}px, ${sy}px)`;if(s.animateBackground)follower.bgLayer.style.backgroundColor=p.color;else follower.bgLayer.style.backgroundColor=follower.colors().paper;}
      if(follower.glitterLayer)follower.glitterLayer.style.transform=`translate(${sx}px, ${sy}px)`;
      this.atmosphere.style.background=s.minimalMode?'none':`radial-gradient(ellipse at ${25+Math.sin(t*.09)*17}% 18%, ${p.glow}35, transparent 58%), radial-gradient(ellipse at 85% 87%, ${p.glow}22, transparent 60%)`;
      this.atmosphere.style.opacity=s.minimalMode?'0':s.template==='cinematic'?'.32':s.template==='illustrated'?'.1':'.035';
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
      this.titleBox.style.color=s.animateBackground?(lightness(p.color)<.18?'#fffdf7':'#303039'):follower.colors().ink;
      this.gpuCommands=[];
      ctx.clearRect(0,0,w,h);
      if(s.minimalMode)return;
      const gpuFx=Boolean(this.gpuLayer);
      const gpuTrails=gpuFx&&this.gpuEffects?.trails?.on;
      const sceneFxOn=s.fxMode!=='none'&&strength>0;
      const scoreImpactOn=s.scoreImpactEnabled&&s.scoreImpactStrength>0;
      if(!sceneFxOn&&!scoreImpactOn&&!gpuTrails)return;
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
      const trailDuration=gpuTrails?this.gpuEffects.trails.duration:s.trailDuration;
      const history=(s.fxMode==='trail'||gpuTrails)?Math.max(1.8,trailDuration):1.8;
      while(low<high){const mid=(low+high)>>>1;if(events[mid].audio<t-history)low=mid+1;else high=mid;}
      const visible=[],view=this.viewport.getBoundingClientRect(),scale=view.width/this.viewport.clientWidth||1;
      const containerBox=follower.container?.getBoundingClientRect?.()||null;
      const containerX=containerBox?(containerBox.left-view.left)/scale:NaN;
      const containerY=containerBox?(containerBox.top-view.top)/scale:NaN;
      const cameraScale=Number(follower.cameraScale)||1;
      const accents=follower.cameraAccents||[];
      let accentIndex=0;
      while(accentIndex<accents.length&&accents[accentIndex].time<(events[low]?.audio??t)-.075)accentIndex++;
      for(let i=low;i<events.length&&events[i].audio<=t+.015;i++){
        const e=events[i],age=t-e.audio;
        if(age<0||age>history)continue;
        while(accentIndex<accents.length&&accents[accentIndex].time<e.audio-.075)accentIndex++;
        const emphasis=Math.abs((accents[accentIndex]?.time??Infinity)-e.audio)<=.075?
          accents[accentIndex].intensity:0;
        const gpuPoint=gpuFx?gpuScorePoint(e.headEl||e.el,this.viewport):null;
        let x=gpuPoint?.x??containerX+e.noteX*cameraScale,
          y=gpuPoint?.y??containerY+e.noteY*cameraScale;
        if(!Number.isFinite(x)||!Number.isFinite(y)){
          const rect=e.el.getBoundingClientRect();if(!rect.width||!rect.height)continue;
          x=(rect.left+rect.width/2-view.left)/scale;
          y=(rect.top+rect.height/2-view.top)/scale;
        }
        if(x<-70||x>w+70||y<-70||y>h+70)continue;
        const velocity=(follower.effects.velocityReactive===false?78:e.velocity)/127;
        const power=clamp((.24+.76*velocity**1.25)*strength,0,4);
        const decay=Math.exp(-age*((s.fxMode==='trail'||gpuTrails)?1.9:3.4));
        const solidColor=(s.fxMode==='trail'||gpuTrails)?(e.hand==='lower'?s.trailLower:s.trailUpper):p.glow;
        const lightColor=noteLightColor(s,e.velocity,solidColor,follower.velocityRange);
        const pitchLight=pitchLightProfile(e.pitch);
        const duration=Math.max(.08,(Number(e.endAudio)||e.audio+.4)-e.audio);
        const impact=root.ScorePianoFall?.impactEnvelope(age,duration,velocity)
          ??Math.exp(-age*7.5)*velocity;
        visible.push({x,y,age,power,decay,velocity,emphasis,index:i,hand:e.hand||'upper',systemKey:e.systemKey,audio:e.audio,endAudio:e.endAudio,beat:e.beat,pitch:e.pitch,color:lightColor});
        if(sceneFxOn&&s.fxMode!=='trail'){
          const energy=Math.max(decay,impact)*power*pitchLight.focus,size=(14+power*23)*pitchLight.spread;
          if(gpuFx)this.gpuCommands.push({kind:'note',space:'stage',x,y,radius:size*.82,energy:clamp(energy*.4,0,.9),color:lightColor,age,velocity,emphasis,seed:e.pitch+e.audio});
          else this.drawBloom(ctx,x,y,energy,lightColor,size);
        }
        if(scoreImpactOn){
          if(gpuFx)this.gpuCommands.push({kind:'piano',space:'stage',x,y,unit:10,keyWidth:10,keyHeight:24,
            energy:impact*s.scoreImpactStrength,strength:s.scoreImpactStrength,color:follower.eventLightColor?.(e.velocity)||lightColor,age,velocity,emphasis,seed:e.pitch+e.audio});
          else this.drawScoreImpact(ctx,x,y,age,s.scoreImpactStrength,follower.eventLightColor?.(e.velocity)||lightColor,e);
        }
        for(const extra of e.fallbackHeads||[]){
          const extraPoint=gpuFx?gpuScorePoint(extra.el,this.viewport):null;
          const extraX=extraPoint?.x??containerX+extra.noteX*cameraScale,
            extraY=extraPoint?.y??containerY+extra.noteY*cameraScale;
          if(!Number.isFinite(extraX)||!Number.isFinite(extraY))continue;
          if(sceneFxOn&&s.fxMode!=='trail'){
            const energy=Math.max(decay,impact)*power*pitchLight.focus,size=(14+power*23)*pitchLight.spread;
            if(gpuFx)this.gpuCommands.push({kind:'note',space:'stage',x:extraX,y:extraY,radius:size*.82,energy:clamp(energy*.4,0,.9),color:lightColor,age,velocity,emphasis,seed:e.pitch+e.audio});
            else this.drawBloom(ctx,extraX,extraY,energy,lightColor,size);
          }
          if(scoreImpactOn){
            if(gpuFx)this.gpuCommands.push({kind:'piano',space:'stage',x:extraX,y:extraY,unit:10,keyWidth:10,keyHeight:24,
              energy:impact*s.scoreImpactStrength,strength:s.scoreImpactStrength,color:follower.eventLightColor?.(e.velocity)||lightColor,age,velocity,emphasis,seed:e.pitch+e.audio});
            else this.drawScoreImpact(ctx,extraX,extraY,age,s.scoreImpactStrength,follower.eventLightColor?.(e.velocity)||lightColor,e);
          }
        }
        if(sceneFxOn&&s.fxMode==='resonance'){
          if(gpuFx)this.gpuCommands.push({kind:'ring',space:'stage',x,y,width:14+age*116,height:10+age*88,
            energy:clamp(Math.exp(-age*2.5)*power*.65,0,1),color:lightColor});
          else this.drawRing(ctx,x,y,age,power,lightColor);
        }
        if(sceneFxOn&&s.fxMode==='glitter'){
          if(gpuFx)this.gpuCommands.push({kind:'burst',space:'stage',x,y,age,
            velocity:e.velocity/127,energy:clamp(power,0,1),color:lightColor,
            seed:e.pitch+e.audio,force:true});
          else this.drawGlitter(ctx,x,y,age,power,lightColor,i);
        }
      }
      // A tie continuation is not a new attack: inherit its preceding note's
      // velocity color with gentle sustained illumination only (no particles).
      for(const hold of (sceneFxOn?(follower.activeTies?.(t)||follower.tieContinuations||[]):[])){
        if(t<hold.audio||t>hold.endAudio)continue;
        const holdPoint=gpuFx?gpuScorePoint(hold.headEl||hold.el,this.viewport):null;
        let x=holdPoint?.x??containerX+hold.noteX*cameraScale,
          y=holdPoint?.y??containerY+hold.noteY*cameraScale;
        if(!Number.isFinite(x)||!Number.isFinite(y)||x<-60||x>w+60||y<-60||y>h+60)continue;
        const color=noteLightColor(s,hold.velocity,p.glow,follower.velocityRange);
        const remain=clamp((hold.endAudio-t)/.28,0,1);
        const energy=Math.min(.48,.21+hold.velocity/127*.22)*remain*strength,size=12+hold.velocity/127*12;
        if(gpuFx)this.gpuCommands.push({kind:'note',space:'stage',x,y,radius:size*.82,energy:clamp(energy*.4,0,.9),color,age:1,velocity:hold.velocity/127,seed:hold.pitch+hold.audio});
        else this.drawBloom(ctx,x,y,energy,color,size);
      }
      if((sceneFxOn&&s.fxMode==='trail')||gpuTrails){
        const trailLength=gpuTrails?this.gpuEffects.trails.length:s.trailLength;
        const trailBrightness=gpuTrails?this.gpuEffects.trails.strength:s.trailBrightness;
        const trails=selectHandTrails(visible,t,{windowSec:trailDuration,maxGapSec:.85,maxDistance:Math.max(160,Math.min(w*.38,480))});
        const colorGradient=s.lightColorMode==='aurora';
        for(const [hand,fullPath] of [['upper',trails.upper],['lower',trails.lower]]){
          const path=fullPath.slice(-Math.round(trailLength));
          if(gpuFx){
            for(let i=1;i<path.length;i++){
              const a=path[i-1],b=path[i],solid=hand==='upper'?s.trailUpper:s.trailLower;
              this.gpuCommands.push({kind:'trailRibbon',space:'stage',
                a:{x:a.x,y:a.y,color:colorGradient?a.color:solid,energy:a.decay*a.power,age:a.age,velocity:a.velocity,emphasis:a.emphasis},
                b:{x:b.x,y:b.y,color:colorGradient?b.color:solid,energy:b.decay*b.power,age:b.age,velocity:b.velocity,emphasis:b.emphasis},
                brightness:trailBrightness,thickness:s.trailThickness});
            }
          }else drawTrailChain(ctx,path,hand==='upper'?s.trailUpper:s.trailLower,
            colorGradient,trailBrightness,s.trailThickness);
          const tip=path.at(-1);if(!tip)continue;
          // Keep the light attached to the highest sounding note, but shape
          // the tip as a narrow flare instead of a large circular bloom.
          if(gpuFx){
            this.gpuCommands.push({kind:'trailTip',space:'stage',x:tip.x,y:tip.y,
              energy:tip.decay*tip.power*trailBrightness,color:tip.color,age:tip.age,velocity:tip.velocity,emphasis:tip.emphasis});
            this.gpuCommands.push({kind:'burst',space:'stage',x:tip.x,y:tip.y,age:tip.age,
              velocity:tip.velocity,energy:Math.min(1,tip.power*trailBrightness),color:tip.color,
              seed:tip.index,force:true});
          }else{
            this.drawGlitter(ctx,tip.x,tip.y,tip.age,tip.power*trailBrightness,tip.color,tip.index);
            this.drawTrailTip(ctx,tip.x,tip.y,tip.decay*tip.power*trailBrightness,tip.color);
          }
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
  root.ScoreStudio={presets,FONT_STACKS,auroraPresets,auroraColor,normalizedVelocity,minimalActiveColor,minimalPalette,recommendMinimalPalette,minimalNoteAccent,noteLightColor,pitchLightProfile,normalize,frame,mix,random,gpuScorePoint,selectHandTrails,LayerRenderer};
})(typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined')module.exports=globalThis.ScoreStudio;
