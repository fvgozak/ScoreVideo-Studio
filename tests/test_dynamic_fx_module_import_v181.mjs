import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';

// Regression for Chrome's cached background1 JS: if the lighting module
// lacks the newly-added export, the adapter must still load successfully.
const root=new URL('../static/',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const piano=readFileSync(new URL('piano-fall.js',root),'utf8');
const adapter=readFileSync(new URL('dynamic-fx/adapter.js',root),'utf8');
assert.match(html,/piano-fall\.js\?v=[^"']+/);
assert.match(piano,/adapter\.js\?v=[^"']+/);
assert.match(adapter,/renderer\.js\?v=[^"']+/);
assert.match(adapter,/adaptive-lighting\.js\?v=[^"']+/);
assert.doesNotMatch(adapter,/import\s*\{[^}]*fxBackdropAlpha[^}]*\}/,
  'fxBackdropAlpha must not be a required named import');
const temp=mkdtempSync(join(tmpdir(),'scoremotion-v181-'));
try{
  const dest=join(temp,'dynamic-fx');
  cpSync(new URL('dynamic-fx/',root).pathname,dest,{recursive:true});
  // Simulate a stale background1 response which has the ordinary lighting
  // exports but not the new fxBackdropAlpha helper.
  const lightingFile=join(dest,'adaptive-lighting.js');
  const lighting=readFileSync(lightingFile,'utf8');
  assert.match(lighting,/export function fxBackdropAlpha/);
  writeFileSync(lightingFile,lighting.replace('export function fxBackdropAlpha','function fxBackdropAlpha'));
  const {ScoreDynamicFX}=await import(pathToFileURL(join(dest,'adapter.js')).href+'?v=photoalpha181');
  assert.equal(typeof ScoreDynamicFX,'function');
  console.log('PASS: v18.1 imports with stale lighting module (no fxBackdropAlpha export)');
}finally{rmSync(temp,{recursive:true,force:true});}
