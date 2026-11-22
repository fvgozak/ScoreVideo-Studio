/* Optional GPU light layer. Musical timing and geometry remain in ScoreStage. */
(function(root){
  'use strict';
  const MODULE='/static/vendor/pixi-8.23.0.min.mjs';
  const MAX_SPRITES=512;
  const MAX_PARTICLES=160;
  const MAX_TRAIL_LINKS=32;
  const MAX_VOLUME_RAYS=32;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const bloomFilterStrength=(radius,factor,pixelScale=1)=>(2+radius*factor)*clamp(Number(pixelScale)||1,1,4);
  function random(seed,index,salt=0){
    let x=(Math.imul(Math.round((Number(seed)||0)*1000)+17,1664525)^
      Math.imul(index+51+salt*131,1013904223))|0;
    x^=x>>>16;x=Math.imul(x,2246822519);x^=x>>>13;
    x=Math.imul(x,3266489917);x^=x>>>16;
    return (x>>>0)/4294967296;
  }
  const presets={
    classic:{classic:1,bloom:0,outline:0,stardust:0},
    dreamy:{classic:.65,bloom:1.2,outline:0,stardust:.15},
    sparkle:{classic:.7,bloom:.25,outline:0,stardust:1},
    luminous:{classic:.9,bloom:.65,outline:.8,stardust:.35},
    custom:{classic:1,bloom:0,outline:0,stardust:0}
  };
  const cinematicDefaults={
    cinematic:{strength:1,reaction:0},
    classic:{on:true,strength:1},bloom:{on:false,strength:1},
    outline:{on:false,strength:1},stardust:{on:false,strength:1},
    volumetric:{on:false,strength:.7},chromatic:{on:false,strength:.6},
    glow:{core:{strength:1,radius:.16},mid:{strength:.55,radius:.42},halo:{strength:.22,radius:.78}},
    trails:{on:false,strength:1,length:8,duration:1.3},
    burst:{on:false,count:8,size:1,speed:42,direction:-90,spread:300,life:.7,brightness:1}
  };
  function cinematicPreset(value){
    const base=cinematicDefaults;
    return {...base,...value,
      cinematic:{...base.cinematic,...value.cinematic},
      glow:{core:{...base.glow.core,...value.glow?.core},
        mid:{...base.glow.mid,...value.glow?.mid},halo:{...base.glow.halo,...value.glow?.halo}},
      trails:{...base.trails,...value.trails},burst:{...base.burst,...value.burst}};
  }
  const cinematicPresets={
    aurora:cinematicPreset({cinematic:{strength:.9,reaction:1.25},
      classic:{on:true,strength:.62},bloom:{on:true,strength:1.15},stardust:{on:true,strength:.45},
      glow:{core:{strength:.8,radius:.14},mid:{strength:.7,radius:.46},halo:{strength:.32,radius:.82}},
      trails:{on:true,strength:.45,length:6,duration:1.45},
      burst:{on:true,count:5,size:.75,speed:30,life:.48,brightness:.72},
      palette:{lightColorMode:'aurora',auroraLow:'#3ACFCB',auroraHigh:'#AA80E8'}}),
    starlight:cinematicPreset({cinematic:{strength:.95,reaction:1.35},
      classic:{on:true,strength:1.05},stardust:{on:true,strength:1.15},
      glow:{core:{strength:1.3,radius:.1},mid:{strength:.38,radius:.28},halo:{strength:.12,radius:.5}},
      burst:{on:true,count:5,size:.58,speed:58,spread:280,life:.23,brightness:1.25}}),
    goldenHall:cinematicPreset({cinematic:{strength:.92,reaction:.85},
      classic:{on:true,strength:.9},bloom:{on:true,strength:.7},
      glow:{core:{strength:.92,radius:.16},mid:{strength:.58,radius:.42},halo:{strength:.3,radius:.74}},
      palette:{lightColorMode:'solid',glowColor:'#DDB969'}}),
    dreamscape:cinematicPreset({cinematic:{strength:.85,reaction:.75},
      classic:{on:true,strength:.55},bloom:{on:true,strength:1.35},
      volumetric:{on:true,strength:.65},
      glow:{core:{strength:.68,radius:.2},mid:{strength:.78,radius:.56},halo:{strength:.42,radius:.9}},
      trails:{on:true,strength:.7,length:14,duration:2.7}}),
    minimalNoir:cinematicPreset({cinematic:{strength:.72,reaction:1.1},
      classic:{on:true,strength:.85},stardust:{on:true,strength:.32},
      glow:{core:{strength:1.2,radius:.09},mid:{strength:.15,radius:.22},halo:{strength:.11,radius:.42}},
      burst:{on:true,count:2,size:.55,speed:22,spread:180,life:.35,brightness:.45}})
  };
  for(const [name,preset] of Object.entries(cinematicPresets))
    presets[name]=Object.fromEntries(['classic','bloom','outline','stardust'].map(key=>[key,preset[key].on?preset[key].strength:0]));
  function normalizeEffects(value={}){
    const preset=presets[value?.preset]?value.preset:'classic',base=presets[preset];
    const cinematicBase=cinematicPresets[preset]||cinematicDefaults;
    const result={preset,pedalResonance:value?.pedalResonance!==false,sustainAfterglow:value?.sustainAfterglow!==false};
    result.cinematic={on:value?.cinematic?.on!==false,
      strength:clamp(Number(value?.cinematic?.strength??cinematicBase.cinematic.strength),0,2),
      reaction:clamp(Number(value?.cinematic?.reaction??cinematicBase.cinematic.reaction),0,2)};
    for(const name of ['classic','bloom','outline','stardust']){
      const item=value?.[name];
      result[name]={on:item?.on??base[name]>0,
        strength:clamp(Number(item?.strength??(base[name]||1)),0,4)};
    }
    const profile=value?.glow||{},glowBase=cinematicBase.glow;
    result.glow={
      core:{strength:clamp(Number(profile.core?.strength??glowBase.core.strength),0,4),radius:clamp(Number(profile.core?.radius??glowBase.core.radius),.04,.8)},
      mid:{strength:clamp(Number(profile.mid?.strength??glowBase.mid.strength),0,4),radius:clamp(Number(profile.mid?.radius??glowBase.mid.radius),.08,.95)},
      halo:{strength:clamp(Number(profile.halo?.strength??glowBase.halo.strength),0,4),radius:clamp(Number(profile.halo?.radius??glowBase.halo.radius),.12,1)}
    };
    const burst=value?.burst||{},burstBase=cinematicBase.burst;
    result.burst={on:burst.on??burstBase.on,count:clamp(Math.round(Number(burst.count??burstBase.count)),1,16),
      size:clamp(Number(burst.size??burstBase.size),.5,3),speed:clamp(Number(burst.speed??burstBase.speed),4,100),
      direction:clamp(Number(burst.direction??burstBase.direction),-180,180),
      spread:clamp(Number(burst.spread??burstBase.spread),0,360),
      life:clamp(Number(burst.life??burstBase.life),.1,1.5),
      brightness:clamp(Number(burst.brightness??burstBase.brightness),0,2)};
    result.volumetric={on:value?.volumetric?.on??cinematicBase.volumetric.on,
      strength:clamp(Number(value?.volumetric?.strength??cinematicBase.volumetric.strength),0,2)};
    result.chromatic={on:value?.chromatic?.on??cinematicBase.chromatic.on,
      strength:clamp(Number(value?.chromatic?.strength??cinematicBase.chromatic.strength),0,2)};
    result.trails={on:value?.trails?.on??cinematicBase.trails.on,
      strength:clamp(Number(value?.trails?.strength??cinematicBase.trails.strength),0,2),
      length:clamp(Math.round(Number(value?.trails?.length??cinematicBase.trails.length)),2,16),
      duration:clamp(Number(value?.trails?.duration??cinematicBase.trails.duration),.3,3)};
    // These fields are consumed by Dynamic FX and travel with the same
    // preview/export settings snapshot as the Pixi score effects.
    result.groups=value?.groups&&typeof value.groups==='object'?value.groups:{};
    result.keyboard=value?.keyboard&&typeof value.keyboard==='object'?value.keyboard:{};
    return result;
  }
  const tint=color=>Number.parseInt(/^#[0-9a-f]{6}$/i.test(color||'')?color.slice(1):'ffffff',16);
  // Unit quad. Every light pixel, including the feathered edge, is generated
  // by the GPU; no Canvas2D bitmap is uploaded or stretched into a rectangle.
  const VERTEX=`
    in vec2 aPosition; in vec2 aUV; out vec2 vUV;
    uniform vec4 uRect; uniform vec2 uViewport; uniform float uAngle;
    void main(){
      vec2 local=aPosition*uRect.zw*.5;
      float c=cos(uAngle),s=sin(uAngle);
      vec2 pos=uRect.xy+vec2(local.x*c-local.y*s,local.x*s+local.y*c);
      // Emission is rendered into a Pixi RenderTexture before the final
      // composite. Its texture-to-screen pass flips Y, so writing a second
      // screen-space Y flip here mirrored every light around the stage center.
      gl_Position=vec4(pos.x/uViewport.x*2.0-1.0,pos.y/uViewport.y*2.0-1.0,0.0,1.0);
      vUV=aUV;
    }`;
  const FRAGMENT=`
    precision highp float;
    in vec2 vUV; out vec4 finalColor;
    uniform vec3 uColor; uniform vec4 uCoreMid; uniform vec4 uHaloMode;
    uniform vec4 uRect; uniform float uChromatic;
    void main(){
      vec2 p=vUV*2.0-1.0;
      float shape=uHaloMode.w;
      if(shape>7.5){
        // A bounded 2.5D cone rising from the note/key. Both longitudinal
        // ends and the sides reach zero alpha before the quad boundary.
        float travel=clamp((1.0-p.y)*.5,0.0,1.0);
        float spread=.13+.68*travel;
        float cone=exp(-2.4*pow(p.x/spread,2.0));
        float streak=.78+.22*pow(max(0.0,cos(p.x*9.0/spread+uRect.x*.035)),2.0);
        float axial=pow(1.0-travel,1.5)*smoothstep(0.0,.08,travel);
        float border=1.0-smoothstep(.76,1.0,max(abs(p.x),abs(p.y)));
        float ray=clamp(cone*streak*axial*border*uHaloMode.z*.42,0.0,.34);
        finalColor=vec4(uColor*ray,ray);
        return;
      }
      float radial=length(p);
      float edgeDistance=max(abs(p.x),abs(p.y));
      if(shape>5.5){
        radial=length(vec2(p.x*.55,p.y*3.2));
      }else if(shape>4.5){
        float theta=atan(p.y,p.x);
        radial=length(p)/(0.43+0.32*pow(abs(cos(theta*2.0)),10.0));
      }else if(shape>3.5){
        radial=abs(length(p)-.76)*7.0;
      }else if(shape>2.5){
        radial=abs(radial-.72)*7.0;
      }else if(shape>1.5){
        radial=length(p);
      }else if(shape>.5){
        radial=abs(p.x)*1.9;
      }
      float core=exp(-.5*pow(radial/max(.001,uCoreMid.y),2.0))*uCoreMid.x;
      float mid=exp(-.5*pow(radial/max(.001,uCoreMid.w),2.0))*uCoreMid.z;
      float halo=exp(-.5*pow(radial/max(.001,uHaloMode.y),2.0))*uHaloMode.x;
      float edge=1.0-smoothstep(.78,1.0,edgeDistance);
      if(shape<.5||(shape>3.5&&shape<4.5))
        edge*=1.0-smoothstep(.62,.98,length(p));
      if(shape>.5&&shape<1.5){
        edge*=1.0-smoothstep(.85,1.0,abs(p.x));
        halo*=smoothstep(-1.0,.85,p.y);
        mid*=smoothstep(-1.0,.4,p.y);
      }
      float alpha=clamp((core+mid+halo)*edge*uHaloMode.z,0.0,1.0);
      if(uChromatic>.001&&shape<.5){
        float shift=min(.07,uChromatic*.045);
        float redRadius=length(p-vec2(shift,0.0));
        float blueRadius=length(p+vec2(shift,0.0));
        // Shifted RGB lobes must also vanish at the unshifted quad boundary.
        // Otherwise one fringe still has alpha when the geometry is clipped.
        float guard=1.0-smoothstep(.90,1.0,edgeDistance);
        float redEdge=guard*(1.0-smoothstep(.62,.98,redRadius));
        float blueEdge=guard*(1.0-smoothstep(.62,.98,blueRadius));
        float red=clamp((exp(-.5*pow(redRadius/max(.001,uCoreMid.y),2.0))*uCoreMid.x+
          exp(-.5*pow(redRadius/max(.001,uCoreMid.w),2.0))*uCoreMid.z+
          exp(-.5*pow(redRadius/max(.001,uHaloMode.y),2.0))*uHaloMode.x)*redEdge*uHaloMode.z,0.0,1.0);
        float blue=clamp((exp(-.5*pow(blueRadius/max(.001,uCoreMid.y),2.0))*uCoreMid.x+
          exp(-.5*pow(blueRadius/max(.001,uCoreMid.w),2.0))*uCoreMid.z+
          exp(-.5*pow(blueRadius/max(.001,uHaloMode.y),2.0))*uHaloMode.x)*blueEdge*uHaloMode.z,0.0,1.0);
        float rim=smoothstep(.16,.63,radial);
        vec3 fringeColor=mix(uColor,vec3(1.0),min(.16,uChromatic*.16));
        vec3 rgb=mix(uColor*alpha,fringeColor*vec3(red,alpha,blue),rim);
        float outAlpha=max(alpha,max(rgb.r,max(rgb.g,rgb.b)));
        finalColor=vec4(min(rgb,vec3(outAlpha)),outAlpha);
      }else finalColor=vec4(uColor*alpha,alpha);
    }`;
  function makeShader(PIXI){
    return PIXI.Shader.from({gl:{vertex:VERTEX,fragment:FRAGMENT},resources:{glowUniforms:{
      uRect:{value:[0,0,1,1],type:'vec4<f32>'},uViewport:{value:[1,1],type:'vec2<f32>'},
      uAngle:{value:0,type:'f32'},uColor:{value:[1,1,1],type:'vec3<f32>'},
      uCoreMid:{value:[1,.16,.55,.42],type:'vec4<f32>'},
      uHaloMode:{value:[.22,.78,1,0],type:'vec4<f32>'},
      uChromatic:{value:0,type:'f32'}
    }}});
  }
  // A single quad per musical link. The GPU computes distance to the same
  // quadratic curve used by the Canvas fallback, with no rasterized strokes.
  const TRAIL_FRAGMENT=`
    precision highp float;
    in vec2 vUV; out vec4 finalColor;
    uniform vec4 uRect; uniform vec2 uStart; uniform vec2 uControl; uniform vec2 uEnd;
    uniform vec3 uStartColor; uniform vec3 uEndColor;
    uniform vec2 uEnergy; uniform float uWidth; uniform float uBrightness;
    uniform float uChromatic;
    void main(){
      vec2 pixel=uRect.xy+(vUV-vec2(.5))*uRect.zw;
      float distanceToPath=1.0e6,along=0.0,signedDistance=0.0;
      vec2 previous=uStart;
      for(int i=1;i<=12;i++){
        float t=float(i)/12.0,one=1.0-t;
        vec2 current=one*one*uStart+2.0*one*t*uControl+t*t*uEnd;
        vec2 segment=current-previous;
        float part=clamp(dot(pixel-previous,segment)/max(dot(segment,segment),.001),0.0,1.0);
        float d=length(pixel-(previous+segment*part));
        if(d<distanceToPath){
          distanceToPath=d;along=(float(i-1)+part)/12.0;
          signedDistance=dot(pixel-(previous+segment*part),
            vec2(-segment.y,segment.x)/max(length(segment),.001));
        }
        previous=current;
      }
      float core=exp(-.5*pow(distanceToPath/max(.3,uWidth*.58),2.0))*.72;
      float halo=exp(-.5*pow(distanceToPath/max(1.0,uWidth*4.2),2.0))*.16;
      vec2 square=abs(vUV*2.0-1.0);
      float edge=1.0-smoothstep(.78,1.0,max(square.x,square.y));
      float alpha=clamp((core+halo)*edge*mix(uEnergy.x,uEnergy.y,along)*uBrightness,0.0,.84);
      vec3 palette=mix(uStartColor,uEndColor,along);
      if(uChromatic>.001){
        float shift=uChromatic*uWidth*.65;
        float red=exp(-.5*pow((signedDistance-shift)/max(.3,uWidth*.58),2.0))*.72+
          exp(-.5*pow((signedDistance-shift)/max(1.0,uWidth*4.2),2.0))*.16;
        float blue=exp(-.5*pow((signedDistance+shift)/max(.3,uWidth*.58),2.0))*.72+
          exp(-.5*pow((signedDistance+shift)/max(1.0,uWidth*4.2),2.0))*.16;
        float gain=edge*mix(uEnergy.x,uEnergy.y,along)*uBrightness;
        float rim=smoothstep(uWidth*.25,uWidth*1.7,abs(signedDistance));
        vec3 fringeColor=mix(palette,vec3(1.0),min(.16,uChromatic*.16));
        vec3 rgb=mix(palette*alpha,fringeColor*vec3(clamp(red*gain,0.0,.84),alpha,
          clamp(blue*gain,0.0,.84)),rim);
        float outAlpha=max(alpha,max(rgb.r,max(rgb.g,rgb.b)));
        finalColor=vec4(min(rgb,vec3(outAlpha)),outAlpha);
      }else finalColor=vec4(palette*alpha,alpha);
    }`;
  function makeTrailShader(PIXI){
    return PIXI.Shader.from({gl:{vertex:VERTEX,fragment:TRAIL_FRAGMENT},resources:{trailUniforms:{
      uRect:{value:[0,0,1,1],type:'vec4<f32>'},uViewport:{value:[1,1],type:'vec2<f32>'},
      uAngle:{value:0,type:'f32'},uStart:{value:[0,0],type:'vec2<f32>'},
      uControl:{value:[0,0],type:'vec2<f32>'},uEnd:{value:[0,0],type:'vec2<f32>'},
      uStartColor:{value:[1,1,1],type:'vec3<f32>'},
      uEndColor:{value:[1,1,1],type:'vec3<f32>'},
      uEnergy:{value:[1,1],type:'vec2<f32>'},
      uWidth:{value:1,type:'f32'},uBrightness:{value:1,type:'f32'},
      uChromatic:{value:0,type:'f32'}
    }}});
  }
  class Layer{
    constructor(PIXI,app,host,kind){
      this.PIXI=PIXI;this.app=app;this.host=host;this.kind=kind;this.pixelScale=1;
      // All procedural lights first land in one transparent, full-size GPU
      // emission target. Bloom is applied to that target, never per note.
      this.container=new PIXI.Container();
      this.emissionRoot=new PIXI.Container();
      this.emissionRoot.addChild(this.container);
      this.targets=null;
      this.geometry=new PIXI.MeshGeometry({
        positions:new Float32Array([-1,-1,1,-1,1,1,-1,1]),
        uvs:new Float32Array([0,0,1,0,1,1,0,1]),
        indices:new Uint32Array([0,1,2,0,2,3])});
      this.pool=[];this.count=0;this.peak=0;this.rayCount=0;
      this.trailRoot=new PIXI.Container();this.emissionRoot.addChild(this.trailRoot);
      this.trailPool=[];this.trailCount=0;
      this.particleGroups=[new PIXI.Container(),new PIXI.Container(),new PIXI.Container()];
      this.particleGroups.forEach(group=>this.emissionRoot.addChild(group));
      this.particlePools=[[],[],[]];this.particleCounts=[0,0,0];this.particleCount=0;
      // Procedural particle masks are rendered once on the GPU, then tinted
      // and batched as ordinary Pixi sprites. No Canvas2D texture is created.
      this.particleTextures=[2,5,6].map(mode=>{
        const texture=PIXI.RenderTexture.create({width:64,height:64,resolution:1,antialias:false});
        const mesh=new PIXI.Mesh({geometry:this.geometry,shader:makeShader(PIXI)});
        const u=mesh.shader.resources.glowUniforms.uniforms;
        u.uRect=[32,32,64,64];u.uViewport=[64,64];u.uColor=[1,1,1];
        u.uCoreMid=[1,.16,.48,.38];u.uHaloMode=[.14,.7,1,mode];
        app.renderer.render({container:mesh,target:texture,clear:true});
        mesh.destroy();
        return texture;
      });
      app.canvas.className='score-pixi-fx score-pixi-'+kind;
      app.canvas.setAttribute('aria-hidden','true');host.appendChild(app.canvas);
    }
    static async create(host,kind){
      const PIXI=await import(MODULE);
      const app=new PIXI.Application();
      await app.init({width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight),
        resolution:1,autoStart:false,backgroundAlpha:0,preserveDrawingBuffer:true,preference:'webgl',powerPreference:'high-performance'});
      app.ticker.stop();return new Layer(PIXI,app,host,kind);
    }
    resize(width,height){
      width=Math.max(1,Math.round(width));height=Math.max(1,Math.round(height));
      if(this.app.renderer.width!==width||this.app.renderer.height!==height){
        this.app.renderer.resize(width,height);
        this.releaseTargets();
      }
      if(!this.targets)this.createTargets(width,height);
    }
    releaseTargets(){
      const targets=this.targets;
      if(!targets)return;
      this.app.stage.removeChild(targets.composite);
      targets.composite.destroy({children:true});
      for(const container of targets.passes)container.destroy({children:true});
      targets.midFilter.destroy();targets.wideFilter.destroy();
      for(const texture of targets.textures)texture.destroy(true);
      this.targets=null;
    }
    createTargets(width,height){
      const P=this.PIXI;
      const halfW=Math.max(1,Math.ceil(width/2)),halfH=Math.max(1,Math.ceil(height/2));
      const quarterW=Math.max(1,Math.ceil(width/4)),quarterH=Math.max(1,Math.ceil(height/4));
      const texture=(w,h)=>P.RenderTexture.create({width:w,height:h,resolution:1,antialias:false});
      const emission=texture(width,height),midRaw=texture(halfW,halfH),mid=texture(halfW,halfH);
      const wideRaw=texture(quarterW,quarterH),wide=texture(quarterW,quarterH);
      const pass=(source,w,h)=>{
        const container=new P.Container(),sprite=new P.Sprite(source);
        sprite.width=w;sprite.height=h;container.addChild(sprite);
        return {container,sprite};
      };
      const downMid=pass(emission,halfW,halfH);
      const blurMid=pass(midRaw,halfW,halfH);
      const downWide=pass(mid,quarterW,quarterH);
      const blurWide=pass(wideRaw,quarterW,quarterH);
      // Full-viewport filter areas prevent bloom from clipping at an
      // individual note's quad or Pixi's automatic filter bounds.
      blurMid.sprite.filterArea=new P.Rectangle(0,0,halfW,halfH);
      blurWide.sprite.filterArea=new P.Rectangle(0,0,quarterW,quarterH);
      const midFilter=new P.BlurFilter({strength:8,quality:2,repeatEdgePixels:true});
      const wideFilter=new P.BlurFilter({strength:14,quality:2,repeatEdgePixels:true});
      blurMid.sprite.filters=[midFilter];blurWide.sprite.filters=[wideFilter];
      const composite=new P.Container();
      const coreSprite=new P.Sprite(emission),midSprite=new P.Sprite(mid),wideSprite=new P.Sprite(wide);
      for(const sprite of [coreSprite,midSprite,wideSprite]){
        sprite.width=width;sprite.height=height;composite.addChild(sprite);
      }
      midSprite.blendMode='add';wideSprite.blendMode='add';
      this.app.stage.addChild(composite);
      this.targets={width,height,emission,midRaw,mid,wideRaw,wide,composite,
        coreSprite,midSprite,wideSprite,midFilter,wideFilter,
        downMid,blurMid,downWide,blurWide,
        passes:[downMid.container,blurMid.container,downWide.container,blurWide.container],
        textures:[emission,midRaw,mid,wideRaw,wide]};
    }
    sprite(kind,x,y,w,h,alpha,color,angle=0,chromatic=0){
      if(this.count>=MAX_SPRITES||alpha<=.002)return null;
      let mesh=this.pool[this.count];
      if(!mesh){
        const shader=makeShader(this.PIXI);
        mesh=new this.PIXI.Mesh({geometry:this.geometry,shader});mesh.blendMode='add';
        this.container.addChild(mesh);this.pool.push(mesh);this.peak=Math.max(this.peak,this.pool.length);
      }
      const u=mesh.shader.resources.glowUniforms.uniforms,profile=this.profile;
      const rgb=tint(color);
      u.uRect=[x,y,Math.max(.1,w),Math.max(.1,h)];u.uViewport=[this.app.renderer.width,this.app.renderer.height];
      u.uAngle=angle;u.uColor=[((rgb>>16)&255)/255,((rgb>>8)&255)/255,(rgb&255)/255];
      u.uCoreMid=[profile.core.strength,profile.core.radius,profile.mid.strength,profile.mid.radius];
      const mode={glow:0,beam:1,particle:2,ring:3,outline:4,volume:8}[kind]||0;
      u.uHaloMode=[profile.halo.strength,profile.halo.radius,clamp(alpha,0,1),mode];
      u.uChromatic=clamp(chromatic,0,1);
      mesh.visible=true;this.count++;
      return mesh;
    }
    chromaticLevel(command,fx){
      if(!command||!fx.chromatic.on||fx.chromatic.strength<=0)return 0;
      const age=Math.max(0,Number(command.age)||0);
      const velocity=clamp(Number(command.velocity??.65),0,1);
      const emphasis=clamp(Number(command.emphasis)||0,0,1);
      const energy=clamp(Number(command.energy)||0,0,1);
      return clamp(fx.chromatic.strength*(.18+.82*clamp((velocity-.55)/.45,0,1))*
        (.65+.35*emphasis)*energy*Math.exp(-age*5),0,1);
    }
    volume(command,fx,width,height){
      if(!fx.volumetric.on||fx.volumetric.strength<=0||this.rayCount>=MAX_VOLUME_RAYS)return;
      const energy=clamp(Number(command.energy)||0,0,1.5);
      const velocity=clamp(Number(command.velocity??.65),0,1);
      const emphasis=clamp(Number(command.emphasis)||0,0,1);
      const age=Math.max(0,Number(command.age)||0);
      const gain=clamp(energy*(.3+.7*velocity)*(.8+.4*emphasis)*
        Math.exp(-age*1.5)*fx.volumetric.strength*.7,0,.7);
      if(gain<.018)return;
      // Localized transparent cone; the already-composited image remains the
      // background and no full-screen pass or extra texture is allocated.
      this.sprite('volume',command.x,command.y-height*.43,width,height,gain,command.color);
      this.rayCount++;
    }
    particle(shape,x,y,size,alpha,color,rotation=0){
      if(this.particleCount>=MAX_PARTICLES||alpha<=.002)return;
      const index=shape%3,slot=this.particleCounts[index]++;
      let sprite=this.particlePools[index][slot];
      if(!sprite){
        sprite=new this.PIXI.Sprite(this.particleTextures[index]);
        sprite.anchor.set(.5);sprite.blendMode='add';
        this.particleGroups[index].addChild(sprite);
        this.particlePools[index].push(sprite);
      }
      sprite.position.set(x,y);
      sprite.width=Math.max(1,size)*(index===2?1.8:1);
      sprite.height=Math.max(1,size)*(index===2?.7:1);
      sprite.rotation=rotation;sprite.alpha=clamp(alpha,0,.85);
      sprite.tint=tint(color);sprite.visible=true;this.particleCount++;
    }
    ribbon(command,fx){
      if(this.trailCount>=MAX_TRAIL_LINKS||!command.a||!command.b)return;
      const {a,b}=command;
      if(![a.x,a.y,b.x,b.y].every(Number.isFinite))return;
      const control={x:(a.x+b.x)/2,y:(a.y+b.y)/2-(6*this.pixelScale+Math.min(22*this.pixelScale,Math.abs(a.y-b.y)*.18))};
      const width=1.25*clamp(Number(command.thickness)||1,.5,3*this.pixelScale),pad=width*17+4*this.pixelScale;
      const left=Math.min(a.x,b.x,control.x)-pad,right=Math.max(a.x,b.x,control.x)+pad;
      const top=Math.min(a.y,b.y,control.y)-pad,bottom=Math.max(a.y,b.y,control.y)+pad;
      let mesh=this.trailPool[this.trailCount];
      if(!mesh){
        mesh=new this.PIXI.Mesh({geometry:this.geometry,shader:makeTrailShader(this.PIXI)});
        mesh.blendMode='add';this.trailRoot.addChild(mesh);this.trailPool.push(mesh);
      }
      const rgb=color=>{const n=tint(color);return [((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255];};
      const u=mesh.shader.resources.trailUniforms.uniforms;
      u.uRect=[(left+right)/2,(top+bottom)/2,right-left,bottom-top];
      u.uViewport=[this.app.renderer.width,this.app.renderer.height];
      u.uStart=[a.x,a.y];u.uControl=[control.x,control.y];u.uEnd=[b.x,b.y];
      u.uStartColor=rgb(a.color);u.uEndColor=rgb(b.color);
      u.uEnergy=[clamp(Number(a.energy)||0,0,2),clamp(Number(b.energy)||0,0,2)];
      u.uWidth=width;u.uBrightness=clamp(Number(command.brightness)||0,0,2);
      u.uChromatic=Math.max(this.chromaticLevel(a,fx),this.chromaticLevel(b,fx));
      mesh.visible=true;this.trailCount++;
    }
    burst(command,fx,force=false){
      const custom=command.kind==='scoreParticleBurst'&&command.particleSettings?.on===true;
      if(!(force||custom||fx.stardust.on||fx.burst.on))return;
      const {x,y,color,seed=0,age=0,energy=1,velocity=.65}=command;
      const props=custom?command.particleSettings:fx.burst;
      const life=custom?props.life:(fx.burst.on?fx.burst.life:Math.min(.55,fx.burst.life));
      if(age<0||age>=life||this.particleCount>=MAX_PARTICLES)return;
      const velocityAmount=clamp(Number(velocity),0,1);
      const amount=custom?props.count:(fx.burst.on?fx.burst.count:Math.min(4,fx.burst.count));
      const count=Math.min(amount,Math.max(1,Math.round(amount*(.3+.7*velocityAmount))));
      const fade=(1-age/life)**1.7;
      const style=custom?props.style:'spark';
      const direction=(custom?-90:fx.burst.direction)*Math.PI/180;
      const spread=(custom?(style==='rise'?85:style==='dust'?360:310):fx.burst.spread)*Math.PI/180;
      for(let i=0;i<count&&this.particleCount<MAX_PARTICLES;i++){
        const angle=direction+(random(seed,i,1)-.5)*spread;
        const speed=props.speed*this.pixelScale*(.45+.9*random(seed,i,2));
        const distance=(3+random(seed,i,3)*4)*this.pixelScale+speed*age;
        const size=(6+random(seed,i,4)*7)*this.pixelScale*props.size*(.75+.35*velocityAmount);
        const brightness=fade*(.3+.7*velocityAmount)*(.45+.55*random(seed,i,5))*
          props.brightness*(custom?1:(fx.burst.on?1:.55))*
          (custom?1:(fx.stardust.on?fx.stardust.strength:1))*
          clamp(energy,0,1);
        const shape=custom?(style==='dust'?0:style==='rise'?i%2:(i%2)+1):i%3;
        this.particle(shape,x+Math.cos(angle)*distance,y+Math.sin(angle)*distance,
          size,brightness,color,angle);
      }
    }
    draw(commands,width,height,effects,options={}){
      this.pixelScale=clamp(Number(options?.pixelScale)||1,1,4);
      this.resize(width,height);this.count=0;this.rayCount=0;this.trailCount=0;this.particleCount=0;this.particleCounts.fill(0);
      const fx=normalizeEffects(effects);
      const bloom=fx.bloom.on&&fx.bloom.strength>0;
      this.profile=fx.glow;
      const light=(shape,x,y,w,h,energy,color,rotation=0,command=null)=>{
        if(fx.classic.on||bloom)this.sprite('glow',x,y,w,h,
          energy*(fx.classic.on?fx.classic.strength:Math.min(1,fx.bloom.strength)),color,rotation,
          this.chromaticLevel(command,fx));
        if(fx.outline.on&&shape==='note')this.sprite('ring',x,y,
          Math.max(5,w*.42),Math.max(5,h*.42),energy*.62*fx.outline.strength,color,rotation);
      };
      const gainFor=command=>{
        const velocity=clamp(Number(command.velocity??.5),0,1);
        const emphasis=clamp(Number(command.emphasis)||0,0,1);
        return fx.cinematic.strength*clamp(1+fx.cinematic.reaction*((velocity-.5)*.24+emphasis*.12),.7,1.3);
      };
      for(const source of (fx.cinematic.on?commands:commands.filter(c=>c.kind==='scoreParticleBurst'))){
        const command=source.kind==='scoreParticleBurst'||(fx.cinematic.strength===1&&fx.cinematic.reaction===0)?source:
          source.kind==='trailRibbon'?{...source,
            a:{...source.a,energy:source.a.energy*gainFor(source.a)},
            b:{...source.b,energy:source.b.energy*gainFor(source.b)}}:
            {...source,energy:Number.isFinite(source.energy)?source.energy*gainFor(source):source.energy};
        if(command.kind==='piano'){
          const {x,y,unit,keyWidth,keyHeight,energy,color,spread=1,focus=1,age=0,seed=0}=command;
          const radius=unit*(2.4+2.6*Math.min(1,energy))*spread;
          light('key',x,y,radius*2,radius*2,Math.min(.8,.48*energy*focus),color,0,command);
          this.volume(command,fx,Math.min(unit*3.5,150*this.pixelScale),Math.min(unit*6,210*this.pixelScale));
          this.burst(command,fx);
          if(fx.outline.on)this.sprite('outline',x,y+keyHeight*.3,keyWidth,keyHeight*.6,
            energy*.42*fx.outline.strength,color);
          const beamHeight=Math.min(y,unit*(3.1+2.7*energy)*spread);
          if(fx.classic.on){
            this.sprite('beam',x,y-beamHeight/2+9*this.pixelScale,keyWidth*1.3*spread,beamHeight+18*this.pixelScale,.44*energy*focus*fx.classic.strength,color);
            this.sprite('beam',x,y+keyHeight*.25,keyWidth*.9,keyHeight*.55,.22*energy*fx.classic.strength,color);
          }
        }else if(command.kind==='note'){
          const {x,y,radius,energy,color,age=0,seed=0,width,height,rotation=0}=command;
          light('note',x,y,width??radius*2,height??radius*1.4,energy,color,rotation,command);
          this.volume(command,fx,Math.min(radius*2.2,110*this.pixelScale),Math.min(radius*3.1,135*this.pixelScale));
        }else if(command.kind==='particle'){
          const {x,y,size=4,energy,color}=command;
          this.particle(0,x,y,size*2,energy,color);
        }else if(command.kind==='burst'||command.kind==='scoreParticleBurst'){
          this.burst(command,fx,Boolean(command.force)||command.kind==='scoreParticleBurst');
        }else if(command.kind==='trail'){
          const {x,y,width=18,height,energy,color,rotation=0}=command;
          this.sprite('glow',x,y,width,height||Math.max(4,width*.3),energy,color,rotation,
            this.chromaticLevel(command,fx));
        }else if(command.kind==='trailRibbon'){
          this.ribbon(command,fx);
        }else if(command.kind==='trailTip'){
          this.sprite('glow',command.x,command.y,15*this.pixelScale,7*this.pixelScale,command.energy*.48,command.color,0,
            this.chromaticLevel(command,fx));
          this.volume(command,fx,24*this.pixelScale,42*this.pixelScale);
        }else if(command.kind==='fall'){
          const {x,y,width,height,energy,color,age=0,seed=0}=command;
          light('fall',x,y,width+14*this.pixelScale,height+14*this.pixelScale,energy,color);
          if(fx.outline.on)this.sprite('outline',x,y,width,height,energy*.5*fx.outline.strength,color);
        }else if(command.kind==='pedal'&&fx.pedalResonance){
          this.sprite('glow',command.x,command.y,command.width,command.height,
            command.energy*.24,command.color);
        }else if(command.kind==='afterglow'&&fx.sustainAfterglow){
          this.sprite('glow',command.x,command.y,command.width,command.height,
            command.energy*.22,command.color);
        }else if(command.kind==='ring'){
          const {x,y,width,height,energy,color}=command;
          this.sprite('ring',x,y,width,height,energy,color);
        }
      }
      for(let i=this.count;i<this.pool.length;i++)this.pool[i].visible=false;
      for(let i=this.trailCount;i<this.trailPool.length;i++)this.trailPool[i].visible=false;
      for(let shape=0;shape<3;shape++)for(let i=this.particleCounts[shape];i<this.particlePools[shape].length;i++)
        this.particlePools[shape][i].visible=false;
      const t=this.targets,renderer=this.app.renderer;
      // The source is premultiplied by the glow shader. Downsampled textures
      // stay transparent; only the final full-screen composite is presented.
      renderer.render({container:this.emissionRoot,target:t.emission,clear:true});
      if(bloom&&(this.count||this.trailCount||this.particleCount)){
        t.midFilter.strength=bloomFilterStrength(fx.glow.mid.radius,18,this.pixelScale);
        t.wideFilter.strength=bloomFilterStrength(fx.glow.halo.radius,22,this.pixelScale);
        renderer.render({container:t.downMid.container,target:t.midRaw,clear:true});
        renderer.render({container:t.blurMid.container,target:t.mid,clear:true});
        renderer.render({container:t.downWide.container,target:t.wideRaw,clear:true});
        renderer.render({container:t.blurWide.container,target:t.wide,clear:true});
      }
      t.midSprite.visible=t.wideSprite.visible=bloom&&(this.count+this.trailCount+this.particleCount)>0;
      t.midSprite.alpha=clamp(fx.bloom.strength*fx.glow.mid.strength*.42,0,.68);
      t.wideSprite.alpha=clamp(fx.bloom.strength*fx.glow.halo.strength*.5,0,.42);
      this.app.render();
    }
    clear(){this.draw([],this.app.renderer.width,this.app.renderer.height);}
    stats(){return {sprites:this.pool.length,peakSprites:this.peak,maxSprites:MAX_SPRITES,
      trailLinks:this.trailCount,maxTrailLinks:MAX_TRAIL_LINKS,rays:this.rayCount,maxRays:MAX_VOLUME_RAYS,
      particles:this.particleCount,maxParticles:MAX_PARTICLES,
      textureBytes:(this.targets?.textures.reduce((n,t)=>n+t.width*t.height*4,0)||0)+3*64*64*4,
      canvasBytes:this.app.renderer.width*this.app.renderer.height*4};}
    dispose(){this.releaseTargets();this.emissionRoot.destroy({children:true});
      this.particleTextures.forEach(texture=>texture.destroy(true));
      this.app.canvas.remove();this.app.destroy(true,{children:true});this.geometry.destroy();this.pool=[];}
  }
  root.ScorePixiFx={Layer,MAX_SPRITES,presets,cinematicPresets,normalizeEffects,bloomFilterStrength};
})(typeof window==='undefined'?globalThis:window);
