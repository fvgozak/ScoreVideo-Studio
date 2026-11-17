/* Original GLSL ES 3.00 materials for ScoreMotion Dynamic FX. */
export const FULLSCREEN_VERT=`#version 300 es
precision highp float;
out vec2 vUV;
void main(){vec2 p=vec2((gl_VertexID << 1)&2,gl_VertexID&2);vUV=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;
export const BACKGROUND_FRAG=`#version 300 es
precision highp float;
in vec2 vUV;out vec4 frag;
uniform float uTime;uniform vec2 uResolution;uniform float uBackgroundAlpha;
uniform vec3 uPaletteColor;uniform float uPaletteBackground;uniform int uTextureMode;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
 vec2 p=vUV; float v=pow(1.-abs(p.x-.5)*1.28,1.8);
 vec3 low=vec3(.022,.029,.061),high=vec3(.036,.061,.11);
 vec3 c=mix(low,high,smoothstep(.06,.95,p.y))*(.53+.51*v);
 float aur=pow(max(0.,1.-abs(p.y-(.54+.04*sin(p.x*8.+uTime*.07)))*5.4),3.);
 if(uPaletteBackground>.5)c=uPaletteColor*(.87+.13*v);
 c+=vec3(.035,.030,.086)*aur*v;
 vec2 cell=floor((p-.02)*vec2(110.,63.));float star=step(.9965,hash(cell));
 vec2 f=fract((p-.02)*vec2(110.,63.))-.5;
 star*=smoothstep(.3,0.,length(f));
 c+=star*vec3(.24,.36,.62)*(.4+.5*sin(uTime*.6+hash(cell)*20.));
 float floorGlow=exp(-pow((p.y-.225)/.16,2.));
 c+=vec3(.011,.016,.035)*floorGlow;
 vec2 pixel=floor(p*uResolution);
 if(uTextureMode==1){
   if(mod(pixel.x,6.)<1.)c=mix(c,vec3(.33,.28,.19),.019);
   if(mod(pixel.y,9.)<1.)c=mix(c,vec3(.31,.27,.24),.014);
 }else if(uTextureMode==2){
   float a=.16*pow(max(0.,1.-distance(p,vec2(.08,.12))/.7),1.4);
   a+=.15*pow(max(0.,1.-distance(p,vec2(.93,.91))/.75),1.4);
   c=mix(c,vec3(.51,.31,.12),clamp(a,0.,.22));
   if(mod(pixel.y,9.)<1.)c=mix(c,vec3(.49,.32,.15),.024);
 }else if(uTextureMode==3){
   if(hash(pixel)<.01)c=mix(c,vec3(.39),.045);
 }else if(uTextureMode==4){
   if(mod(pixel.x,5.)<1.)c=mix(c,vec3(.35,.34,.27),.033);
   if(mod(pixel.y,4.)<1.)c=mix(c,vec3(.35,.34,.27),.038);
 }else if(uTextureMode==5){
   if(distance(mod(pixel,14.),vec2(1.))<=1.)c=mix(c,vec3(.43),.105);
 }
 frag=vec4(c,uBackgroundAlpha);
}`;
export const GEOMETRY_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
layout(location=2) in float aKey;
layout(location=3) in float aRole;
uniform mat4 uVP;uniform float uKeyPress[88];
out vec3 vN;out vec3 vP;out float vPress;
flat out int vKey;flat out int vRole;
void main(){
  vec3 position=aP;
  int key=int(aKey+.1);
  if(key>=0&&key<88){
    float pressure=clamp(uKeyPress[key],0.,1.);
    // The front of an acoustic piano key travels further than its pivot.
    // A short release tail is smoothed on the CPU, never animated by FPS.
    float depth=clamp((-.81-aP.y)/1.46,0.,1.);
    position.z-=pressure*(.014+.108*depth);
    vPress=pressure;
  }
  vN=aN;vP=position;vKey=key;vRole=int(aRole+.1);
  gl_Position=uVP*vec4(position,1.);
}`;
export const GEOMETRY_FRAG=`#version 300 es
precision highp float;
in vec3 vN;in vec3 vP;in float vPress;
flat in int vKey;flat in int vRole;
out vec4 frag;
uniform vec4 uKeyLight[88];uniform float uKeyX[88];
uniform float uGlowGain;uniform float uTime;
uniform float uCustomKeys;uniform vec3 uWhiteKey;uniform vec3 uBlackKey;
uniform float uWhiteBrightness;uniform float uBlackBrightness;
uniform float uReflectionGain;uniform vec3 uSurfaceTint;
float gauss(float x,float sigma){float v=x/max(sigma,.001);return exp(-v*v);}
int blackAt(int idx){int p=(idx+21)%12;return (p==1||p==3||p==6||p==8||p==10)?1:0;}
void main(){
 vec3 n=normalize(vN);
 vec3 lightDir=normalize(vec3(-.36,-.35,1.));
 vec3 eyeDir=normalize(vec3(.0,-.17,1.));
 float ndl=max(0.,dot(n,lightDir));
 float specAngle=max(0.,dot(n,normalize(lightDir+eyeDir)));
 float rough=vRole==2?.23:vRole==6?.29:vRole==0?.51:vRole==7?.45:.72;
 float shininess=mix(120.,14.,rough);
 float sheen=pow(specAngle,shininess);
 vec3 col;
 if(vRole==0)col=vec3(.876,.868,.848);          // warm ivory crown
 else if(vRole==1)col=vec3(.675,.678,.686);     // translucent plastic sidewall
 else if(vRole==7)col=vec3(.815,.821,.814);     // ivory chamfer
 else if(vRole==2)col=vec3(.022,.027,.038);     // polished ebony top
 else if(vRole==3)col=vec3(.019,.023,.034);     // ebony dark side
 else if(vRole==4)col=vec3(.060,.068,.082);     // sloped black-key nose
 else if(vRole==6)col=vec3(.073,.082,.097);     // ebony edge catch-light
 else col=vec3(.019,.025,.037);                 // piano lacquer
 if(uCustomKeys>.5){
   if(vRole==0)col=uWhiteKey;
   else if(vRole==1)col=uWhiteKey*.77;
   else if(vRole==7)col=uWhiteKey*.92;
   else if(vRole==2)col=uBlackKey;
   else if(vRole==3)col=uBlackKey*.85;
   else if(vRole==4||vRole==6)col=uBlackKey*1.25;
 }
 col*=.70+.33*ndl;
 if(vRole==0){
   float dx=abs(vP.x-uKeyX[vKey])/.116;
   float edge=smoothstep(.77,1.,dx);
   col*=1.-.069*edge;
   // Soft reflection from studio strip lighting, at slightly different
   // angles for each key. No texture assets required.
   float strip=gauss((vP.x-uKeyX[vKey])/.116+.27*vP.y+.14,.18);
   col+=vec3(.040,.045,.048)*strip*uReflectionGain;
   // Shadow from each adjacent raised black key, with a soft front falloff.
   float shadow=0.;
   for(int k=-1;k<=1;k+=2){
      int other=vKey+k;
      if(other>=0&&other<88&&blackAt(other)==1){
         float xdiff=vP.x-uKeyX[other];
         float frontDist=max(0.,(-.81-.90)-vP.y);
         float span=gauss(xdiff,.11+frontDist*.12);
         float longitudinal=smoothstep(-.81-1.17,-.81-.89,vP.y);
         shadow=max(shadow,span*(.40+.60*longitudinal));
      }
   }
   col*=1.-.14*shadow;
   // Just perceptible satin micrograin, screen-space derivatives stay tiny.
   col+=.0024*sin(vP.y*248.+float(vKey)*19.9);
   col+=vec3(.047)*sheen*uReflectionGain;
 }else if(vRole==7){col+=vec3(.084,.077,.068)*sheen*uReflectionGain;}
 else if(vRole==1){col*=.94+0.06*smoothstep(-2.27,-.81,vP.y);col+=vec3(.011)*sheen*uReflectionGain;}
 else if(vRole==2){
   float dx=abs(vP.x-uKeyX[vKey])/.0725;
   // A narrow curved studio-box reflection makes ebony look lacquered,
   // rather than light grey blocks painted over the whites.
   float highlight=gauss(dx-.34,.095)*.105+gauss(dx+.36,.13)*.038;
   col+=vec3(.79,.83,.92)*highlight*uReflectionGain;
   col+=vec3(.14,.16,.20)*sheen*uReflectionGain;
   col*=1.-.11*smoothstep(.78,1.,dx);
 }else if(vRole==4){col+=vec3(.055,.061,.073)*sheen*uReflectionGain;}
 else if(vRole==6){col+=vec3(.12,.13,.15)*sheen*uReflectionGain;}
 else if(vRole==5){
   float line=gauss(fract(vP.y*2.7)-.5,.09);
   col+=vec3(.010,.015,.025)*line;
   col+=vec3(.09)*sheen*uReflectionGain;
 }
 if(vRole==0||vRole==1||vRole==7)col*=uSurfaceTint*uWhiteBrightness;
 else if(vRole==2||vRole==3||vRole==4||vRole==6)col*=uSurfaceTint*uBlackBrightness;
 if(vKey>=0&&vKey<88){
   vec3 accumulated=vec3(0.);float energy=0.;
   for(int k=-2;k<=2;k++){
     int idx=clamp(vKey+k,0,87);
     vec4 light=uKeyLight[idx];
     float dx=vP.x-uKeyX[idx];
     float spot=gauss(dx,vRole==0?.23:.18)*gauss(vP.y+.84,.62);
     float amp=min(light.a,3.4)*spot;
     energy+=amp;accumulated+=light.rgb*amp;
   }
   float response=1.-exp(-energy*.24*max(0.,uGlowGain));
   if(energy>.0001){
      vec3 tint=accumulated/energy;
      float materialResponse=vRole==0?.59:vRole==7?.47:vRole==2?.58:.28;
      col=mix(col,tint*.73+col*.48,clamp(response*materialResponse,0.,.67));
   }
   // Recessed keys catch less overhead light and expose a darker front edge.
   float front=clamp((-.81-vP.y)/1.46,0.,1.);
   col*=1.-vPress*front*(vRole==0||vRole==2?.16:.24);
   if(uKeyLight[vKey].a>.001 && (vRole==0||vRole==2||vRole==7||vRole==6)){
     // A held key glows on its own crown, including the visible front edge.
     // This follows Note On/Off pressure rather than the longer light tail.
     vec3 keyColor=uKeyLight[vKey].rgb;
     float frontY=vRole==2||vRole==6?-1.42:-2.08;
     float band=gauss(vP.y-frontY,vRole==2||vRole==6?.19:.25);
     // Keep the Aurora hue legible on ivory as well as ebony. A weak wash
     // under the bright studio material previously looked almost white.
     float wash=vRole==0||vRole==2?.34:.20;
     float power=vPress*clamp(uKeyLight[vKey].a*.65,.35,1.);
     col=mix(col,keyColor,clamp(power*(wash+.60*band),0.,.85));
     col+=keyColor*power*band*.10;
   }
 }
 frag=vec4(max(col,vec3(0.)),1.);
}`;
export const NOTE_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aColor;
layout(location=2) in vec2 aUV;
uniform mat4 uVP;
out vec3 vColor;out vec2 vUV;out float vHeight;
void main(){vColor=aColor;vUV=aUV;gl_Position=uVP*vec4(aP,1.);}`;
export const NOTE_FRAG=`#version 300 es
precision highp float;
in vec3 vColor;in vec2 vUV;out vec4 frag;
uniform float uEmissionMode;
void main(){
  // Rounded clear-resin strip: transparent sides, slender inner highlight,
  // and softened head/tail. The fragment itself never has square glow edges.
  float side=smoothstep(0.,.07,vUV.x)*(1.-smoothstep(.93,1.,vUV.x));
  float endcap=smoothstep(0.,.027,vUV.y)*(1.-smoothstep(.973,1.,vUV.y));
  float edgeSoft=side*endcap;
  float longGrad=.25+.29*pow(1.-vUV.y,.68);
  float sideRim=pow(max(0.,1.-abs(vUV.x-.08)/.12),3.);
  float frontLine=exp(-pow((vUV.x-.24)/.042,2.));
  float rim=smoothstep(.80,.99,vUV.x)*.18+smoothstep(.0,.10,vUV.x)*.15;
  vec3 surface=vColor*longGrad+mix(vColor,vec3(.91,.94,1.),.20)*frontLine*.12;
  surface+=vec3(.045,.06,.09)*rim;
  surface+=vColor*max(0.,sideRim)*.10;
  if(uEmissionMode>.5){
    // Only a weak chromatic rim blooms, not the entire falling-note bar.
    frag=vec4(vColor*(.12+.18*frontLine),edgeSoft*.35);
  }else{
    frag=vec4(surface,edgeSoft*.89);
  }
}`;
export const SPRITE_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aColor;
layout(location=2) in float aAlpha;
layout(location=3) in float aSize;
layout(location=4) in float aKind;
layout(location=5) in float aAge;
uniform mat4 uVP;uniform float uPixelScale;
out vec3 vColor;out float vAlpha;flat out int vKind;out float vAge;
void main(){
 gl_Position=uVP*vec4(aP,1.);// Orthographic camera: gl_Position.w is 1.  The former 13/4 factor
 // turned 45 px flashes into 146+ px sprites and hid the entire keyboard.
 gl_PointSize=clamp(aSize*uPixelScale,1.,112.);
 vColor=aColor;vAlpha=aAlpha;vKind=int(aKind+.1);vAge=aAge;
}`;
export const SPRITE_FRAG=`#version 300 es
precision highp float;
in vec3 vColor;in float vAlpha;flat in int vKind;in float vAge;
out vec4 frag;
void main(){
 vec2 uv=gl_PointCoord*2.-1.;float r=length(uv);
 float shape=0.; vec3 tint=vColor;
 if(vKind==3){
   // Tightly localized attack: soft oval atmosphere + small chromatic core.
   vec2 p=uv*vec2(1.,1.42);
   float bloom=exp(-dot(p,p)*5.8);
   float core=exp(-dot(p,p)*40.);
   shape=(.20*bloom+.77*core)*(1.-smoothstep(.78,1.,r));
   // Preserve MIDI-derived hue even in the brightest impact core.
   tint=mix(vColor,vec3(.94,.95,1.),core*.07);
 } else if(vKind==1){
   // Tapered, glistening fibre. Unlike a rectangular sprite this fades on
   // every edge and its visible length varies with particle age.
   float width=exp(-pow(uv.x*12.,2.));
   float tip=smoothstep(-1.,-.13,uv.y)*(1.-smoothstep(.38,1.,uv.y));
   shape=width*tip*.69;
 } else if(vKind==2){
   // Slow wispy volume, almost transparent, behind the bright dots.
   vec2 p=uv*vec2(.9,1.18);
   shape=exp(-dot(p,p)*3.4)*.22*(1.-smoothstep(.7,1.,r));
 } else {
   float core=exp(-r*r*18.);
   shape=(.58*exp(-r*r*5.7)+.42*core)*(1.-smoothstep(.78,1.,r));
   tint=mix(vColor,vec3(.94,.96,1.),.05*core);
 }
 float fade=1.-smoothstep(.74,1.,vAge);
 float alpha=shape*clamp(vAlpha,0.,1.)*fade;
 if(alpha<.0009)discard;
 frag=vec4(tint,alpha);
}`;
export const LINE_VERT=`#version 300 es
precision highp float;
layout(location=0) in vec3 aP;layout(location=1) in vec2 aUV;
uniform mat4 uVP;
out vec2 vUV;
void main(){vUV=aUV;gl_Position=uVP*vec4(aP,1.);}`;
export const LINE_FRAG=`#version 300 es
precision highp float;
in vec2 vUV;out vec4 frag;
uniform float uIntensity;uniform vec3 uColor;
void main(){float y=abs(vUV.y-.5)*2.;float a=exp(-y*y*60.)*.5+exp(-y*y*800.)*.7;
 float x=smoothstep(0.,.018,vUV.x)*smoothstep(0.,.018,1.-vUV.x);
 vec3 c=mix(uColor*.36,uColor,1.-y)*uIntensity;
 frag=vec4(c,a*x*uIntensity);}`;
