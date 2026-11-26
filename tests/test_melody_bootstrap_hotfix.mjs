import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.argv[2]||'.';
const fx=fs.readFileSync(path.join(root,'static/fx-groups.js'),'utf8');
const staff=fs.readFileSync(path.join(root,'static/staff-colors.js'),'utf8');
const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
assert.ok(fx.includes('SCOREMOTION_MELODY_BOOTSTRAP_HOTFIX_V1'));
assert.ok(fx.includes("node.querySelector('.effect-basics') && node.querySelector('.effect-advanced')"));
assert.ok(staff.includes('SCOREMOTION_MELODY_BOOTSTRAP_HOTFIX_V1'));
assert.ok(staff.includes('node.querySelector(\'.fx-quick-group[data-fx-group="score"]\')'));
assert.ok(!fx.includes("const panel=document.querySelector('[data-editor-panel=\"effects\"] .panel:not("));
assert.ok(!staff.includes("const panel=document.querySelector('[data-editor-panel=\"effects\"] .panel:not("));
for(const s of ['fx-groups','staff-colors']){
  const matches=[...html.matchAll(new RegExp('/static/'+s+'\\.js\\?v=([^\"<>]+)', 'g'))];
  assert.equal(matches.length,1,s+' expected exactly once');
  assert.ok(matches[0][1].includes('&melodyBoot1'),s+' version should be cache busted');
}
assert.ok(html.includes('id="melodyEnabled"')&&html.includes('id="uploadForm"'));
console.log('PASS bootstrap static: real FX panel selected, staff colors placed correctly, fresh assets, project form intact');
