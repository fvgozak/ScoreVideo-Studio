const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const index=fs.readFileSync('static/index.html','utf8');
const app=fs.readFileSync('static/app.js','utf8');
const ids=['zoom','zoomInButton','zoomOutButton','zoomResetButton','zoomVal','paletteImageFile','paletteDropZone','paletteFromBackground','paletteChips','paletteSchemes','paletteUseBackground'];
for(const id of ids){assert.match(index,new RegExp(`id="${id}"`));}
assert.equal((index.match(/id="zoom"/g)||[]).length,1);
assert(index.indexOf('id="zoom"')>index.indexOf('id="playerDock"'));
assert(index.indexOf('id="zoom"')<index.indexOf('id="previewSurround"'));
assert.match(app,/ScoreImagePaletteUI\.schemes\(result\.schemes/);
assert.match(app,/uploadBackgroundForPalette/);
assert.match(app,/queueApply\(\)/);
assert.match(index,/image-palette\.js\?v=0\.17\.1/);
console.log('v0.17 visible zoom + palette app UI wiring passed');
