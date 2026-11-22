'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=process.argv[2]||'.';
const source=fs.readFileSync(path.join(root,'static/local-projects.js'),'utf8');
const a=source.indexOf('function firstSoundPercentile(');
const b=source.indexOf('async function apiFetch(',a);
assert(a>=0&&b>a,'First-sound detector not installed');
const context={Float32Array,Array,Math,Number,Error};
vm.runInNewContext(source.slice(a,b)+'\nthis.detect=detectFirstAudioSound;this.align=autoSync;',context);
const sr=16000;const mono=(seconds)=>new Float32Array(Math.round(sr*seconds));
function put(arr,start,duration,amplitude,freq=311){const a=Math.max(0,Math.round(start*sr)),b=Math.min(arr.length,a+Math.round(duration*sr));
 for(let i=a;i<b;i++){const x=i-a;const ramp=Math.min(1,x/(sr*.02));arr[i]+=amplitude*ramp*Math.sin(2*Math.PI*freq*i/sr);}}
function buffer(...channels){return {sampleRate:sr,numberOfChannels:channels.length,length:channels[0].length,getChannelData:i=>channels[i]};}
function check(label,buf,expected,tolerance=.085){const r=context.detect(buf);console.log(label,r.first_audio_sec, 'expect',expected, 'confidence',r.confidence);assert(Math.abs(r.first_audio_sec-expected)<tolerance,`${label}: onset=${r.first_audio_sec} expected=${expected}`);return r;}
{
 let x=mono(7);put(x,.82,1,.0009);put(x,2.3,.8,.3);
 check('weak opening then loud chord',buffer(x),.82);
}
{
 let left=mono(6),right=mono(6);put(right,.63,1,.035);put(left,2,.8,.15);
 const r=check('right channel onset',buffer(left,right),.63);assert.equal(r.channels_analyzed,2);
}
{
 let x=mono(5);put(x,0,1,.0007);put(x,2,1,.2);
 check('weak start at t=0',buffer(x),0);
}
{
 let x=mono(5);put(x,.2,.003,.55);put(x,.9,.8,.025);
 check('isolated click then true onset',buffer(x),.9);
}
{
 let x=mono(6);for(let i=0;i<x.length;i++)x[i]=.00003*Math.sin(2*Math.PI*90*i/sr);
 put(x,1.05,.8,.013);
 check('quiet hum then note',buffer(x),1.05);
}
{
 let x=mono(6);for(let i=0;i<x.length;i++)x[i]=.004*Math.sin(2*Math.PI*120*i/sr);
 put(x,1.2,.9,.1);
 check('sustained hum must not be t=0',buffer(x),1.2);
}
{
 let x=mono(8);put(x,.45,.8,.02);put(x,2,.8,.12);
 class AudioContextMock {async decodeAudioData(){return buffer(x);}async close(){}}
 context.AudioContext=AudioContextMock;
 (async()=>{const data=await context.align({meta:{note_events:[{second:.10},{second:2.5}],note_count:2,midi_duration_sec:4,generated_audio:false},audio:{arrayBuffer:async()=>new ArrayBuffer(0)}});
 assert(Math.abs(data.offset_sec-.35)<.08);assert.equal(data.analysis_version,3);assert.equal(data.anchors[0].audio,data.offset_sec);
 console.log('PASS: stereo, soft attack, click filtering, offset anchors');
 })().catch(e=>{console.error(e);process.exitCode=1;});
}
