import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const text=path=>readFileSync(resolve(ROOT,path),'utf8');
const html=text('static/index.html');
const renderHtml=text('static/render.html');
const app=text('static/app.js');
const offline=text('static/offline/offline.js');
const dispatcher=text('static/offline-export.js');
const composer=text('static/gpu-composer.js');

// No user-facing option can select the deprecated CPU/Canvas2D effect renderer.
assert.match(html,/<select id="fxRenderer" hidden><option selected value="pixi">/);
assert.doesNotMatch(html,/<option value="canvas"[^>]*>기존 Canvas2D/);
assert.doesNotMatch(html,/<option value="auto"[^>]*>자동 \(Auto\)/);
assert.match(app,/\$\('fxRenderer'\)\.value='pixi'/);
// Both primary paths no longer load the retired background pattern.
assert.ok(!existsSync(resolve(ROOT,'static/background-pattern.js')));
assert.doesNotMatch(html,/\/static\/background-pattern\.js/);
assert.doesNotMatch(renderHtml,/\/static\/background-pattern\.js/);
// A single GPU composer always owns MP4 output. CPU-only overlays are retired.
assert.match(composer,/this\.gpu=true/);
assert.doesNotMatch(offline,/createScoreGlowOverlay|createStaticScoreHeads/);
assert.doesNotMatch(offline,/compositeContext\.drawImage|compositeContext\.fillText|\.shadowCache=/);
assert.doesNotMatch(dispatcher,/score-glow-overlay\.js|score-static-heads\.js/);
assert.match(dispatcher,/offline\.js.*offline-audio\.js.*mediabunny\.min\.mjs/);
// The active fallback encoder and 3D/FX engines MUST remain intact.
for(const f of ['static/dynamic-fx/adapter.js','static/dynamic-fx/renderer.js',
  'static/pixi-fx.js','static/three-keyboard.js','render_video.py','render_worker.py']){
  assert.ok(existsSync(resolve(ROOT,f)),`active engine removed: ${f}`);
}
console.log('PASS v20: retired pattern, dead GPU-era CPU overlay paths and unavailable renderer UI removed');
