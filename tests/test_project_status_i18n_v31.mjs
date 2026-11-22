import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=process.argv[2]||'.';
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
assert.match(html, /id="portableProjectStatus"[^>]*data-i18n="projectIO\.idle"/, 'initial hint must still be localized');
const first=app.indexOf(' const portableStatus=(text,isError=false)=>{');
const last=app.indexOf(' const portableLocal=',first);
assert(first>0&&last>first,'status function not found');
const snippet=app.slice(first,last);
assert(snippet.includes("node.removeAttribute('data-i18n')"),'dynamic status must drop the static translation key');
assert(snippet.indexOf("node.removeAttribute('data-i18n')")<snippet.indexOf('node.textContent=text'), 'remove static translation key BEFORE updating dynamic status');
const attrs=new Map([['data-i18n','projectIO.idle']]);
const classes=new Set();let textValue='프로젝트 파일은 브라우저에서만 처리됩니다.';let logged='';
const el={
  removeAttribute:k=>{attrs.delete(k);},
  set textContent(v){textValue=String(v); if(attrs.has('data-i18n'))textValue='프로젝트 파일은 브라우저에서만 처리됩니다.';},
  get textContent(){return textValue;},
  classList:{toggle(k,v){if(v)classes.add(k);else classes.delete(k);}}
};
const ctx={ $:id=>id==='portableProjectStatus'?el:null, message:(s)=>{logged=s;} };
vm.runInNewContext(snippet+'globalThis.setStatus=portableStatus;',ctx);
ctx.setStatus('프로젝트 복원 완료');
assert.equal(el.textContent,'프로젝트 복원 완료');
assert.equal(logged,'프로젝트 복원 완료');
assert.equal(attrs.has('data-i18n'),false);
ctx.setStatus('파일 교체 완료');assert.equal(el.textContent,'파일 교체 완료');
ctx.setStatus('프로젝트 열기 실패: 테스트',true);assert(classes.has('error'));
ctx.setStatus('이전 원본 파일로 복원했습니다.');assert(!classes.has('error'));
console.log('PASS project status i18n v3.1: idle translated once, subsequent success/error/replace status stays visible');
