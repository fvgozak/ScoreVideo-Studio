import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=process.argv[2]||'.';
const source=fs.readFileSync(path.join(root,'static/realtime-salamander.js'),'utf8');
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
const local=fs.readFileSync(path.join(root,'static/local-projects.js'),'utf8');
const html=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
const render=fs.readFileSync(path.join(root,'static/render.html'),'utf8');
let ctx,timer,stopped=0,created=0,notes=[];
class AudioContext {
 constructor(){this.currentTime=0;this.destination={};this.state='suspended';ctx=this;}
 async resume(){this.state='running';}
 async close(){this.state='closed';}
 createBufferSource(){
   const obj={buffer:null,playbackRate:{value:1},connect(){return obj;},disconnect(){},
     start(...args){notes.push(args);},stop(){stopped++;}};created++;return obj;
 }
 createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}};}
}
const fake={AudioContext,ScoreLocalProjects:{pianoSampleKey:p=>String(Math.round(p/3)),getPianoSample(){}}};
const env={window:fake,console,setInterval:f=>(timer=f,1),clearInterval:()=>{timer=null;}};
vm.runInNewContext(source,env,{filename:'realtime-salamander.js'});
assert.equal(typeof fake.ScoreRealtimeSalamander.Player,'function');
let loads=0,changes=[];
const player=new fake.ScoreRealtimeSalamander.Player({audio_duration_sec:4,note_events:[
 {second:0,pitch:60,velocity:100,end_second:.5,sustain_end_second:1.8},
 {second:.6,pitch:64,velocity:64,end_second:1.1,sustain_end_second:1.1},
 {second:2.4,pitch:67,velocity:80,end_second:3.1,sustain_end_second:3.1}
]}, {loadSample:async p=>{loads++;return {pitch:p,buffer:{duration:12}};},onState:t=>changes.push(t)});
assert.equal(player.paused,true);
await player.prepare();assert.equal(player.paused,true);assert.equal(player.currentTime,0);
assert.equal(notes.length,0,'prewarm must not render or play audio');
assert.equal(loads,2,'only near-future samples should load');
await player.play();assert.equal(player.paused,false);
assert.equal(created>0,true,'audio node should be scheduled at playback start');
ctx.currentTime=.4;timer?.();assert.ok(player.currentTime>.3&&player.currentTime<.5);
ctx.currentTime=.7;timer?.();assert.equal(notes.length>=2,true);
player.pause();assert.equal(player.paused,true);const paused=player.currentTime;
ctx.currentTime+=1;assert.equal(player.currentTime,paused,'pause must freeze visual clock');
player.seek(2.4);assert.equal(player.currentTime,2.4);
await player.play();assert.equal(player.paused,false);
ctx.currentTime+=2;timer?.();assert.equal(player.paused,true);
assert.ok(changes.includes('play')&&changes.includes('pause')&&changes.includes('ended'));
await player.dispose();assert.equal(ctx.state,'closed');
assert.ok(stopped>0,'active notes must stop on pause');
// No full-length WAV during project setup or normal preview. Output retains WAV.
assert.ok(!app.includes('queueSalamanderWarmup('));
assert.ok(app.includes('new window.ScoreRealtimeSalamander.Player(meta,'));
assert.ok(app.includes('void primer.prepare()'));
assert.ok(app.includes('if(liveSampler){'));
assert.ok(app.includes('function previewTime(){return liveSampler?'));
assert.ok(app.includes('function setPreviewTime(time){if(liveSampler)'));
assert.ok(app.includes('await ensureLocalAudioReady(projectId);'),'MP4 & WebM must still prepare offline audio');
assert.ok(local.includes('getPianoSample:(pitch,context)=>'));
assert.ok(local.includes('async function generatedPianoAudio(timing){'));
assert.ok(local.includes('async function ensureAudio(id){'));
assert.ok(html.includes('/static/realtime-salamander.js?v=livePreview1'));
assert.match(html,/\/static\/local-projects\.js\?[^"\s]*livePreview1/);
assert.ok(html.includes('app.js?')&&html.includes('livePreview1'));
assert.ok(!render.includes('realtime-salamander.js'),'offline render entry must stay unchanged');
console.log('PASS realtime piano: prewarm without WAV, sampled MIDI, clock/pause/seek/end, output WAV path, preview wiring');
