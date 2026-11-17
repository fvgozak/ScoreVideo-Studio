/**
 * Independent keyboard mesh. World X/Y = key width/length, +Z = key crown.
 * Visual roles, not external assets: 0 ivory top, 1 ivory shell,
 * 2 ebony crown, 3 ebony side, 4 ebony slope, 5 lacquer case,
 * 6 ebony edge bevel, 7 ivory edge bevel.
 */
import {KEYBOARD} from './engine.js?v=aurora3';

export const HIT_Y = -0.81;
export const FRONT_Y = -2.27;

function faceNormal(a,b,c){
  const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
  const v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const len=Math.hypot(...n)||1; return n.map(c=>c/len);
}
function tri(out,a,b,c,key,role){
  const n=faceNormal(a,b,c);
  for(const v of [a,b,c])out.push(...v,...n,key,role);
}
function quad(out,a,b,c,d,key,role){tri(out,a,b,c,key,role);tri(out,a,c,d,key,role)}
function cube(out,x0,x1,y0,y1,z0,z1,key,topRole,sideRole){
  quad(out,[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],key,topRole);
  quad(out,[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],key,sideRole);
  quad(out,[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],key,sideRole);
  quad(out,[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],key,sideRole);
  quad(out,[x1,y1,z0],[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],key,sideRole);
}
function ivoryOutline(x0,x1,y0,y1,z,r){
  const a=[[x0+r,y0,z],[x1-r,y0,z]], segments=7;
  for(let k=1;k<=segments;k++){
    const t=-Math.PI/2+Math.PI/2*k/segments;
    a.push([x1-r+r*Math.cos(t),y0+r+r*Math.sin(t),z]);
  }
  a.push([x1,y1,z],[x0,y1,z],[x0,y0+r,z]);
  for(let k=1;k<segments;k++){
    const t=Math.PI+Math.PI/2*k/segments;
    a.push([x0+r+r*Math.cos(t),y0+r+r*Math.sin(t),z]);
  }
  return a;
}
function polygonCap(out,outline,key,role){
  const center=[outline.reduce((s,p)=>s+p[0],0)/outline.length,outline.reduce((s,p)=>s+p[1],0)/outline.length,outline[0][2]];
  for(let i=0;i<outline.length;i++)tri(out,center,outline[i],outline[(i+1)%outline.length],key,role);
}
function ring(out,base,top,key,role){
  for(let i=0;i<base.length;i++){
    const j=(i+1)%base.length;
    // Winding follows the normal of the outer body rather than top face.
    quad(out,base[i],base[j],top[j],top[i],key,role);
  }
}
function whiteKey(out,k,index){
  const half=k.width/2, x0=k.x-half, x1=k.x+half;
  // The undercap occupies the visible side wall. A slightly raised rounded
  // top and an independent bevel prevent the 'flat keyboard graphic' effect.
  cube(out,x0,x1,FRONT_Y,HIT_Y,-.047,.010,index,1,1);
  const radius=Math.min(.022,k.width*.13);
  const bottom=ivoryOutline(x0,x1,FRONT_Y,HIT_Y,.011,radius);
  const shoulder=ivoryOutline(x0+.0028,x1-.0028,FRONT_Y+.008,HIT_Y-.0015,.028,radius*.93);
  const crown=ivoryOutline(x0+.006,x1-.006,FRONT_Y+.017,HIT_Y-.0035,.038,radius*.84);
  ring(out,bottom,shoulder,index,1);
  ring(out,shoulder,crown,index,7);
  polygonCap(out,crown,index,0);
}
function blackKey(out,k,index){
  const half=k.width/2, x0=k.x-half, x1=k.x+half, y0=HIT_Y-k.length, y1=HIT_Y;
  const z0=.038,zShoulder=.128,zTop=.157,frontSlope=.082;
  const A=[x0,y0,z0],B=[x1,y0,z0],C=[x1,y1,z0],D=[x0,y1,z0];
  const E=[x0,y0+frontSlope,zShoulder],F=[x1,y0+frontSlope,zShoulder],G=[x1,y1,zShoulder],H=[x0,y1,zShoulder];
  quad(out,A,B,F,E,index,4); // polished 55-degree front slope
  quad(out,B,C,G,F,index,3);
  quad(out,D,A,E,H,index,3);
  quad(out,C,D,H,G,index,3);
  // Raised, softly inset ebony crown. The bevel produces its own highlight
  // instead of relying on a painted light line.
  const inset=.0105;
  const crown=[
    [x0+inset,y0+frontSlope+.013,zTop],
    [x1-inset,y0+frontSlope+.013,zTop],
    [x1-inset,y1-.009,zTop],
    [x0+inset,y1-.009,zTop],
  ];
  ring(out,[E,F,G,H],crown,index,6);
  quad(out,crown[0],crown[1],crown[2],crown[3],index,2);
}
export function buildKeyboard(){
  const out=[],width=KEYBOARD.totalWidth;
  // Satin lacquer case with a slim front lip and lateral cheek blocks.
  cube(out,-width/2-.23,width/2+.23,FRONT_Y-.205,HIT_Y+.09,-.35,-.092,-1,5,5);
  cube(out,-width/2-.31,width/2+.31,FRONT_Y-.225,FRONT_Y-.151,-.31,.071,-1,5,5);
  cube(out,-width/2-.35,-width/2-.13,FRONT_Y-.212,HIT_Y+.07,-.32,.155,-1,5,5);
  cube(out,width/2+.13,width/2+.35,FRONT_Y-.212,HIT_Y+.07,-.32,.155,-1,5,5);
  for(let i=0;i<KEYBOARD.keys.length;i++)if(!KEYBOARD.keys[i].black)whiteKey(out,KEYBOARD.keys[i],i);
  for(let i=0;i<KEYBOARD.keys.length;i++)if(KEYBOARD.keys[i].black)blackKey(out,KEYBOARD.keys[i],i);
  return new Float32Array(out);
}
