/* Output dimensions use the shorter edge; legacy presets migrate by meaning. */
(function(root){
  'use strict';
  const ratios={'16:9':[16,9],'9:16':[9,16],'1:1':[1,1],'4:5':[4,5],'3:4':[3,4],'4:3':[4,3],'21:9':[21,9]};
  const even=n=>2*Math.round(n/2);
  function size(aspect='16:9',quality=1080,custom=[16,9]){
    const [a,b]=aspect==='custom'?custom:(ratios[aspect]||ratios['16:9']);
    const short=[720,1080,1440,2160].includes(Number(quality))?Number(quality):1080;
    return a>=b?{width:even(short*a/b),height:short}:{width:short,height:even(short*b/a)};
  }
  function migrate(resolution){
    const [width,height]=String(resolution||'').split('x').map(Number);
    if(!width||!height)return {aspect:'16:9',quality:1080};
    const edge=Math.min(width,height);
    const quality=[720,1080,1440,2160].reduce((best,item)=>Math.abs(item-edge)<Math.abs(best-edge)?item:best,720);
    const legacy={'1280x720':'16:9','1920x1080':'16:9','720x1280':'9:16','1080x1920':'9:16',
      '720x720':'1:1','1080x1080':'1:1','720x900':'4:5','1080x1350':'4:5',
      '720x960':'3:4','1080x1440':'3:4','960x720':'4:3','1440x1080':'4:3',
      '1680x720':'21:9','2520x1080':'21:9','2560x1080':'21:9'};
    const exact=legacy[`${width}x${height}`];
    if(exact)return {aspect:exact,quality};
    const ratio=width/height;
    const aspect=Object.keys(ratios).reduce((best,key)=>{
      const [a,b]=ratios[key],[c,d]=ratios[best];
      return Math.abs(a/b-ratio)<Math.abs(c/d-ratio)?key:best;
    },'16:9');
    return {aspect,quality};
  }
  // A project has a stable logical editing resolution, separate from its export quality.
  let designEdge=0;
  function restoreDesignEdge(saved,width,height){
    const n=Number(saved),short=Math.min(Number(width),Number(height));
    designEdge=Number.isFinite(n)&&n>=200&&n<=1080?Math.round(n):
      Number.isFinite(short)&&short>0?Math.max(200,Math.min(1080,Math.round(short))):1080;
    return designEdge;
  }
  function getDesignEdge(){return designEdge||1080;}
  function previewSize(width,height){
    const short=Math.min(width,height),edge=designEdge||restoreDesignEdge(null,width,height),scale=edge/short;
    return {width:Math.max(200,even(width*scale)),height:Math.max(200,even(height*scale))};
  }
  function layoutScale(width,height){
    const preview=previewSize(width,height);
    return Math.max(.5,Math.min(4,Math.min(width,height)/Math.min(preview.width,preview.height)));
  }
  const api={ratios,size,migrate,restoreDesignEdge,getDesignEdge,previewSize,layoutScale};
  root.ScoreOutputSize=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
