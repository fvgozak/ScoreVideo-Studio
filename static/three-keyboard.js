/* ScoreMotion: keyboard-only Three.js renderer (performance edition).
 * Original MIDI, falling notes, SVG score and PixiJS glow remain untouched.
 * 88 keys are TWO instanced draws; WebGL buffer covers ONLY the keyboard band.
 * preserveDrawingBuffer stays enabled because offline export reads this canvas.
 */
(function (root) {
  'use strict';
  const VERSION = '0.187.0';
  const FIRST = 21, LAST = 108;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const isBlack = pitch => [1, 3, 6, 8, 10].includes(pitch % 12);
  let threePromise;

  async function loadThree() {
    if (!threePromise) {
      threePromise = (async () => {
        const THREE = await import('/static/vendor/three-0.187.0.module.js');
        if (THREE.WebGLRenderer && THREE.InstancedMesh && THREE.ExtrudeGeometry) return THREE;
        throw new Error('Local Three.js 0.187.0 module is incomplete.');

      })();
    }
    return threePromise;
  }

  function makeKeyGeometry(THREE, radius) {
    const s = new THREE.Shape(), a = -0.5, b = 0.5, r = radius;
    s.moveTo(a + r, a);
    s.lineTo(b - r, a); s.quadraticCurveTo(b, a, b, a + r);
    s.lineTo(b, b - r); s.quadraticCurveTo(b, b, b - r, b);
    s.lineTo(a + r, b); s.quadraticCurveTo(a, b, a, b - r);
    s.lineTo(a, a + r); s.quadraticCurveTo(a, a, a + r, a);
    // Same bevel silhouette as the initial Three.js keyboard. Built ONCE.
    return new THREE.ExtrudeGeometry(s, {
      depth: 0.045, steps: 1, bevelEnabled: true,
      bevelThickness: 0.009, bevelSize: 0.009, bevelSegments: 2, curveSegments: 3,
    });
  }

  // Per-key emissive radiance without 88 separately compiled materials.
  // The extra vec4 is one vertex attribute; StandardMaterial supplies lighting.
  function makeKeyMaterial(THREE, black) {
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: black ? 0.32 : 0.35,
      metalness: black ? 0.26 : 0.09,
      emissive: '#000000',
      emissiveIntensity: 1,
    });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 instanceGlow;\nvarying vec4 vKeyGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKeyGlow = instanceGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec4 vKeyGlow;')
        .replace('#include <emissivemap_fragment>',
          '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vKeyGlow.rgb * vKeyGlow.a;');
    };
    // Make the custom shader identity stable across exports/re-creations.
    material.customProgramCacheKey = () => 'scoremotion-instanced-emissive-v1';
    return material;
  }

  class Keyboard3D {
    constructor(viewport, THREE) {
      this.THREE = THREE;
      this.viewport = viewport;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'piano-three-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.top = 'auto';
      this.canvas.style.bottom = '0';
      this.canvas.style.width = '100%';
      this.canvas.style.height = '1px';
      this.failed = false;
      this.onContextLost = event => {
        event.preventDefault();
        this.failed = true;
        this.canvas.style.display = 'none';
        this.viewport.dispatchEvent(new CustomEvent('score-keyboard-renderer', {
          detail: { actual: 'error', reason: 'Three.js WebGL context lost (GPU required)' },
        }));
      };
      this.canvas.addEventListener('webglcontextlost', this.onContextLost);
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        // Required: offline compositor draws this WebGL canvas AFTER stage.seek().
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      this.renderer.setPixelRatio(1);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 2000);
      this.camera.position.z = 1000;
      this.scene.add(new THREE.AmbientLight(0xffffff, 1.55));
      this.keyLight = new THREE.DirectionalLight(0xf1f8ff, 1.55);
      this.keyLight.position.set(-250, 900, 650);
      this.scene.add(this.keyLight);
      this.rimLight = new THREE.DirectionalLight(0x93c8f7, 0.42);
      this.rimLight.position.set(550, -250, 450);
      this.scene.add(this.rimLight);

      this.bed = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({color:'#e8e9ee',roughness:0.72,metalness:0.04}),
      );
      this.bed.position.z = -8;
      this.scene.add(this.bed);
      this.whiteGeometry = makeKeyGeometry(THREE, 0.018);
      this.blackGeometry = makeKeyGeometry(THREE, 0.032);
      const whiteCount = Array.from({length:LAST-FIRST+1}, (_,i)=>FIRST+i).filter(p=>!isBlack(p)).length;
      const blackCount = LAST-FIRST+1-whiteCount;
      this.whiteGroup = this.createGroup(this.whiteGeometry, false, whiteCount);
      this.blackGroup = this.createGroup(this.blackGeometry, true, blackCount);
      // Three.js sorts by Object3D order only when transparency demands it;
      // opaque depth testing ensures the black key bodies are in front.
      this.scene.add(this.whiteGroup.mesh);
      this.scene.add(this.blackGroup.mesh);
      this.keys = new Map();
      let wi=0,bi=0;
      for(let pitch=FIRST;pitch<=LAST;pitch++){
        const black=isBlack(pitch),group=black?this.blackGroup:this.whiteGroup;
        this.keys.set(pitch,{pitch,black,group,index:black?bi++:wi++});
      }
      this.hits = new Array(LAST+1).fill(null);
      this.hitLevels = new Float32Array(LAST+1);
      this.previousLevels = new Float32Array(LAST+1);
      this.previousLevels.fill(-1);
      this.previousHitColors = new Array(LAST+1).fill('');
      this.dummy = new THREE.Object3D();
      this.baseColor = new THREE.Color();
      this.tintColor = new THREE.Color();
      this.lastLayout = null;
      this.lastPalette = null;
      this.lastMinimal = null;
      this.lastPedalGlow = -1;
      this.lastCanvasWidth = 0;
      this.lastCanvasHeight = 0;
      this.renderCount = 0;
      this.skippedFrames = 0;
      viewport.appendChild(this.canvas);
    }

    createGroup(geometry, black, count) {
      const THREE = this.THREE;
      const material = makeKeyMaterial(THREE, black);
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.name = black ? 'ScoreBlackKeys' : 'ScoreWhiteKeys';
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // One extra instance vec4 stores light tint RGB and emissive energy.
      const glow = new THREE.InstancedBufferAttribute(new Float32Array(count*4), 4);
      glow.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('instanceGlow', glow);
      return {mesh, glow, count, colorDirty:false, matrixDirty:false, glowDirty:false};
    }

    draw(frame) {
      if(this.failed) return false;
      const {width:w,height:h,left,whiteWidth,keyTop,keyHeight,keys,layout,
        active,minimal,pedal,pedalEnabled} = frame;
      if(!(w>0 && h>0 && whiteWidth>0 && keyHeight>0)) return false;
      const cropHeight=Math.min(h,Math.max(1,Math.ceil(keyHeight + Math.max(9,whiteWidth*.2))));
      const resized = this.lastCanvasWidth !== w || this.lastCanvasHeight !== cropHeight;
      if(resized){
        this.renderer.setSize(w,cropHeight,false);
        this.canvas.style.height=`${cropHeight}px`;
        this.camera.left=0;this.camera.right=w;
        this.camera.top=cropHeight;this.camera.bottom=0;
        this.camera.updateProjectionMatrix();
        this.lastCanvasWidth=w;this.lastCanvasHeight=cropHeight;
      }
      const layoutSignature = [left,whiteWidth,keyTop,keyHeight];
      const layoutChanged = resized || !this.lastLayout ||
        layoutSignature.some((v,i)=>v!==this.lastLayout[i]);
      const paletteChanged = !this.lastPalette ||
        keys.white!==this.lastPalette.white ||
        keys.black!==this.lastPalette.black ||
        keys.bed!==this.lastPalette.bed;
      const minimalChanged = minimal!==this.lastMinimal;
      if(layoutChanged){
        this.bed.position.set(left+layout.whiteCount*whiteWidth/2,
          keyHeight/2,-8);
        this.bed.scale.set(layout.whiteCount*whiteWidth,keyHeight,3);
        this.bed.updateMatrix();
        this.lastLayout=layoutSignature;
      }
      if(paletteChanged){
        this.bed.material.color.set(keys.bed);
        this.lastPalette={white:keys.white,black:keys.black,bed:keys.bed};
      }
      this.lastMinimal=minimal;
      const pedalGlow=0;
      const pedalChanged=pedalGlow!==this.lastPedalGlow;
      if(pedalChanged){
        this.bed.material.emissive.set(keys.black);
        this.bed.material.emissiveIntensity=pedalGlow;
        this.lastPedalGlow=pedalGlow;
      }else if(paletteChanged && pedalGlow){
        this.bed.material.emissive.set(keys.black);
      }
      this.hitLevels.fill(0);
      this.hits.fill(null);
      for(let i=0;i<active.length;i++){
        const hit=active[i],pitch=hit?.note?.pitch;
        if(pitch<FIRST || pitch>LAST || !Number.isFinite(pitch)) continue;
        const power=clamp(hit.intensity,0,1);
        if(power>this.hitLevels[pitch]){
          this.hitLevels[pitch]=power;
          this.hits[pitch]=hit;
        }
      }
      let changed = resized || layoutChanged || paletteChanged || minimalChanged || pedalChanged;
      let whiteColorDirty=false,blackColorDirty=false;
      let whiteMatrixDirty=false,blackMatrixDirty=false;
      let whiteGlowDirty=false,blackGlowDirty=false;
      for(let k=0;k<layout.keys.length;k++){
        const key=layout.keys[k],slot=this.keys.get(key.pitch);
        if(!slot)continue;
        const group=slot.group,mesh=group.mesh,isDark=slot.black;
        const power=this.hitLevels[key.pitch],hit=this.hits[key.pitch];
        const hitColor=hit?.color || '';
        const levelChanged = Math.abs(power-this.previousLevels[key.pitch])>0.002 ||
          hitColor!==this.previousHitColors[key.pitch];
        if(!layoutChanged && !paletteChanged && !minimalChanged && !levelChanged)continue;
        changed=true;
        const boxX=isDark
          ?left+(key.whiteIndex+1)*whiteWidth-whiteWidth*.32
          :left+key.whiteIndex*whiteWidth;
        const boxW=whiteWidth*(isDark?.64:1);
        const xPad=isDark?Math.max(.2,whiteWidth*.008):Math.max(.4,whiteWidth*.018);
        const keyH=Math.max(1,keyHeight*(isDark?.67:1)-3);
        const keyW=Math.max(1,boxW-xPad*2);
        if(layoutChanged || levelChanged){
          this.dummy.position.set(boxX+boxW/2,keyHeight-keyH/2-2,
            (isDark?11:0)-power*(isDark?1.4:.85));
          this.dummy.scale.set(keyW,keyH,Math.max(2,whiteWidth*(isDark?.25:.13)));
          this.dummy.updateMatrix();
          mesh.setMatrixAt(slot.index,this.dummy.matrix);
          if(isDark)blackMatrixDirty=true;else whiteMatrixDirty=true;
        }
        if(paletteChanged || minimalChanged || levelChanged){
          this.baseColor.set(isDark?keys.black:keys.white);
          if(hit){
            this.tintColor.set(hit.color);
            this.baseColor.lerp(this.tintColor,power*(minimal?.82:.34));
          }
          mesh.setColorAt(slot.index,this.baseColor);
          if(isDark)blackColorDirty=true;else whiteColorDirty=true;
          const arr=group.glow.array,offset=slot.index*4;
          if(hit){
            arr[offset]=this.tintColor.r;
            arr[offset+1]=this.tintColor.g;
            arr[offset+2]=this.tintColor.b;
            arr[offset+3]=minimal?0:power*1.15;
          }else{
            arr[offset]=arr[offset+1]=arr[offset+2]=arr[offset+3]=0;
          }
          if(isDark)blackGlowDirty=true;else whiteGlowDirty=true;
        }
        this.previousLevels[key.pitch]=power;
        this.previousHitColors[key.pitch]=hitColor;
      }
      if(whiteMatrixDirty)this.whiteGroup.mesh.instanceMatrix.needsUpdate=true;
      if(blackMatrixDirty)this.blackGroup.mesh.instanceMatrix.needsUpdate=true;
      if(whiteColorDirty)this.whiteGroup.mesh.instanceColor.needsUpdate=true;
      if(blackColorDirty)this.blackGroup.mesh.instanceColor.needsUpdate=true;
      if(whiteGlowDirty)this.whiteGroup.glow.needsUpdate=true;
      if(blackGlowDirty)this.blackGroup.glow.needsUpdate=true;
      if(!changed){this.skippedFrames++;return true;}
      this.renderer.render(this.scene,this.camera);
      this.renderCount++;
      return true;
    }

    stats() {
      return {renderCount:this.renderCount,skippedFrames:this.skippedFrames,
        drawGroups:2,keys:this.keys.size,canvasPixels:this.lastCanvasWidth*this.lastCanvasHeight};
    }

    dispose() {
      this.canvas.removeEventListener('webglcontextlost',this.onContextLost);
      this.whiteGroup.mesh.dispose();
      this.blackGroup.mesh.dispose();
      this.whiteGroup.mesh.material.dispose();
      this.blackGroup.mesh.material.dispose();
      this.whiteGeometry.dispose();this.blackGeometry.dispose();
      this.bed.geometry.dispose();this.bed.material.dispose();
      this.renderer.dispose();
      this.keys.clear();
      this.canvas.remove();
    }
  }

  async function create(viewport) {
    const THREE=await loadThree();
    let keyboard;
    try {
      keyboard=new Keyboard3D(viewport,THREE);
      viewport.dispatchEvent(new CustomEvent('score-keyboard-renderer', {detail:{actual:'three'}}));
      return keyboard;
    }catch(error){keyboard?.dispose();throw error;}
  }
  root.ScoreThreeKeyboard={create,loadThree,Keyboard3D,version:VERSION};
})(window);
