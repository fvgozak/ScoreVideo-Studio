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
  function rgba(hex,alpha){
    const color=/^#[\da-f]{6}$/i.test(hex||'')?hex:'#68ddfa';
    return `rgba(${parseInt(color.slice(1,3),16)},${parseInt(color.slice(3,5),16)},${parseInt(color.slice(5,7),16)},${clamp(alpha,0,1)})`;
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
      const keyTop=h*.835,keyHeight=h-keyTop,fieldTop=h*.55,impact=keyTop-2;
      const left=w*.025,right=w*.975,whiteWidth=(right-left)/keyLayout.whiteCount;
      const speed=(impact-fieldTop)/PREVIEW_SECONDS;
      ctx.save();
      const shade=ctx.createLinearGradient(0,fieldTop,0,keyTop);
      shade.addColorStop(0,'rgba(4,8,18,0)');shade.addColorStop(.23,'rgba(4,8,18,.54)');shade.addColorStop(1,'rgba(4,8,18,.9)');
      ctx.fillStyle=shade;ctx.fillRect(0,fieldTop,w,keyTop-fieldTop);
      const byPitch=new Map(keyLayout.keys.map(key=>[key.pitch,key]));
      // Binary search keeps long pieces inexpensive during 30/60fps export.
      let lo=0,hi=this.notes.length;
      while(lo<hi){const mid=(lo+hi)>>>1;if(this.notes[mid].audio<time-this.longestDuration-.5)lo=mid+1;else hi=mid;}
      const active=[];
      ctx.save();ctx.beginPath();ctx.rect(left,fieldTop,right-left,impact-fieldTop);ctx.clip();
      for(let i=lo;i<this.notes.length&&this.notes[i].audio<=time+PREVIEW_SECONDS+.2;i++){
        const note=this.notes[i],geometry=noteGeometry(note,time,impact,speed);
        if(geometry.bottom<fieldTop||geometry.top>impact)continue;
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
      for(let i=lo;i<this.notes.length&&this.notes[i].audio<=time+.025;i++){
        const note=this.notes[i];if(time<note.audio-.025||time>note.endAudio+.45)continue;
        const key=byPitch.get(note.pitch),box=this.keyBox(key,left,whiteWidth);
        const color=this.follower.eventLightColor(note.velocity);
        const attack=clamp((time-note.audio)/.12,0,1);
        const release=time>note.endAudio?Math.exp(-(time-note.endAudio)*7):1;
        const intensity=(.42+.58*note.velocity/127)*(1-.26*attack)*release;
        active.push({key,box,color,intensity,age:time-note.audio});
      }
      // Key fill and luminous impact are separate from the existing notehead
      // glow. Neither effect hides or switches off the other.
      for(const hit of active){
        const {key,box,color,intensity}=hit;
        ctx.fillStyle=rgba(color,intensity*(key.black?.8:.43));
        ctx.fillRect(box.x+1,keyTop+2,box.w-2,keyHeight*(key.black?.67:1)-3);
        if(!this.settings.light)continue;
        const center=box.x+box.w/2,reach=whiteWidth*(key.black?2.5:3.2);
        const strength=clamp(this.settings.strength??1,0,4);
        const bloom=ctx.createRadialGradient(center,impact,1,center,impact,reach);
        bloom.addColorStop(0,rgba(color,.92*intensity*Math.min(strength,1.5)));
        bloom.addColorStop(.22,rgba(color,.38*intensity*Math.min(strength,1.8)));
        bloom.addColorStop(1,rgba(color,0));
        ctx.fillStyle=bloom;ctx.beginPath();ctx.ellipse(center,impact,reach,Math.max(22,h*.07),0,0,Math.PI*2);ctx.fill();
        ctx.save();ctx.globalCompositeOperation='screen';ctx.shadowColor=color;ctx.shadowBlur=18*strength;
        ctx.fillStyle=rgba(color,clamp(intensity*strength,0,1));
        ctx.fillRect(box.x+box.w*.12,impact-2,box.w*.76,3);ctx.restore();
        if(hit.age>=0&&hit.age<.3){
          const flare=(1-hit.age/.3)*intensity*strength;
          ctx.fillStyle=rgba(color,flare*.25);
          ctx.beginPath();ctx.ellipse(center,impact-h*.026,whiteWidth*1.1,h*.04,0,0,Math.PI*2);ctx.fill();
        }
      }
      ctx.restore();
    }
  }
  root.ScorePianoFall={PianoFall,keyLayout,noteGeometry};
})(typeof window==='undefined'?globalThis:window);
