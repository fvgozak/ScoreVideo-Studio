const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.resolve(process.argv[2]||'.'),O=require(path.join(dir,'static/output-size.js'));
const app=fs.readFileSync(path.join(dir,'static/app.js'),'utf8'),stage=fs.readFileSync(path.join(dir,'static/stage-runtime.js'),'utf8');
function between(a,b){const start=app.indexOf(a),end=app.indexOf(b,start+1);assert(start>=0&&end>start,a);return app.slice(start,end);}
const controls={};for(const [id,value] of Object.entries({aspectRatio:'16:9',outputQuality:'720',resolution:'1280x720',customAspectWidth:'16',customAspectHeight:'9',customAspectControls:'',actualOutputSize:'',exportAspectSummary:'',convertExactWide:'',zoom:'1.35'}))controls[id]={value};
const ctx={window:{ScoreOutputSize:O},$:id=>controls[id],config:()=>{const [width,height]=controls.resolution.value.split('x').map(Number);return {width,height,zoom:Number(controls.zoom.value)};},stage:{setSettings:async s=>{ctx.applied=s;},scoreWindow:{querySelector:()=>({getBoundingClientRect:()=>({width:12*(ctx.applied?.score_layout_scale||1)/(ctx.applied?.width||1280)*1280})})},viewport:{getBoundingClientRect:()=>({width:1280})}},resizePreview(){},Math};
vm.createContext(ctx);vm.runInContext(between(' let preserveLegacyWide=',' function selectedExportMode()')+'\n'+between(' function previewConfig(){',' function saveSettings(){'),ctx);
function preview(){return JSON.parse(JSON.stringify(ctx.previewConfig()));}
function restore(saved,edge){controls.aspectRatio.value=saved.aspectRatio;controls.outputQuality.value=saved.outputQuality;ctx.migrateOutputSize(saved,edge);}
(async()=>{
 restore({aspectRatio:'16:9',outputQuality:'720',resolution:'1280x720'});assert.equal(O.getDesignEdge(),720);
 const initial=preview();assert.deepEqual(initial,{width:1280,height:720,zoom:1.35});
 for(const q of ['1440','1080','720','1440','2160','720','1440']){controls.outputQuality.value=q;ctx.syncOutputSize();assert.deepEqual(preview(),initial);assert.equal(O.getDesignEdge(),720);assert.equal(Number(controls.zoom.value),1.35);}
 assert.equal(controls.resolution.value,'2560x1440');assert.equal(O.layoutScale(2560,1440),2);
 ctx.applied=initial;const out=await ctx.prepareExportStage();assert.equal(out.width,2560);assert.equal(out.height,1440);assert.equal(out.score_layout_scale,2);assert.equal(out.zoom,1.35);await ctx.restorePreviewStage();assert.deepEqual(JSON.parse(JSON.stringify(ctx.applied)),initial);
 const saved=O.getDesignEdge();restore({aspectRatio:'16:9',outputQuality:'1440',resolution:'2560x1440'});assert.equal(O.getDesignEdge(),1080);assert.equal(preview().height,1080);
 restore({aspectRatio:'16:9',outputQuality:'1440',resolution:'2560x1440'},saved);assert.deepEqual(preview(),initial);
 controls.aspectRatio.value='9:16';ctx.syncOutputSize();assert.equal(preview().width,720);assert.equal(preview().height,1280);controls.outputQuality.value='720';ctx.syncOutputSize();assert.equal(preview().height,1280);
 restore({aspectRatio:'21:9',outputQuality:'1080',resolution:'2560x1080'});assert.equal(preview().width,2560);assert.equal(preview().height,1080);
 O.restoreDesignEdge('bad',1280,720);assert.equal(O.getDesignEdge(),720);
 O.restoreDesignEdge(0,2560,1440);assert.equal(O.getDesignEdge(),1080);
 // Existing project extension, legacy/global settings, preset and restore paths are wired.
 assert(app.includes('preview_design_edge:window.ScoreOutputSize?.getDesignEdge?.()'));
 assert(app.includes('migrateOutputSize(state.settings.controls,state.extensions?.preview_design_edge)'));
 assert(app.includes('item.previewDesignEdge=window.ScoreOutputSize.getDesignEdge()'));
 assert(app.includes('settings.previewDesignEdge=window.ScoreOutputSize.getDesignEdge()'));
 assert(app.includes('migrateOutputSize({resolution:$(\'resolution\').value},window.ScoreOutputSize.getDesignEdge())'));
 const sandbox={};vm.createContext(sandbox);vm.runInContext(stage,sandbox);
 const S=sandbox.ScoreStage.Stage;const p={width:1280,height:720,designEdge:0,scoreRegion:{widthPercent:100,xPercent:50,heightPercent:50,cropTopPercent:0,marginTopPercent:4,marginBottomPercent:9},effects:{scorePositionY:40},piano:{enabled:true}};
 assert(Math.abs(S.scoreTopPadding({...p,width:2560,height:1440,designEdge:720})-S.scoreTopPadding(p)*2)<=1);
 console.log('PASS: real app geometry helpers, repeated quality changes, export calibration, preview restore, old/new projects, portrait, 21:9, score padding and persistence wiring');
})().catch(e=>{console.error(e);process.exitCode=1;});
