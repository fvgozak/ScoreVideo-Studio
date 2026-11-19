/* ScoreMotion staff/part-specific score lighting.
   Stable keys use MusicXML part id + 1-based staff, never UI order or hand.
   Client-side output config is shared by preview and offline rendering. */
(function(root){
 'use strict';
 const $=id=>document.getElementById(id);
 const COLORS=['#54bced','#e4b46e','#c194f6','#75cb9b','#ee8d9a','#93b7ff','#e8d26a','#a0cfcb'];
 const isColor=x=>/^#[0-9a-fA-F]{6}$/.test(x||'');
 const groupKey=(part,staff)=>`${part}:${staff}`;
 function groupsForCatalog(parts){
   return (Array.isArray(parts)?parts:[]).flatMap(p=>Array.from({length:Math.min(32,Math.max(1,p.staves||1))},(_,i)=>({
     key:groupKey(p.id,i+1),part_index:p.part_index,part_id:p.id,
     staff:i+1,name:p.name||p.id,label:`${p.name||p.id}${p.staves>1?' · '+(i+1):''}`
   })));
 }
 // Resolve OSMD's Staff/Instrument objects into stable MusicXML part+staff ids.
 // Prefer object reference identity over numeric staff IDs, which may be global.
 function resolveStaff(staff,instruments,parts){
   const instrument=staff?.ParentInstrument;
   let index=Array.isArray(instruments)?instruments.indexOf(instrument):-1;
   if(index<0){
     const id=instrument?.Id||instrument?.id;
     index=Array.isArray(parts)?parts.findIndex(p=>p.id===id):-1;
   }
   if(index<0){
     const name=instrument?.Name||instrument?.InstrumentName;
     if(name&&parts.filter(p=>p.name===name).length===1)index=parts.findIndex(p=>p.name===name);
   }
   if(index<0||!parts?.[index])return null;
   const part=parts[index];
   const staves=instrument?.Staves||instrument?.Staffs||instrument?.staves;
   let staffIdx=Array.isArray(staves)?staves.indexOf(staff):-1;
   if(staffIdx<0){
     const sid=Number(staff?.Id);
     const before=parts.slice(0,index).reduce((n,p)=>n+Math.max(1,p.staves||1),0);
     const total=parts.reduce((n,p)=>n+Math.max(1,p.staves||1),0);
     if(Number.isInteger(sid)){
       // OSMD versions have used both zero-based and one-based staff IDs.
       // Prefer the first model only if IDs in the current score agree.
       const base=Array.isArray(instruments)&&instruments.some(i=>i?.Staves?.some(s=>Number(s.Id)===0))?0:
         (sid===total?1:0);
       staffIdx=sid-base-before;
     }
   }
   if(staffIdx<0||staffIdx>=part.staves)return null;
   return {key:groupKey(part.id,staffIdx+1),part_index:index,part_id:part.id,staff:staffIdx+1};
 }
 function shiftAt(part,measure,staff){
   let globalShift=0,localShift=null;
   for(const t of part?.transpositions||[]){
     if(t.measure>measure)break;
     if(t.staff===0)globalShift=t.semitones;
     else if(t.staff===staff)localShift=t.semitones;
   }
   return localShift===null?globalShift:localShift;
 }
 function normalize(input,catalog){
   const value=input&&typeof input==='object'?input:{};
   const allowed=new Set(groupsForCatalog(catalog).map(g=>g.key));
   const pendingCatalog=!Array.isArray(catalog)||!catalog.length;
   const colors={};
   for(const [key,color] of Object.entries(value.colors||{}))if((pendingCatalog||allowed.has(key))&&isColor(color))colors[key]=color;
   return {enabled:value.enabled===true,keyboard:value.keyboard===true,colors};
 }
 const storageKey=id=>`scoremotion.staffColors.v1.${id}`;
 let projectId=null,catalog=[],current={enabled:false,keyboard:false,colors:{}},pitchMode=null;
 const panel=document.querySelector('[data-editor-panel="effects"] .panel:not(.image-palette-studio):not(.video-background-panel)');
 const parent=panel?.querySelector('.fx-quick-group[data-fx-group="score"]');
 let section=null,list=null,check=null,keyboardCheck=null,status=null,refresh=null;
 let metaRef=null,loading=false,lastError='';
 const tr=(key,fallback,vars={})=>{
   const val=root.ScoreI18n?.t?.(key,vars);
   return val&&val!==key?val:fallback.replace(/\{(\w+)\}/g,(_,name)=>String(vars[name]??`{${name}}`));
 };
 // Show the control even when the catalog is absent: otherwise legacy projects
 // silently hide the entire feature and users cannot diagnose/retry detection.
 if(panel){
   section=document.createElement('section');section.className='fx-group score-staff-colors';
   section.innerHTML=`<div class="fx-group-heading"><h3 data-i18n="staffColors.title">오선별 빛 색상</h3><small data-i18n="staffColors.help">악기·오선마다 음표 발광색을 지정합니다. 악보의 인쇄 색상은 그대로 유지됩니다.</small></div>
      <label class="fx-check"><input id="staffColorsEnabled" type="checkbox"><span data-i18n="staffColors.enable">오선별 색상 사용</span></label>
      <label class="fx-check staff-colors-keyboard-toggle"><input id="staffColorsKeyboard" type="checkbox"><span data-i18n="staffColors.keyboard">건반도 동일하게 표시</span></label>
      <p id="staffColorsStatus" class="staff-colors-status" role="status"></p>
      <div id="staffColorsList" class="staff-colors-list"></div>
      <button type="button" id="staffColorsRefresh" class="subtle-button staff-colors-refresh" data-i18n="staffColors.refresh">악기 목록 다시 읽기</button>
      <small id="staffTransposeInfo" class="hint" hidden></small>`;
   if(parent)parent.after(section);
   else panel.insertBefore(section,panel.querySelector('.fx-all-advanced')||panel.firstChild);
   list=$('staffColorsList');check=$('staffColorsEnabled');keyboardCheck=$('staffColorsKeyboard');status=$('staffColorsStatus');refresh=$('staffColorsRefresh');
   check.addEventListener('change',()=>{current.enabled=check.checked;paint();save(true);});
   keyboardCheck.addEventListener('change',()=>{current.keyboard=keyboardCheck.checked;save(true);});
   refresh.addEventListener('click',()=>{if(metaRef)void recoverCatalog(metaRef,true);});
 }
 const notify=()=>document.dispatchEvent(new CustomEvent('scoremotion:staffcolorschange'));
 let persistTimer=null;
 function save(immediate=false){
   // localStorage.setItem is synchronous. Debounce writes while the browser's
   // native color picker emits a stream of input events; always snapshot the
   // project id to prevent a pending write leaking into the next project.
   if(persistTimer!==null){clearTimeout(persistTimer);persistTimer=null;}
   const id=projectId,payload=JSON.stringify(current);
   const persist=()=>{if(id){try{localStorage.setItem(storageKey(id),payload);}catch(_){}}};
   if(immediate)persist();
   else persistTimer=setTimeout(()=>{persistTimer=null;persist();},220);
   notify();
 }
 function paint(){
   if(!list||!check)return;
   check.checked=current.enabled;
   keyboardCheck.checked=current.keyboard;
   keyboardCheck.disabled=!catalog.length||!current.enabled;
   // Never hide the whole section just because metadata was created by v26.
   section.hidden=false;
   check.disabled=!catalog.length;
   list.hidden=!catalog.length;
   refresh.hidden=!metaRef||metaRef.has_score===false;
   if(status){
     status.hidden=Boolean(catalog.length);
     if(loading)status.textContent=tr('staffColors.detecting','MusicXML에서 악기·오선을 분석하고 있습니다...');
     else if(lastError)status.textContent=tr('staffColors.detectFailed','악기 목록을 읽지 못했습니다: {error}',{error:lastError});
     else if(!metaRef||metaRef.has_score===false)status.textContent=tr('staffColors.noScore','MusicXML을 불러오면 악기·오선이 자동으로 표시됩니다.');
     else status.textContent=tr('staffColors.notFound','악기 목록이 없습니다. 다시 읽기를 눌러 MusicXML에서 추출하세요.');
   }
   list.replaceChildren();
   for(const [i,g] of groupsForCatalog(catalog).entries()){
     const label=document.createElement('label');label.className='staff-color-row';
     const name=document.createElement('span');name.textContent=g.label;name.setAttribute('data-i18n-ignore','');
     const color=document.createElement('input');color.type='color';color.value=current.colors[g.key]||COLORS[i%COLORS.length];
     color.setAttribute('aria-label',g.label+' color');color.dataset.staffKey=g.key;
     color.addEventListener('input',()=>{current.colors[g.key]=color.value;save();});
     color.addEventListener('change',()=>{current.colors[g.key]=color.value;save(true);});
     const id=document.createElement('small');id.className='staff-color-key';id.textContent=g.key;
     const identity=document.createElement('span');identity.className='staff-color-identity';identity.append(name,id);
     label.append(identity,color);list.append(label);
   }
 }
 function updatePitchInfo(){
   const label=$('staffTransposeInfo');if(!label)return;
   const transposed=catalog.some(p=>(p.transpositions||[]).some(t=>t.semitones!==0));
   label.hidden=!transposed||!pitchMode;
   if(!label.hidden){
     const key=pitchMode==='written'?'staffColors.writtenMidi':'staffColors.concertMidi';
     label.textContent=root.ScoreI18n?.t?.(key)||key;
   }
 }
 document.addEventListener('scorevideo:languagechange',()=>{updatePitchInfo();paint();});
 function setProject(meta){
   metaRef=meta||null;projectId=meta?.id||null;catalog=Array.isArray(meta?.staff_groups)?meta.staff_groups:[];
   loading=false;lastError='';
   pitchMode=meta?.score_alignment?.pitch_mode||null;
   let stored=null;
   try{stored=projectId?JSON.parse(localStorage.getItem(storageKey(projectId))||'null'):null;}catch(_){stored=null;}
   current=normalize(stored||meta?.effect_settings?.staff_colors,catalog);
   paint();updatePitchInfo();
 }
 // Recover part/staff catalog from the saved *local* MusicXML for projects
 // created before v27. No uploads, no audio analysis or note realignment.
 // On local-only builds, a blob URL from OPFS is the sole input.
 async function recoverCatalog(meta,force=false){
   if(!meta||meta.has_score===false)return false;
   if(!force&&Array.isArray(meta.staff_groups)&&meta.staff_groups.length)return true;
   if(loading)return false;
   loading=true;lastError='';paint();
   try{
     const source=meta.local_score_url||(!root.SCOREMOTION_LOCAL_ONLY&&meta.id?
       `/api/projects/${encodeURIComponent(meta.id)}/score`:null);
     if(!source)throw Error(tr('staffColors.scoreMissing','저장된 악보 파일 경로가 없습니다.'));
     const response=await fetch(source);
     if(!response.ok)throw Error(`HTTP ${response.status}`);
     const score=await response.text();
     const parser=root.ScoreLocalMusicXML;
     if(!parser?.parse||!parser?.partCatalog)throw Error('MusicXML reader unavailable');
     const found=parser.partCatalog(parser.parse(score));
     if(!found.length)throw Error(tr('staffColors.empty','MusicXML에 악기 파트가 없습니다.'));
     // A queued reload can finish after another project has been selected.
     if(metaRef!==meta)return false;
     meta.staff_groups=found;
     if(meta.local_project&&root.ScoreLocalProjects?.setStaffGroups){
       try{await root.ScoreLocalProjects.setStaffGroups(meta.id,found);}catch(error){console.warn('Staff catalog persistence:',error);}
     }
     if(metaRef!==meta)return false;
     setProject(meta);
     return true;
   }catch(error){
     if(metaRef===meta){lastError=String(error?.message||error);loading=false;paint();}
     return false;
   }
 }
 function setConfig(config){current=normalize(config,catalog);paint();save();}
 function getConfig(){
   const colors={...current.colors};
   if(current.enabled){
     groupsForCatalog(catalog).forEach((group,i)=>{if(!colors[group.key])colors[group.key]=COLORS[i%COLORS.length];});
   }
   return {enabled:current.enabled,keyboard:current.keyboard,colors};
 }
 setProject(null);
 root.ScoreStaffColors={groupKey,groupsForCatalog,resolveStaff,shiftAt,normalize,setProject,recoverCatalog,setConfig,getConfig};
})(typeof window!=='undefined'?window:globalThis);
