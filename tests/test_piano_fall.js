const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{},document:{}};
vm.createContext(context);
for(const name of ['studio-scene.js','piano-fall.js','stage-runtime.js'])
  vm.runInContext(fs.readFileSync(`static/${name}`,'utf8'),context,{filename:name});
const {PianoFall,keyLayout,noteGeometry,fallSpeed,impactEnvelope,drawImpactLight,keyPalette,noteRange,cameraTarget,pianoProjection}=context.window.ScorePianoFall;
const {Stage,normalized}=context.window.ScoreStage;
assert.equal(keyLayout.keys.length,88);
assert.equal(keyLayout.whiteCount,52);
assert.equal(keyLayout.keys[0].pitch,21);
assert.equal(keyLayout.keys.at(-1).pitch,108);
const onset=noteGeometry({audio:2,endAudio:3},2,600,100);
assert.equal(onset.bottom,600,'bar must touch the keyboard exactly on MIDI note-on');
assert.equal(onset.top,500);
assert.equal(noteGeometry({audio:2,endAudio:3},2-3.2,600,fallSpeed(600)).bottom,0,
  'falling bar must enter at the absolute top of the stage');
assert.ok(impactEnvelope(0,.5,1)>impactEnvelope(.12,.5,1));
assert.ok(impactEnvelope(.12,.5,1)>impactEnvelope(.7,.5,1));
assert.equal(impactEnvelope(-.01,.5,1),0);
assert.equal(impactEnvelope(.86,.5,1),0);
assert.ok(impactEnvelope(.05,.5,1)>impactEnvelope(.05,.5,.3));
const calls={radial:0,linear:0,sparks:[]};
const lightContext={
 save(){},restore(){},beginPath(){},fill(){},fillRect(){},arc(x,y,r){calls.sparks.push([x,y,r]);},
 createRadialGradient(){calls.radial++;return {addColorStop(){}};},
 createLinearGradient(){calls.linear++;return {addColorStop(){}};}
};
drawImpactLight(lightContext,{pitch:60,audio:2,endAudio:2.5,velocity:120},
  {x:50,w:12},2,{impact:600,keyHeight:110,whiteWidth:12,black:false,strength:1.4,color:'#68ddfa'});
assert.equal(calls.radial,1,'impact uses Lumenote-style center bloom');
assert.equal(calls.linear,2,'impact includes a beam and key reflection');
assert.equal(calls.sparks.length,7,'impact includes seven deterministic sparks');
const firstSparks=JSON.stringify(calls.sparks);
calls.sparks=[];
drawImpactLight(lightContext,{pitch:60,audio:2,endAudio:2.5,velocity:120},
  {x:50,w:12},2,{impact:600,keyHeight:110,whiteWidth:12,black:false,strength:1.4,color:'#68ddfa'});
assert.equal(JSON.stringify(calls.sparks),firstSparks,'seeking back to a note reproduces the same particles');
const lowLight=context.window.ScoreStudio.pitchLightProfile(36);
const highLight=context.window.ScoreStudio.pitchLightProfile(96);
assert.ok(lowLight.spread>highLight.spread,'bass notes create a wider halo');
assert.ok(highLight.focus>lowLight.focus,'treble notes have a stronger core');
const radii=[];
const pitchContext={...lightContext,createRadialGradient(x,y,inner,x2,y2,radius){radii.push(radius);return {addColorStop(){}};}};
for(const pitch of [36,96])drawImpactLight(pitchContext,{pitch,audio:2,endAudio:2.5,velocity:100},
  {x:50,w:12},2,{impact:600,keyHeight:110,whiteWidth:12,black:false,strength:1.4,color:'#68ddfa'});
