/** Screen-space keyboard horizon light. Shared normalization for preview/export. */
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
export const BOUNDARY_STYLES=Object.freeze({
  none:0,clean:1,aurora:2,resonance:3,mist:4,prism:5,velvet:6,ripple:7,electric:8,
});
export function normalizeBoundaryLight(input={}){
  const value=input&&typeof input==='object'?input:{};
  const style=Object.hasOwn(BOUNDARY_STYLES,value.style)?value.style:'none';
  const hex=typeof value.color==='string'&&/^#[\da-f]{6}$/i.test(value.color)?value.color:'#73c9ed';
  const finite=(input,fallback)=>Number.isFinite(Number(input))?Number(input):fallback;
  return {style,styleId:BOUNDARY_STYLES[style],
    strength:clamp(finite(value.strength,0.8),0,2),
    thickness:clamp(finite(value.thickness,1.8),.5,5),
    reaction:clamp(finite(value.reaction,0.85),0,2),
    speed:clamp(finite(value.speed,1),0,2.5),
    colorMode:value.colorMode==='custom'?'custom':'palette',color:hex};
}
export function boundaryGeometry(camera,width,height,keyboardWidth,hitY=-.81,hitZ=.038){
  const portrait=height>width;
  const scale=clamp(Math.min(width/(portrait?1080:1920),height/(portrait?1920:1080)),.4,4);
  const left=.5+(-keyboardWidth/2-camera.focusX)/camera.visibleWidth;
  const right=.5+(keyboardWidth/2-camera.focusX)/camera.visibleWidth;
  // Camera strikeScreenY is top-down; WebGL NDC Y is bottom-up. Project the
  // *actual key crown* instead of guessing from a percentage (v7 drew the
  // stripe at the opposite side of the screen in portrait output).
  const m=camera.matrix;
  const projectedY=m[5]*hitY+m[9]*hitZ+m[13];
  return {y:clamp(projectedY,-1,1),
    left:clamp(left,0,1),right:clamp(right,0,1),
    scale,halfHeight:Math.ceil(82*scale)};
}
/** Select at most eight strongest illuminated keys; never scale work with MIDI note count. */
export function boundaryPulses(keyLights,keyX,camera,limit=8){
  const active=[];
  for(let i=0;i<keyX.length;i++){
    const strength=Math.max(0,Number(keyLights[i*4+3])||0);
    if(strength>.06){
      const x=.5+(keyX[i]-camera.focusX)/camera.visibleWidth;
      if(x>=-.06&&x<=1.06)active.push({x,strength,index:i});
    }
  }
  active.sort((a,b)=>b.strength-a.strength||a.index-b.index);
  const count=Math.min(limit,8,active.length),values=new Float32Array(16);
  for(let i=0;i<count;i++){
    values[i*2]=active[i].x;
    values[i*2+1]=clamp(active[i].strength/2,0,1);
  }
  return {count,values};
}
