import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = process.argv[2] || '.';
const content = fs.readFileSync(path.join(root, 'tests/validate_local_mp4_audio_browser.py'),'utf8');
const match = content.match(/page\.wait_for_function\('([^'\n]*ScoreLocalProjects[^'\n]*)',timeout=30000\)/);
assert.ok(match, 'Could not find Playwright readiness predicate');
const predicate = match[1];
let called=0;
const context = {window: {ScoreLocalProjects: { enabled: true, openProject: () => {called++;throw Error('openProject was unexpectedly called without ID');}}}};
const evaluate = (text) => {
  const value=vm.runInNewContext(text,context);
  // Playwright waits by calling a returned function with undefined.
  return typeof value === 'function'?value(undefined):value;
};
assert.equal(evaluate(predicate),true,'project readiness predicate must return true');
assert.equal(called,0,'readiness predicate must not call openProject()');
context.window.ScoreLocalProjects.enabled=false;
assert.equal(evaluate(predicate),false);
context.window.ScoreLocalProjects.enabled=true;
context.window.ScoreLocalProjects.openProject=undefined;
assert.equal(evaluate(predicate),false);
console.log('PASS local MP4 browser test predicate: Boolean readiness, no openProject(undefined), no project data touched');