assert.ok(radii[0]>radii[1],'keyboard light uses the shared pitch-based halo size');
const options=normalized({piano_enabled:true,piano_light:true,piano_light_strength:2.7});
assert.equal(options.piano.enabled,true);
assert.equal(options.piano.light,true);
assert.equal(options.piano.strength,2.7);
assert.equal(normalized({piano_enabled:false,piano_light:false}).piano.enabled,false);
assert.equal(normalized({}).piano.keyStyle,'auto');
assert.equal(normalized({piano_key_style:'custom',piano_white_key_color:'#445566',piano_black_key_color:'#111827'}).piano.whiteKeyColor,'#445566');
assert.equal(normalized({width:1080,height:1920}).piano.portrait,true);
assert.equal(normalized({width:1920,height:1080}).piano.portrait,false);
assert.equal(normalized({width:1080,height:1920,piano_camera:false}).piano.camera,false);
assert.equal(keyPalette({keyStyle:'auto'},'#101827').white,keyPalette({keyStyle:'dark'}).white);
assert.equal(keyPalette({keyStyle:'auto'},'#fffdf6').white,keyPalette({keyStyle:'classic'}).white);
assert.equal(keyPalette({keyStyle:'custom',whiteKeyColor:'#445566',blackKeyColor:'#111827'}).white,'#445566');
assert.equal(normalized({}).scoreVisible,true);
assert.equal(normalized({score_visible:false}).scoreVisible,false);
assert.equal(normalized({score_visible:true},{has_score:false}).scoreVisible,false,
  'MIDI-only projects cannot reveal a missing score');
const hiddenStage=Object.create(Stage.prototype);
hiddenStage.meta={has_score:false};hiddenStage.settings=normalized({score_panel_opacity:.8},{has_score:false});
hiddenStage.scoreWindow={style:{setProperty(){}},dataset:{},hidden:false};hiddenStage.scorePanel={style:{}};hiddenStage.setupWindow=()=>{};
hiddenStage.applyScoreWindow();
assert.equal(hiddenStage.scoreWindow.hidden,true,'MIDI-only score window must not intercept or shade the piano');
assert.equal(hiddenStage.scorePanel.style.opacity,'0','an old opaque score panel must become fully transparent');
const visibilityStage=Object.create(Stage.prototype);
visibilityStage.settings=normalized({score_visible:false});
visibilityStage.layer={canvas:{style:{}}};
visibilityStage.follower={glitterLayer:{style:{}}};
visibilityStage.applyScoreVisibility();
assert.equal(visibilityStage.layer.canvas.style.display,'none');
assert.equal(visibilityStage.follower.glitterLayer.style.display,'none');
visibilityStage.settings=normalized({score_visible:true});
visibilityStage.applyScoreVisibility();
assert.equal(visibilityStage.layer.canvas.style.display,'');
assert.equal(visibilityStage.follower.glitterLayer.style.display,'');
const piano=Object.create(PianoFall.prototype);
piano.setFollower({noteEvents:[
  {pitch:60,velocity:100,beat:2,second:1,end_second:1.6},
  {pitch:60,velocity:50,beat:4,second:2,end_second:2.2},
  {pitch:12,velocity:80,beat:5,second:3,end_second:4}],
  beatToSeconds:beat=>beat/2,midiToAudio:second=>second+.25});
assert.equal(piano.notes.length,2);
assert.equal(piano.notes[0].audio,1.25);
assert.ok(Math.abs(piano.notes[0].endAudio-1.85)<1e-10);
assert.equal(piano.notes[1].audio,2.25,'repeated notes remain separate attacks');
const sharedSync={noteEvents:[{pitch:60,velocity:100,beat:2,second:1,end_second:1.6}],
  offsetSec:.2,beatToSeconds:beat=>beat/2,midiToAudio:second=>second+.5+.2};
