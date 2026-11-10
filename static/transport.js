/* Pure keyboard-navigation helpers. Used by the editor and Node regression tests. */
(function(root){
  'use strict';
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));
  function shortcut(event){
    if(event.altKey||event.ctrlKey||event.metaKey||event.isComposing||event.keyCode===229)return null;
    const code=event.code||'';
    const key=event.key||'';
    if(code==='Space'||key===' '||key==='Spacebar')return 'play';
    if(code==='Comma'||key===','||key==='<')return 'previous-measure';
    if(code==='Period'||key==='.'||key==='>')return 'next-measure';
    if(code==='ArrowLeft'||key==='ArrowLeft')return 'back-five';
    if(code==='ArrowRight'||key==='ArrowRight')return 'forward-five';
    return null;
  }
  function isTextEditing(target){
    if(!target||typeof target.closest!=='function')return false;
    // Keep actual text entry usable; range/select/color/checkbox/button
    // MUST NOT swallow the application's keyboard shortcuts.
    return !!target.closest('textarea, input:not([type]), input[type="text"], input[type="search"], input[type="number"], input[type="email"], input[type="url"], input[type="password"], [contenteditable=""], [contenteditable="true"], [role="textbox"]');
  }
  function normalizedMeasures(measures){
    return (Array.isArray(measures)?measures:[]).map(m=>typeof m==='number'?m:m?.audio)
      .filter(t=>Number.isFinite(t)&&t>=0).sort((a,b)=>a-b)
      .filter((time,i,arr)=>i===0||time-arr[i-1]>0.02);
  }
  function seekMeasure(current,direction,measures,duration){
    const axis=normalizedMeasures(measures);
    if(!axis.length)return null;
    const now=Math.max(0,Number(current)||0);
    const end=Number.isFinite(duration)?Math.max(0,duration):Infinity;
    if(direction<0){
      // At an exact bar line, go to the preceding bar; otherwise return
      // to the start of the current bar. 120ms avoids floating noise.
      for(let i=axis.length-1;i>=0;i--){
        if(axis[i]<now-.12)return clamp(axis[i],0,end);
      }
      return 0;
    }
    for(const t of axis)if(t>now+.12)return clamp(t,0,end);
    return clamp(axis.at(-1),0,end);
  }
  function seekSeconds(current,delta,duration){
    return clamp((Number(current)||0)+delta,0,Number.isFinite(duration)?Math.max(0,duration):Infinity);
  }
  function currentMeasure(current,measures){
    const axis=normalizedMeasures(measures);
    if(!axis.length)return {index:0,total:0};
    let i=0;
    for(let j=0;j<axis.length;j++)if(axis[j]<=current+0.00001)i=j;else break;
    return {index:i+1,total:axis.length};
  }
  root.ScoreTransport={shortcut,isTextEditing,normalizedMeasures,seekMeasure,seekSeconds,currentMeasure};
})(typeof window!=='undefined'?window:globalThis);
if(typeof module!=='undefined')module.exports=globalThis.ScoreTransport;
