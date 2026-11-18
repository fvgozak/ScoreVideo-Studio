import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,base),'utf8');
const html=read('static/index.html'),app=read('static/app.js'),runtime=read('static/stage-runtime.js');
const adapter=read('static/dynamic-fx/adapter.js'),renderer=read('static/dynamic-fx/renderer.js');
const server=read('app.py');
assert.match(html,/id="pianoVerticalOffset"[^>]*type="range"[^>]*min="-20"[^>]*max="20"[^>]*value="0"/);
assert.match(app,/piano_vertical_offset_pct:Number\(\$\('pianoVerticalOffset'\).value\)/);
assert.match(app,/persistent=\[[\s\S]*?'pianoVerticalOffset'/);
assert.match(app,/\$\('pianoVerticalOffset'\).addEventListener\('input',queueApply\)/);
assert.match(runtime,/verticalOffsetPct:clamp\(number\(s.piano_vertical_offset_pct,0\),-20,20\)/);
assert.match(adapter,/cameraVerticalOffsetPct:clamp\(Number\(pianoSettings.verticalOffsetPct\?\?0\),-20,20\)/);
assert.match(renderer,/verticalOffsetPct:this.settings.cameraVerticalOffsetPct/g);
assert.match(server,/piano_vertical_offset_pct: float = Field\(default=0.0, ge=-20, le=20\)/);
for(const lang of ['ko','en','ja']){
  const pack=JSON.parse(read(`static/locales/${lang}.json`));
  assert.ok(pack.messages['scene.pianoVerticalOffset']);
  assert.ok(pack.messages['scene.pianoVerticalOffsetHelp']);
}
console.log('PASS v24 UI + persistent settings + preview/export + localization wiring');
