import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {risingNoteRect,normalizeNoteBarMode} from '../static/dynamic-fx/note-bars.js';

const options={hitY:-.81,roof:5.4,speed:2};
const note={start:1,end:2,midi:60,velocity:95};
assert.equal(risingNoteRect(note,.99,options),null,'never appear before attack');
assert.equal(risingNoteRect(note,1,options),null,'starts at zero length at the key');
const half=risingNoteRect(note,1.5,options);
assert.ok(half.hi>options.hitY+.9&&half.hi<options.hitY+1.1,'head rises while held');
assert.ok(half.lo>options.hitY&&half.lo<options.hitY+.05,'tail anchored to struck key');
const later=risingNoteRect(note,2.5,options);
assert.ok(later.lo>options.hitY+.9,'tail follows after note-off');
assert.ok(later.hi>half.hi,'head keeps travelling');
assert.equal(risingNoteRect(note,6,options),null,'bar eventually leaves viewport');
for(const t of [1.25,1.7,2.3,3.2]){
  assert.deepEqual(risingNoteRect(note,t,options),risingNoteRect(note,t,options),
    `geometry must be seek/FPS independent: ${t}`);
}
assert.equal(normalizeNoteBarMode('rise'),'rise');
assert.equal(normalizeNoteBarMode('both'),'both');
assert.equal(normalizeNoteBarMode('off'),'off');
assert.equal(normalizeNoteBarMode('legacy-value'),'fall');
const root=new URL('../static/',import.meta.url);
const index=readFileSync(new URL('index.html',root),'utf8');
const render=readFileSync(new URL('render.html',root),'utf8');
const ui=readFileSync(new URL('fx-groups.js',root),'utf8');
const app=readFileSync(new URL('app.js',root),'utf8');
const adapter=readFileSync(new URL('dynamic-fx/adapter.js',root),'utf8');
const renderer=readFileSync(new URL('dynamic-fx/renderer.js',root),'utf8');
for(const text of [index,render])assert.match(text,/piano-fall\.js\?v=keyboard24/);
for(const key of ['keyboardNoteBarMode','keyboardNoteRiseSpeed']){
  assert.ok(ui.includes(key),`${key} exists in effects UI`);
  assert.ok(app.includes(key),`${key} saved/exported`);
}
assert.ok(adapter.includes('keyboard.noteBarMode')&&adapter.includes('keyboard.noteRiseSpeed'));
assert.match(renderer,/risingNoteRect\(/);
assert.match(renderer,/updateBuffer\(gl,this\.notes,new Float32Array\(noteBarData\)\)/,
  'switching Off must clear stale geometry');
console.log('PASS: note bars rise from struck keys, release tail, seek deterministic, UI/export wired');
