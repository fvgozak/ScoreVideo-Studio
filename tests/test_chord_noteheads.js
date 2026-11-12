const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const scope={window:{}};
vm.createContext(scope);
vm.runInContext(fs.readFileSync('static/score-core.js','utf8'),scope);
const pick=scope.window.ScoreFollower.pickNoteheadForChord;
const upperHead={getBoundingClientRect:()=>({top:10,left:5,width:8,height:5}),setAttribute(){}};
const lowerHead={getBoundingClientRect:()=>({top:30,left:5,width:8,height:5}),setAttribute(){}};
const group={querySelectorAll:()=>[lowerHead,upperHead]};
const lower={sourceNote:{halfTone:60},getSVGGElement:()=>group};
const upper={sourceNote:{halfTone:72},getSVGGElement:()=>group};
const duplicate={sourceNote:lower.sourceNote,getSVGGElement:()=>group};

assert.equal(pick(lower,[lower,upper,duplicate],group,[lowerHead])[0],lowerHead);
assert.equal(pick(upper,[lower,upper,duplicate],group,[lowerHead])[0],upperHead);
assert.notEqual(pick(lower,[lower,upper],group,[lowerHead])[0],pick(upper,[lower,upper],group,[lowerHead])[0],
  'notes sharing a stem must retain separate illuminated noteheads');
assert.match(fs.readFileSync('static/score-core.js','utf8'),/seenGraphical\.has\(identity\)/,
  'shared SVG groups must not be deduplicated before their chord notes are mapped');
const follower=Object.create(scope.window.ScoreFollower.prototype);
const matched={el:group,headEl:lowerHead};
follower.noteTriggers=[matched];follower.tieContinuations=[];
follower.container={getBoundingClientRect:()=>({left:0,top:0})};
follower.viewport={clientWidth:100,getBoundingClientRect:()=>({left:0,top:0,width:100})};
follower.attachUnmatchedChordHeads();
assert.equal(matched.fallbackHeads.length,1,'an unmatched sibling uses the chord attack for visual light only');
assert.equal(matched.fallbackHeads[0].el,upperHead);
assert.equal(matched.fallbackHeads[0].noteY,12.5);
console.log('Chord notes sharing a stem map to separate noteheads');
