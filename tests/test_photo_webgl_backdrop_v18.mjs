import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../static/dynamic-fx/',import.meta.url);
const source=readFileSync(new URL('adaptive-lighting.js',root),'utf8');
const imported=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const {fxBackdropAlpha,keyboardMaterialAt}=imported;
for(const opacity of [.05,.5,.7,1]){
  assert.equal(fxBackdropAlpha({backgroundUrl:'/api/projects/test/background',backgroundOpacity:opacity}),0,
    'user photo must never be tinted by a second fullscreen GPU background');
}
assert.equal(fxBackdropAlpha({backgroundUrl:'/api/projects/test/background',backgroundOpacity:0}),.94,
  'explicitly hidden photo retains the original procedural studio backdrop');
assert.equal(fxBackdropAlpha({backgroundUrl:'',backgroundOpacity:1}),.94,
  'no-photo scene retains its original studio backdrop');
// Material illumination remains sensitive to the underlying image, not to
// the obsolete extra fullscreen studio tint when a photo is active.
const image={width:1,height:1,aspect:16/9,pixels:new Uint8ClampedArray([255,32,0,255])};
const lighting={mode:'auto',temperatureSync:true};
const scene={animateBackground:false};
const effects={paper:'#f7f7f7',staff:'#333333',backgroundOpacity:1,backgroundFit:'cover',backgroundPositionX:50,backgroundPositionY:50};
const result=keyboardMaterialAt(0,{lighting,scene,effects,image,width:1280,height:720,backgroundAlpha:fxBackdropAlpha({backgroundUrl:'/api/projects/id/background',backgroundOpacity:1})});
assert.ok(result.tint[0]>result.tint[2],'photo warmth should affect the keyboard');
const adapter=readFileSync(new URL('adapter.js',root),'utf8');
assert.match(adapter,/backgroundAlpha:fxBackdropAlpha\(follower\?\.effects\)/);
const renderer=readFileSync(new URL('renderer.js',root),'utf8');
assert.match(renderer,/premultipliedAlpha:false/,'canvas must use straight alpha for photo compositing');
console.log('PASS v18: photo visible beneath WebGL keyboard, straight-alpha compositor, adaptive keyboard lighting');
