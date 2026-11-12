/* MIDI piano layer shared by the editor and frame-by-frame MP4 renderer. */
(function (root) {
  'use strict';
  const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
  const black=pitch=>[1,3,6,8,10].includes(pitch%12);
  const FIRST=21,LAST=108,PREVIEW_SECONDS=3.2;
  const keyLayout=(()=>{
    const keys=[];let whiteIndex=0;
    for(let pitch=FIRST;pitch<=LAST;pitch++){
      if(black(pitch))keys.push({pitch,black:true,whiteIndex:whiteIndex-1});
      else keys.push({pitch,black:false,whiteIndex:whiteIndex++});
    }
    return {keys,whiteCount:whiteIndex};
  })();
  function noteGeometry(note,time,impactY,speed){
    const start=Number(note.audio),end=Math.max(start+.08,Number(note.endAudio)||start+.4);
    return {top:impactY-(end-time)*speed,bottom:impactY-(start-time)*speed};
  }
  const fallSpeed=impactY=>impactY/PREVIEW_SECONDS;
  function rgba(hex,alpha){
    const color=/^#[\da-f]{6}$/i.test(hex||'')?hex:'#68ddfa';
    return `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},${clamp(alpha,0,1)})`;
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
  function drawImpactLight(ctx,note,box,time,{impact,keyHeight,whiteWidth,black,strength,color}){
    const age=time-note.audio,duration=Math.max(.08,note.endAudio-note.audio);
    const energy=impactEnvelope(age,duration,note.velocity/127)*strength;
    if(energy<=.006)return;
    const x=box.x+box.w/2,paint=alpha=>rgba(color,alpha),unit=whiteWidth;
    ctx.save();ctx.globalCompositeOperation='lighter';
    const radius=unit*(2.4+2.6*Math.min(1,energy));
    const bloom=ctx.createRadialGradient(x,impact,2,x,impact,radius);
    bloom.addColorStop(0,paint(.48*energy));
    bloom.addColorStop(.24,paint(.28*energy));
    bloom.addColorStop(.65,paint(.09*energy));
    bloom.addColorStop(1,paint(0));
    ctx.fillStyle=bloom;ctx.fillRect(x-radius,impact-radius,radius*2,radius*2);
    const beamHeight=Math.min(impact,unit*(3.1+2.7*energy));
    const beam=ctx.createLinearGradient(0,impact-beamHeight,0,impact+18);
    beam.addColorStop(0,paint(0));
    beam.addColorStop(.72,paint(.14*energy));
    beam.addColorStop(1,paint(.46*energy));
    ctx.fillStyle=beam;
    ctx.fillRect(x-box.w*.65,impact-beamHeight,box.w*1.3,beamHeight+18);
    const reflectionHeight=keyHeight*(black?.58:.82);
    const reflection=ctx.createLinearGradient(0,impact,0,impact+reflectionHeight);
    reflection.addColorStop(0,paint(.5*energy));
    reflection.addColorStop(.42,paint(.22*energy));
    reflection.addColorStop(1,paint(0));
    ctx.fillStyle=reflection;
    ctx.fillRect(box.x+1,impact+3,Math.max(1,box.w-2),reflectionHeight);
    ctx.shadowColor=color;ctx.shadowBlur=(14+33*Math.min(1,energy))*Math.min(2,strength);
    ctx.globalAlpha=Math.min(1,.28+.63*energy);
    ctx.fillStyle='#ffffff';
    ctx.fillRect(box.x+1,impact-2,Math.max(1,box.w-2),3+3*Math.min(1,energy));
    ctx.shadowBlur=0;ctx.globalAlpha=1;
    if(age<.72){
      const fade=(1-age/.72)**1.6*Math.min(1,strength);
      for(let index=0;index<7;index++){
        const drift=(sparkleSeed(note,index,0)-.5)*(box.w*3+age*38);
        const rise=8+sparkleSeed(note,index,17)*32+age*(38+sparkleSeed(note,index,31)*70);
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
      this.canvas=document.createElement('canvas');this.canvas.className='piano-fall-canvas';
      this.canvas.setAttribute('aria-hidden','true');viewport.appendChild(this.canvas);
      this.context=this.canvas.getContext('2d');this.notes=[];this.follower=null;this.settings={enabled:true,light:true};
    }
    setSettings(settings){this.settings=settings||{enabled:true,light:true};this.canvas.style.display=this.settings.enabled?'':'none';}
    setFollower(follower){
      this.follower=follower;
      // Use every physical MIDI attack, including notes without an engraved
      // counterpart. The same midiToAudio mapping drives score-note lights.
      this.notes=(follower?.noteEvents||[]).map(event=>{
        const midi=Number.isFinite(event.second)?event.second:follower.beatToSeconds(event.beat);
        const end=Number(event.end_second);
        return {pitch:event.pitch,velocity:event.velocity,audio:follower.midiToAudio(midi),
          endAudio:follower.midiToAudio(Number.isFinite(end)&&end>midi?end:midi+.35)};
      }).filter(note=>note.pitch>=FIRST&&note.pitch<=LAST&&Number.isFinite(note.audio))
        .sort((a,b)=>a.audio-b.audio);
      this.longestDuration=this.notes.reduce((longest,note)=>Math.max(longest,note.endAudio-note.audio),.35);
    }
    keyBox(key,left,whiteWidth){
      return key.black?{x:left+(key.whiteIndex+1)*whiteWidth-whiteWidth*.32,w:whiteWidth*.64}
        :{x:left+key.whiteIndex*whiteWidth,w:whiteWidth};
    }
    draw(time){
      if(!this.settings.enabled||!this.context||!this.follower)return;
      const canvas=this.canvas,w=this.follower.stageRoot?.clientWidth||canvas.parentElement.clientWidth;
      const h=this.follower.stageRoot?.clientHeight||canvas.parentElement.clientHeight;
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const ctx=this.context;ctx.clearRect(0,0,w,h);
      const keyTop=h*.835,keyHeight=h-keyTop,fallTop=0,shadeTop=h*.55,impact=keyTop-2;
      const left=w*.025,right=w*.975,whiteWidth=(right-left)/keyLayout.whiteCount;
      const speed=fallSpeed(impact);
      ctx.save();
      const shade=ctx.createLinearGradient(0,shadeTop,0,keyTop);
      shade.addColorStop(0,'rgba(4,8,18,0)');shade.addColorStop(.23,'rgba(4,8,18,.54)');shade.addColorStop(1,'rgba(4,8,18,.9)');
      ctx.fillStyle=shade;ctx.fillRect(0,shadeTop,w,keyTop-shadeTop);
      const byPitch=new Map(keyLayout.keys.map(key=>[key.pitch,key]));
      // Binary search keeps long pieces inexpensive during 30/60fps export.
      let lo=0,hi=this.notes.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(this.notes[mid].audio<time-this.longestDuration-.8)lo=mid+1;else hi=mid;}
      const active=[];
      ctx.save();ctx.beginPath();ctx.rect(left,fallTop,right-left,impact-fallTop);ctx.clip();
      for(let i=lo;i<this.notes.length&&this.notes[i].audio<=time+PREVIEW_SECONDS+.2;i++){
        const note=this.notes[i],geometry=noteGeometry(note,time,impact,speed);
        if(geometry.bottom<fallTop||geometry.top>impact)continue;
        const key=byPitch.get(note.pitch),box=this.keyBox(key,left,whiteWidth);
        const color=this.follower.eventLightColor(note.velocity);
        const x=box.x+box.w*(key.black?.15:.22),barWidth=box.w*(key.black?.7:.56);
        const top=Math.min(geometry.top,geometry.bottom-3),height=Math.max(3,geometry.bottom-top);
        ctx.fillStyle=rgba(color,.18);ctx.fillRect(x-2,top-2,barWidth+4,height+4);
        ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=clamp(this.settings.strength??1,0,4)*11;
        ctx.beginPath();ctx.roundRect(x,top,barWidth,height,Math.min(5,barWidth*.35));ctx.fill();ctx.shadowBlur=0;
      }
      ctx.restore();
      ctx.fillStyle='#e8e9ee';ctx.fillRect(left,keyTop,right-left,keyHeight);
      for(const key of keyLayout.keys.filter(item=>!item.black)){
        const box=this.keyBox(key,left,whiteWidth);
        ctx.fillStyle='#f1f1f5';ctx.fillRect(box.x+1,keyTop+2,box.w-2,keyHeight-3);
        ctx.fillStyle='rgba(13,17,29,.56)';ctx.fillRect(box.x+box.w-1,keyTop,1,keyHeight);
      }
      for(const key of keyLayout.keys.filter(item=>item.black)){
        const box=this.keyBox(key,left,whiteWidth);
        ctx.fillStyle='#151821';ctx.fillRect(box.x,keyTop,box.w,keyHeight*.67);
        ctx.fillStyle='#303441';ctx.fillRect(box.x+1,keyTop+2,box.w-2,keyHeight*.04);
      }
      for(let i=lo;i<this.notes.length&&this.notes[i].audio<=time;i++){
        const note=this.notes[i];if(time>Math.max(note.audio+.8,note.endAudio+.35))continue;
        const key=byPitch.get(note.pitch),box=this.keyBox(key,left,whiteWidth);
        const color=this.follower.eventLightColor(note.velocity);
        const duration=Math.max(.08,note.endAudio-note.audio);
        const intensity=impactEnvelope(time-note.audio,duration,note.velocity/127);
        if(intensity<=.006)continue;
        active.push({note,key,box,color,intensity});
      }
      // Key fill and luminous impact are separate from the existing notehead
      // glow. Neither effect hides or switches off the other.
      for(const hit of active){
        const {note,key,box,color,intensity}=hit;
        ctx.fillStyle=rgba(color,intensity*(key.black?.8:.43));
        ctx.fillRect(box.x+1,keyTop+2,box.w-2,keyHeight*(key.black?.67:1)-3);
        if(!this.settings.light)continue;
        const strength=clamp(this.settings.strength??1,0,4);
        drawImpactLight(ctx,note,box,time,{impact,keyHeight,whiteWidth,black:key.black,strength,color});
      }
      ctx.restore();
    }
  }
  root.ScorePianoFall={PianoFall,keyLayout,noteGeometry,fallSpeed,impactEnvelope,drawImpactLight};
})(typeof window==='undefined'?globalThis:window);
