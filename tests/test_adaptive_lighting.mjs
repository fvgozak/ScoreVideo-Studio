import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const source=readFileSync(new URL('../static/dynamic-fx/adaptive-lighting.js',import.meta.url));
const {keyboardMaterialAt,srgbToLinear}=await import(`data:text/javascript;base64,${source.toString('base64')}`);
const context=(paper,extra={})=>({time:3,width:1920,height:1080,backgroundAlpha:extra.backgroundAlpha??.94,
  effects:{paper,staff:'#323a43',backgroundOpacity:0,...extra.effects},
  lighting:{scoreVisible:true,panelOpacity:0,...extra.lighting},
  scene:{animateBackground:false},image:extra.image||null});

test('sRGB luminance changes the actual white and black material gains',()=>{
  assert.ok(Math.abs(srgbToLinear(.5)-.21404114)<1e-6);
  const dark=keyboardMaterialAt(3,context('#080e19'));
  const bright=keyboardMaterialAt(3,context('#ffffff'));
  assert.ok(dark.white>bright.white+.1);
  assert.ok(dark.black>bright.black+.1);
});

test('image, score color, panel opacity and color temperature affect the target',()=>{
  const dark=keyboardMaterialAt(3,context('#080e19'));
  const image={width:1,height:1,aspect:1,pixels:new Uint8ClampedArray([255,220,170,255])};
  const photo=keyboardMaterialAt(3,context('#080e19',{image,backgroundAlpha:.04,effects:{backgroundOpacity:1}}));
  const score=keyboardMaterialAt(3,context('#080e19',{effects:{staff:'#ffffff'}}));
  const panel=keyboardMaterialAt(3,context('#080e19',{lighting:{panelOpacity:1,panelColor:'#ffffff'}}));
  assert.ok(photo.white<dark.white);
  assert.ok(score.white<dark.white);
  assert.ok(panel.white<dark.white);
  assert.ok(photo.tint[0]>photo.tint[2]);
  assert.deepEqual(keyboardMaterialAt(3,context('#080e19',{lighting:{temperatureSync:false}})).tint,[1,1,1]);
});

test('manual material, independent gains and time-based scene smoothing are repeatable',()=>{
  const manual=context('#ffffff',{lighting:{mode:'manual',baseBrightness:.8,
    whiteBrightness:1.2,blackBrightness:.7,reflectionStrength:.4}});
  const result=keyboardMaterialAt(3,manual);
  assert.equal(result.white,.96);
  assert.ok(Math.abs(result.black-.56)<1e-10);
  assert.equal(result.reflection,.4);
  const dim=keyboardMaterialAt(3,context('#ffffff',{lighting:{mode:'manual',baseBrightness:.15,
    whiteBrightness:.3,blackBrightness:.2}}));
  assert.equal(dim.white,.08);
  assert.equal(dim.black,.05);
  globalThis.ScoreStudio={frame:(_scene,time)=>({color:time<3?'#101018':'#ffffff'})};
  const scene=context('#080e19');scene.scene.animateBackground=true;
  const at3=keyboardMaterialAt(3,scene);
  keyboardMaterialAt(10,scene);
  assert.deepEqual(keyboardMaterialAt(3,scene),at3);
  assert.ok(at3.white>keyboardMaterialAt(3.6,scene).white);
});
