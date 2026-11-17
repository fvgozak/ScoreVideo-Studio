const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const handlers = {};
const context = {window: {}, document: {querySelectorAll: () => [], getElementById: () => null}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('static/visual-editor.js', 'utf8'), context);

const box = {
  style: {}, addEventListener(type, callback){handlers[type] = callback;},
  setPointerCapture(){}, hasPointerCapture(){return false;}
};
const editButton = {
  disabled: false, addEventListener(){}, setAttribute(){}, textContent: ''
};
const controls = Object.fromEntries(Object.entries({
  x: 50, width: 50, height: 50, top: 10, bottom: 10
}).map(([key, value]) => [key, {value: String(value)}]));
const stage = {settings: {width: 1080, height: 1920}, scoreWindow: {style: {}}};
const editor = context.window.createScoreVisualEditor({
  frame: {getBoundingClientRect: () => ({width: 480, height: 853.333333333})},
  overlay: {hidden: true}, box, editButton, controls,
  getResolution: () => ({width: 2160, height: 3840}),
  getStage: () => stage, commit(){}, label(){}
});
editor.setEditing(true);

const pointer = (clientX, clientY) => ({
  button: 0, pointerId: 1, target: {closest: () => null},
  clientX, clientY, preventDefault(){}
});
handlers.pointerdown(pointer(100, 200));
handlers.pointermove(pointer(148, 200));
assert.equal(controls.x.value, '70');
assert.equal(stage.scoreWindow.style.left, '378px',
  '4K to 1080px preview must move the SVG by preview-scaled pixels, not 4K pixels');
assert.equal(stage.scoreWindow.style.width, '540px');
handlers.pointermove(pointer(100, 285.333333333));
assert.equal(controls.top.value, '20');
assert.equal(stage.scoreWindow.style.top, '384px',
  'vertical dragging must use the preview stage resolution as well');
handlers.pointerup(pointer(100, 285.333333333));
console.log('Score area drag at downscaled Shorts resolution tests passed');
