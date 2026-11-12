/* Editor uses exactly the same ScoreStage as the MP4 renderer. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),audio=$('audioPlayer'),transport=window.ScoreTransport;
 window.ScoreHexControls?.setup();
 const inputIds=['score','midi','audio'],labelIds=['scoreName','midiName','audioName'];
 const persistent=['paperColor','staffColor','inkColor','accentColor','glowColor','cursorColor','cursorVisible','cursorMotion','themeColor','texture','inverted','glitter','sparkle','velocityReactive','noteMotion','motionStrength','drawScore','pianoEnabled','pianoLight','pianoLightStrength','layoutMode','scorePosX','scorePosY','zoom','resolution','fps','backgroundOpacity','backgroundFit','backgroundPosX','backgroundPosY',
 'scoreAreaX','scoreAreaWidth','scoreAreaHeight','scoreMarginTop','scoreMarginBottom','scorePanelColor','scorePanelOpacity','renderMode','sceneTemplate','cameraMode','fxMode','fxStrength','lightColorMode','velocityScale','auroraPreset','auroraLow','auroraHigh','titleText','titleFont','titleGap','artistText','creditText','showText','animateBackground','sceneStartColor','sceneEndColor','sceneStartGlow','sceneEndGlow','transitionTime','trailUpperColor','trailLowerColor'];
 const storeKey='scorevideo_studio_v05_settings';
 let project=null,stage=null,polling=null,raf=null,applySerial=Promise.resolve(),revision=0;
 const fmt=(s)=>{const t=Math.max(0,Math.floor(Number(s)||0));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
 function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
 const offset=()=>Number($('offset').value),pianoOffset=()=>Number($('pianoOffset').value),zoom=()=>Number($('zoom').value);
 function cameraPointStoreKey(){return project?`scorevideo_camera_points_${project.id}`:'';}
 function readCameraPoints(){try{const raw=JSON.parse(localStorage.getItem(cameraPointStoreKey())||'[]');return Array.isArray(raw)?raw.slice(0,500):[];}catch(_){return[];}}
 let selectedCameraPoint='',cameraPointPicking=false;
 function writeCameraPoints(points){if(!project)return;localStorage.setItem(cameraPointStoreKey(),JSON.stringify(points.slice(0,500)));stage?.setCameraPoints(points);renderCameraPointList();saveSettings();}
 function noteName(pitch){const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];return `${names[((pitch%12)+12)%12]}${Math.floor(pitch/12)-1}`;}
 function renderCameraPointList(){
   const list=$('cameraPointList');if(!list)return;const points=readCameraPoints();list.replaceChildren();
   for(const point of points){const button=document.createElement('button');button.type='button';button.className='camera-point-item'+(point.key===selectedCameraPoint?' selected':'');button.textContent=`마디 ${point.measure||'—'} · ${noteName(Number(point.pitch)||60)}`;button.addEventListener('click',()=>{selectedCameraPoint=point.key;syncCameraPointControls();renderCameraPointList();const resolved=stage?.follower?.cameraPoints?.find(p=>p.key===point.key);if(resolved)seekTo(resolved.time);});list.append(button);}
   $('cameraPointControls').hidden=!points.some(p=>p.key===selectedCameraPoint);
   $('cameraPointStatus').textContent=cameraPointPicking?'미리보기에서 음표를 클릭하세요. 다시 누르면 선택을 마칩니다.':points.length?`${points.length}개 포인트 · 목록에서 줌·타이밍·지속 시간을 조절하세요.`:'포인트 없음 · Points 모드를 고르고 미리보기 음표를 눌러 추가하세요.';
   $('cameraPointModeToggle').textContent=cameraPointPicking?'✓ 음표 선택 끝내기':'＋ 프리뷰에서 음표 포인트 찍기';
   stage?.follower?.setCameraPointPicking(cameraPointPicking);
 }
 function syncCameraPointControls(){const p=readCameraPoints().find(x=>x.key===selectedCameraPoint);if(!p)return;for(const [id,key] of [['cameraPointZoom','zoom'],['cameraPointDuration','duration'],['cameraPointShake','shake'],['cameraPointTiming','timing']])$(id).value=String(p[key]??({zoom:1.3,duration:1.6,shake:0,timing:-.6}[key]));$('cameraPointZoomVal').textContent=`${Math.round(Number(p.zoom||1.3)*100)}%`;$('cameraPointDurationVal').textContent=`${Number(p.duration||1.6).toFixed(1)}초`;$('cameraPointShakeVal').textContent=`${Math.round(Number(p.shake||0)*100)}%`;const timing=Number.isFinite(Number(p.timing))?Number(p.timing):-.6;$('cameraPointTimingVal').textContent=timing<0?`${Math.abs(timing).toFixed(2)}초 먼저`:`${timing.toFixed(2)}초 뒤`;}
 window.ScoreCameraPointEditor={active:()=>cameraPointPicking,add(data){const points=readCameraPoints();let point=points.find(p=>p.key===data.key);if(!point){point={key:data.key,measure:data.measure,pitch:data.pitch,beat:data.beat,zoom:1.3,duration:1.6,shake:0,timing:-.6};points.push(point);}selectedCameraPoint=point.key;writeCameraPoints(points);if($('cameraMode').value!=='points'){$('cameraMode').value='points';if(stage?.follower)stage.follower.cameraMode='points';queueApply();}syncCameraPointControls();if(Number.isFinite(data.time))seekTo(data.time);}};
 $('cameraPointModeToggle').addEventListener('click',()=>{cameraPointPicking=!cameraPointPicking;if(cameraPointPicking&&$('cameraMode').value!=='points'){$('cameraMode').value='points';queueApply();}renderCameraPointList();});
 $('cameraPointAtPlayhead').addEventListener('click',()=>{const notes=stage?.follower?.noteTriggers||[],time=Number(audio.currentTime)||0;let best=null,distance=Infinity;for(const note of notes){const d=Math.abs(note.audio-time);if(d<distance){best=note;distance=d;}}if(!best||distance>.6){message('현재 위치 근처에서 음표를 찾지 못했습니다. 재생 위치를 음표 가까이 옮겨 주세요.',true);return;}const chord=notes.filter(n=>Math.abs(n.audio-best.audio)<.055&&n.systemKey===best.systemKey);const target=chord.reduce((top,n)=>(Number(n.pitch)>Number(top.pitch)?n:top),best);window.ScoreCameraPointEditor.add({key:target.scoreKey,time:target.audio,beat:target.beat,pitch:target.pitch,measure:target.measure});});
 for(const [id,key] of [['cameraPointZoom','zoom'],['cameraPointDuration','duration'],['cameraPointShake','shake'],['cameraPointTiming','timing']])$(id).addEventListener('input',()=>{const points=readCameraPoints(),p=points.find(x=>x.key===selectedCameraPoint);if(!p)return;p[key]=Number($(id).value);writeCameraPoints(points);syncCameraPointControls();});
 $('cameraPointRemove').addEventListener('click',()=>{const removed=selectedCameraPoint;selectedCameraPoint='';writeCameraPoints(readCameraPoints().filter(p=>p.key!==removed));});
 $('cameraPointClear').addEventListener('click',()=>{selectedCameraPoint='';writeCameraPoints([]);});
 $('cameraMode').addEventListener('change',()=>{if($('cameraMode').value!=='points'){cameraPointPicking=false;renderCameraPointList();}});
 function sceneOptions(){return {
   template:$('sceneTemplate').value,cameraMode:$('cameraMode').value,fxMode:$('fxMode').value,fxStrength:Number($('fxStrength').value),lightColorMode:$('lightColorMode').value,velocityScale:$('velocityScale').value,
   trailUpper:$('trailUpperColor').value,trailLower:$('trailLowerColor').value,
   auroraPreset:$('auroraPreset').value,auroraLow:$('auroraLow').value,auroraHigh:$('auroraHigh').value,
   font:$('titleFont').value,titleGap:Number($('titleGap').value),
   title:$('titleText').value,artist:$('artistText').value,credit:$('creditText').value,showText:$('showText').checked,
   animateBackground:$('animateBackground').checked,
   keyframes:[{time:0,color:$('sceneStartColor').value,glow:$('sceneStartGlow').value},
     {time:Number($('transitionTime').value),color:$('sceneEndColor').value,glow:$('sceneEndGlow').value}],
 };}
 function config(){
   const [width,height]=$('resolution').value.split('x').map(Number);
   return {width,height,fps:Number($('fps').value),render_mode:$('renderMode').value,offset_sec:offset(),piano_offset_sec:pianoOffset(),zoom:zoom(),camera_points:readCameraPoints(),
      paper_color:$('paperColor').value,staff_color:$('staffColor').value,ink_color:$('inkColor').value,
      glow_color:$('glowColor').value,cursor_color:$('cursorColor').value,cursor_visible:$('cursorVisible').checked,cursor_motion:$('cursorMotion').value,accent_color:$('accentColor').value,
      texture:$('texture').value,background_opacity:Number($('backgroundOpacity').value),background_fit:$('backgroundFit').value,background_position_x:Number($('backgroundPosX').value),background_position_y:Number($('backgroundPosY').value),
      inverted:$('inverted').checked,glitter:$('glitter').checked,sparkle:$('sparkle').checked,draw_score:$('drawScore').checked,
      velocity_reactive:$('velocityReactive').checked,note_motion:$('noteMotion').checked,motion_strength:Number($('motionStrength').value),
      piano_enabled:$('pianoEnabled').checked,piano_light:$('pianoLight').checked,piano_light_strength:Number($('pianoLightStrength').value),
      layout_mode:$('layoutMode').value,scroll_mode:$('layoutMode').value==='singleline'?'horizontal':'vertical',score_position_x:Number($('scorePosX').value),score_position_y:Number($('scorePosY').value),score_area_x:Number($('scoreAreaX').value),score_area_width:Number($('scoreAreaWidth').value),score_area_height:Number($('scoreAreaHeight').value),score_margin_top:Number($('scoreMarginTop').value),score_margin_bottom:Number($('scoreMarginBottom').value),score_panel_color:$('scorePanelColor').value,score_panel_opacity:Number($('scorePanelOpacity').value)/100,scene:sceneOptions()};
 }
 function saveSettings(){const item={};for(const id of persistent){const node=$(id);item[id]=node.type==='checkbox'?node.checked:node.value;}localStorage.setItem(storeKey,JSON.stringify(item));}
 function restoreSettings(){try{
   const data=JSON.parse(localStorage.getItem(storeKey)||'{}');
   if(data.fxMode==='aurora'&&!data.lightColorMode){data.fxMode='bloom';data.lightColorMode='aurora';}
   for(const id of persistent){const node=$(id);if(data[id]===undefined)continue;if(node.type==='checkbox')node.checked=!!data[id];else node.value=data[id];}
 }catch(e){}updateLabels();resizePreview();}
 const videoPresetStoreKey='scorevideo_named_video_presets_v1';
 function readVideoPresets(){try{const items=JSON.parse(localStorage.getItem(videoPresetStoreKey)||'[]');return Array.isArray(items)?items.filter(x=>x&&x.id&&x.name&&x.projectId&&x.settings):[];}catch(_){return[];}}
 function refreshVideoPresets(selectedId=''){
   const select=$('videoPresetSelect'),items=readVideoPresets();
   select.replaceChildren(new Option(items.length?'— 선택 —':'저장한 설정 없음',''));
   for(const preset of items){
     const option=new Option(`${preset.projectName} · ${preset.name} · ${String(preset.settings.resolution||'').replace('x','×')}`,preset.id);
     select.add(option);
   }
   if(selectedId&&items.some(x=>x.id===selectedId))select.value=selectedId;
   $('loadVideoPreset').disabled=!select.value;
   $('deleteVideoPreset').disabled=!select.value;
   $('saveVideoPreset').disabled=!project;
 }
 function currentVideoPresetSettings(){
   const settings={};
   for(const id of persistent){const node=$(id);settings[id]=node.type==='checkbox'?node.checked:node.value;}
   settings.offset=$('offset').value;settings.pianoOffset=$('pianoOffset').value;settings.cameraPoints=readCameraPoints();
   return settings;
 }
 $('videoPresetSelect').addEventListener('change',()=>{
   const selected=Boolean($('videoPresetSelect').value);
   $('loadVideoPreset').disabled=!selected;$('deleteVideoPreset').disabled=!selected;
 });
 $('saveVideoPreset').addEventListener('click',()=>{
   const name=$('videoPresetName').value.trim();
   if(!project){message('현재 곡을 먼저 불러와 주세요.',true);return;}
   if(!name){message('설정 이름을 입력해 주세요.',true);$('videoPresetName').focus();return;}
   const items=readVideoPresets();
   let preset=items.find(x=>x.projectId===project.id&&x.name.toLocaleLowerCase()===name.toLocaleLowerCase());
   if(!preset){preset={id:crypto.randomUUID?.()||`${Date.now()}_${Math.random().toString(36).slice(2)}`};items.push(preset);}
   preset.name=name;preset.projectId=project.id;
   preset.projectName=project.score_name.replace(/\.(musicxml|xml|mxl)$/i,'');
   preset.settings=currentVideoPresetSettings();preset.savedAt=new Date().toISOString();
   try{localStorage.setItem(videoPresetStoreKey,JSON.stringify(items));saveSettings();refreshVideoPresets(preset.id);message('영상 설정을 저장했습니다.');}
   catch(e){message('설정을 저장하지 못했습니다: '+e.message,true);}
 });
 $('loadVideoPreset').addEventListener('click',async()=>{
   const preset=readVideoPresets().find(x=>x.id===$('videoPresetSelect').value);if(!preset)return;
   const button=$('loadVideoPreset');button.disabled=true;
   try{
     if(project?.id!==preset.projectId){
       const response=await fetch(`/api/projects/${preset.projectId}`);
       if(!response.ok)throw Error('저장된 곡을 찾지 못했습니다.');
       const meta=await response.json();await loadProject(meta);localStorage.setItem('scorevideo_last_project',meta.id);
     }
     for(const id of persistent){
       const node=$(id),value=preset.settings[id];if(value===undefined)continue;
       if(node.type==='checkbox')node.checked=Boolean(value);else node.value=String(value);
     }
     $('offset').value=String(preset.settings.offset??0);
     $('pianoOffset').value=String(preset.settings.pianoOffset??0);
     if(Array.isArray(preset.settings.cameraPoints))writeCameraPoints(preset.settings.cameraPoints);
     if(preset.settings.titleText!==undefined)localStorage.setItem('scorevideo_title_override_'+preset.projectId,preset.settings.titleText);
     updateLabels();queueApply();refreshVideoPresets(preset.id);message('저장한 영상 설정을 불러왔습니다.');
   }catch(e){message('설정을 불러오지 못했습니다: '+e.message,true);}
   finally{button.disabled=!$('videoPresetSelect').value;}
 });
 $('deleteVideoPreset').addEventListener('click',()=>{
   const id=$('videoPresetSelect').value;if(!id)return;
   const items=readVideoPresets().filter(x=>x.id!==id);
   localStorage.setItem(videoPresetStoreKey,JSON.stringify(items));refreshVideoPresets();message('저장한 영상 설정을 삭제했습니다.');
 });
 function updateLabels(){
   window.ScoreHexControls?.syncAll();
   $('offsetVal').textContent=`${offset()>0?'+':''}${offset().toFixed(2)}초`;
   $('pianoOffsetVal').textContent=`${pianoOffset()>0?'+':''}${pianoOffset().toFixed(2)}초`;
   $('zoomVal').textContent=`${Math.round(zoom()*100)}%`;
   $('motionStrengthVal').textContent=`${Math.round(Number($('motionStrength').value)*100)}%`;
   $('pianoLightStrengthVal').textContent=`${Math.round(Number($('pianoLightStrength').value)*100)}%`;
   $('backgroundOpacityVal').textContent=`${Math.round(Number($('backgroundOpacity').value)*100)}%`;
   $('backgroundPosXVal').textContent=`${$('backgroundPosX').value}%`;
   $('backgroundPosYVal').textContent=`${$('backgroundPosY').value}%`;
   $('scorePosXVal').textContent=`${$('scorePosX').value}%`;
   $('scorePosYVal').textContent=`${$('scorePosY').value}%`;
   $('titleGapVal').textContent=`${$('titleGap').value}px`;
   for(const key of ['scoreAreaX','scoreAreaWidth','scoreAreaHeight','scoreMarginTop','scoreMarginBottom','scorePanelOpacity'])$(key+'Val').textContent=`${$(key).value}%`;
   $('singleLineYControl').hidden=$('layoutMode').value!=='singleline';
   $('auroraOptions').hidden=$('lightColorMode').value!=='aurora';
   const velocities=project?.note_events?.map(n=>Number(n.velocity)).filter(Number.isFinite)||[];
   if(velocities.length){const lo=velocities.reduce((a,b)=>Math.min(a,b),127),hi=velocities.reduce((a,b)=>Math.max(a,b),1);$('velocityRangeInfo').textContent=`현재 MIDI: ${lo}~${hi} · 절대값은 1~127, 상대값은 이 범위 전체를 사용`;}
   $('fxStrengthVal').textContent=`${Math.round(Number($('fxStrength').value)*100)}%`;
   $('transitionTimeVal').textContent=`${$('transitionTime').value}초`;
   $('backgroundTrack').style.background=`linear-gradient(90deg,${$('sceneStartColor').value},${$('sceneEndColor').value})`;
   $('trailOptions').hidden=$('fxMode').value!=='trail';
   $('cameraPointTools').hidden=$('cameraMode').value!=='points';
 }
 function resizePreview(){
   const [w,h]=$('resolution').value.split('x').map(Number);
   const surround=$('previewSurround'),frame=$('stageFrame'),viewport=$('scoreViewport');
   const avail=Math.max(140,surround.clientWidth-24);
   const desktop=window.matchMedia('(min-width:951px)').matches;
   const inFullscreen=document.fullscreenElement===$('playerDock');
   const heightLimit=inFullscreen?Math.max(125,surround.clientHeight-12):desktop?Math.max(125,surround.clientHeight-20)
     :Math.max(180,Math.min(window.innerHeight*.5,570));
   const scale=Math.min(avail/w,heightLimit/h);
   const fw=Math.round(w*scale),fh=Math.round(h*scale);
   frame.style.width=`${fw}px`;frame.style.height=`${fh}px`;
   viewport.style.width=`${w}px`;viewport.style.height=`${h}px`;
   viewport.style.transform=`scale(${scale})`;
   window.ScoreVisualEditor?.sync();
 }
 function queueApply(){
   revision++;
   const myRevision=revision,setting=config();
   saveSettings();updateLabels();resizePreview();
   if(!stage){$('scoreViewport').style.backgroundColor=setting.paper_color;return;}
   $('previewInfo').textContent='설정을 미리보기에 적용 중…';
   applySerial=applySerial.catch(()=>{}).then(async()=>{
     if(myRevision!==revision||!stage)return;
     await stage.setSettings(setting);
     stage.seek(audio.currentTime);
     window.ScoreVisualEditor?.sync();
     if(myRevision===revision)$('previewInfo').textContent='미리보기와 MP4: 같은 설정 · 같은 장면 엔진';
   }).catch(e=>{
     if(myRevision===revision)message(`미리보기 적용 실패: ${e.message}`,true);
   });
 }
 function syncInfo(){
   if(!project?.sync){$('syncInfo').textContent='싱크 대기';$('syncInfo').title='음원의 첫 유효한 소리와 MIDI 첫 타건을 자동 정렬합니다. 곡 전체 템포가 다르면 수동 보정이 필요할 수 있습니다.';$('clearSyncButton').hidden=true;return;}
   const s=project.sync;
   const detail=s.method==='first-sound-offset'
       ? `첫 소리 자동 싱크 · MIDI ${s.first_midi_sec.toFixed(3)}초 → 음원 ${s.first_audio_sec.toFixed(3)}초 · 보정 ${s.offset_sec.toFixed(3)}초`
       : `동기화 보정 ${Number(s.offset_sec||0).toFixed(3)}초`;
   $('syncInfo').textContent=`싱크 ${Number(s.offset_sec)>=0?'+':''}${Number(s.offset_sec||0).toFixed(3)}초`;
   $('syncInfo').title=detail;
   $('clearSyncButton').hidden=false;
 }
 for(let i=0;i<inputIds.length;i++)$(inputIds[i]).addEventListener('change',()=>{$(labelIds[i]).textContent=$(inputIds[i]).files?.[0]?.name||'파일 선택';});
 for(const id of persistent){
   if(['sceneTemplate','themeColor','auroraPreset','auroraLow','auroraHigh','zoom'].includes(id))continue;
   $(id).addEventListener('input',queueApply);
   $(id).addEventListener('change',queueApply);
 }
 $('drawScore').addEventListener('change',()=>{
   if($('drawScore').checked&&$('paperColor').value.toLowerCase()==='#fffdf6'&&$('staffColor').value.toLowerCase()==='#323a43'&&$('inkColor').value.toLowerCase()==='#181b22'){
     $('paperColor').value='#07101f';$('staffColor').value='#edf1f5';$('inkColor').value='#fffdf6';
     $('cursorColor').value='#f0c96b';$('accentColor').value='#8fd8f2';$('glowColor').value='#a5cfff';
   }
   queueApply();
 });
 // Zoom re-renders the score. Delay expensive OSMD layout while dragging,
 // but show the percentage immediately and commit on release.
 let zoomInputDebounce=null;
 $('zoom').addEventListener('input',()=>{
   updateLabels();clearTimeout(zoomInputDebounce);
   zoomInputDebounce=setTimeout(()=>{zoomInputDebounce=null;queueApply();},180);
 });
 $('zoom').addEventListener('change',()=>{
   clearTimeout(zoomInputDebounce);zoomInputDebounce=null;queueApply();
 });
 $('scoreReadablePreset').addEventListener('click',()=>{$('scorePanelColor').value='#0c1120';$('scorePanelOpacity').value='55';queueApply();});
 $('themeColor').addEventListener('input',saveSettings);
 $('titleText').addEventListener('input',()=>{if(project)localStorage.setItem('scorevideo_title_override_'+project.id,$('titleText').value);});
 $('resetTitleButton').addEventListener('click',()=>{
   if(!project)return;localStorage.removeItem('scorevideo_title_override_'+project.id);
   $('titleText').value=project.score_name.replace(/\.(musicxml|xml|mxl)$/i,'');
   queueApply();
 });
 function applyAuroraPreset(){
   const chosen=$('auroraPreset').value;
   const colors=chosen==='theme'?window.ScoreTheme.auroraPalette($('themeColor').value):window.ScoreStudio.auroraPresets[chosen];
   if(colors){$('auroraLow').value=colors.low;$('auroraHigh').value=colors.high;}
   queueApply();
 }
 $('auroraPreset').addEventListener('change',applyAuroraPreset);
 for(const id of ['auroraLow','auroraHigh'])$(id).addEventListener('input',()=>{$('auroraPreset').value='custom';queueApply();});

 $('sceneTemplate').addEventListener('change',()=>{
   const name=$('sceneTemplate').value,p=window.ScoreStudio.presets[name];
   $('cameraMode').value=p.cameraMode;$('fxMode').value=p.fxMode;$('fxStrength').value=p.fxStrength;
   $('sceneStartColor').value=p.color;$('sceneStartGlow').value=p.glow;
   $('animateBackground').checked=name==='cinematic';
   if(name==='cinematic'){$('sceneEndColor').value='#25132e';$('sceneEndGlow').value='#dab5e8';}
   if(name==='illustrated'){$('sceneEndColor').value='#d2d7c7';$('sceneEndGlow').value='#caa25f';}
   if(name==='minimal'){$('sceneEndColor').value='#e8dfd3';$('sceneEndGlow').value='#a49cca';}
   $('texture').value=p.texture;
   queueApply();
 });
 $('autoPalette').addEventListener('click',()=>{
   const palette=window.ScoreTheme.palette($('themeColor').value);
   for(const [key,node] of Object.entries({paper:'paperColor',staff:'staffColor',note:'inkColor',accent:'accentColor',glow:'glowColor',cursor:'cursorColor'}))$(node).value=palette[key];
   $('sceneStartColor').value=palette.paper;$('sceneStartGlow').value=palette.glow;
   $('trailUpperColor').value=palette.trailUpper;$('trailLowerColor').value=palette.trailLower;
   $('auroraLow').value=palette.auroraLow;$('auroraHigh').value=palette.auroraHigh;
   $('auroraPreset').value='theme';
   $('animateBackground').checked=false;$('inverted').checked=false;
   queueApply();message('테마와 어울리는 오선·음표·배경·발광 및 오른손/왼손 궤적 2색을 자동 설정했습니다.');
 });
 $('autoTrailPalette').addEventListener('click',()=>{
   const colors=window.ScoreTheme.trailPalette($('themeColor').value);
   $('trailUpperColor').value=colors.trailUpper;
   $('trailLowerColor').value=colors.trailLower;
   queueApply();message('테마 기준색에 맞춰 오른손과 왼손 궤적색을 자동 설정했습니다.');
 });
 // Quick zoom is available without opening the Score tab. It uses the
 // exact same #zoom setting consumed by preview and export.
 function adjustZoom(delta){
   const slider=$('zoom');const next=Math.max(Number(slider.min),Math.min(Number(slider.max),Math.round((Number(slider.value)+delta)*20)/20));
   if(Math.abs(next-Number(slider.value))<1e-6)return;
   slider.value=String(next);queueApply();
 }
 $('zoomOutButton').addEventListener('click',()=>adjustZoom(-.05));
 $('zoomInButton').addEventListener('click',()=>adjustZoom(.05));
 $('zoomResetButton').addEventListener('click',()=>{$('zoom').value='1';queueApply();});

 // Artwork palette extraction uses the original Hemio Image Studio image-color
 // grouping algorithm via a local FastAPI endpoint. The source image is not
 // stored unless "이 이미지를 영상 배경으로 사용" is explicitly checked.
 let paletteSourceFile=null,paletteIsCurrentBackground=false,paletteArtworkURL=null,paletteSerial=0,paletteBackgroundTask=null;
 function paletteMessage(value,isError=false){
   $('paletteStatus').textContent=value;$('paletteStatus').classList.toggle('error',isError);
 }
 async function uploadBackgroundForPalette(file){
   if(!project)throw Error('배경으로 사용하려면 먼저 악보·MIDI·음원 파일을 불러오세요. 색상 적용은 파일 없이 가능합니다.');
   if(!/\.(png|jpe?g|webp)$/i.test(file.name))throw Error('BMP/GIF는 색상 추출만 지원합니다. 영상 배경은 PNG, JPG, WebP를 사용해 주세요.');
   const form=new FormData();form.append('background',file,file.name);
   const response=await fetch(`/api/projects/${project.id}/background`,{method:'POST',body:form});
   const data=await response.json();
   if(!response.ok)throw Error(data.detail||'영상 배경 적용 실패');
   project.background_filename=data.background_filename;project.background_version=data.background_version;refreshBackground();
   return data;
 }
 async function ensurePaletteBackground(){
   while(true){
     const file=paletteSourceFile;
     if(!file)throw Error('먼저 영상 배경으로 사용할 이미지를 선택해 주세요.');
     if(paletteIsCurrentBackground)return;
     if(paletteBackgroundTask){await paletteBackgroundTask;continue;}
     const task=uploadBackgroundForPalette(file);paletteBackgroundTask=task;
     try{
       await task;
       if(paletteSourceFile===file){paletteIsCurrentBackground=true;return;}
     }finally{if(paletteBackgroundTask===task)paletteBackgroundTask=null;}
   }
 }
 async function analyzePaletteImage(file,{existing=false}={}){
   if(!file)return;
   if(file.size>20*1024*1024){paletteMessage('이미지는 20MB 이하로 선택해 주세요.',true);return;}
   const serial=++paletteSerial;
   paletteSourceFile=file;paletteIsCurrentBackground=existing;$('paletteUseBackground').checked=existing;
   $('paletteResults').hidden=true;
   paletteMessage('이미지의 색상을 분석하고 있습니다…');
   if(paletteArtworkURL)URL.revokeObjectURL(paletteArtworkURL);
   paletteArtworkURL=URL.createObjectURL(file);
   $('paletteArtworkPreview').src=paletteArtworkURL;
   $('paletteArtworkPreview').hidden=false;
   $('paletteUploadHint').textContent=file.name;
   try{
     const form=new FormData();form.append('image',file,file.name);
     const response=await fetch('/api/palette/extract',{method:'POST',body:form});
     const result=await response.json();
     if(!response.ok)throw Error(result.detail||'색상 추출 실패');
     if(serial!==paletteSerial)return;
     window.ScoreImagePaletteUI.chips(result.palette);
     window.ScoreImagePaletteUI.schemes(result.schemes,scheme=>void applyPaletteScheme(scheme,result.primary));
     $('paletteResults').hidden=false;
     paletteMessage(`${result.palette.length}개 주요 색상과 ${result.schemes.length}개 악보 조합을 찾았어요. 원하는 디자인을 선택하세요.`);
   }catch(error){if(serial===paletteSerial)paletteMessage('이미지 분석 실패: '+error.message,true);}
 }
 async function applyPaletteScheme(scheme,primary){
   const c=scheme?.colors;if(!c)return;
   for(const [id,key] of Object.entries({paperColor:'paper',inkColor:'ink',staffColor:'staff',accentColor:'accent',glowColor:'glow',cursorColor:'cursor',
     trailUpperColor:'trail_upper',trailLowerColor:'trail_lower',auroraLow:'aurora_low',auroraHigh:'aurora_high',scorePanelColor:'panel'})){
       if(/^#[0-9a-f]{6}$/i.test(c[key]||''))$(id).value=c[key];
   }
   if(/^#[0-9a-f]{6}$/i.test(primary||''))$('themeColor').value=primary;
   $('sceneStartColor').value=c.paper;$('sceneEndColor').value=c.paper;
   $('sceneStartGlow').value=c.glow;$('sceneEndGlow').value=c.glow;
   $('auroraPreset').value='custom';
   $('animateBackground').checked=false;
   $('inverted').checked=false;
   // Keep scene effects/velocity scale/user font choices, but ensure the
   // recommended score colors are not overridden by animated background.
   const useArt=$('paletteUseBackground').checked;
   const hasPhoto=Boolean(project?.background_filename||useArt);
   $('scorePanelOpacity').value=hasPhoto?String(Math.round(Number(scheme.panel_opacity||.65)*100/5)*5):'0';
   queueApply();
   if(useArt){
     try{
       await ensurePaletteBackground();
       paletteMessage(`${scheme.name} 디자인과 사진 배경을 적용했습니다. HEX 색상은 아래에서 수정할 수 있어요.`);
     }catch(e){paletteMessage(`색상은 적용했습니다. 이미지 배경: ${e.message}`,true);}
   }else{
     paletteMessage(`${scheme.name} 디자인을 적용했습니다. 색상은 개별 수정할 수 있어요.`);
   }
 }
 $('paletteUseBackground').addEventListener('change',async()=>{
   const control=$('paletteUseBackground'),useArt=control.checked;
   control.disabled=true;
   try{
     if(useArt){
       await ensurePaletteBackground();
       paletteMessage('선택한 그림을 미리보기와 영상 배경에 적용했습니다. 디자인 탭에서 투명도와 위치를 조절할 수 있어요.');
     }else if(paletteIsCurrentBackground&&project){
       const response=await fetch(`/api/projects/${project.id}/background`,{method:'DELETE'});
       if(!response.ok)throw Error('배경 이미지 제거 실패');
       project.background_filename=null;project.background_version=null;paletteIsCurrentBackground=false;
       $('backgroundFile').value='';refreshBackground();paletteMessage('영상 배경에서 그림을 제거했습니다.');
     }
   }catch(error){
     control.checked=!useArt;paletteMessage(`영상 배경 적용 실패: ${error.message}`,true);
   }finally{control.disabled=false;}
 });
 $('paletteImageFile').addEventListener('change',()=>{
   const file=$('paletteImageFile').files?.[0];
   $('paletteImageFile').value='';
   if(file)void analyzePaletteImage(file);
 });
 const drop=$('paletteDropZone');
 for(const eventName of ['dragenter','dragover'])drop.addEventListener(eventName,event=>{
   event.preventDefault();drop.classList.add('drag-over');
 });
 for(const eventName of ['dragleave','drop'])drop.addEventListener(eventName,event=>{
   event.preventDefault();drop.classList.remove('drag-over');
   if(eventName==='drop'){
     const file=Array.from(event.dataTransfer?.files||[]).find(f=>f.type.startsWith('image/')||/\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
     if(file)void analyzePaletteImage(file);
   }
 });
 $('paletteFromBackground').addEventListener('click',async()=>{
   if(!project?.background_filename)return;
   try{
     paletteMessage('현재 영상 배경 이미지를 읽고 있습니다…');
     const response=await fetch(`/api/projects/${project.id}/background`,{cache:'no-store'});
     if(!response.ok)throw Error('배경 이미지를 읽을 수 없습니다.');
     const blob=await response.blob();
     const file=new File([blob],project.background_filename,{type:blob.type||'image/png'});
     await analyzePaletteImage(file,{existing:true});
   }catch(e){paletteMessage(e.message,true);}
 });

 $('offset').addEventListener('input',queueApply);
 $('pianoOffset').addEventListener('input',queueApply);
 $('syncAdjustToggle').addEventListener('click',()=>{
   const open=$('syncAdjustPopover').hidden;
   $('syncAdjustPopover').hidden=!open;$('syncAdjustToggle').setAttribute('aria-expanded',String(open));
 });
 document.addEventListener('click',event=>{
   if(event.target.closest('.sync-adjust-control'))return;
   $('syncAdjustPopover').hidden=true;$('syncAdjustToggle').setAttribute('aria-expanded','false');
 });
 document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!$('syncAdjustPopover').hidden){$('syncAdjustPopover').hidden=true;$('syncAdjustToggle').setAttribute('aria-expanded','false');}
 });
 $('backgroundFile').addEventListener('change',async()=>{
   const file=$('backgroundFile').files?.[0];if(!file)return;
   void analyzePaletteImage(file);
   if(!project){message('먼저 악보·MIDI·음원을 업로드해 주세요.',true);return;}
   const form=new FormData();form.append('background',file);
   try{const r=await fetch(`/api/projects/${project.id}/background`,{method:'POST',body:form});const data=await r.json();if(!r.ok)throw Error(data.detail||'배경 업로드 실패');
     project.background_filename=data.background_filename;project.background_version=data.background_version;refreshBackground();if(paletteSourceFile===file){paletteIsCurrentBackground=true;$('paletteUseBackground').checked=true;}message('배경 이미지를 미리보기와 출력 설정에 적용했습니다. 디자인 탭에서 추천 팔레트를 확인하세요.');
   }catch(e){message(e.message,true);}
 });
 $('removeBackground').addEventListener('click',async()=>{
   if(!project)return;
   try{const r=await fetch(`/api/projects/${project.id}/background`,{method:'DELETE'});if(!r.ok)throw Error('배경 삭제 실패');
     project.background_filename=null;project.background_version=null;$('backgroundFile').value='';paletteIsCurrentBackground=false;$('paletteUseBackground').checked=false;refreshBackground();message('배경 이미지를 제거했습니다.');
   }catch(e){message(e.message,true);}
 });

 async function rebuildPreview(reason='미리보기 재설정 중…'){
   if(!stage||!project)return;
   $('previewInfo').textContent=reason;
   await stage.load();
   stage.seek(audio.currentTime||0);
   $('previewInfo').textContent='미리보기와 MP4: 같은 설정 · 같은 장면 엔진';
 }
 $('resetPreviewButton').addEventListener('click',()=>void rebuildPreview());

 function refreshBackground(){
   $('removeBackground').hidden=!project?.background_filename;
   $('paletteFromBackground').hidden=!project?.background_filename;
   $('backgroundName').textContent=project?.background_filename||'최대 20MB · PNG / JPG / WebP';
   if(stage){stage.meta.background_filename=project.background_filename;stage.meta.background_version=project.background_version;queueApply();}
 }
 async function loadProject(meta){
   stage=null;revision++;await applySerial.catch(()=>{});
   project=meta;selectedCameraPoint='';cameraPointPicking=false;renderCameraPointList();refreshVideoPresets($('videoPresetSelect').value);audio.pause();$('projectTitle').textContent=meta.score_name.replace(/\.(musicxml|xml|mxl)$/i,'');
   const titleOverride=localStorage.getItem('scorevideo_title_override_'+meta.id);
   $('titleText').value=titleOverride!==null?titleOverride:meta.score_name.replace(/\.(musicxml|xml|mxl)$/i,'');
   const a=meta.score_alignment;
   const alignmentText=a?
     `악보↔MIDI 매칭 ${Math.round(a.coverage*100)}% · ${a.matched_notes}/${a.total_notes}개 음표 · ${a.status==='ok'?'실제 타건 시점 적용':'매칭되지 않은 음표 있음'}`:
     '악보↔MIDI 매칭 정보 없음';
   const repeat=meta.repeat_info;
   const repeatText=repeat?.mode==='unfolded'
     ?` · 되돌이표 전개 ${repeat.source_measures}→${repeat.playback_measures}마디`
     :(repeat?.warning?` · ${repeat.warning}`:'');
   $('scoreAlignmentInfo').textContent=a?`매칭 ${Math.round(a.coverage*100)}%`:'매칭 정보 없음';
   $('scoreAlignmentInfo').title=alignmentText+repeatText;
   $('scoreAlignmentInfo').classList.toggle('error',a?.status!=='ok');
   $('metadata').textContent=`${meta.note_count.toLocaleString()}개 MIDI 음표 · ${fmt(meta.audio_duration_sec)} · 템포 변화 ${meta.tempo_map.length}개 · 악보/MIDI 음표 매칭 ${Math.round((a?.coverage||0)*100)}%`;
   if(a?.status==='needs-review')message(`악보 ↔ MIDI 매칭 주의 (${Math.round(a.coverage*100)}%): ${a.message}`,true);
   audio.src=`/api/projects/${meta.id}/audio`;
   $('totalTime').textContent=fmt(meta.audio_duration_sec);$('currentTime').textContent='00:00';
   $('seek').max=meta.audio_duration_sec;$('seek').value=0;
   $('offset').value=0;$('pianoOffset').value=0;updateLabels();
   for(const id of ['playButton','previousMeasureButton','nextMeasureButton','restartButton','seek','exportButton','autoSyncButton'])$(id).disabled=false;
   $('placeholder').style.display='none';
   refreshBackground();resizePreview();
   stage=new window.ScoreStage.Stage({viewport:$('scoreViewport'),container:$('osmdContainer'),meta,settings:config()});
   await stage.load();stage.seek(0);renderCameraPointList();window.ScoreVisualEditor?.sync();syncInfo();
   $('previewInfo').textContent='미리보기와 MP4: 같은 설정 · 같은 장면 엔진';
   if(meta.score_alignment?.status==='needs-review'){
     message(`악보/MIDI 음표 매칭 ${Math.round(meta.score_alignment.coverage*100)}% — 일치하지 않는 음표가 있어 영상 싱크를 확인해 주세요.`,true);
   }else if(meta.repeat_info?.mode==='unfolded'){
     message(`되돌이표를 MIDI 연주 순서로 전개했습니다 (${meta.repeat_info.source_measures}→${meta.repeat_info.playback_measures}마디). 미리보기·MP4에 동일 적용됩니다.`);
   }else message('악보 ↔ MIDI 실제 타건 시간 매칭 완료. 미리보기와 MP4에 동일하게 반영됩니다.');
 }
 async function importProjectFiles(files,{backgroundFile=null}={}){
   $('uploadButton').disabled=true;$('demoButton').disabled=true;message('악보와 MIDI, 음원 분석 중...');
   const form=new FormData();for(const name of inputIds){if(!files[name]){message(`${name} 파일을 선택해 주세요.`,true);$('uploadButton').disabled=false;$('demoButton').disabled=false;return;}form.append(name,files[name]);}
   try{
     const r=await fetch('/api/projects',{method:'POST',body:form});const data=await r.json();if(!r.ok)throw Error(data.detail||'파일 처리 실패');
     if(backgroundFile){
       const bg=new FormData();bg.append('background',backgroundFile);
       const response=await fetch(`/api/projects/${data.id}/background`,{method:'POST',body:bg});const image=await response.json();
       if(!response.ok)throw Error(image.detail||'예제 커버 적용 실패');
       data.background_filename=image.background_filename;data.background_version=image.background_version;
     }
     localStorage.setItem('scorevideo_last_project',data.id);await loadProject(data);
   }catch(err){message(`악보 로딩 실패: ${err.message}`,true);}finally{$('uploadButton').disabled=false;$('demoButton').disabled=false;}
 }
 $('uploadForm').addEventListener('submit',async e=>{
   e.preventDefault();const files=Object.fromEntries(inputIds.map(name=>[name,$(name).files?.[0]]));
   if(inputIds.some(name=>!files[name])){message('MusicXML, MIDI, 음원 파일을 모두 선택해 주세요.',true);return;}
   await importProjectFiles(files);
 });
 $('demoButton').addEventListener('click',async()=>{
   $('demoButton').disabled=true;message('Dream Journey 예제 파일을 준비하고 있습니다...');
   try{
     const assets={score:'dream-journey.musicxml',midi:'dream-journey.mid',audio:'dream-journey.mp3',background:'cover.png'};
     const files={};
     await Promise.all(Object.entries(assets).map(async([key,name])=>{
       const response=await fetch(`/api/examples/dream-journey/${name}`);
       if(!response.ok)throw Error(`${name} 예제 파일을 읽을 수 없습니다.`);
       const blob=await response.blob();files[key]=new File([blob],name,{type:blob.type});
     }));
     for(const name of inputIds){const transfer=new DataTransfer();transfer.items.add(files[name]);$(name).files=transfer.files;
       const label=labelIds[inputIds.indexOf(name)];$(label).textContent=files[name].name;}
     await importProjectFiles(files,{backgroundFile:files.background});
   }catch(error){message(`예제 준비 실패: ${error.message}`,true);$('demoButton').disabled=false;}
 });
 $('autoSyncButton').addEventListener('click',async()=>{
   if(!project)return;$('autoSyncButton').disabled=true;
   try{const r=await fetch(`/api/projects/${project.id}/auto-sync`,{method:'POST'});const data=await r.json();if(!r.ok)throw Error(data.detail||'자동 싱크 실패');
     project.sync=data;$('offset').value=0;$('pianoOffset').value=0;stage?.setSync(data);queueApply();syncInfo();message('첫 소리 자동 싱크 적용. 악보와 건반은 미세 조정에서 각각 보정할 수 있습니다.');
   }catch(e){message(e.message,true);}finally{$('autoSyncButton').disabled=false;}
 });
 $('clearSyncButton').addEventListener('click',async()=>{
   if(!project)return;
   try{const r=await fetch(`/api/projects/${project.id}/auto-sync`,{method:'DELETE'});if(!r.ok)throw Error('초기화 실패');
     project.sync=null;stage?.setSync(null);syncInfo();message('싱크 초기화됨.');
   }catch(e){message(e.message,true);}
 });
 function duration(){return Number.isFinite(audio.duration)?audio.duration:(Number(project?.audio_duration_sec)||0);}
 function measureAxis(){return stage?.getMeasureStarts?.()||[];}
 function updateTimeline(){
   if(!project)return;
   const t=Number(audio.currentTime)||0;
   $('currentTime').textContent=fmt(t);$('seek').value=t;
   const current=transport.currentMeasure(t,measureAxis());
   $('measureInfo').textContent=current.total?`마디 ${current.index}/${current.total}`:'마디 —';
   stage?.seek(t);
 }
 function tick(){if(!project)return;updateTimeline();if(!audio.paused)raf=requestAnimationFrame(tick);}
 function seekTo(time){
   if(!project)return;
   const target=transport.seekSeconds(0,Number(time)||0,duration());
   audio.currentTime=target;
   updateTimeline();
 }
 function moveByMeasure(direction){
   if(!project)return;
   const time=transport.seekMeasure(audio.currentTime,direction,measureAxis(),duration());
   if(time===null){message('마디 위치를 읽지 못했습니다. 악보 로딩 상태를 확인해 주세요.',true);return;}
   seekTo(time);
 }
 async function toggle(){
   if(!project){message('먼저 악보, MIDI, 음원을 불러오세요.');return;}
   if(audio.paused){try{await audio.play();}catch(e){message('오디오 재생 실패: '+e.message,true);}}
   else audio.pause();
 }
 const playerDock=$('playerDock');
 const fullscreenButton=$('fullscreenPreviewButton');
 let fullscreenWasEditing=false;
 async function toggleFullscreen(){
   try{
     if(document.fullscreenElement===playerDock){await document.exitFullscreen();return;}
     if(!playerDock.requestFullscreen)throw Error('이 브라우저에서는 전체화면 미리보기를 지원하지 않습니다.');
     fullscreenWasEditing=$('editScoreAreaButton').getAttribute('aria-pressed')==='true';
     if(fullscreenWasEditing)window.ScoreVisualEditor?.setEditing(false);
     await playerDock.requestFullscreen();
   }catch(e){message('전체화면 전환 실패: '+e.message,true);}
 }
 fullscreenButton.addEventListener('click',()=>void toggleFullscreen());
 document.addEventListener('fullscreenchange',()=>{
   const full=document.fullscreenElement===playerDock;
   fullscreenButton.textContent=full?'⛶ 전체화면 종료':'⛶ 전체화면';
   fullscreenButton.setAttribute('aria-pressed',String(full));
   if(!full&&fullscreenWasEditing){window.ScoreVisualEditor?.setEditing(true);fullscreenWasEditing=false;}
   requestAnimationFrame(()=>{resizePreview();requestAnimationFrame(resizePreview);});
 });
 $('playButton').addEventListener('click',()=>void toggle());
 $('previousMeasureButton').addEventListener('click',()=>moveByMeasure(-1));
 $('nextMeasureButton').addEventListener('click',()=>moveByMeasure(1));
 // Capture before the focused slider/colour/button swallows Space or arrows.
 // Actual text editing is exempt so titles can contain spaces and punctuation.
 window.addEventListener('keydown',e=>{
   // Range inputs need their own arrow keys for 0.01-second sync tuning.
   if(e.target?.closest?.('input,select,textarea,[contenteditable="true"],[role="slider"]'))return;
   if((e.key==='f'||e.key==='F')&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!transport.isTextEditing(e.target)&&!e.repeat){
     e.preventDefault();e.stopImmediatePropagation();void toggleFullscreen();return;
   }
   const command=transport.shortcut(e);
   if(!command||transport.isTextEditing(e.target)||(!project))return;
   if(e.repeat&&command==='play')return;
   e.preventDefault();e.stopImmediatePropagation();
   if(command==='play')void toggle();
   else if(command==='previous-measure')moveByMeasure(-1);
   else if(command==='next-measure')moveByMeasure(1);
   else if(command==='back-five')seekTo(transport.seekSeconds(audio.currentTime,-5,duration()));
   else if(command==='forward-five')seekTo(transport.seekSeconds(audio.currentTime,5,duration()));
 },{capture:true});
 for(const id of ['play','pause','ended'])audio.addEventListener(id,()=>{
   $('playButton').textContent=audio.paused?'▶':'Ⅱ';
   $('playButton').setAttribute('aria-label',audio.paused?'재생':'일시정지');
   cancelAnimationFrame(raf);tick();
 });
 $('seek').addEventListener('input',()=>seekTo(Number($('seek').value)));
 $('restartButton').addEventListener('click',()=>seekTo(0));
 async function pollStatus(){if(!project)return;try{
   const r=await fetch(`/api/projects/${project.id}/status`);if(!r.ok)return;
   const s=await r.json();$('progressWrap').hidden=false;$('statusText').textContent=s.message||s.state;
   $('percent').textContent=`${s.progress||0}%`;$('progressBar').style.width=`${s.progress||0}%`;
   if(['done','error'].includes(s.state)){
     clearInterval(polling);polling=null;$('exportButton').disabled=false;
     if(s.state==='done'){$('downloadLink').hidden=false;$('downloadLink').href=`/api/projects/${project.id}/download`;message('MP4 영상 출력 완료. 미리보기와 동일한 장면 엔진을 사용했습니다.');}
     else message('MP4 출력 실패: '+s.message,true);
   }
 }catch(e){}}
 $('exportButton').addEventListener('click',async()=>{
   if(!project)return;$('exportButton').disabled=true;$('downloadLink').hidden=true;
   $('progressWrap').hidden=false;$('statusText').textContent='영상 설정 저장 중';$('progressBar').style.width='0%';
   try{await applySerial;const payload=config();
     const r=await fetch(`/api/projects/${project.id}/render`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     const result=await r.json();if(!r.ok)throw Error(result.detail||'출력 실패');
     clearInterval(polling);polling=setInterval(pollStatus,750);pollStatus();message('미리보기와 같은 설정으로 프레임별 영상 출력 중입니다.');
   }catch(e){message(e.message,true);$('exportButton').disabled=false;}
 });
 window.ScoreVisualEditor=window.createScoreVisualEditor({
   frame:$('stageFrame'),overlay:$('scoreEditOverlay'),box:$('scoreEditBox'),
   editButton:$('editScoreAreaButton'),centerButton:$('centerScoreAreaButton'),
   controls:{x:$('scoreAreaX'),width:$('scoreAreaWidth'),height:$('scoreAreaHeight'),
     top:$('scoreMarginTop'),bottom:$('scoreMarginBottom')},
   getResolution:()=>({width:config().width,height:config().height}),
   getStage:()=>stage,commit:queueApply,label:()=>updateLabels(),
 });
 $('editScoreFromSidebar').addEventListener('click',()=>window.ScoreVisualEditor?.activate());
 refreshVideoPresets();restoreSettings();window.addEventListener('resize',resizePreview);
 if(typeof ResizeObserver!=='undefined'){
   let lastWidth=0,lastHeight=0;
   new ResizeObserver(entries=>{
     const box=entries[0]?.contentRect;
     if(!box||Math.abs(box.width-lastWidth)<1&&Math.abs(box.height-lastHeight)<1)return;
     lastWidth=box.width;lastHeight=box.height;resizePreview();
   }).observe($('previewSurround'));
 }
 (async()=>{
   const id=localStorage.getItem('scorevideo_last_project');if(!id)return;
   try{const r=await fetch(`/api/projects/${id}`);if(!r.ok)return;await loadProject(await r.json());
     const s=await fetch(`/api/projects/${id}/status`).then(r=>r.json());
     if(['queued','rendering'].includes(s.state)){polling=setInterval(pollStatus,750);pollStatus();}
     else if(s.state==='done'){$('downloadLink').hidden=false;$('downloadLink').href=`/api/projects/${id}/download`;}
   }catch(e){message('이전 프로젝트 복원 실패: '+e.message,true);}
 })();
 // A narrow debug hook to verify preview/export settings parity in browser tests.
 window.__scoreVideoDebug={config,sceneOptions,getStage:()=>stage,resizePreview,transport,seekTo,moveByMeasure,measureAxis,visualEditor:()=>window.ScoreVisualEditor};
})();
