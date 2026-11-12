const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('static/camera-auto.js','utf8'),context,{filename:'camera-auto.js'});
const suggest=context.window.ScoreCameraAuto.suggest;
const notes=[];
for(let second=0;second<=80;second++){
  const chord=second%8===0;
  const pitches=chord?[48,60,72]:[60+(second%7)];
  pitches.forEach((pitch,index)=>notes.push({scoreKey:`n${second}-${index}`,audio:second,pitch,
    beat:second*2,measure:Math.floor(second/4)+1,velocity:chord?105:65,
    noteX:second*20,noteY:90-pitch,systemKey:Math.floor(second/16)}));
}
const manual={key:'n16-2',measure:5,pitch:72,zoom:1.4,duration:2,timing:-.6,shake:0};
const result=suggest(notes,{duration:81,existing:[manual]});
assert(result.length>=5&&result.length<=24,'sparse points spread across the piece');
assert(result.every(p=>p.auto&&p.key&&p.zoom>=1.05&&p.zoom<=1.6));
assert(result.some(p=>p.measure>=15),'late sections are included');
const times=result.map(p=>notes.find(n=>n.scoreKey===p.key).audio);
assert(times.every(t=>Math.abs(t-16)>=5.2),'manual points are protected');
assert(times.slice(1).every((t,i)=>t-times[i]>=5.2),'shots are not too dense');
assert.equal(JSON.stringify(result),JSON.stringify(suggest([...notes].reverse(),{duration:81,existing:[manual]})),'input order does not change suggestions');
assert.equal(suggest([]).length,0);
const index=fs.readFileSync('static/index.html','utf8');
const app=fs.readFileSync('static/app.js','utf8');
assert(index.includes('id="cameraPointAuto"'));
assert(index.indexOf('camera-auto.js')<index.indexOf('app.js'));
assert(app.includes('ScoreCameraAuto.suggest'));
assert(app.includes('writeCameraPoints([...manual,...suggested])'));
assert(app.includes('p.auto=false'),'editing an automatic point promotes it to a protected manual point');
console.log('Interactive View auto points are deterministic, sparse, and preserve manual edits');
