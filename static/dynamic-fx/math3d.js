/* Minimal independent 3D camera math. Matrices are column-major. */
export function perspective(fovy,aspect,near,far){
  const f=1/Math.tan(fovy/2),nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
}
export function lookAt(eye,center,up=[0,1,0]){
  const norm=(v)=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const z=norm(eye.map((v,i)=>v-center[i])),x=norm(cross(up,z)),y=cross(z,x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,
    -x.reduce((s,v,i)=>s+v*eye[i],0),-y.reduce((s,v,i)=>s+v*eye[i],0),-z.reduce((s,v,i)=>s+v*eye[i],0),1]);
}
export function mul4(a,b){const out=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)out[r+c*4]+=a[r+k*4]*b[k+c*4];return out;}

/** Camera for a piano plane: Z is optical depth; X/Y are keyboard coordinates. */
export function orthographic(left,right,bottom,top,near,far){
  const rl=1/(right-left),tb=1/(top-bottom),fn=1/(far-near);
  return new Float32Array([2*rl,0,0,0, 0,2*tb,0,0, 0,0,-2*fn,0,
    -(right+left)*rl,-(top+bottom)*tb,-(far+near)*fn,1]);
}
