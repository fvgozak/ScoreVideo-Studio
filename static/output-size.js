/* Output dimensions use the shorter edge; legacy presets migrate by meaning. */
(function(root){
  'use strict';
  const ratios={'16:9':[16,9],'9:16':[9,16],'1:1':[1,1],'4:5':[4,5],'3:4':[3,4],'4:3':[4,3],'21:9':[21,9]};
  const even=n=>2*Math.round(n/2);
  function size(aspect='16:9',quality=1080){
    const [a,b]=ratios[aspect]||ratios['16:9'];
    const short=Number(quality)===720?720:1080;
    return a>=b?{width:even(short*a/b),height:short}:{width:short,height:even(short*b/a)};
  }
  function migrate(resolution){
    const [width,height]=String(resolution||'').split('x').map(Number);
    if(!width||!height)return {aspect:'16:9',quality:1080};
    const quality=Math.min(width,height)<900?720:1080;
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
  const api={ratios,size,migrate};
  root.ScoreOutputSize=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
