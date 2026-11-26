/* ScoreMotion Color Director — palette-only, no renderer overrides.
 * Each recommendation preserves its source palette, while distributing
 * related, low-chroma colors to score, glow, keyboard and backdrop roles.
 */
(function(root){
  'use strict';
  const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
  const valid=s=>/^#[0-9a-f]{6}$/i.test(s||'');
  const srgb=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
  const rgb=v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
  function lab(hex){
    if(!valid(hex))return null;
    const [r,g,b]=[1,3,5].map(i=>srgb(parseInt(hex.slice(i,i+2),16)/255));
    const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b);
    const m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b);
    const s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
    return [.2104542553*l+.7936177850*m-.0040720468*s,
      1.9779984951*l-2.4285922050*m+.4505937099*s,
      .0259040371*l+.7827717662*m-.8086757660*s];
  }
  function hexFromLab([L,a,b]){
    const l=(L+.3963377774*a+.2158037573*b)**3;
    const m=(L-.1055613458*a-.0638541728*b)**3;
    const s=(L-.0894841775*a-1.2914855480*b)**3;
    const channels=[4.0767416621*l-3.3077115913*m+.2309699292*s,
      -1.2684380046*l+2.6097574011*m-.3413193965*s,
      -.0041960863*l-.7034186147*m+1.7076147010*s];
    const bytes=channels.map(v=>Math.round(clamp(rgb(v),0,1)*255));
    return '#'+bytes.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
  }
  // Reduce perceptual chroma while keeping the original image hue.
  function calm(hex,factor=1){const v=lab(hex);return v?hexFromLab([v[0],v[1]*factor,v[2]*factor]):hex;}
  function blend(hex,other,weight){
    const a=lab(hex),b=lab(other);return a&&b?hexFromLab(a.map((v,i)=>v*(1-weight)+b[i]*weight)):hex;
  }
  function harmonize(scheme){
    const c={...(scheme?.colors||{})};
    if(scheme?.color_director_version===3)return c; // V3 colors are already final.
    if(!valid(c.accent)||!valid(c.glow))return c;
    const mode=scheme?.id||'paper';
    const strength={paper:.70,dark:.77,muted:.52,vivid:.88}[mode]??.75;
    c.accent=calm(c.accent,Math.min(1,strength+.05));
    c.glow=calm(blend(c.glow,c.accent,mode==='vivid'?.15:.28),strength);
    if(valid(c.aurora_low))c.aurora_low=calm(blend(c.aurora_low,c.glow,.42),strength);
    if(valid(c.aurora_high))c.aurora_high=calm(blend(c.aurora_high,c.accent,.36),Math.min(1,strength+.09));
    if(valid(c.trail_upper))c.trail_upper=calm(blend(c.trail_upper,c.accent,.18),strength);
    if(valid(c.trail_lower))c.trail_lower=calm(blend(c.trail_lower,c.glow,.25),strength);
    return c;
  }
  // V3: analyze only on request, never in the preview/export frame loop.
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const chroma=v=>Math.hypot(v[1],v[2]);
  const toHex=(r,g,b)=>'#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
  function luminance(hex){const [r,g,b]=[1,3,5].map(i=>srgb(parseInt(hex.slice(i,i+2),16)/255));return .2126*r+.7152*g+.0722*b;}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  // Keep hue by reducing chroma until the requested lightness fits sRGB.
  function tone(v,L,C){
    L=clamp(L,0,1);const base=chroma(v),f=base>1e-7?C/base:0;
    let lo=0,hi=1;
    const fits=k=>{const a=v[1]*f*k,b=v[2]*f*k;
      const l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.2914855480*b)**3;
      return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.7076147010*s].every(x=>x>=-1e-7&&x<=1+1e-7);};
    if(fits(1))lo=1;else for(let i=0;i<15;i++){const k=(lo+hi)/2;if(fits(k))lo=k;else hi=k;}
    return hexFromLab([L,v[1]*f*lo,v[2]*f*lo]);
  }
  function legible(v,L,C,paper,target){
    const dark=luminance(paper)>.35;let result=tone(v,L,C);
    for(let i=0;i<100&&contrast(result,paper)<target;i++){L=clamp(L+(dark?-.01:.01),0,1);result=tone(v,L,C);}
    return contrast(result,paper)>=target?result:(dark?'#000000':'#FFFFFF');
  }
  function extractPixels(rgba){
    // Histogram uses the original RGB bytes, not rounded color bucket centers.
    const hist=new Map();let total=0;
    for(let i=0;i+3<rgba.length;i+=4){const a=rgba[i+3];if(a<80)continue;const key=(rgba[i]<<16)|(rgba[i+1]<<8)|rgba[i+2],w=a/255;hist.set(key,(hist.get(key)||0)+w);total+=w;}
    if(!total)throw Error('분석할 수 있는 불투명 픽셀이 없습니다.');
    const points=Array.from(hist,([key,w])=>{const hex=toHex(key>>16,(key>>8)&255,key&255);return {hex,w,v:lab(hex)};}).sort((a,b)=>b.w-a.w||a.hex.localeCompare(b.hex));
    // Deterministic weighted farthest-first initialization, then OKLab K-means.
    const centers=[points[0].v];
    const nearest=new Float64Array(points.length).fill(Infinity);
    while(centers.length<Math.min(9,points.length)){
      let best=-1,score=0;const last=centers[centers.length-1];
      for(let i=0;i<points.length;i++){nearest[i]=Math.min(nearest[i],distance(points[i].v,last));const q=nearest[i]**2*Math.sqrt(points[i].w);if(q>score){score=q;best=i;}}
      if(best<0||nearest[best]<.025)break;centers.push(points[best].v);
    }
    const assignment=new Int16Array(points.length);
    function assign(){const sums=centers.map(()=>[0,0,0,0]);for(let i=0;i<points.length;i++){const p=points[i];let best=0,d=Infinity;for(let j=0;j<centers.length;j++){const q=distance(p.v,centers[j]);if(q<d){d=q;best=j;}}assignment[i]=best;const s=sums[best];for(let j=0;j<3;j++)s[j]+=p.v[j]*p.w;s[3]+=p.w;}return sums;}
    for(let iteration=0;iteration<12;iteration++){const sums=assign();let shift=0;for(let j=0;j<centers.length;j++){const s=sums[j];if(!s[3])continue;const v=s.slice(0,3).map(x=>x/s[3]);shift=Math.max(shift,distance(v,centers[j]));centers[j]=v;}if(shift<.0005)break;}
    const sums=assign();
    // Preserve the original cluster index even when a center is empty.
    const all=centers.map((v,i)=>({v,w:sums[i][3],members:[]}));points.forEach((p,i)=>all[assignment[i]].members.push(p));
    const merged=all.filter(g=>g.w>0).sort((a,b)=>b.w-a.w);
    for(let i=0;i<merged.length;i++)for(let j=merged.length-1;j>i;j--){const a=merged[i],b=merged[j];if(distance(a.v,b.v)<.048){const w=a.w+b.w;a.v=a.v.map((x,k)=>(x*a.w+b.v[k]*b.w)/w);a.w=w;a.members.push(...b.members);merged.splice(j,1);}}
    // Use real sampled colors nearest to the centroid, not invented rounded RGB.
    const candidates=merged.sort((a,b)=>b.w-a.w).map(g=>{let best=g.members[0],d=Infinity;for(const p of g.members){const q=distance(p.v,g.v);if(q<d){d=q;best=p;}}return {hex:best.hex,v:best.v,weight:g.w/total};});
    const selected=[candidates.shift()];
    while(candidates.length&&selected.length<5){let index=0,best=-1;for(let i=0;i<candidates.length;i++){const p=candidates[i],d=Math.min(...selected.map(s=>distance(p.v,s.v)));const q=Math.sqrt(p.weight)*(.35+Math.min(1,d/.16));if(q>best){best=q;index=i;}}selected.push(candidates.splice(index,1)[0]);}
    return selected.map(({hex,weight},i)=>({name:`대표색 ${i+1}`,hex,weight}));
  }
  const DESIGNS=[
    ['paper','Gallery Paper','이미지 색감의 밝고 선명한 악보',.965,.91,.18,.40,.46,.49,.68,.10],
    ['dark','Midnight','이미지 색감의 깊고 어두운 악보',.225,.15,.96,.76,.78,.85,.83,.16],
    ['muted','Soft Canvas','이미지 색감의 부드러운 악보',.89,.82,.25,.43,.43,.45,.72,.08],
    ['vivid','Vivid Contrast','이미지 색감의 선명한 색채 대비',.23,.145,.955,.72,.72,.76,.83,.30]
  ];
  function recommend(palette){
    const clean=palette.filter(p=>valid(p.hex));if(!clean.length)throw Error('유효한 색상이 없습니다.');
    const entries=clean.map((p,i)=>({...p,v:lab(p.hex),w:Number.isFinite(p.weight)?Math.max(0,p.weight):1/(i+1)}));
    const dominant=entries[0];
    const colorful=entries.slice().sort((a,b)=>(chroma(b.v)*Math.sqrt(b.w))-(chroma(a.v)*Math.sqrt(a.w)))[0];
    const alternate=entries.slice().sort((a,b)=>rank(b)-rank(a))[0];
    function rank(e){return Math.sqrt(e.w)*(Math.min(.25,distance(e.v,colorful.v))+.04)*(chroma(e.v)>.025?1:.35);}
    const anchor=chroma(dominant.v)>.025?dominant.v:colorful.v;
    const c=chroma(anchor),a=chroma(colorful.v),b=chroma(alternate.v);
    const schemes=DESIGNS.map(([id,name,description,pL,bL,iL,sL,aL,gL,panel_opacity,strength])=>{
      const dark=pL<.5;
      const paper=tone(anchor,pL,Math.min(dark?.075:.045,c*strength));
      const background=tone(anchor,bL,Math.min(.09,c*(strength+.10)));
      const ink=legible(anchor,iL,Math.min(.028,c*.13),paper,7);
      const staff=legible(anchor,sL,Math.min(.045,c*.22),paper,4.5);
      const factor=id==='muted'?.60:id==='vivid'?1:.82;
      const accent=legible(colorful.v,aL,a*factor,paper,3);
      const glow=legible(alternate.v,gL,b*factor,paper,3);
      const high=tone(colorful.v,id==='vivid'?.77:.83,a*factor),low=tone(alternate.v,id==='vivid'?.55:.58,b*factor);
      return {id,name,description,panel_opacity,color_director_version:3,contrast:contrast(ink,paper),colors:{paper,background,ink,staff,accent,glow,cursor:accent,panel:paper,trail_upper:glow,trail_lower:accent,aurora_low:low,aurora_high:high}};
    });
    return {palette:clean,primary:dominant.hex,schemes};
  }
  async function extract(file){
    const bitmap=await createImageBitmap(file);
    try{const scale=Math.min(1,128/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);return recommend(extractPixels(ctx.getImageData(0,0,canvas.width,canvas.height).data));}finally{bitmap.close?.();}
  }
  // Ranges conform to fx-groups.js slider limits. Intentional visual
  // separation per design without touching particle/glow intensity presets.
  const KEYBOARD_LIGHTING=Object.freeze({
    paper:{mode:'auto-offset',baseBrightness:1.10,sensitivity:.65,brightnessOffset:.06,whiteBrightness:1.10,blackBrightness:1.05,reflectionStrength:.70},
    dark:{mode:'auto-offset',baseBrightness:.75,sensitivity:.90,brightnessOffset:-.06,whiteBrightness:.90,blackBrightness:.80,reflectionStrength:1.20},
    muted:{mode:'auto-offset',baseBrightness:.90,sensitivity:.85,brightnessOffset:0,whiteBrightness:1.00,blackBrightness:.85,reflectionStrength:.50},
    vivid:{mode:'auto-offset',baseBrightness:.95,sensitivity:.95,brightnessOffset:0,whiteBrightness:1.00,blackBrightness:.90,reflectionStrength:1.15}
  });
  function keyboardLighting(id){return {...(KEYBOARD_LIGHTING[id]||KEYBOARD_LIGHTING.muted)};}
  root.ScorePaletteDirector={harmonize,keyboardLighting,calm,blend,lab,hexFromLab,extractPixels,recommend,extract,contrast};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ScorePaletteDirector;
})(typeof window!=='undefined'?window:globalThis);
