/* Dynamic score layer over the shared composer's cached engraving. */
const makeCanvas=(width,height)=>{
  const canvas=typeof OffscreenCanvas==='undefined'?document.createElement('canvas'):new OffscreenCanvas(width,height);
  canvas.width=width;canvas.height=height;return canvas;
};
const place=(rect,base,sx,sy)=>[(rect.left-base.left)*sx,(rect.top-base.top)*sy,rect.width*sx,rect.height*sy];

export function createScoreGlowOverlay(stage,canvas){
  const ctx=canvas.getContext('2d'),headIds=new WeakMap(),sprites=new Map();
  const maxSpriteBytes=48*1024*1024;
  let nextHeadId=0,spriteCount=0,spriteBuildMs=0,spriteBytes=0,peakSpriteBytes=0;
  let evictions=0,activeHeads=0,particleCount=0;
  function cached(key){
    const value=sprites.get(key);
    if(value){sprites.delete(key);sprites.set(key,value);}
    return value;
  }
  function remember(key,value){
    const bytes=value.tile.width*value.tile.height*4;
    if(bytes>maxSpriteBytes)return value;
    while(spriteBytes+bytes>maxSpriteBytes&&sprites.size){
      const oldest=sprites.keys().next().value;
      const removed=sprites.get(oldest);sprites.delete(oldest);
      spriteBytes-=removed.tile.width*removed.tile.height*4;evictions++;
    }
    sprites.set(key,value);spriteBytes+=bytes;
    peakSpriteBytes=Math.max(peakSpriteBytes,spriteBytes);
    return value;
  }
  function headSprite(head,color,blur,width,height){
    let id=headIds.get(head);
    if(!id){id=++nextHeadId;headIds.set(head,id);}
    const style=head.closest('.score-window')?.dataset.notationStyle||'';
    const key=`h|${id}|${style}|${color}|${Math.round(blur*2)/2}|${Math.round(width)}|${Math.round(height)}`;
    const previous=cached(key);if(previous)return previous;
    const start=performance.now(),box=head.getBBox();
    if(!box.width||!box.height)return null;
    const factor=2,pad=Math.ceil(blur*factor*3+4);
    const tile=makeCanvas(Math.ceil(width*factor+pad*2),Math.ceil(height*factor+pad*2));
    const brush=tile.getContext('2d');
    const paths=[...head.querySelectorAll('path[d]')];
    if(head.matches('path[d]'))paths.unshift(head);
    if(!paths.length)return null;
    brush.translate(pad-box.x*width*factor/box.width,pad-box.y*height*factor/box.height);
    brush.scale(width*factor/box.width,height*factor/box.height);
    brush.fillStyle=color;brush.strokeStyle=color;
    brush.shadowColor=color;brush.shadowBlur=blur*factor;
    for(const path of paths){
      const glyph=new Path2D(path.getAttribute('d'));
      if(path.getAttribute('fill')!=='none')brush.fill(glyph);
      const strokeWidth=parseFloat(getComputedStyle(path).strokeWidth)||0;
      if(strokeWidth||path.getAttribute('fill')==='none'){
        brush.lineWidth=strokeWidth||1;brush.stroke(glyph);
      }
    }
    const result={tile,pad:pad/factor};
    remember(key,result);spriteCount++;
    spriteBuildMs+=performance.now()-start;
    return result;
  }
  function particleSprite(kind,color,length,height){
    const key=`p|${kind}|${color}|${Math.round(length*2)/2}|${Math.round(height*2)/2}`;
    const previous=cached(key);if(previous)return previous;
    const scale=2,pad=kind==='star'?15:12;
    const tile=makeCanvas(Math.ceil((length+pad*2)*scale),Math.ceil((height+pad*2)*scale));
    const brush=tile.getContext('2d');brush.translate(pad*scale,pad*scale);
    brush.shadowColor=color;brush.shadowBlur=(kind==='star'?6:4)*scale;
    if(kind==='star'){
      brush.fillStyle=color;brush.fillRect(0,0,length*scale,height*scale);
      brush.fillRect(length*.4*scale,-height*.8*scale,Math.max(1,scale),height*2.6*scale);
    }else{
      const gradient=brush.createLinearGradient(0,0,length*scale,0);
      gradient.addColorStop(0,'transparent');gradient.addColorStop(.5,color);gradient.addColorStop(1,'transparent');
      brush.fillStyle=gradient;brush.fillRect(0,0,length*scale,height*scale);
    }
    const result={tile,pad};remember(key,result);spriteCount++;
    return result;
  }
  function drawParticles(overlay,base,sx,sy){
    if(!overlay)return;
    for(const particle of overlay.children){
      const star=particle.classList.contains('note-star');
      if(!star&&!particle.classList.contains('note-trail'))continue;
      const rect=particle.getBoundingClientRect();if(!rect.width||!rect.height)continue;
      const [x,y,w,h]=place(rect,base,sx,sy),style=getComputedStyle(particle);
      const color=star?style.backgroundColor:(style.getPropertyValue('--score-glow').trim()||'#ffffff');
      const rotation=Number(particle.style.transform.match(/rotate\((-?[\d.]+)deg\)/)?.[1]||0)*Math.PI/180;
      const scale=Number(particle.style.transform.match(/scale\(([\d.]+)\)/)?.[1]||1);
      const shapeW=parseFloat(particle.style.width||style.width)*sx*scale;
      const shapeH=parseFloat(style.height)*sy*scale;
      const sprite=particleSprite(star?'star':'trail',color,shapeW,shapeH);
      ctx.save();ctx.globalAlpha=Number(style.opacity)||0;
      ctx.globalCompositeOperation=star?'source-over':'screen';
      ctx.translate(x+w/2,y+h/2);ctx.rotate(rotation);
      ctx.drawImage(sprite.tile,-shapeW/2-sprite.pad,-shapeH/2-sprite.pad,
        shapeW+2*sprite.pad,shapeH+2*sprite.pad);
      ctx.restore();particleCount++;
    }
  }
  return {
    draw(){
      if(!stage.settings.scoreVisible||stage.meta.has_score===false)return {heads:0,particles:0};
      const follower=stage.follower,base=stage.viewport.getBoundingClientRect(),region=stage.scoreWindow.getBoundingClientRect();
      if(!base.width||!base.height||!region.width||!region.height)return {heads:0,particles:0};
      const sx=stage.settings.width/base.width,sy=stage.settings.height/base.height;
      const beforeHeads=activeHeads,beforeParticles=particleCount;
      ctx.save();ctx.beginPath();ctx.rect(...place(region,base,sx,sy));ctx.clip();
      const seen=new Set();
      for(const {el,motionEl=el} of follower.activeNodes){
        if(seen.has(el))continue;seen.add(el);
        const glowing=el.classList.contains('score-glowing');
        const minimal=stage.settings.effects.minimalMode&&el.classList.contains('score-minimal-active');
        if(!glowing&&!minimal&&!motionEl.classList.contains('score-note-moving'))continue;
        const rect=el.getBoundingClientRect();
        if(!rect.width||!rect.height||rect.right<region.left||rect.left>region.right||rect.bottom<region.top||rect.top>region.bottom)continue;
        const style=getComputedStyle(el);
        const color=minimal?(style.getPropertyValue('--score-minimal-color').trim()||follower.colors().accent):glowing?(style.getPropertyValue('--score-note-active').trim()||follower.eventLightColor(80)):
          (getComputedStyle(el.querySelector('path')||el).fill||follower.colors().ink);
        const blur=glowing?(parseFloat(style.getPropertyValue('--score-glow-blur'))||3)*Math.max(sx,sy):0;
        const [x,y,w,h]=place(rect,base,sx,sy),sprite=headSprite(el,color,blur,w,h);
        if(!sprite)continue;
        ctx.drawImage(sprite.tile,x-sprite.pad,y-sprite.pad,w+2*sprite.pad,h+2*sprite.pad);
        activeHeads++;
      }
      if(!stage.settings.effects.minimalMode)drawParticles(follower.overlay,base,sx,sy);
      ctx.restore();
      return {heads:activeHeads-beforeHeads,particles:particleCount-beforeParticles};
    },
    stats(){return {spriteCount,spriteBuildMs:+spriteBuildMs.toFixed(2),spriteBytes,
      peakSpriteBytes,maxSpriteBytes,cacheEntries:sprites.size,evictions,activeHeads,particles:particleCount};},
    close(){sprites.clear();spriteBytes=0;}
  };
}
