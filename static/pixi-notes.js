/* GPU-only falling-note renderer. No CanvasRenderingContext2D, including fallbacks. */
(function(root){
 'use strict';
 const MODULE='/static/vendor/pixi-8.23.0.min.mjs';
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const color=h=>parseInt(/^#[\da-f]{6}$/i.test(h||'')?h.slice(1):'68ddfa',16);
 class NotesLayer{
   constructor(app,PIXI,viewport){
     this.app=app;this.PIXI=PIXI;this.viewport=viewport;
     this.canvas=app.canvas;this.canvas.className='piano-fall-canvas';
     this.canvas.setAttribute('aria-hidden','true');
     this.canvas.style.pointerEvents='none';
     viewport.appendChild(this.canvas);
     this.shade=new PIXI.Graphics();
     this.bars=new PIXI.Graphics();
     this.pedal=new PIXI.Graphics();
     app.stage.addChild(this.shade,this.bars,this.pedal);
     this.maskShape=new PIXI.Graphics();
     app.stage.addChild(this.maskShape);
     this.bars.mask=this.maskShape;
   }
   static async create(viewport){
     const PIXI=await import(MODULE),app=new PIXI.Application();
     await app.init({width:Math.max(1,viewport.clientWidth),height:Math.max(1,viewport.clientHeight),
       autoStart:false,resolution:1,backgroundAlpha:0,preserveDrawingBuffer:true,preference:'webgl',powerPreference:'high-performance'});
     app.ticker.stop();return new NotesLayer(app,PIXI,viewport);
   }
   draw({width,height,visible=true,minimal=false,shadeTop,keyTop,left,right,impact,bars,pedal,pedalColor}){
     const w=Math.max(1,Math.round(width)),h=Math.max(1,Math.round(height));
     if(this.app.renderer.width!==w||this.app.renderer.height!==h)this.app.renderer.resize(w,h);
     this.canvas.style.display=visible?'':'none';
     this.shade.clear();this.bars.clear();this.pedal.clear();this.maskShape.clear();
     if(!visible){this.app.render();return;}
     if(!minimal&&keyTop>shadeTop){
       const bands=20,span=keyTop-shadeTop;
       for(let i=0;i<bands;i++){
         const f=(i+.5)/bands,alpha=.88*Math.pow(f,2.15);
         this.shade.rect(0,shadeTop+span*i/bands,w,span/bands+1).fill({color:0x040812,alpha});
       }
     }
     this.maskShape.rect(Math.max(0,left),0,Math.max(0,Math.min(w,right)-Math.max(0,left)),Math.max(1,impact)).fill(0xffffff);
     for(const note of bars){
       if(note.height<.1||note.width<.1)continue;
       this.bars.roundRect(note.x-2,note.top-2,note.width+4,note.height+4,Math.min(6,note.width*.35)).fill({color:color(note.color),alpha:.16});
       this.bars.roundRect(note.x,note.top,note.width,note.height,Math.min(5,note.width*.35)).fill({color:color(note.color),alpha:.94});
     }
     if(pedal?.down&&minimal){this.pedal.rect(left,h-4,Math.max(0,right-left),4).fill({color:color(pedalColor),alpha:.85});}
     this.app.render();
   }
   dispose(){this.app.destroy(true,{children:true});}
 }
 root.ScorePixiNotes={NotesLayer};
})(window);