// Keyboard/body boundary: a clipped WebGL2 ribbon, composited into scene +
// emissive pass. Time comes from the MIDI transport (seek/export deterministic).
export const BOUNDARY_VERT=`#version 300 es
precision highp float;
out vec2 vUV;
uniform float uCenterY;uniform float uHalfHeight;uniform vec2 uResolution;
void main(){
  vec2 p=vec2(float((gl_VertexID==1||gl_VertexID==2||gl_VertexID==4)?1:0),
              float((gl_VertexID==2||gl_VertexID==4||gl_VertexID==5)?1:0));
  vUV=p;
  gl_Position=vec4(p.x*2.-1.,uCenterY+(p.y*2.-1.)*uHalfHeight*2./uResolution.y,0.,1.);
}`;
export const BOUNDARY_FRAG=`#version 300 es
precision highp float;
in vec2 vUV;out vec4 frag;
uniform int uStyle;uniform float uStrength;uniform float uThickness;
uniform float uReaction;uniform float uScale;uniform float uHalfHeight;
uniform float uTime;uniform float uSpeed;
uniform vec2 uResolution;uniform vec2 uKeyboardRange;
uniform vec3 uColorLow;uniform vec3 uColorHigh;
uniform float uEmissionMode;uniform vec2 uPulses[8];uniform int uPulseCount;
float gauss(float x,float size){float q=x/max(size,.01);return exp(-q*q);}
float hash1(float n){return fract(sin(n*127.13+31.7)*43758.5453);}
void main(){
  // Positive px is above the ivory key edge in GL's bottom-up coordinates.
  float px=(vUV.y-.5)*uHalfHeight*2.;
  float x=vUV.x;
  float left=smoothstep(uKeyboardRange.x,uKeyboardRange.x+2./uResolution.x,x);
  float right=1.-smoothstep(uKeyboardRange.y-2./uResolution.x,uKeyboardRange.y,x);
  float coverage=left*right;
  if(coverage<.001||uStyle==0||uStrength<.001)discard;
  float range=max(.0001,uKeyboardRange.y-uKeyboardRange.x);
  float t=clamp((x-uKeyboardRange.x)/range,0.,1.);
  float xp=x*uResolution.x;
  float tm=uTime*uSpeed;
  float size=max(.6,uThickness*uScale);
  float wave=sin(xp*.035-tm*2.7)*1.35*uScale+sin(xp*.074+tm*1.8)*.65*uScale;
  float core=gauss(px-wave,size);
  float glow=gauss(px,size*5.5);
  float alpha=0.;vec3 color=mix(uColorLow,uColorHigh,.5);
  float pulse=0.;
  if(uStyle==3||uStyle==7||uStyle==8){
    for(int i=0;i<8;i++){
      if(i>=uPulseCount)break;
      float dx=(x-uPulses[i].x)*uResolution.x;
      pulse+=uPulses[i].y*gauss(dx,26.*uScale);
    }
    pulse=clamp(pulse*uReaction,0.,1.3);
  }
  if(uStyle==1){ // clean: restrained polished edge
    alpha=.45*gauss(px,size)+.13*glow;
  }else if(uStyle==2){ // aurora: an understated moving gradient
    float flowingT=clamp(t+.09*sin(t*11.-tm*.85),0.,1.);
    color=mix(uColorLow,uColorHigh,smoothstep(0.,1.,flowingT));
    alpha=.34*core+.14*gauss(px,size*8.)+.07*gauss(px-7.*uScale,9.*uScale)*(.5+.5*sin(xp*.04-tm*1.9));
  }else if(uStyle==3){ // resonance: key-local MIDI reaction
    color=mix(uColorLow,uColorHigh,clamp(.38+.40*pulse,0.,1.));
    alpha=.14*core+.065*glow+pulse*(.48*core+.20*gauss(px,9.*uScale));
  }else if(uStyle==4){ // mist: slow breathing light haze
    float haze=gauss(px-14.*uScale-wave*1.5,24.*uScale)*smoothstep(-3.*uScale,8.*uScale,px);
    alpha=.21*core+.09*glow+.21*haze*(.82+.18*sin(xp*.027-tm*1.2));
  }else if(uStyle==5){ // prism: three distinct spectral rims
    vec3 rays=uColorLow*gauss(px-size*1.6,size*.55)*.31
             +uColorHigh*gauss(px+size*1.6,size*.55)*.31
             +vec3(.82,.91,1.)*gauss(px,size*.55)*.45;
    float amount=gauss(px-size*1.6,size*.55)+gauss(px+size*1.6,size*.55)+gauss(px,size);
    color=rays/max(.2,amount);alpha=.32*amount+.045*glow;
  }else if(uStyle==6){ // velvet: a catch-light and shadow below
    float shadow=gauss(px+2.5*uScale,3.5*uScale);
    if(px<-.1*uScale){color=vec3(.014,.020,.029);alpha=.38*shadow;}
    else{color=mix(uColorLow,uColorHigh,.35);alpha=.24*gauss(px,size)+.07*glow;}
  }else if(uStyle==7){ // ripple flow: traveling water ripples + rising droplets
    color=mix(uColorLow,uColorHigh,.45+.3*sin(xp*.011-tm*.65));
    float ripples=pow(.5+.5*sin(xp*.052-tm*2.7-px*.20),4.);
    float crest=ripples*gauss(px-9.*uScale-wave,13.*uScale);
    // Sparse deterministic droplets; no per-frame allocations or CPU particles.
    float cell=floor(xp/(17.*uScale));
    float seed=hash1(cell);
    float age=fract(tm*.14+seed);
    float dropX=(cell+.17+.64*hash1(cell+3.3))*17.*uScale+sin(tm*.6+cell)*1.8*uScale;
    float dropY=(5.+age*55.)*uScale;
    float drop=gauss(xp-dropX,1.1*uScale)*gauss(px-dropY,1.5*uScale)
             *smoothstep(0.,.12,age)*(1.-smoothstep(.65,1.,age))
             *step(.42,hash1(cell+13.8));
    alpha=.23*core+.085*glow+.26*crest+drop*(.45+.20*pulse)
          +pulse*.14*gauss(px,12.*uScale);
    alpha+=.055*gauss(px+6.*uScale,5.*uScale); // faint ivory reflection
  }else if(uStyle==8){ // electric current: running arcs + localized MIDI sparks
    float segment=floor(xp/(11.*uScale));
    float jitter=(hash1(segment+floor(tm*6.))-.5)*5.*uScale;
    float arc=wave*1.5+jitter;
    float streak=pow(max(0.,.5+.5*sin(xp*.042-tm*6.4)),12.);
    float branch=gauss(px-7.*uScale-arc*1.7,1.2*uScale)*streak;
    float spark=gauss(px-13.*uScale,7.*uScale)*pulse;
    color=mix(uColorLow,uColorHigh,clamp(.4+.35*streak+.2*pulse,0.,1.));
    alpha=.19*gauss(px-arc,1.15*uScale)+.07*glow+.40*streak*gauss(px-arc,3.*uScale)
          +.40*branch+.27*spark+.15*pulse*gauss(px,7.*uScale);
    alpha+=.045*gauss(px+4.*uScale,5.*uScale);
  }
  // Only the lit portion enters selective bloom; never bloom velvet shadow.
  if(uEmissionMode>.5){
    if(uStyle==6&&px<0.)discard;
    alpha*=.27;
  }
  frag=vec4(max(color,vec3(0.)),clamp(alpha*uStrength*coverage,0.,.72));
}`;
export const BRIGHT_FRAG=`#version 300 es
precision highp float;
in vec2 vUV;out vec4 frag;
uniform sampler2D uTexture;
void main(){
 vec3 color=texture(uTexture,vUV).rgb;
 float lum=dot(color,vec3(.2126,.7152,.0722));
 // Soft-knee extraction preserves coloured highlights without clipping to
 // white when many notes land together.
 float weight=smoothstep(.07,.48,lum);
 frag=vec4(max(color-vec3(.035),vec3(0.))*weight,1.);
}`;
export const BLUR_FRAG=`#version 300 es
precision highp float;
in vec2 vUV;out vec4 frag;
uniform sampler2D uTexture;uniform vec2 uStep;
void main(){
 vec3 sum=texture(uTexture,vUV).rgb*.227027;
 for(int i=1;i<=4;i++){
   float weight=i==1?.1945946:i==2?.1216216:i==3?.054054:.016216;
   sum+=texture(uTexture,vUV+float(i)*uStep).rgb*weight;
   sum+=texture(uTexture,vUV-float(i)*uStep).rgb*weight;
 }
 frag=vec4(sum,1.);
}`;
export const COPY_FRAG=`#version 300 es
precision highp float;
in vec2 vUV;out vec4 frag;uniform sampler2D uTexture;
void main(){frag=vec4(texture(uTexture,vUV).rgb,1.);}`;
export const COMPOSITE_FRAG=`#version 300 es
precision highp float;
in vec2 vUV;out vec4 frag;
uniform sampler2D uScene;uniform sampler2D uBloom;
uniform sampler2D uWideBloom;uniform float uBloomIntensity;
void main(){
 vec4 scenePixel=texture(uScene,vUV);
 vec3 scene=scenePixel.rgb;
 vec3 tight=texture(uBloom,vUV).rgb;
 vec3 wide=texture(uWideBloom,vUV).rgb;
 // Two scales: sharp spark and soft volumetric aura. Tonemap after blending.
 vec3 radiance=scene+(tight*.70+wide*.43)*uBloomIntensity;
 // Hable-inspired simple filmic shoulder. Avoid turning saturated lilac
 // into large overexposed white patches.
 radiance=max(radiance,vec3(0.));
 vec3 exposure=vec3(1.18)+.92*smoothstep(vec3(.30),vec3(.85),radiance);
 vec3 mapped=1.-exp(-radiance*exposure);
 mapped=clamp(mapped,0.,1.);
 float bloomAlpha=clamp(max(max(tight.r,tight.g),tight.b)*uBloomIntensity*.6+
                        max(max(wide.r,wide.g),wide.b)*uBloomIntensity*.25,0.,.65);
 frag=vec4(pow(mapped,vec3(.98)),max(scenePixel.a,bloomAlpha));
}`;
