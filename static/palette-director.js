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
  // Ranges conform to fx-groups.js slider limits. Intentional visual
  // separation per design without touching particle/glow intensity presets.
  const KEYBOARD_LIGHTING=Object.freeze({
    paper:{mode:'auto-offset',baseBrightness:1.10,sensitivity:.65,brightnessOffset:.06,whiteBrightness:1.10,blackBrightness:1.05,reflectionStrength:.70},
    dark:{mode:'auto-offset',baseBrightness:.75,sensitivity:.90,brightnessOffset:-.06,whiteBrightness:.90,blackBrightness:.80,reflectionStrength:1.20},
    muted:{mode:'auto-offset',baseBrightness:.90,sensitivity:.85,brightnessOffset:0,whiteBrightness:1.00,blackBrightness:.85,reflectionStrength:.50},
    vivid:{mode:'auto-offset',baseBrightness:1.20,sensitivity:.95,brightnessOffset:.08,whiteBrightness:1.15,blackBrightness:1.10,reflectionStrength:1.40}
  });
  function keyboardLighting(id){return {...(KEYBOARD_LIGHTING[id]||KEYBOARD_LIGHTING.muted)};}
  root.ScorePaletteDirector={harmonize,keyboardLighting,calm,blend,lab,hexFromLab};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.ScorePaletteDirector;
})(typeof window!=='undefined'?window:globalThis);
