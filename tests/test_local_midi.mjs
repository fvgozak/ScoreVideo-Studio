import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import vm from 'node:vm';

const base=resolve(import.meta.dirname,'..');
const window={};
vm.runInNewContext(readFileSync(resolve(base,'static/local-project-codec.js'),'utf8'),
  {window,Uint8Array,DataView,TextDecoder,Blob,Math,Number,Map,Set,Error,String,Array},
  {filename:'local-project-codec.js'});
const fixture=readFileSync(resolve(base,'examples/dream-journey/dream-journey.mid'));
const data=window.ScoreLocalCodec.midiTiming(fixture);
assert.equal(data.note_count,1557);
assert.equal(data.tempo_map.length,124);
assert.ok(Math.abs(data.midi_duration_sec-194.808)<.001);
assert.ok(data.note_events.some(n=>n.end_second>n.second));
assert.equal(data.note_events[0].pitch>=0,true);
assert.ok(data.pedal_events.length>=0);
const corrupt=Uint8Array.from([0,1,2,3,4,5,6,7]);
assert.throws(()=>window.ScoreLocalCodec.midiTiming(corrupt),/MIDI:/);
console.log('PASS local MIDI parser: tempo, notes, duration, sustain, invalid files');