piano.settings={offsetSec:.7};piano.setFollower(sharedSync);
assert.ok(Math.abs(piano.notes[0].audio-2.2)<1e-10,'piano trim is relative to shared auto sync, not score trim');
sharedSync.offsetSec=.9;sharedSync.midiToAudio=second=>second+.5+.9;
piano.setFollower(sharedSync);
assert.ok(Math.abs(piano.notes[0].audio-2.2)<1e-10,'changing the score trim must not move the piano');
assert.equal(normalized({piano_offset_sec:-.45}).piano.offsetSec,-.45);
assert.equal(normalized({piano_offset_sec:99}).piano.offsetSec,5);
const framedNotes=[
  {pitch:60,audio:0,endAudio:.5},{pitch:84,audio:5.5,endAudio:6},
  {pitch:48,audio:11,endAudio:11.5}];
const firstRange=noteRange(framedNotes,0,.5);
assert.equal(firstRange.low,57);
assert.equal(firstRange.high,63,'portrait view includes three physical keys each side');
assert.ok(cameraTarget(firstRange).span<52,'a narrow phrase crops the 88-key keyboard');
const far=pianoProjection({center:26,span:52},1080,1920,true);
const near=pianoProjection({center:26,span:11},1080,1920,true);
assert.ok(near.keyHeight>far.keyHeight&&near.whiteWidth>far.whiteWidth,
  'moving the camera closer enlarges keys in both dimensions');
assert.ok(Math.abs(near.keyHeight/near.whiteWidth-far.keyHeight/far.whiteWidth)<1e-9,
  'key proportions stay constant during portrait zoom');
assert.ok(near.keyTop<far.keyTop&&near.visibleSeconds<far.visibleSeconds,
  'the close camera shows taller keys but fewer falling notes');
const falling={audio:2,endAudio:2.5};
const nearBar=noteGeometry(falling,1.8,near.impact,near.speed);
const farBar=noteGeometry(falling,1.8,far.impact,far.speed);
assert.ok(nearBar.bottom-nearBar.top>farBar.bottom-farBar.top,
  'falling-note length grows along with the closer camera');
assert.equal(pianoProjection({center:26,span:52},1920,1080,false).keyHeight,1080*.165,
  'landscape retains the previous keyboard depth');
const cameraPiano=Object.create(PianoFall.prototype);
cameraPiano.settings={portrait:true,camera:true,offsetSec:0};
cameraPiano.setFollower({noteEvents:framedNotes.map(n=>({pitch:n.pitch,velocity:100,second:n.audio,end_second:n.endAudio})),
  beatToSeconds:beat=>beat,midiToAudio:second=>second,audioDuration:12,offsetSec:0});
const cameraStart=cameraPiano.cameraAt(0),cameraAfter=cameraPiano.cameraAt(3);
assert.ok(cameraStart.center<cameraAfter.center,'camera pans toward a later high register');
assert.ok(cameraPiano.cameraAt(.5).center>cameraStart.center,'the five-second window moves before the attack');
assert.ok(Math.abs(cameraPiano.cameraAt(.999).center-cameraPiano.cameraAt(1.001).center)<.01,
  'camera path is continuous at the second boundary');
assert.ok(Math.abs(cameraPiano.cameraAt(.999).span-cameraPiano.cameraAt(1.001).span)<.01,
  'camera zoom is continuous at the second boundary');
cameraPiano.settings={portrait:false,camera:true};
assert.equal(cameraPiano.cameraAt(7).span,52,'landscape keeps all 88 keys');
const zoomPiano=Object.create(PianoFall.prototype);
zoomPiano.settings={portrait:true,camera:true,offsetSec:0};
zoomPiano.setFollower({noteEvents:[
  {pitch:48,velocity:90,second:0,end_second:.5},
  {pitch:84,velocity:90,second:4,end_second:4.5},
  {pitch:84,velocity:90,second:7,end_second:7.5}],
  beatToSeconds:beat=>beat,midiToAudio:second=>second,audioDuration:9,offsetSec:0});
const opening=pianoProjection(zoomPiano.cameraAt(0),1080,1920,true);
const solo=pianoProjection(zoomPiano.cameraAt(6),1080,1920,true);
assert.ok(opening.whiteWidth<solo.whiteWidth&&opening.keyHeight<solo.keyHeight,
  'wide low/high interval pulls the camera away; a later narrow phrase moves it closer');
