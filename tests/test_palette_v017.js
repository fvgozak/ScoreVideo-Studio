const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const index=fs.readFileSync('static/index.html','utf8');
const app=fs.readFileSync('static/app.js','utf8');
const ids=['zoom','zoomInButton','zoomOutButton','zoomResetButton','zoomVal','paletteImageFile','paletteDropZone','paletteSetBackground','backgroundFile','backgroundPreview','backgroundStatus','paletteFromBackground','paletteChips','paletteSchemes','backgroundName','removeBackground'];
for(const id of ids){assert.match(index,new RegExp(`id="${id}"`));}
assert.equal((index.match(/id="zoom"/g)||[]).length,1);
assert(index.indexOf('id="zoom"')>index.indexOf('id="playerDock"'));
assert(index.indexOf('id="zoom"')<index.indexOf('id="previewSurround"'));
assert.match(index,/id="zoom"[^>]*max="2"/,'score zoom reaches 200%');
assert(index.indexOf('image-palette-studio')<index.indexOf('video-background-panel'),
  'the prominent image card comes before background adjustments');
assert(index.indexOf('id="paletteImageFile"')<index.indexOf('id="backgroundFile"'),'palette and background have separate pickers');
assert(index.indexOf('id="backgroundFile"')<index.indexOf('id="paletteResults"'),'background controls remain visible before long palette results');
assert(!index.includes('id="paletteUseBackground"'),'background application is explicit');
assert(app.includes("$('backgroundFile')"));
assert(!app.includes("$('paletteUseBackground')"));
assert.match(index,/id="velocityUniformWarning"/);
assert.match(app,/ScoreImagePaletteUI\.schemes\(result\.schemes/);
assert.match(app,/function setBackground\(file\)/);
assert.match(app,/paletteSourceFile/);
assert.match(app,/pendingBackgroundFile/);
assert(!app.includes('palettePendingFile'));
assert.match(app,/queueApply\(\)/);
assert.match(index,/image-palette\.js\?v=[0-9.]+/);
console.log('v0.17 visible zoom + palette app UI wiring passed');
