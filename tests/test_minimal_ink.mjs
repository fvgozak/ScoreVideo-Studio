import fs from 'node:fs';import assert from 'node:assert/strict';import path from 'node:path';
const root=path.resolve(process.argv[2]||process.cwd());
const source=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const core=source('static/score-core.js');
assert(core.includes("this.stageRoot.style.setProperty('--minimal-note-base',ink);"),'live score: engraving ink');
for(const rel of ['static/gpu-composer.js','static/webm-recorder.js','static/offline/score-static-heads.js']){
  const txt=source(rel);
  assert(!txt.includes('stage.settings.effects.minimalPalette?.note||stage.settings.effects.accent'),`${rel}: pre-play accent leak`);
  assert(txt.includes('(stage.settings.effects.inverted?stage.settings.effects.paper:stage.settings.effects.ink)'),`${rel}: inverted-aware ink`);
}
assert(source('static/stage.css').includes('.score-minimal-active'),'active notes remain highlighted');
assert(core.includes("el.classList.add('score-minimal-active')"),'active-note temporal updates preserved');
console.log('PASS: minimal idle noteheads = engraving ink in live/GPU/WebM/offline; active note logic unchanged');
