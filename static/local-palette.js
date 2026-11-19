/* Client-only color extraction. Images never leave the browser. */
(function(root){
 'use strict';
 const THEMES={space:['우주','#4754A8','#8E5EC9','#1E274F'],sea:['바다','#247BA0','#48B6C7','#0F3B60'],
   forest:['숲','#367A55','#94BA62','#1F4536'],wood:['나무','#9A6640','#C99661','#593A2D']};
 const hsl=(h,s,l)=>{const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),m=l-c/2;
   const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
   return '#'+[r,g,b].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');};
 const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
 const rotate=(hex,degree,light=.6)=>{const [r,g,b]=rgb(hex).map(v=>v/255);const hi=Math.max(r,g,b),lo=Math.min(r,g,b),diff=hi-lo;
   const sat=diff===0?0:diff/(1-Math.abs(hi+lo-1));let hue=0;
   if(diff){hue=hi===r?((g-b)/diff)%6:hi===g?(b-r)/diff+2:(r-g)/diff+4;hue*=60;}
   return hsl((hue+degree+360)%360,Math.max(.35,Math.min(.86,sat)),light);};
 function recommendations(main,second,palette){
   const entries=[['paper','Gallery Paper','가독성 높은 밝은 악보','#fffdf6','#171b22','#343d4b',.12],
     ['dark','Midnight','사진에 어울리는 어두운 악보','#111b30','#f2f5fb','#abbcd2',.58],
     ['muted','Soft Canvas','절제된 색감과 따뜻한 질감','#e7e3dc','#26313a','#536570',.18],
     ['vivid','Vivid Contrast','선명한 음표와 색채 대비','#101a29','#f7f7ff','#b1c4d3',.50]];
   return {palette,primary:main,schemes:entries.map(([id,name,description,paper,ink,staff,panel_opacity])=>({
     id,name,description,panel_opacity,contrast:7,
     colors:{paper,background:paper,ink,staff,accent:main,glow:second,cursor:main,
       trail_upper:rotate(main,0,.65),trail_lower:rotate(second,125,.62),aurora_low:rotate(main,160,.60),
       aurora_high:rotate(second,350,.63),panel:paper}
   }))};
 }
 function theme(key){const entry=THEMES[key];if(!entry)throw Error('알 수 없는 색상 테마입니다.');
   const [name,main,accent,shadow]=entry;
   return recommendations(main,accent,[{name:`${name} 기본`,hex:main},{name:`${name} 강조`,hex:accent},{name:`${name} 그림자`,hex:shadow}]);
 }
 async function extract(file){
   if(!(file instanceof Blob)||file.size>20*1024*1024)throw Error('이미지는 20MB 이하여야 합니다.');
   const bitmap=await createImageBitmap(file);
   try{
     const side=96,canvas=document.createElement('canvas');canvas.width=side;canvas.height=side;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,side,side);
     const scale=Math.min(side/bitmap.width,side/bitmap.height),w=bitmap.width*scale,h=bitmap.height*scale;
     ctx.drawImage(bitmap,(side-w)/2,(side-h)/2,w,h);
     const pixels=ctx.getImageData(0,0,side,side).data;
     const groups=new Map();
     for(let i=0;i<pixels.length;i+=4){const [r,g,b]=pixels.slice(i,i+3);
       const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
       if(delta<20||max<35||max>244)continue;
       // Quantize to broad hue + value bands; reject near-neutral and over-exposed pixels.
       let hue=(max===r?60*((g-b)/delta%6):max===g?60*((b-r)/delta+2):60*((r-g)/delta+4)+360)%360;
       const bucket=`${Math.floor(hue/24)}:${Math.floor(max/64)}`;let item=groups.get(bucket);
       if(!item){item={count:0,r:0,g:0,b:0};groups.set(bucket,item);}
       item.count++;item.r+=r;item.g+=g;item.b+=b;
     }
     const palette=[...groups.values()].sort((a,b)=>b.count-a.count).slice(0,6).map((item,i)=>({
       name:`색상 ${i+1}`,hex:'#'+['r','g','b'].map(k=>Math.round(item[k]/item.count).toString(16).padStart(2,'0')).join('')}));
     if(!palette.length)palette.push({name:'중성',hex:'#667888'});
     return recommendations(palette[0].hex,palette[1]?.hex||rotate(palette[0].hex,145,.55),palette);
   }finally{bitmap.close?.();}
 }
 root.ScoreLocalPalette={theme,extract};
})(typeof window!=='undefined'?window:globalThis);
