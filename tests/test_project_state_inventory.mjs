import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2]||'.';
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
const fx=fs.readFileSync(path.join(root,'static/fx-groups.js'),'utf8');
const localProjects=fs.readFileSync(path.join(root,'static/local-projects.js'),'utf8');
const spec=JSON.parse(fs.readFileSync(path.join(root,'tests/project_state_inventory.json'),'utf8'));
const captures=[...app.matchAll(/const persistent=\[([\s\S]*?)\];/g),...app.matchAll(/persistent\.push\(([\s\S]*?)\);/g)];
const ids=captures.flatMap(x=>[...x[1].matchAll(/'([A-Za-z][\w]*)'/g)].map(a=>a[1]));
assert.equal(new Set(ids).size,170,'all 170 IDs unique and enumerated');
assert.equal(ids.length,170);
const htmlIds=new Set([...html.matchAll(/\bid="([a-zA-Z][\w-]*)"/g)].map(x=>x[1]));
const dynamic=[...new Set(ids.filter(id=>!htmlIds.has(id)))];
assert.equal(dynamic.length,42,'dynamic FX controls expected');
for(const id of dynamic)assert(fx.includes(id),`missing dynamic control declaration: ${id}`);
assert.deepEqual(new Set(ids),new Set(spec.ids));assert.equal(spec.count,170);
assert(localProjects.includes("indexedDB.open(DB,2)")&&localProjects.includes("STATE_STORE='projectStates'"),'independent lightweight project state IndexedDB store');
for(const key of ['serializeProjectState','restoreProjectState','validateProjectState','saveCurrentProjectState','savePortableProject','openPortableProject','portableReplaceButton','portableUndoReplace','savePortableCopy'])assert(app.includes(key),`missing implementation ${key}`);
for(const id of ['savePortableProject','openPortableProject','portableReplaceButton','portableUndoReplace','savePortableCopy','portableAssets'])assert(htmlIds.has(id),`missing UI ${id}`);
const pos=needle=>html.indexOf(needle);
assert(pos('local-projects.js')<pos('project-archive.js')&&pos('project-archive.js')<pos('project-io.js')&&pos('project-io.js')<pos('app.js'), 'script ordering');
for(const lang of ['ko','en','ja']){
  const dict=JSON.parse(fs.readFileSync(path.join(root,`static/locales/${lang}.json`),'utf8'));
  for(const key of ['title','help','save','saveAs','open','replace','undo','score','midi','audio','background','palette','idle'])assert(dict.messages[`projectIO.${key}`],`${lang} missing ${key}`);
}
console.log('PASS project state inventory: 170 persistent IDs / 42 dynamic controls / special state / portable actions / 3 locales');
