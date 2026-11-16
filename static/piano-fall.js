/* MIDI piano layer shared by the editor and frame-by-frame MP4 renderer. */
(function (root) {
  'use strict';
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  const black=pitch=>[1,3,6,8,10].includes(pitch%12);
  const FIRST=21,LAST=108,PREVIEW_SECONDS=3.2,CAMERA_LOOKAHEAD=5,CAMERA_PADDING=3;
  const keyLayout=(()=>{
    const keys=[];let whiteIndex=0;
    for(let pitch=FIRST;pitch<=LAST;pitch++){
      if(black(pitch))keys.push({pitch,black:true,whiteIndex:whiteIndex-1});
      else keys.push({pitch,black:false,whiteIndex:whiteIndex++});
    }
    return {keys,whiteCount:whiteIndex};
  })();
  const keyByPitch=new Map(keyLayout.keys.map(key=>[key.pitch,key]));
  function lowerBound(notes,time){
    let lo=0,hi=notes.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(notes[mid].audio<time)lo=mid+1;else hi=mid;}
    return lo;
  }
  function accentAt(accents,time){
    let lo=0,hi=accents.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(accents[mid].time<time)lo=mid+1;else hi=mid;}
    const before=accents[lo-1],after=accents[lo];
    const nearest=!before?after:!after?before:
      Math.abs(before.time-time)<=Math.abs(after.time-time)?before:after;
    return nearest&&Math.abs(nearest.time-time)<=.075?Number(nearest.intensity)||0:0;
  }
  function noteRange(notes,time,longestDuration=0,lookahead=CAMERA_LOOKAHEAD){
    const start=lowerBound(notes,time-longestDuration-.001),end=lowerBound(notes,time+lookahead+.001);
    let low=LAST,high=FIRST,found=false;
    for(let index=start;index<end;index++){
      const note=notes[index];
      if(note.endAudio<time-.001)continue;
      low=Math.min(low,note.pitch);high=Math.max(high,note.pitch);found=true;
    }
    return found?{low:clamp(low-CAMERA_PADDING,FIRST,LAST),high:clamp(high+CAMERA_PADDING,FIRST,LAST)}:null;
  }
  function cameraTarget(range){
    if(!range)return {center:keyLayout.whiteCount/2,span:keyLayout.whiteCount};
    const a=keyByPitch.get(range.low),b=keyByPitch.get(range.high);
    const start=a.black?a.whiteIndex+1-.32:a.whiteIndex;
    const end=b.black?b.whiteIndex+1+.32:b.whiteIndex+1;
    const span=clamp(Math.max(11,end-start),11,keyLayout.whiteCount);
    return {center:clamp((start+end)/2,span/2,keyLayout.whiteCount-span/2),span};
  }
  function pianoProjection(camera,w,h,cinematic){
    const whiteWidth=w*.95/camera.span;
    const left=w*.025-(camera.center-camera.span/2)*whiteWidth;
    const keyHeight=cinematic?whiteWidth*4.2:h*.165;
    const keyTop=h-keyHeight,impact=keyTop-2;
    // A close camera makes the keys taller, bars longer, and fewer future
    // attacks visible. A wide camera reverses all three on the same timeline.
    const scale=keyLayout.whiteCount/camera.span;
    const speed=fallSpeed(impact)*(cinematic?Math.sqrt(scale):1);
    return {left,right:left+keyLayout.whiteCount*whiteWidth,whiteWidth,keyHeight,keyTop,impact,
      shadeTop:cinematic?Math.max(0,keyTop-keyHeight*2.1):h*.55,
      speed,visibleSeconds:impact/speed};
  }
  const smoothstep=value=>{const t=clamp(value,0,1);return t*t*(3-2*t);};
  function noteGeometry(note,time,impactY,speed){
    const start=Number(note.audio),end=Math.max(start+.08,Number(note.endAudio)||start+.4);
    return {top:impactY-(end-time)*speed,bottom:impactY-(start-time)*speed};
  }
  const fallSpeed=impactY=>impactY/PREVIEW_SECONDS;
  function rgba(hex,alpha){
    const color=/^#[\da-f]{6}$/i.test(hex||'')?hex:'#68ddfa';
    return `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},${clamp(alpha,0,1)})`;
  }
  function luminance(hex){
    const color=/^#[\da-f]{6}$/i.test(hex||'')?hex:'#fffdf6';
    const channels=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255)
      .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  }
  function mixColor(a,b,amount){
    const f=clamp(amount,0,1);
    return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-f)+parseInt(b.slice(i,i+2),16)*f).toString(16).padStart(2,'0')).join('');
  }
  function keyPalette(settings={},paperColor='#fffdf6'){
    const mode=settings.keyStyle==='auto'||!settings.keyStyle
      ?(luminance(paperColor)<.28?'dark':'classic'):settings.keyStyle;
    if(mode==='dark')return {white:'#596475',bed:'#303947',black:'#111823',highlight:'#354050',divider:'rgba(5,9,17,.62)'};
    if(mode==='custom'){
      const white=/^#[\da-f]{6}$/i.test(settings.whiteKeyColor||'')?settings.whiteKeyColor:'#5a6576';
      const black=/^#[\da-f]{6}$/i.test(settings.blackKeyColor||'')?settings.blackKeyColor:'#141b27';
      return {white,bed:mixColor(white,black,.42),black,highlight:mixColor(black,'#ffffff',.18),divider:rgba(black,.65)};
    }
    return {white:'#f1f1f5',bed:'#e8e9ee',black:'#151821',highlight:'#303441',divider:'rgba(13,17,29,.56)'};
  }
  // Adapted from the previous ScoreMotion/Lumenote-style impact light. Every
  // value depends on MIDI time, so seeking and exported frames are identical.
  function impactEnvelope(age,duration,velocity=1){
    if(age<0||age>Math.max(.8,duration+.35))return 0;
    const flash=Math.exp(-age*7.5);
    const held=age<=duration ? .23 : .23*Math.exp(-(age-duration)*9);
    return Math.min(1,(flash*.78+held)*(.55+velocity*.45));
  }
  function sparkleSeed(note,index,salt){
    const seed=Math.sin(note.pitch*83.17+note.audio*171.31+index*54.79+salt)*43758.5453;
    return seed-Math.floor(seed);
  }
  function drawImpactLight(ctx,note,box,time,{impact,keyHeight,whiteWidth,black,strength,color,shadowCache}){
    const age=time-note.audio,duration=Math.max(.08,note.endAudio-note.audio);
    const energy=impactEnvelope(age,duration,note.velocity/127)*strength;
    if(energy<=.006)return;
    const x=box.x+box.w/2,paint=alpha=>rgba(color,alpha),unit=whiteWidth;
    const {spread,focus}=root.ScoreStudio?.pitchLightProfile(note.pitch)||{spread:1,focus:1};
    ctx.save();ctx.globalCompositeOperation='lighter';
    const radius=unit*(2.4+2.6*Math.min(1,energy))*spread;
    const bloom=ctx.createRadialGradient(x,impact,2,x,impact,radius);
    bloom.addColorStop(0,paint(Math.min(1,.48*energy*focus)));
    bloom.addColorStop(.24,paint(.28*energy));
    bloom.addColorStop(.65,paint(.09*energy));
    bloom.addColorStop(1,paint(0));
    ctx.fillStyle=bloom;ctx.fillRect(x-radius,impact-radius,radius*2,radius*2);
    const beamHeight=Math.min(impact,unit*(3.1+2.7*energy)*spread);
    const beam=ctx.createLinearGradient(0,impact-beamHeight,0,impact+18);
    beam.addColorStop(0,paint(0));
    beam.addColorStop(.72,paint(.14*energy));
    beam.addColorStop(1,paint(Math.min(1,.46*energy*focus)));
    ctx.fillStyle=beam;
    ctx.fillRect(x-box.w*.65*spread,impact-beamHeight,box.w*1.3*spread,beamHeight+18);
    const reflectionHeight=keyHeight*(black?.58:.82);
    const reflection=ctx.createLinearGradient(0,impact,0,impact+reflectionHeight);
    reflection.addColorStop(0,paint(.5*energy));
    reflection.addColorStop(.42,paint(.22*energy));
    reflection.addColorStop(1,paint(0));
    ctx.fillStyle=reflection;
    ctx.fillRect(box.x+1,impact+3,Math.max(1,box.w-2),reflectionHeight);
    ctx.shadowColor=color;ctx.shadowBlur=(14+33*Math.min(1,energy))*Math.min(2,strength)*spread;
    ctx.globalAlpha=Math.min(1,(.28+.63*energy)*focus);
    ctx.fillStyle='#ffffff';
    const core=[box.x+1,impact-2,Math.max(1,box.w-2),3+3*Math.min(1,energy)];
    if(shadowCache)shadowCache.draw(ctx,...core);
    else ctx.fillRect(...core);
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    if(age<.72){
      const fade=(1-age/.72)**1.6*Math.min(1,strength);
      for(let index=0;index<7;index++){
        const drift=(sparkleSeed(note,index,0)-.5)*(box.w*3+age*38)*spread;
        const rise=(8+sparkleSeed(note,index,17)*32+age*(38+sparkleSeed(note,index,31)*70))*spread;
        const size=.8+sparkleSeed(note,index,53)*1.5;
        ctx.globalAlpha=fade*(.35+sparkleSeed(note,index,71)*.55);
        ctx.fillStyle=index%3===0?'#ffffff':color;
        ctx.beginPath();ctx.arc(x+drift,impact-rise,size,0,Math.PI*2);ctx.fill();
      }
    }
    ctx.restore();
  }
  class PianoFall {
    constructor(viewport){
      if(viewport.__scorePianoFall&&viewport.__scorePianoFall!==this)viewport.__scorePianoFall.dispose();
      viewport.__scorePianoFall=this;
      this.canvas=document.createElement('canvas');this.canvas.className='piano-fall-canvas';
      this.canvas.setAttribute('aria-hidden','true');viewport.appendChild(this.canvas);
      this.context=this.canvas.getContext('2d');this.notes=[];this.pedalEvents=[];this.follower=null;this.settings={enabled:true,light:true};
      const Cache=root.ScorePianoShadowSprite?.ShadowSpriteCache;
      this.shadowCache=Cache?new Cache():null;
      this.gpu=null;this.gpuError='';this.gpuEpoch=0;this.ready=Promise.resolve();
    }
    prepareGpu(){
      const mode=this.settings?.fxRenderer||'canvas',wanted=mode!=='canvas'&&
        this.settings.enabled&&this.settings.light&&!this.settings.minimalMode;
      const epoch=++this.gpuEpoch;
      if(!wanted){this.gpu?.dispose();this.gpu=null;this.ready=Promise.resolve();
        this.canvas.parentElement?.dispatchEvent(new CustomEvent('score-fx-renderer',
          {detail:{actual:'canvas',requested:mode}}));return this.ready;}
      if(this.gpu)return this.ready;
      const Layer=root.ScorePixiFx?.Layer;
      if(!Layer){this.gpuError='PixiJS 효과 모듈이 로드되지 않았습니다.';
        this.canvas.parentElement?.dispatchEvent(new CustomEvent('score-fx-renderer',
          {detail:{actual:'canvas',requested:mode,reason:this.gpuError}}));
        return Promise.resolve();}
      this.ready=Layer.create(this.canvas.parentElement,'piano').then(layer=>{
        if(epoch!==this.gpuEpoch){layer.dispose();return;}
        this.gpu=layer;this.gpuError='';
        this.canvas.parentElement.dispatchEvent(new CustomEvent('score-fx-renderer',
          {detail:{actual:'pixi',requested:mode}}));
      }).catch(error=>{
        if(epoch!==this.gpuEpoch)return;
        this.gpuError=String(error?.message||error);
        this.canvas.parentElement.dispatchEvent(new CustomEvent('score-fx-renderer',
          {detail:{actual:'canvas',requested:mode,reason:this.gpuError}}));
      });
      return this.ready;
    }
    setSettings(settings){
      const next=settings||{enabled:true,light:true},old=this.settings||{};
      for(const key of ['enabled','light','minimalMode','keyStyle','whiteKeyColor','blackKeyColor','strength','camera','portrait']){
        if(old[key]!==next[key]){this.shadowCache?.clear();break;}
      }
      this.settings=next;this.canvas.style.display=this.settings.enabled?'':'none';
      if(old.fxRenderer!==next.fxRenderer||old.minimalMode!==next.minimalMode||old.light!==next.light||old.enabled!==next.enabled)
        this.prepareGpu();
    }
    setFollower(follower){
      if(this.follower&&this.follower!==follower)this.shadowCache?.clear();
      this.follower=follower;
      // Use every physical MIDI attack, including notes without an engraved
      // counterpart. The same midiToAudio mapping drives score-note lights.
      const trim=(Number(this.settings?.offsetSec)||0)-(Number(follower?.offsetSec)||0);
      this.notes=(follower?.noteEvents||[]).map(event=>{
        const midi=Number.isFinite(event.second)?event.second:follower.beatToSeconds(event.beat);
        const end=Number(event.end_second);
        // Auto sync is shared, but score and piano trims are independent.
        const sustainEnd=Number(event.sustain_end_second);
        return {pitch:event.pitch,velocity:event.velocity,channel:event.channel??0,audio:follower.midiToAudio(midi)+trim,
          endAudio:follower.midiToAudio(Number.isFinite(end)&&end>midi?end:midi+.35)+trim,
          sustainEndAudio:follower.midiToAudio(Number.isFinite(sustainEnd)&&sustainEnd>end?sustainEnd:(Number.isFinite(end)&&end>midi?end:midi+.35))+trim};
      }).filter(note=>note.pitch>=FIRST&&note.pitch<=LAST&&Number.isFinite(note.audio))
        .sort((a,b)=>a.audio-b.audio);
      const accents=follower?.cameraAccents||[];
      for(const note of this.notes)note.emphasis=accentAt(accents,note.audio);
      this.pedalEvents=(follower?.pedalEvents||[]).map(event=>({
        audio:follower.midiToAudio(Number(event.second))+trim,channel:event.channel??0,down:event.down??event.value>=64
      })).filter(event=>Number.isFinite(event.audio)).sort((a,b)=>a.audio-b.audio);
      const channels=new Set();let releaseTime=-Infinity;
      this.pedalTimeline=this.pedalEvents.map(event=>{
        if(event.down)channels.add(event.channel);
        else{channels.delete(event.channel);releaseTime=event.audio;}
        return {audio:event.audio,down:channels.size>0,releaseTime};
      });
      this.longestDuration=this.notes.reduce((longest,note)=>Math.max(longest,note.sustainEndAudio-note.audio),.35);
      const last=Math.max(Number(follower?.audioDuration)||0,this.notes.at(-1)?.endAudio||0);
      this.cameraTargets=[];
      if(this.settings?.portrait&&this.settings.camera!==false){
        for(let second=0;second<=Math.ceil(last)+1;second++){
          const range=noteRange(this.notes,second,this.longestDuration);
          this.cameraTargets.push(range?cameraTarget(range):null);
        }
        const first=this.cameraTargets.find(Boolean)||cameraTarget(null);
        let previous=first;
        this.cameraTargets=this.cameraTargets.map(target=>(previous=target||previous));
      }
    }
    cameraAt(time){
      if(!this.settings?.portrait||this.settings.camera===false||!this.cameraTargets?.length)return cameraTarget(null);
      const position=Math.max(0,Number(time)||0),index=Math.min(Math.floor(position),this.cameraTargets.length-1);
      const a=this.cameraTargets[index],b=this.cameraTargets[Math.min(index+1,this.cameraTargets.length-1)];
      const blend=smoothstep(position-index);
      return {center:a.center+(b.center-a.center)*blend,span:a.span+(b.span-a.span)*blend};
    }
    keyBox(key,left,whiteWidth){
      return key.black?{x:left+(key.whiteIndex+1)*whiteWidth-whiteWidth*.32,w:whiteWidth*.64}
        :{x:left+key.whiteIndex*whiteWidth,w:whiteWidth};
    }
    pedalAt(time){
      const events=this.pedalTimeline||[];let lo=0,hi=events.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(events[mid].audio<=time)lo=mid+1;else hi=mid;}
      const state=events[lo-1];
      return {down:Boolean(state?.down),energy:state?.down?1:
        Math.exp(-Math.max(0,time-(state?.releaseTime??-Infinity))*5)};
    }
    draw(time){
      if(!this.settings.enabled||!this.context||!this.follower)return;
      const canvas=this.canvas,w=this.follower.stageRoot?.clientWidth||canvas.parentElement.clientWidth;
      const h=this.follower.stageRoot?.clientHeight||canvas.parentElement.clientHeight;
      const measuring=typeof this.onDrawMeasured==='function',started=measuring?performance.now():0;
      const resized=canvas.width!==w||canvas.height!==h;
      if(resized){canvas.width=w;canvas.height=h;this.shadowCache?.clear();}
      const ctx=this.context;ctx.clearRect(0,0,w,h);
      const keys=keyPalette(this.settings,this.follower.colors?.().paper);
      const minimal=Boolean(this.settings.minimalMode);
      const palette=this.settings.minimalPalette,fx=this.settings.gpuEffects||{};
      if(minimal&&palette){keys.white=palette.white;keys.black=palette.black;}
      const camera=this.cameraAt(time),cinematic=Boolean(this.settings?.portrait&&this.settings.camera!==false);
      const {keyTop,keyHeight,shadeTop,impact,left,right,whiteWidth,speed,visibleSeconds}=
        pianoProjection(camera,w,h,cinematic);
      const fallTop=0;
      ctx.save();
      if(!minimal){
        const shade=ctx.createLinearGradient(0,shadeTop,0,keyTop);
        shade.addColorStop(0,'rgba(4,8,18,0)');shade.addColorStop(.23,'rgba(4,8,18,.54)');shade.addColorStop(1,'rgba(4,8,18,.9)');
        ctx.fillStyle=shade;ctx.fillRect(0,shadeTop,w,keyTop-shadeTop);
      }
      // Binary search keeps long pieces inexpensive during 30/60fps export.
      let lo=0,hi=this.notes.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(this.notes[mid].audio<time-this.longestDuration-.8)lo=mid+1;else hi=mid;}
      const active=[];
      const gpuCommands=[];
      const pedal=this.pedalAt(time);
      if(!minimal){
        ctx.save();ctx.beginPath();ctx.rect(left,fallTop,right-left,impact-fallTop);ctx.clip();
        for(let i=lo;i<this.notes.length&&this.notes[i].audio<=time+visibleSeconds+.2;i++){
        const note=this.notes[i],geometry=noteGeometry(note,time,impact,speed);
        if(geometry.bottom<fallTop||geometry.top>impact)continue;
        const key=keyByPitch.get(note.pitch),box=this.keyBox(key,left,whiteWidth);
        const color=this.follower.eventLightColor(note.velocity);
        const x=box.x+box.w*(key.black?.15:.22),barWidth=box.w*(key.black?.7:.56);
        const top=Math.min(geometry.top,geometry.bottom-3),height=Math.max(3,geometry.bottom-top);
        ctx.fillStyle=rgba(color,.18);ctx.fillRect(x-2,top-2,barWidth+4,height+4);
        ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=this.gpu?0:clamp(this.settings.strength??1,0,4)*11;
        ctx.beginPath();ctx.roundRect(x,top,barWidth,height,Math.min(5,barWidth*.35));ctx.fill();ctx.shadowBlur=0;
        if(this.gpu)gpuCommands.push({kind:'fall',x:x+barWidth/2,y:top+height/2,width:barWidth,height,
          age:Math.max(0,time-note.audio),seed:note.pitch+note.audio,
          energy:.22*clamp(this.settings.strength??1,0,4),color});
      }
        ctx.restore();
      }
      ctx.fillStyle=keys.bed;ctx.fillRect(left,keyTop,right-left,keyHeight);
      for(const key of keyLayout.keys.filter(item=>!item.black)){
        const box=this.keyBox(key,left,whiteWidth);
        ctx.fillStyle=keys.white;ctx.fillRect(box.x+1,keyTop+2,box.w-2,keyHeight-3);
        ctx.fillStyle=keys.divider;ctx.fillRect(box.x+box.w-1,keyTop,1,keyHeight);
      }
      for(const key of keyLayout.keys.filter(item=>item.black)){
        const box=this.keyBox(key,left,whiteWidth);
        ctx.fillStyle=keys.black;ctx.fillRect(box.x,keyTop,box.w,keyHeight*.67);
        ctx.fillStyle=keys.highlight;ctx.fillRect(box.x+1,keyTop+2,box.w-2,keyHeight*.04);
      }
      for(let i=lo;i<this.notes.length&&this.notes[i].audio<=time;i++){
        const note=this.notes[i];if(time>Math.max(note.audio+.8,note.endAudio+.35,note.sustainEndAudio+.3))continue;
        if(minimal&&time>=Math.max(note.audio+.08,note.endAudio))continue;
        const key=keyByPitch.get(note.pitch),box=this.keyBox(key,left,whiteWidth);
        const accent=minimal?(root.ScoreStudio.minimalNoteAccent(palette,note.velocity,
          this.follower.effects?.velocityScale,this.follower.velocityRange,
          this.follower.effects?.auroraLow,this.follower.effects?.auroraHigh)||this.follower.colors().accent):null;
        const color=minimal?root.ScoreStudio.minimalActiveColor(accent,
          key.black?keys.black:keys.white,this.follower.colors().paper,note.velocity,
          this.follower.effects?.velocityScale,this.follower.velocityRange):this.follower.eventLightColor(note.velocity);
        const duration=Math.max(.08,note.endAudio-note.audio);
        const pedalled=!minimal&&note.sustainEndAudio>note.endAudio+.001&&
          time>note.endAudio&&time<note.sustainEndAudio+.3;
        const intensity=minimal?1:(pedalled ? .18*Math.exp(-Math.max(0,time-note.sustainEndAudio)*12) :
          impactEnvelope(time-note.audio,duration,note.velocity/127));
        if(intensity<=.006)continue;
        active.push({note,key,box,color,intensity,pedalled});
      }
      // Key fill and luminous impact are separate from the existing notehead
      // glow. Neither effect hides or switches off the other.
      for(const hit of active){
        const {note,key,box,color,intensity,pedalled}=hit;
        ctx.fillStyle=minimal?color:rgba(color,intensity*(key.black?.8:.43));
        ctx.fillRect(box.x+1,keyTop+2,box.w-2,keyHeight*(key.black?.67:1)-3);
        if(minimal||!this.settings.light)continue;
        if(pedalled){
          if(fx.sustainAfterglow!==false){
            if(this.gpu)gpuCommands.push({kind:'afterglow',x:box.x+box.w/2,y:impact,
              width:box.w*2.4,height:whiteWidth*3.2,energy:intensity*4.4,color});
            else{ctx.save();ctx.globalAlpha=.15;ctx.fillStyle=color;
              ctx.fillRect(box.x+1,keyTop+2,box.w-2,Math.min(keyHeight*.18,18));ctx.restore();}
          }
          continue;
        }
        const strength=clamp(this.settings.strength??1,0,4);
        if(this.gpu){
          const energy=impactEnvelope(time-note.audio,Math.max(.08,note.endAudio-note.audio),note.velocity/127)*strength;
          const {spread,focus}=root.ScoreStudio?.pitchLightProfile(note.pitch)||{spread:1,focus:1};
          gpuCommands.push({kind:'piano',x:box.x+box.w/2,y:impact,unit:whiteWidth,
            age:time-note.audio,seed:note.pitch+note.audio,velocity:note.velocity/127,emphasis:note.emphasis,
            keyWidth:box.w,keyHeight,energy,strength,color,spread,focus});
        }else drawImpactLight(ctx,note,box,time,{impact,keyHeight,whiteWidth,black:key.black,strength,color,shadowCache:this.shadowCache});
      }
      if(!minimal&&pedal.energy>.01&&fx.pedalResonance!==false){
        const color=this.follower.colors().glow;
        if(this.gpu)gpuCommands.push({kind:'pedal',x:(left+right)/2,y:keyTop-whiteWidth*.35,
          width:right-left,height:Math.max(16,whiteWidth*6),energy:pedal.energy,color});
        else{ctx.save();ctx.globalAlpha=.11*pedal.energy;ctx.fillStyle=color;
          ctx.fillRect(left,keyTop-5,right-left,5);ctx.restore();}
      }
      if(minimal&&pedal.down&&fx.pedalResonance!==false){ctx.fillStyle=palette?.pedal||this.follower.colors().accent;
        ctx.fillRect(left,h-4,right-left,4);}
      ctx.restore();
      if(this.gpu){
        try{this.gpu.app.canvas.style.display=minimal||!this.settings.light?'none':'';
          this.gpu.draw(minimal?[]:gpuCommands,w,h,fx);
        }catch(error){this.gpuError=String(error?.message||error);this.gpu.dispose();this.gpu=null;
          this.canvas.parentElement?.dispatchEvent(new CustomEvent('score-fx-renderer',
            {detail:{actual:'canvas',requested:this.settings.fxRenderer,reason:this.gpuError}}));}
      }
      if(measuring)this.onDrawMeasured(performance.now()-started,resized);
    }
    dispose(){const viewport=this.canvas.parentElement;this.gpuEpoch++;this.gpu?.dispose();this.gpu=null;this.shadowCache?.clear();this.canvas.remove();this.follower=null;this.notes=[];
      if(viewport?.__scorePianoFall===this)viewport.__scorePianoFall=null;}
  }
  root.ScorePianoFall={PianoFall,keyLayout,noteGeometry,fallSpeed,impactEnvelope,sparkleSeed,drawImpactLight,keyPalette,luminance,noteRange,cameraTarget,pianoProjection};
})(typeof window==='undefined'?globalThis:window);
