/* Deterministic, CPU-side backdrop estimate for the keyboard material. */
const clamp=(value,low=0,high=1)=>Math.max(low,Math.min(high,value));
const mix=(a,b,t)=>a.map((value,i)=>value+(b[i]-value)*t);
export const srgbToLinear=value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4;
export const linearToSrgb=value=>value<=.0031308?value*12.92:1.055*value**(1/2.4)-.055;
export function linearColor(value,fallback='#202838'){
  const text=String(value||fallback).trim();
  const hex=text.match(/^#([\da-f]{6})$/i);
  if(hex)return [0,2,4].map(i=>srgbToLinear(parseInt(hex[1].slice(i,i+2),16)/255));
  const rgb=text.match(/^rgba?\(\s*([\d.]+)[, ]+\s*([\d.]+)[, ]+\s*([\d.]+)/i);
  return rgb?[1,2,3].map(i=>srgbToLinear(clamp(Number(rgb[i])/255))):linearColor(fallback,'#202838');
}
export const luminance=color=>color[0]*.2126+color[1]*.7152+color[2]*.0722;

// The stage's photo layer is rendered below the full-screen Dynamic FX canvas.
// A second WebGL background over the photo used to wash out light-palette
// images even when the score panel opacity was lowered (v17). Only the
// keyboard, falling notes and their emissive effects should cover the photo.
export function fxBackdropAlpha(effects={}){
  const url=String(effects?.backgroundUrl||'');
  const imageVisible=(url.startsWith('/api/projects/')||url.startsWith('blob:'))&&clamp(Number(effects?.backgroundOpacity??0))>0;
  return imageVisible?0:.94;
}

const images=new Map();
export function loadBackdropImage(url){
  if(!url)return Promise.resolve(null);
  if(!images.has(url))images.set(url,(async()=>{
    const response=await fetch(url);
    if(!response.ok)throw Error(`Background image HTTP ${response.status}`);
    const bitmap=await createImageBitmap(await response.blob());
    try{
      const scale=Math.min(1,96/Math.max(bitmap.width,bitmap.height));
      const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const context=canvas.getContext('2d',{willReadFrequently:true});
      context.drawImage(bitmap,0,0,width,height);
      return {width,height,pixels:context.getImageData(0,0,width,height).data,
        aspect:bitmap.width/bitmap.height};
    }finally{bitmap.close?.();}
  })().catch(error=>{images.delete(url);console.warn('Adaptive keyboard image sample failed:',error);return null;}));
  return images.get(url);
}

function imageColor(image,base,options,width,height){
  if(!image||!options.opacity)return base;
  const ratio=width/height,cover=options.fit!=='contain';
  const drawnWidth=(cover?Math.max(1,image.aspect/ratio):Math.min(1,image.aspect/ratio));
  const drawnHeight=drawnWidth*ratio/image.aspect;
  const left=(1-drawnWidth)*options.positionX/100,top=(1-drawnHeight)*options.positionY/100;
  let total=[0,0,0],count=0;
  for(let iy=0;iy<4;iy++)for(let ix=0;ix<12;ix++){
    const x=.08+(ix+.5)/12*.84,y=.59+(iy+.5)/4*.20;
    const u=(x-left)/drawnWidth,v=(y-top)/drawnHeight;
    let color=base;
    if(u>=0&&u<=1&&v>=0&&v<=1){
      const px=Math.min(image.width-1,Math.floor(u*image.width)),py=Math.min(image.height-1,Math.floor(v*image.height));
      const index=(py*image.width+px)*4,alpha=image.pixels[index+3]/255*options.opacity;
      color=mix(base,[0,1,2].map(i=>srgbToLinear(image.pixels[index+i]/255)),alpha);
    }
    for(let i=0;i<3;i++)total[i]+=color[i];
    count++;
  }
  return total.map(value=>value/count);
}

export function keyboardMaterialAt(time,context){
  const {lighting={},effects={},scene={},image=null,width=1920,height=1080,backgroundAlpha=.94}=context;
  const mode=['auto','manual','auto-offset'].includes(lighting.mode)?lighting.mode:'auto';
  const baseBrightness=clamp(Number(lighting.baseBrightness??1),.15,1.5);
  const sensitivity=clamp(Number(lighting.sensitivity??1),0,2);
  const offset=clamp(Number(lighting.offset??0),-.4,.4);
  let sceneColor=[0,0,0],weight=0;
  for(const [seconds,amount] of [[0,.38],[.08,.25],[.18,.18],[.32,.12],[.5,.07]]){
    const color=scene.animateBackground&&globalThis.ScoreStudio?.frame?
      globalThis.ScoreStudio.frame(scene,Math.max(0,time-seconds)).color:effects.paper;
    const sample=linearColor(color,'#fffdf6');
    for(let i=0;i<3;i++)sceneColor[i]+=sample[i]*amount;
    weight+=amount;
  }
  sceneColor=sceneColor.map(value=>value/weight);
  const photoColor=imageColor(image,sceneColor,{opacity:clamp(Number(effects.backgroundOpacity??0)),
    fit:effects.backgroundFit,positionX:clamp(Number(effects.backgroundPositionX??50),0,100),
    positionY:clamp(Number(effects.backgroundPositionY??50),0,100)},width,height);
  // The Dynamic FX transparent studio layer is composited over the image/palette.
  const studio=scene.animateBackground?sceneColor:linearColor('#26304d');
  const composed=mix(photoColor,studio,clamp(backgroundAlpha));
  const scoreInk=mix(linearColor(effects.paper,'#fffdf6'),linearColor(effects.staff,'#323a43'),.18);
  const panel=mix(scoreInk,
    linearColor(lighting.panelColor,'#0c1120'),clamp(Number(lighting.panelOpacity??0)));
  const backdrop=mix(composed,panel,lighting.scoreVisible===false?0:.12);
  const level=luminance(backdrop);
  const auto=mode==='manual'?1:clamp(1.3-sensitivity*.88*Math.sqrt(level),.62,1.38);
  const brightness=clamp(baseBrightness*auto+(mode==='auto-offset'?offset:0),.1,1.7);
  const temperature=lighting.temperatureSync===false?0:
    clamp((backdrop[0]-backdrop[2])/(backdrop[0]+backdrop[2]+.08),-.8,.8);
  return {white:clamp(brightness*Number(lighting.whiteBrightness??1),.08,1.85),
    black:clamp(brightness*Number(lighting.blackBrightness??1),.05,1.9),
    reflection:clamp(Number(lighting.reflectionStrength??1),0,2),
    tint:[1+.07*temperature,1+.01*temperature,1-.07*temperature],
    backgroundLuminance:level};
}
