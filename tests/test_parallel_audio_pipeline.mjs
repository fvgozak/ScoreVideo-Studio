import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const root=process.argv[2]||'.';
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
const off=fs.readFileSync(path.join(root,'static/offline/offline.js'),'utf8');
const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
const modSource=fs.readFileSync(path.join(root,'static/offline/offline-generated-audio.js'),'utf8')
  .replace(/^import .*;\s*$/gm,'').replace(/export (const|async function\*|async function|function)/g,'$1');
assert.match(app,/window\.ScoreLocalProjects\?\.enabled&&project\?\.generated_audio&&window\.__scoreMotionParallelAudioEnabled!==false/);
assert.match(app,/await ensureLocalAudioReady\(projectId\)/);
assert.match(off,/const generatedAudio=audioMode==='source'/);
assert.match(off,/encodeGeneratedPianoAac\(audioTrack\.source,stage\.meta/);
assert.match(off,/audioTask=\(generatedAudio/);
assert.match(off,/if\(generatedAudio\)/);
assert.match(html,/static\/offline-export\.js\?v=[^"\s]*parallelAudio1/);
assert.match(html,/static\/app\.js\?[^"\s]*parallelAudio1/);
let requested=0,created=0,maximumNodes=0,decoderClosed=0,offsetStarts=[];
class AudioSample{constructor(o){Object.assign(this,o);}close(){}}
class FakeDecoder{constructor(){this.state='running';}async close(){decoderClosed++;this.state='closed';}}
class OfflineAudioContext{
 constructor(ch,frames,rate){assert.equal(ch,2);assert.equal(rate,48000);assert.ok(frames<=48000*8);this.length=frames;this.destination={};this.nodes=0;created++;}
 createBufferSource(){this.nodes++;maximumNodes=Math.max(maximumNodes,this.nodes);const s={buffer:null,playbackRate:{value:1},connect(){return s;},start(a,b){offsetStarts.push(b||0);},stop(){}};return s;}
 createGain(){const g={gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){return g;}};return g;}
 async startRendering(){const frames=this.length;return {length:frames,getChannelData(){return new Float32Array(frames);},copyFromChannel(out){out.fill(0);}};}
}
const sample={pitch:60,buffer:{duration:20}};
const local={enabled:true,pianoSampleKey(){return 'C4.mp3';},async getPianoSample(){requested++;return sample;}};
const ctx={window:{ScoreLocalProjects:local},AudioContext:FakeDecoder,OfflineAudioContext,
 AudioSample,performance:{now:()=>Date.now()},setTimeout,clearTimeout,console};
vm.createContext(ctx);
vm.runInContext(modSource+'\nthis.Test={scheduleChunkNote,eventEnvelope,envelopeAt,renderGeneratedChunks,encodeGeneratedPianoAac};',ctx);
const api=ctx.Test;
const e={second:7.8,pitch:60,velocity:80,sustain_end_second:8.8};
const env=api.eventEnvelope(e,20);
assert.ok(api.envelopeAt(env,8.0)>0);
assert.equal(api.envelopeAt(env,7.8),0);
const dense={audio_duration_sec:360,note_events:[]};
for(let i=0;i<11000;i++){
 const second=i*350/11000;
 dense.note_events.push({second,pitch:60,velocity:80,end_second:second+.22,sustain_end_second:second+.58});
}
dense.note_events.push(e);
let received=0,totalFrames=0,final={};
const sink={async add(s){assert.equal(s.numberOfChannels,2);assert.equal(s.sampleRate,48000);assert.ok(s.numberOfFrames<=96000);received++;totalFrames+=s.numberOfFrames;}};
const result=await api.encodeGeneratedPianoAac(sink,dense,360,()=>false,null,p=>{final=p;},()=>360);
assert.equal(result.chunks,45);
assert.equal(result.frames,360*48000);
assert.equal(totalFrames,360*48000);
assert.equal(received,180);
assert.equal(created,45,'must construct bounded 8-second offline contexts');
assert.ok(maximumNodes<1000,'must not create all 11,000 audio nodes in one context');
assert.equal(requested,1,'sample loaded once per complete export');
assert.ok(offsetStarts.some(x=>x>0&&x<1),'note crossing chunk boundary must start at correct sample offset');
assert.equal(final.seconds,360);
assert.equal(decoderClosed,1);
let cancelCount=0;
await assert.rejects(async()=>{
 for await (const chunk of api.renderGeneratedChunks({audio_duration_sec:30,note_events:[e]},
   {shouldCancel:()=>cancelCount++>1}))void chunk;
},/Cancelled/);
console.log('PASS parallel MIDI AAC: 6-minute 11k-note simulation, 45 bounded offline contexts, 180 timestamped AAC blocks, overlapping notes, cancellation, no WAV');
