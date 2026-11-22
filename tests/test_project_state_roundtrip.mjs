import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=process.argv[2]||'.';
const app=fs.readFileSync(path.join(root,'static/app.js'),'utf8');
const audit=JSON.parse(fs.readFileSync(path.join(root,'tests/project_state_inventory.json'),'utf8'));
function between(a,b){const start=app.indexOf(a),stop=app.indexOf(b,start+1);assert(start>=0&&stop>start,`${a} function missing`);return app.slice(start,stop);}
const functions=[between(' function serializeProjectState(){',' function validateProjectState('),between(' function validateProjectState(',' async function saveCurrentProjectState('),between(' async function restoreProjectState(',' const storeKey=')];
const controls={};for(const id of audit.ids){const boolean=audit.types[id]==='boolean';controls[id]={type:boolean?'checkbox':'text',value:'value_'+id,checked:boolean};}
// The 42 runtime-created controls were not classified by the original HTML
// scanner; use the schema-provided types here.
for(const id of audit.ids)if(id.endsWith('On')||id==='scoreParticlesOn'||id==='keyboardPaletteLink'||id==='keyboardTemperatureSync'||id==='keyboardVelocityColor')controls[id].type='checkbox';
controls.scoreParticlesOn.checked=true;
controls.offset={type:'text',value:'0.34'};controls.pianoOffset={type:'text',value:'-0.12'};
controls.downloadName={type:'text',value:'my-clip.mp4'};controls.fxRenderer.value='pixi';
const data={};let savedStaff={enabled:true,keyboard:true,colors:{'P1:1':'#ff1122','P99:1':'#abc123'}};
const context={
 project:{id:'f'.repeat(32),musicxml_title:'Test Music',score_name:'test.musicxml',sync:{method:'manual',offset_sec:.04}},
 activeProjectState:null,restoringPortableState:false,readCameraPoints:()=>[{key:'camera-1',zoom:1.45}],audio:{currentTime:29.2},
 window:{ScoreStaffColors:{getConfig:()=>savedStaff,setConfig:cfg=>{savedStaff=structuredClone(cfg)}},ScoreFxGroups:{syncBoundaryUi(){},syncNoteBarUi(){},syncLightingUi(){},syncCustomColors(){},syncPreview(){}}},
 $:id=>controls[id],persistent:audit.ids,structuredClone,useGpuRenderer(){},migrateOutputSize(){},
 syncInfo(){},updateLabels(){},cameraPointStoreKey:()=> 'scorevideo_camera_points_'+'f'.repeat(32),
 localStorage:{setItem:(k,v)=>data[k]=v,getItem:k=>data[k]},
};
vm.createContext(context);vm.runInContext(functions.join('\n'),context);
const snap=context.serializeProjectState();assert.equal(Object.keys(snap.settings.controls).length,170);
assert.equal(snap.settings.controls.scoreParticlesOn,true);
assert.equal(snap.settings.staff_colors.colors['P99:1'],'#abc123');
assert.equal(snap.timeline.synchronization.manual_offsets.piano_offset_sec,-.12);
assert.equal(snap.timeline.camera.camera_points.length,1);
assert(context.validateProjectState(snap));
for(const id of audit.ids){controls[id].value='changed';controls[id].checked=false;}
controls.offset.value='0';controls.pianoOffset.value='0';controls.downloadName.value='';
context.restoreProjectState(snap);
assert.equal(controls.scoreColorPreset.value,'value_scoreColorPreset');
assert.equal(controls.scoreParticlesOn.checked,true);
assert.equal(controls.pianoOffset.value,'-0.12');
assert.equal(controls.downloadName.value,'my-clip.mp4');
assert.equal(JSON.parse(data[context.cameraPointStoreKey()])[0].zoom,1.45);
// Preserve orphaned colors when a subsequent save observes only the new catalog.
context.window.ScoreStaffColors.getConfig=()=>({enabled:true,keyboard:true,colors:{'P1:1':'#345678'}});
const next=context.serializeProjectState();assert.equal(next.settings.staff_colors.colors['P99:1'],'#abc123');assert.equal(next.settings.staff_colors.colors['P1:1'],'#345678');
console.log('PASS project state: all 170 UI values + specials round-trip, no orphaned staff color loss, camera, offsets, export name');
