import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dirname=path.dirname(fileURLToPath(import.meta.url));
const source=fs.readFileSync(path.join(dirname,'../static/gpu-composer.js'),'utf8');
class FakeCanvas { constructor(){this.width=1920;this.height=1080;} }
class FakeContainer {
  constructor(){this.children=[];this.destroyed=false;}
  addChild(...children){this.children.push(...children);return children[0];}
  removeChildren(){const old=this.children;this.children=[];return old;}
  destroy(){this.destroyed=true;}
}
class FakeGraphics extends FakeContainer {}
class FakeSprite extends FakeContainer {
  constructor(texture){super();this.texture=texture;this.lastDestroyOptions=null;}
  destroy(options){this.lastDestroyOptions=options;this.destroyed=true;}
}
const PIXI={
  Container:FakeContainer,Graphics:FakeGraphics,Sprite:FakeSprite,
  Texture:{from:source=>({source})}
};
const context={performance:{now:()=>100},HTMLCanvasElement:FakeCanvas};
context.window=context;
vm.runInNewContext(source,context,{filename:'gpu-composer.js'});
const GPUComposer=context.ScoreGpuComposer._test.GPUComposer;
function fixture(){
  const app={canvas:{},stage:new FakeContainer(),destroyCalls:[],destroy(...args){this.destroyCalls.push(args);}};
  return {app,composer:new GPUComposer(app,PIXI,{})};
}

// A tile has a private texture; an editor canvas has a shared texture.
const {app,composer}=fixture();
const privateTile={closeCount:0,close(){this.closeCount++;}};
const title={closeCount:0,close(){this.closeCount++;}};
const liveCanvas=new FakeCanvas();
const mirrorCanvas=new FakeCanvas();
composer.ownedSources.add(privateTile);
composer.ownedSources.add(title);
composer.ownedSources.add(mirrorCanvas);
const tileSprite=composer.ensureSprite(privateTile);
const titleSprite=composer.ensureSprite(title);
const liveSprite=composer.ensureSprite(liveCanvas);
const mirrorSprite=composer.ensureSprite(mirrorCanvas);
composer.tileCache.set('tile',{image:privateTile,bytes:4096,usedFrame:1});
composer.tileBytes=4096;
composer.titleCache.set('T',title);
composer.root.addChild(liveSprite);
composer.root.removeChildren(); // Mimics the per-frame detached sprite.
composer.close();
assert.equal(composer.isClosed,true);
assert.equal(tileSprite.destroyed,true);
assert.equal(tileSprite.lastDestroyOptions.texture,true);
assert.equal(titleSprite.destroyed,true);
assert.equal(titleSprite.lastDestroyOptions.textureSource,true);
assert.equal(mirrorSprite.lastDestroyOptions.texture,true);
assert.equal(liveSprite.destroyed,true);
assert.equal(liveSprite.lastDestroyOptions,undefined,'Do not destroy live editor texture');
assert.equal(liveCanvas.width,1920,'Never reset editor canvas');
assert.equal(mirrorCanvas.width,0,'Release private mirror backing store');
assert.equal(privateTile.closeCount,1);
assert.equal(title.closeCount,1);
assert.equal(composer.spriteCache.size,0);
assert.equal(composer.ownedSources.size,0);
assert.equal(app.destroyCalls.length,1);
assert.equal(app.destroyCalls[0][1].context,true);
assert.equal(app.destroyCalls[0][1].textureSource,true);
assert.equal(context.__scoreMotionExportGpuStats.active,0);
assert.equal(context.__scoreMotionExportGpuStats.lastClosed.success,true);
composer.close();
assert.equal(app.destroyCalls.length,1,'Double-close must be safe');
const {composer:second}=fixture();second.close();
assert.equal(context.__scoreMotionExportGpuStats.created,2);
assert.equal(context.__scoreMotionExportGpuStats.closed,2);
assert.equal(context.__scoreMotionExportGpuStats.active,0);
console.log('PASS export GPU lifecycle: detached sprites, private textures, shared preview, mirrors, context, repeat close');
