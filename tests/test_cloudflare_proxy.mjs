import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source=await fs.readFile(new URL('../functions/api/[[path]].js',import.meta.url),'utf8');
const {onRequest}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
const url='https://scoremotion.pages.dev/api/projects/123/status?job_id=abc';
const request=new Request(url,{headers:{'x-scoremotion-proxy-secret':'EVIL',cookie:'private=test'}});
const unauthorized=await onRequest({request,env:{}});
assert.equal(unauthorized.status,503);
const oldFetch=globalThis.fetch;
try{
  let upstream;
  globalThis.fetch=async next=>{upstream=next;return new Response('ok',{status:200});};
  const env={SCOREMOTION_BACKEND_ORIGIN:'https://example.org',SCOREMOTION_PROXY_SECRET:'super-secret'};
  const result=await onRequest({request,env});
  assert.equal(result.status,200);
  assert.equal(new URL(upstream.url).pathname,'/api/projects/123/status');
  assert.equal(new URL(upstream.url).search,'?job_id=abc');
  assert.equal(upstream.headers.get('x-scoremotion-proxy-secret'),'super-secret');
  assert.equal(upstream.headers.get('cookie'),null);
  const tooLarge=await onRequest({request:new Request(url,{method:'POST',headers:{'content-length':String(96*1024*1024)},body:'test'}),env});
  assert.equal(tooLarge.status,413);
  console.log('Cloudflare Pages proxy authorization, routes and upload limit: PASS');
}finally{globalThis.fetch=oldFetch;}
