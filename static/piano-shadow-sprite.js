/* Cached piano impact shadow shared by preview and WebCodecs export. */
(function(root){
  'use strict';
  class ShadowSpriteCache {
    constructor({enabled=true,maxBytes=48*1024*1024,maxEntries=64}={}){
      this.enabled=enabled;this.maxBytes=maxBytes;this.maxEntries=maxEntries;
      this.tiles=new Map();this.bytes=0;this.peakBytes=0;
      this.creates=0;this.hits=0;this.evictions=0;this.buildMs=0;
    }
    draw(ctx,x,y,w,h){
      if(!this.enabled||typeof OffscreenCanvas==='undefined'||ctx.shadowBlur<=0||ctx.fillStyle!=='#ffffff'){
        ctx.fillRect(x,y,w,h);return false;
      }
      const blur=ctx.shadowBlur,color=ctx.shadowColor,alpha=ctx.globalAlpha;
      const composite=ctx.globalCompositeOperation;
      const spriteBlur=Math.max(1,Math.round(blur/2)*2);
      const spriteWidth=Math.max(1,Math.round(w*2)/2),spriteHeight=Math.max(1,Math.round(h*2)/2);
      const key=[color,composite,spriteBlur,spriteWidth,spriteHeight].join('|');
      let sprite=this.tiles.get(key);
      if(sprite){this.hits++;this.tiles.delete(key);this.tiles.set(key,sprite);}
      else{
        const started=performance.now(),pad=Math.ceil(spriteBlur*2+4);
        const tileWidth=Math.ceil(spriteWidth+pad*2),tileHeight=Math.ceil(spriteHeight+pad*2);
        if(tileWidth*tileHeight*4>this.maxBytes){ctx.fillRect(x,y,w,h);return false;}
        sprite=new OffscreenCanvas(tileWidth,tileHeight);
        const brush=sprite.getContext('2d');
        brush.globalCompositeOperation=composite;
        brush.shadowColor=color;brush.shadowBlur=spriteBlur;brush.fillStyle='#ffffff';
        brush.fillRect(pad,pad,spriteWidth,spriteHeight);
        sprite.pad=pad;
        const size=sprite.width*sprite.height*4;
        while(this.tiles.size&&(this.bytes+size>this.maxBytes||this.tiles.size>=this.maxEntries)){
          const oldest=this.tiles.keys().next().value,old=this.tiles.get(oldest);
          this.bytes-=old.width*old.height*4;this.tiles.delete(oldest);this.evictions++;
        }
        this.tiles.set(key,sprite);this.bytes+=size;
        this.peakBytes=Math.max(this.peakBytes,this.bytes);
        this.creates++;this.buildMs+=performance.now()-started;
      }
      ctx.shadowBlur=0;
      try{ctx.drawImage(sprite,x-sprite.pad,y-sprite.pad);}
      finally{ctx.globalAlpha=alpha;ctx.shadowBlur=blur;}
      return true;
    }
    clear(){this.tiles.clear();this.bytes=0;this.peakBytes=0;this.creates=0;this.hits=0;this.evictions=0;this.buildMs=0;}
    stats(){return {entries:this.tiles.size,bytes:this.bytes,peakBytes:this.peakBytes,
      creates:this.creates,hits:this.hits,evictions:this.evictions,buildMs:+this.buildMs.toFixed(2),
      maxBytes:this.maxBytes,maxEntries:this.maxEntries};}
  }
  root.ScorePianoShadowSprite={ShadowSpriteCache};
})(typeof window==='undefined'?globalThis:window);