assert.ok(opening.visibleSeconds>solo.visibleSeconds,
  'the farther camera shows a longer run of future falling notes');
assert.match(fs.readFileSync('static/index.html','utf8'),/id="pianoOffset"/);
assert.match(fs.readFileSync('static/index.html','utf8'),/id="offsetNumber"/);
assert.match(fs.readFileSync('static/index.html','utf8'),/id="pianoOffsetNumber"/);
assert.match(fs.readFileSync('static/index.html','utf8'),/id="scoreVisible"/);
assert.match(fs.readFileSync('static/app.js','utf8'),/piano_offset_sec:pianoOffset\(\)/);
assert.match(fs.readFileSync('static/app.js','utf8'),/closest\?\.\('input,select,textarea,/,
  'global seek shortcuts must not swallow fine-tune slider arrow keys');
const scoreSparks=[];
const scoreImpactContext={...lightContext,ellipse(){},arc(x,y,r){scoreSparks.push([x,y,r]);}};
const scoreImpact=context.window.ScoreStudio.LayerRenderer.prototype.drawScoreImpact;
const engraved={pitch:60,audio:2,endAudio:2.5,velocity:120};
calls.radial=0;calls.linear=0;
scoreImpact(scoreImpactContext,50,80,0,.9,'#68ddfa',engraved);
assert.equal(scoreSparks.length,7,'score note receives the same seven-spark attack motion');
assert.equal(calls.radial,1,'engraved note uses the piano impact radial bloom');
assert.equal(calls.linear,2,'engraved note uses the piano impact beam and reflection');
const engravedSparks=JSON.stringify(scoreSparks);scoreSparks.length=0;
scoreImpact(scoreImpactContext,50,80,0,.9,'#68ddfa',engraved);
assert.equal(JSON.stringify(scoreSparks),engravedSparks);
const applyOrder=[];
const runtime=Object.create(Stage.prototype);
runtime.settings=normalized({offset_sec:0,piano_offset_sec:0});
runtime.meta={};runtime.applyScoreWindow=()=>{};runtime.seek=()=>{};
runtime.follower={setEffects(){},setOffset(value){applyOrder.push(['score',value]);},setCameraPoints(){}};
runtime.piano={setSettings(value){applyOrder.push(['piano-settings',value.offsetSec]);},
  setFollower(){applyOrder.push(['piano-events']);}};
runtime.layer={setScene(){}};
runtime.setSettings({offset_sec:.1,piano_offset_sec:.25});
assert.equal(JSON.stringify(applyOrder),JSON.stringify([
  ['score',.1],['piano-settings',.25],['piano-events']
]));
let scoreSeeks=0,scoreDraws=0,pianoDraws=0;
const stage=Object.create(Stage.prototype);
stage.follower={seek:()=>scoreSeeks++};
stage.layer={draw:()=>scoreDraws++};
stage.piano={draw:()=>pianoDraws++};
stage.seek(2);
assert.equal(scoreSeeks,1);
assert.equal(scoreDraws,1);
assert.equal(pianoDraws,1,'score and piano lights render on the same time axis');
for(const page of ['index.html','render.html'])
  assert.match(fs.readFileSync(`static/${page}`,'utf8'),/piano-fall\.js/);
const stageCss=fs.readFileSync('static/stage.css','utf8');
const pianoDepth=Number(stageCss.match(/\.piano-fall-canvas\{[^}]*z-index:(\d+)/)[1]);
const scoreDepth=Number(stageCss.match(/\.score-window\{[^}]*z-index:(\d+)/)[1]);
const noteLightDepth=Number(stageCss.match(/\.studio-fx-canvas\{[^}]*z-index:(\d+)/)[1]);
assert.ok(pianoDepth<scoreDepth&&scoreDepth<noteLightDepth,
  'falling notes stay behind the score while score-note lights remain above it');
console.log('88-key MIDI fall, impact timing, shared preview/export stage verified');
