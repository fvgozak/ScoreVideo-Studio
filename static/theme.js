/* Standalone color palette generator; browser and Node compatible. */
(function(root){
 'use strict';
 const bound=(x,a,b)=>Math.min(b,Math.max(a,x));
 function rgb(hex){if(!/^#[0-9a-f]{6}$/i.test(hex||''))throw Error('Hex color must be #RRGGBB');return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);}
 function toHsl(hex){let [r,g,b]=rgb(hex),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,h=0,s=0,l=(max+min)/2;
  if(d){s=d/(1-Math.abs(2*l-1));switch(max){case r:h=((g-b)/d)%6;break;case g:h=(b-r)/d+2;break;default:h=(r-g)/d+4;}h=(h*60+360)%360;}
  return {h,s,l};}
 function hsl(h,s,l){h=((h%360)+360)%360;s=bound(s,0,1);l=bound(l,0,1);
  const a=s*Math.min(l,1-l);const f=n=>{let k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return '#'+[f(0),f(8),f(4)].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');}
 function trailPalette(hex){
  const c=toHsl(hex),dark=c.l<.33;
  const light=dark?.73:.48;
  // Upper follows the main hue; lower uses a distinct complementary accent.
  return {trailUpper:hsl(c.h-12,.85,light),trailLower:hsl(c.h+153,.80,dark?.74:.51)};
 }
 function auroraPalette(hex){const c=toHsl(hex);return {
    low:hsl(c.h+145,.86,.64),high:hsl(c.h+305,.91,.59)
  };}
 function palette(hex){const c=toHsl(hex);const dark=c.l<.33;
  const base=dark?{paper:hsl(c.h,Math.min(.37,c.s*.45+.12),.11),staff:hsl(c.h,Math.min(.24,c.s*.24+.04),.71),note:hsl(c.h,Math.min(.34,c.s*.3+.1),.94),accent:hsl(c.h,Math.max(.55,c.s),.69),glow:hsl(c.h+28,.82,.77),cursor:hsl(c.h+16,.65,.74)}:
  {paper:hsl(c.h,Math.min(.38,c.s*.33+.08),.95),staff:hsl(c.h,Math.min(.28,c.s*.32+.04),.33),note:hsl(c.h,Math.min(.44,c.s*.5+.09),.16),accent:hsl(c.h,Math.max(.48,c.s),.45),glow:hsl(c.h+22,.83,.59),cursor:hsl(c.h,Math.max(.47,c.s),.4)};
  return {...base,...trailPalette(hex),auroraLow:auroraPalette(hex).low,auroraHigh:auroraPalette(hex).high};
 }
 root.ScoreTheme={palette,trailPalette,auroraPalette,toHsl};
})(typeof module!=='undefined'&&module.exports?module.exports:window);
