import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=process.argv[2]||'.';
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
const lp=fs.readFileSync(path.join(root,'static/local-projects.js'),'utf8');
const sc=fs.readFileSync(path.join(root,'static/staff-colors.js'),'utf8');
for(const symbol of ['browserOnlyRequested','lastProjectKey','exampleManifest','scorevideo_last_local_project','serializeProjectState','restoreProjectState'])
  assert(app.includes(symbol),`current app feature was lost: ${symbol}`);
assert(app.includes('localStorage.setItem(lastProjectKey,imported.id)'), 'import must preserve browser-local recent project key');
assert(!app.includes("localStorage.setItem('scorevideo_last_project',imported.id)"), 'avoid writing stale server recent project key');
assert(app.includes('project.sync=null;stage?.setSync(null);schedulePortableAutosave()'), 'sync clearing should persist');
for(const symbol of ['root.SCOREMOTION_LOCAL_ONLY===true','local_project:true','request:apiFetch','setStaffGroups(id,groups)','saveState','replaceAsset','importRecord','STATE_STORE'])
  assert(lp.includes(symbol),`current local-project feature was lost: ${symbol}`);
assert(sc.includes('setStaffGroups(meta.id,found)'), 'staff catalog recovery contract must survive');
console.log('PASS v3 integration: browser-local flags, example manifest, staff group catalog API, recent project and sync persistence');
