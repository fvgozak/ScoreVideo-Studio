/* One deterministic background texture bitmap for preview and video compositing. */
(function(root){
  'use strict';
  const modes=new Set(['paper','parchment','grain','linen','dots']);
  function render(host,mode,width,height){
    if(!host)return null;
    mode=modes.has(mode)?mode:'none';
    host.dataset.texture=mode;
    let canvas=host.querySelector('canvas.score-texture-canvas');
    if(mode==='none'){
      if(canvas)canvas.hidden=true;
      return null;
    }
    if(!canvas){canvas=document.createElement('canvas');canvas.className='score-texture-canvas';host.appendChild(canvas);}
    canvas.hidden=false;
    const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
    if(canvas.width===w&&canvas.height===h&&canvas.dataset.mode===mode)return canvas;
    canvas.width=w;canvas.height=h;canvas.dataset.mode=mode;
    const ctx=canvas.getContext('2d',{alpha:true});
    if(!ctx)return null;
    if(mode==='paper'||mode==='linen'){
      const vertical=mode==='paper'?6:5,horizontal=mode==='paper'?9:4;
      ctx.fillStyle=mode==='paper'?'rgba(84,72,48,.019)':'rgba(90,86,70,.033)';
      for(let x=0;x<w;x+=vertical)ctx.fillRect(x,0,1,h);
      ctx.fillStyle=mode==='paper'?'rgba(80,70,60,.014)':'rgba(90,86,70,.038)';
      for(let y=0;y<h;y+=horizontal)ctx.fillRect(0,y,w,1);
    }else if(mode==='parchment'){
      for(const [x,y,r,color] of [[w*.08,h*.12,Math.max(w,h)*.7,'rgba(147,92,34,.16)'],
        [w*.93,h*.91,Math.max(w,h)*.75,'rgba(116,67,21,.15)']]){
        const gradient=ctx.createRadialGradient(x,y,0,x,y,r);
        gradient.addColorStop(0,color);gradient.addColorStop(1,'rgba(116,67,21,0)');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      }
      ctx.fillStyle='rgba(126,81,38,.024)';
      for(let y=0;y<h;y+=9)ctx.fillRect(0,y,w,1);
    }else if(mode==='dots'){
      ctx.fillStyle='rgba(110,110,110,.105)';
      for(let y=1;y<h;y+=14)for(let x=1;x<w;x+=14){ctx.beginPath();ctx.arc(x,y,1,0,Math.PI*2);ctx.fill();}
    }else{
      let seed=0x5c0fe42d;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const count=Math.min(18000,Math.ceil(w*h/180));
      ctx.fillStyle='rgba(100,100,100,.045)';
      for(let i=0;i<count;i++)ctx.fillRect(Math.floor(random()*w),Math.floor(random()*h),1,1);
    }
    return canvas;
  }
  function drawGpu(graphics,mode,width,height){
    graphics.clear();
    const w=Math.max(1,width),h=Math.max(1,height);
    if(mode==='paper'||mode==='linen'){
      const paper=mode==='paper';
      for(let x=0;x<w;x+=paper?6:5)graphics.rect(x,0,1,h);
      graphics.fill({color:paper?0x544830:0x5a5646,alpha:paper?.019:.033});
      for(let y=0;y<h;y+=paper?9:4)graphics.rect(0,y,w,1);
      graphics.fill({color:paper?0x50463c:0x5a5646,alpha:paper?.014:.038});
    }else if(mode==='parchment'){
      for(const [x,y,r,color,alpha] of [[w*.08,h*.12,Math.max(w,h)*.7,0x935c22,.16],
        [w*.93,h*.91,Math.max(w,h)*.75,0x744315,.15]]){
        for(let ring=8;ring>=1;ring--){
          const size=r*ring/8;
          graphics.ellipse(x,y,size,size).fill({color,alpha:alpha/15});
        }
      }
      for(let y=0;y<h;y+=9)graphics.rect(0,y,w,1);
      graphics.fill({color:0x7e5126,alpha:.024});
    }else if(mode==='dots'){
      for(let y=0;y<h;y+=14)for(let x=0;x<w;x+=14)graphics.rect(x,y,2,2);
      graphics.fill({color:0x6e6e6e,alpha:.105});
    }else if(mode==='grain'){
      let seed=0x5c0fe42d;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const count=Math.min(18000,Math.ceil(w*h/180));
      for(let i=0;i<count;i++)graphics.rect(Math.floor(random()*w),Math.floor(random()*h),1,1);
      graphics.fill({color:0x646464,alpha:.045});
    }
  }
  root.ScoreBackgroundPattern={render,drawGpu};
})(typeof window==='undefined'?globalThis:window);
