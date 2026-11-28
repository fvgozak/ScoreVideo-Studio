#!/usr/bin/env python3
"""Test migration in Chromium; optional original MusicXML path for full-score verification."""
from pathlib import Path
import argparse, os, shutil, json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]; S=ROOT/'static'
parser=argparse.ArgumentParser();parser.add_argument('musicxml',nargs='?');args=parser.parse_args()
fixture='''<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">'''
for i in range(5):
    a='<divisions>1</divisions><time><beats>1</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>G</sign><line>2</line></clef>' if i==0 else '<clef number="2"><sign>F</sign><line>4</line></clef>' if i==2 else ''
    n=lambda staff: f'<note><pitch><step>{"CDEFG"[i]}</step><octave>{5 if staff==1 else 4}</octave></pitch><duration>1</duration><voice>{staff}</voice><type>quarter</type><staff>{staff}</staff></note>'
    fixture+=f'<measure number="{i+1}">'+(f'<attributes>{a}</attributes>' if a else '')+('<barline location="left"><repeat direction="forward"/></barline>' if i==1 else '')+n(1)+'<backup><duration>1</duration></backup>'+n(2)+('<barline location="right"><repeat direction="backward"/></barline>' if i==3 else '')+'</measure>'
fixture+='</part></score-partwise>'
JS=r'''async ({xml,real})=>{
 const C=ScoreLocalCodec, assert=(ok,msg)=>{if(!ok)throw Error(msg);}, parse=x=>new DOMParser().parseFromString(x,'application/xml');
 const old=C._unfoldForTest(xml,false).xml,fixed=C._unfoldForTest(xml,true).xml;
 const repaired=C.repairRepeatClefs(xml,old);assert(repaired===fixed,'repair differs from fresh expansion');
 assert(C.repairRepeatClefs(xml,fixed)===null,'already fixed');
 assert(C.repairRepeatClefs(xml,old)===fixed,'repair determinism');
 const changed=parse(old);changed.querySelector('note pitch step').textContent='B';assert(!C.repairRepeatClefs(xml,new XMLSerializer().serializeToString(changed)),'modified playback should not be overwritten');
 const noDTD=old.replace(/<!DOCTYPE[^>]*>/,'');const fixedNoDTD=C.repairRepeatClefs(xml,noDTD);assert(fixedNoDTD&&!fixedNoDTD.includes('<!DOCTYPE'),'normalized archive');
 const fingerprint=x=>{let a=2166136261,b=0x9e3779b9;for(let i=0;i<x.length;i++){const c=x.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b^c,2246822519);}return `${x.length}:${(a>>>0).toString(16).padStart(8,'0')}:${(b>>>0).toString(16).padStart(8,'0')}`;};
 const oldParsed=C.decodeScore(old),newParsed=C.decodeScore(fixed);assert(JSON.stringify(oldParsed.groups)===JSON.stringify(newParsed.groups),'note groups changed');assert(JSON.stringify(oldParsed.tieContinuations)===JSON.stringify(newParsed.tieContinuations),'tie timing changed');
 const id='a'.repeat(32),meta={id,has_score:true,repeat_info:{mode:'unfolded'},score_alignment:{matched_notes:123},sync:{offset_sec:.15}};
 const state={settings:{controls:{scoreZoom:145}},preview:{playhead_sec:229},extensions:{score_editor:{version:1,source:fingerprint(old),edits:{'d:0:0:0:0':{x:12,y:-4}}}}};
 const record={id,meta,score:old,scoreOriginal:new File([xml],'original.musicxml'),midi:new File(['midi'],'original.mid'),audio:new File(['audio'],'original.wav'),state};
 window._testStores.projects.set(id,record);window._testStores.projectStates.set(id,{id,state});
 const [a,b]=await Promise.all([ScoreLocalProjects.openProject(id),ScoreLocalProjects.openProject(id)]);assert(a===b,'concurrent loads');assert(a.score===fixed,'IndexedDB legacy record');assert(JSON.stringify(a.meta)===JSON.stringify(meta),'analysis/sync changed');assert(a.state.extensions.score_editor.source===fingerprint(fixed),'editor fingerprint');assert(a.state.extensions.score_editor.edits['d:0:0:0:0'].x===12&&a.state.settings.controls.scoreZoom===145&&a.state.preview.playhead_sec===229,'edit/settings lost');assert(await a.scoreOriginal.text()===xml,'source altered');assert(await (await ScoreLocalProjects.request('/api/projects/'+id+'/score')).text()===fixed,'preview/export API');
 const id2='b'.repeat(32),candidate={...record,id:id2,meta:{...meta,id:id2},score:noDTD,state:{...state,extensions:{score_editor:{...state.extensions.score_editor,source:fingerprint(noDTD)}}}};
 await ScoreLocalProjects.importRecord(candidate);const imported=await ScoreLocalProjects.openProject(id2);assert(imported.score===fixedNoDTD,'archive import record');assert(imported.state.extensions.score_editor.source===fingerprint(fixedNoDTD),'archive editor identity');
 const measures=real?[40,41,104,105]:[1,4];const geometry={};
 for(const [key,x] of [['old',old],['fixed',fixed]]){
   const osmd=new opensheetmusicdisplay.OpenSheetMusicDisplay(document.getElementById('score'),{backend:'svg',drawTitle:false,drawComposer:false,renderSingleHorizontalStaffline:true,newSystemFromXML:false,newSystemFromNewPageInXML:false,newPageFromXML:false});await osmd.load(x);osmd.render();const g=osmd.GraphicSheet.MeasureList;
   geometry[key]=measures.map(i=>{const m=g[i][1],notes=m.staffEntries.flatMap(e=>e.graphicalVoiceEntries.flatMap(v=>v.notes)).filter(n=>!n.sourceNote.isRest());return {measure:i+1,clefs:[...new Set(notes.map(n=>n.vfnote?.[0]?.clef))],pitch:notes[0]?.sourceNote?.Pitch?.getHalfTone?.()};});osmd.clear();
 }
 assert(geometry.old.at(-1).clefs.includes('bass'),'old bass not reproduced');assert(geometry.fixed.at(-1).clefs.every(x=>x==='treble'),'new treble not restored');assert(geometry.fixed[0].pitch===geometry.fixed[real?2:1].pitch,'source pitch mismatch');
 return {measures:parse(fixed).querySelectorAll('part > measure').length,geometry};
}'''
# The test-only hook exposes the already existing internal unfold routine to
# construct an exact pre-V1 saved project. Production code has no such hook.
with sync_playwright() as p:
    exe=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium');b=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**({'executable_path':exe} if exe else {}))
    try:
        for xml,real in [(fixture,False)]+([(Path(args.musicxml).read_text(),True)] if args.musicxml else []):
            ctx=b.new_context(viewport={'width':1800,'height':900});page=ctx.new_page();page.set_content('<div id="score" style="width:1700px"></div>')
            # Browser navigation is unavailable in some CI environments. A
            # minimal transaction mock exercises the real load/import code;
            # notation rendering below uses actual Chromium and OSMD.
            page.evaluate(r'''() => {
                const stores=window._testStores={projects:new Map(),projectStates:new Map()};
                const db={transaction(){const tx={objectStore(name){const map=stores[name];return {get(id){return {result:map.get(id)};},put(v){map.set(v.id,v);},delete(id){map.delete(id);}};}};queueMicrotask(()=>tx.oncomplete?.());return tx;}};
                Object.defineProperty(window,'indexedDB',{configurable:true,value:{open(){const req={result:db};queueMicrotask(()=>req.onsuccess?.());return req;}}});
                window.SCOREMOTION_LOCAL_ONLY=true;
            }''')
            page.add_script_tag(content=(S/'local-project-codec.js').read_text().replace('root.ScoreLocalCodec={','root.ScoreLocalCodec={_unfoldForTest:unfoldScore,'))
            local=(S/'local-projects.js').read_text().replace("'use strict';", "'use strict';const location=new URL('https://scoremotion-test.invalid/?browser-local');",1)
            page.add_script_tag(content=local);page.add_script_tag(path=S/'vendor/opensheetmusicdisplay.min.js')
            print('PASS: '+('provided MusicXML' if real else 'synthetic repeat fixture')+'; mock IndexedDB stored/imported playback repair; analysis, edits, source preservation; actual OSMD clefs',json.dumps(page.evaluate(JS,{'xml':xml,'real':real})));ctx.close()
    finally:b.close()
