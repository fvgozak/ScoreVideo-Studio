/* Editor uses exactly the same ScoreStage as the MP4 renderer. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),audio=$('audioPlayer'),transport=window.ScoreTransport;
     let liveSampler=null;
     function previewTime(){return liveSampler?liveSampler.currentTime:(Number(audio.currentTime)||0);}
     function previewPaused(){return liveSampler?liveSampler.paused:audio.paused;}
     function pausePreview(){liveSampler?.pause();audio.pause();}
     function setPreviewTime(time){if(liveSampler)liveSampler.seek(time);else audio.currentTime=time;}
     function updatePlaybackUi(){
       $('playButton').textContent=previewPaused()?'▶':'Ⅱ';
       $('playButton').setAttribute('aria-label',previewPaused()?'재생':'일시정지');
       cancelAnimationFrame(raf);tick();
     }
 const browserParams=new URLSearchParams(location.search);
 const browserOnlyRequested=window.SCOREMOTION_LOCAL_ONLY===true||browserParams.has('browser-local')||
   !browserParams.has('python-backend')&&location.protocol==='https:'&&!['localhost','127.0.0.1'].includes(location.hostname);
 if(browserOnlyRequested&&window.ScoreLocalProjects?.enabled!==true){
   const reason='브라우저 프로젝트 엔진을 불러오지 못했습니다. 파일은 서버로 전송되지 않았습니다. 페이지를 새로고침해 주세요.';
   const status=$('message');if(status)status.textContent=reason;
   throw Error(reason);
 }
 const lastProjectKey=window.ScoreLocalProjects?.enabled?'scorevideo_last_local_project':'scorevideo_last_project';
 window.ScoreHexControls?.setup();
 const inputIds=['score','midi','audio'],labelIds=['scoreName','midiName','audioName'];
 const fileInputHints=labelIds.map(id=>$(id).textContent);
 function clearUploadInputs(){
   $('uploadForm').reset();
   for(let i=0;i<inputIds.length;i++){
     $(inputIds[i]).value='';$(labelIds[i]).textContent=fileInputHints[i];
   }
 }
 const persistent=['fxRenderer','gpuPreset','gpuClassicOn','gpuClassicStrength','gpuBloomOn','gpuBloomStrength','gpuOutlineOn','gpuOutlineStrength','gpuStardustOn','gpuStardustStrength','pedalResonance','sustainAfterglow','minimalMode','minimalPaletteMode','minimalNoteColor','minimalWhiteColor','minimalBlackColor','minimalPedalColor','paperColor','staffColor','inkColor','accentColor','glowColor','cursorColor','cursorVisible','cursorMotion','themeColor','paletteTheme','inverted','glitter','sparkle','velocityReactive','noteMotion','motionStrength','drawScore','scoreVisible','pianoEnabled','pianoCamera','pianoVerticalOffset','pianoKeyStyle','pianoWhiteKeyColor','pianoBlackKeyColor','scoreImpactEnabled','scoreImpactStrength','pianoLight','pianoLightStrength','layoutMode','notationStyle','scorePosX','scorePosY','zoom','aspectRatio','outputQuality','resolution','fps','backgroundOpacity','backgroundFit','backgroundPosX','backgroundPosY',
 'scoreAreaX','scoreAreaWidth','scoreAreaHeight','scoreCropTop','scoreMarginTop','scoreMarginBottom','scorePanelColor','scorePanelOpacity','renderMode','videoQuality','videoBitrate','sceneTemplate','cameraMode','fxMode','fxStrength','lightColorMode','velocityScale','auroraPreset','auroraLow','auroraHigh','titleText','titleFont','titleGap','artistText','creditText','showText','animateBackground','sceneStartColor','sceneEndColor','sceneStartGlow','sceneEndGlow','transitionTime','trailUpperColor','trailLowerColor','trailLength','trailBrightness','trailThickness','trailDuration','customAspectWidth','customAspectHeight',
 'scoreParticlesOn','scoreParticleStyle','scoreParticleCount','scoreParticleSize','scoreParticleSpeed','scoreParticleLife','scoreParticleBrightness',
 'scoreFxPreset','scoreColorPreset','keyboardFxPreset','keyboardColorPreset','keyboardColorLow','keyboardColorHigh','keyboardVelocityColor','keyboardPaletteLink','keyboardVelocityScale','keyboardGlowSize','keyboardParticleDensity','keyboardParticleSize','keyboardParticleLife','keyboardCurlStrength','keyboardDensityFastWeight','keyboardBloomStrength','keyboardBloomRadius','keyboardVelocityContrast',
 'paletteApplyScore','paletteApplyGlow','paletteApplyKeyboard','paletteApplyBackground',
 'keyboardLightingMode','keyboardBaseBrightness','keyboardLightingSensitivity','keyboardBrightnessOffset','keyboardTemperatureSync','keyboardWhiteBrightness','keyboardBlackBrightness','keyboardReflectionStrength',
 'keyboardBoundaryStyle','keyboardBoundaryStrength','keyboardBoundaryThickness','keyboardBoundaryReaction','keyboardBoundarySpeed','keyboardBoundaryColorMode','keyboardBoundaryColor','keyboardNoteBarMode','keyboardNoteRiseSpeed'];
 persistent.push('gpuCoreStrength','gpuCoreRadius','gpuMidStrength','gpuMidRadius','gpuHaloStrength','gpuHaloRadius');
 persistent.push('gpuBurstOn','gpuParticleCount','gpuParticleSize','gpuParticleSpeed',
   'gpuParticleDirection','gpuParticleSpread','gpuParticleLife','gpuParticleBrightness');
 persistent.push('gpuVolumetricOn','gpuVolumetricStrength','gpuChromaticOn','gpuChromaticStrength');
 persistent.push('gpuTrailOn','gpuTrailStrength','gpuTrailLength','gpuTrailDuration');
 persistent.push('gpuCinematicOn','gpuCinematicStrength','gpuMusicReaction');
 // New-project scene: values reconstructed from the supplied 1920x1080
 // single-line stage DOM (not the transient blob: image URL).
 const NEW_PROJECT_DEFAULTS=Object.freeze({
   layoutMode:'singleline',aspectRatio:'16:9',outputQuality:'1080',
   scoreAreaX:'50',scoreAreaWidth:'100',scoreAreaHeight:'50',
   scoreMarginTop:'4',scoreMarginBottom:'9',scoreCropTop:'0',
   scorePanelColor:'#141a23',scorePanelOpacity:'55',
   paperColor:'#111722',staffColor:'#abb7c8',inkColor:'#f5f6fc',
   backgroundOpacity:'0.5',backgroundFit:'contain',backgroundPosX:'50',backgroundPosY:'50',
   sceneStartColor:'#111722',sceneEndColor:'#111722',
   scoreColorPreset:'aurora',auroraPreset:'custom',
   auroraLow:'#3ac7db',auroraHigh:'#aa80e8',glowColor:'#aa80e8',
   lightColorMode:'aurora',velocityScale:'relative',
   keyboardColorPreset:'linked',keyboardColorLow:'#3ac7db',keyboardColorHigh:'#aa80e8',
   keyboardPaletteLink:true,keyboardVelocityScale:'follow-score',
   scoreVisible:true,pianoEnabled:true
 });
 function applyNewProjectDefaults(){
   for(const [id,value] of Object.entries(NEW_PROJECT_DEFAULTS)){
     const node=$(id);if(!node)continue;
     if(node.type==='checkbox')node.checked=Boolean(value);else node.value=String(value);
   }
   window.ScoreFxGroups?.syncPreview();
   window.ScoreFxGroups?.syncCustomColors();
   window.ScoreFxGroups?.syncLightingUi();
   window.ScoreFxGroups?.syncBoundaryUi();
 }
 // Portable project state is project-scoped. Legacy global localStorage is
 // retained only as a compatibility fallback for older local projects.
 let activeProjectState=null,restoringPortableState=false,portableSaveTimer=null;
 function serializeProjectState(){
   if(!project)throw Error('현재 프로젝트가 없습니다.');
   const controls={};for(const id of persistent){const node=$(id);if(node)controls[id]=node.type==='checkbox'?node.checked:node.value;}
   const old=activeProjectState||{};
   return {schema_version:1,project_name:old.project_name||project.musicxml_title||project.score_name||project.midi_name||'ScoreMotion',
     settings:{controls,staff_colors:(()=>{
       const present=window.ScoreStaffColors?.getConfig?.()||{enabled:false,keyboard:false,colors:{}};
       // Keep orphaned colors for staves temporarily absent after XML replacement.
       return {...present,colors:{...(old.settings?.staff_colors?.colors||{}),...present.colors}};
     })(),export:{download_name:$('downloadName').value}},
     timeline:{synchronization:{schema_version:1,midi_to_audio:project.sync||null,
         manual_offsets:{score_offset_sec:Number($('offset').value),piano_offset_sec:Number($('pianoOffset').value)},
         user_locks:old.timeline?.synchronization?.user_locks||[],
         review_state:old.timeline?.synchronization?.review_state||'valid',
         dependencies:old.timeline?.synchronization?.dependencies||{}},
       camera:{schema_version:1,camera_points:readCameraPoints()}},
     preview:{playhead_sec:Number(previewTime())||0},extensions:{...(old.extensions||{}),melody_highlight:window.ScoreMelodyHighlight?.getState?.()}};
 }
 function validateProjectState(state){
   if(!state||state.schema_version!==1||!state.settings?.controls||!state.timeline?.synchronization)throw Error('프로젝트 상태가 유효하지 않습니다.');
   for(const [id,value] of Object.entries(state.settings.controls)){
     if(!persistent.includes(id))continue;
     const node=$(id);if(!node)continue;
     if(node.type==='checkbox'?typeof value!=='boolean':typeof value!=='string')throw Error('프로젝트 설정 타입 오류: '+id);
   }
   if(!Array.isArray(state.timeline.camera?.camera_points||[])||(state.timeline.camera?.camera_points||[]).length>500)throw Error('카메라 포인트 개수가 잘못됐습니다.');
   for(const value of Object.values(state.timeline.synchronization.manual_offsets||{}))if(!Number.isFinite(Number(value)))throw Error('동기화 오프셋이 유효하지 않습니다.');
   return true;
 }
 async function saveCurrentProjectState(){
   if(!project||!window.ScoreLocalProjects?.enabled||restoringPortableState)return;
   const id=project.id,state=serializeProjectState();validateProjectState(state);
   await window.ScoreLocalProjects.saveState(id,state);
   if(project?.id===id)activeProjectState=state;
 }
 function schedulePortableAutosave(){
   if(restoringPortableState||!project||!window.ScoreLocalProjects?.enabled)return;
   if(portableSaveTimer!==null)clearTimeout(portableSaveTimer);
   const id=project.id;
   portableSaveTimer=setTimeout(()=>{
     portableSaveTimer=null;
     if(project?.id!==id)return;
     void saveCurrentProjectState().catch(error=>console.warn('Project autosave:',error));
   },700);
 }
 async function restoreProjectState(state){
   if(!state)return;
   validateProjectState(state);
   restoringPortableState=true;
   window.ScoreMelodyHighlight?.restoreState?.(state.extensions?.melody_highlight);
   try{
     activeProjectState=structuredClone(state);
     for(const [id,value] of Object.entries(state.settings.controls||{})){
       if(!persistent.includes(id))continue;
       const node=$(id);if(!node)continue;
       if(node.type==='checkbox')node.checked=value;else node.value=value;
     }
     useGpuRenderer();migrateOutputSize(state.settings.controls);
     $('downloadName').value=state.settings.export?.download_name||'';
     const sync=state.timeline.synchronization;
     if(sync?.midi_to_audio!==undefined){project.sync=sync.midi_to_audio;syncInfo();}
     $('offset').value=String(sync?.manual_offsets?.score_offset_sec??0);
     $('pianoOffset').value=String(sync?.manual_offsets?.piano_offset_sec??0);
     if(Array.isArray(state.timeline.camera?.camera_points)){
       localStorage.setItem(cameraPointStoreKey(),JSON.stringify(state.timeline.camera.camera_points.slice(0,500)));
     }
     if(state.settings.staff_colors)window.ScoreStaffColors?.setConfig?.(state.settings.staff_colors);
     window.ScoreFxGroups?.syncBoundaryUi();window.ScoreFxGroups?.syncNoteBarUi();
     window.ScoreFxGroups?.syncLightingUi();window.ScoreFxGroups?.syncCustomColors();window.ScoreFxGroups?.syncPreview();
     localStorage.setItem('scorevideo_title_override_'+project.id,$('titleText').value);
     updateLabels();
   }finally{restoringPortableState=false;}
 }
 const storeKey='scorevideo_studio_v05_settings';
 const effectSettingIds=persistent.filter(id=>id.startsWith('paletteApply')||$(id)?.closest('.fx-group')||
   ['paperColor','staffColor','inkColor','cursorColor','accentColor','glowColor','auroraLow','auroraHigh','paletteTheme'].includes(id));
 let effectSaveTimer=null;
 function saveProjectEffects(){
   if(!project)return;
   // The browser-only project store writes the lightweight state object only.
   // Rewriting the large audio/MIDI record on every color slider change would
   // cause avoidable IndexedDB I/O and potential video-preview stalls.
   if(window.ScoreLocalProjects?.enabled){schedulePortableAutosave();return;}
   clearTimeout(effectSaveTimer);
   const id=project.id;
   effectSaveTimer=setTimeout(()=>{
     if(project?.id!==id)return;
     const settings={};for(const key of effectSettingIds){const node=$(key);settings[key]=node.type==='checkbox'?node.checked:node.value;}
     settings.staff_colors=window.ScoreStaffColors?.getConfig?.()||{enabled:false,keyboard:false,colors:{}};
     void fetch(`/api/projects/${id}/effect-settings`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)})
       .then(response=>{if(!response.ok)throw Error(`HTTP ${response.status}`)})
       .catch(error=>console.warn('Effect settings save failed:',error));
   },550);
 }
 const exportModeKey='scorevideo_mp4_engine_v1';
 let project=null,stage=null,polling=null,raf=null,applySerial=Promise.resolve(),revision=0,cancelReturnTime=null,activeDownloadJob=null;
 const attemptedDownloads=new Set();
 let renderUiActive=false,renderUiJob=null,renderPollEpoch=0,lastPreviewFrame=0,webmRecorder=null,webmPosition=0,webmDownloadUrl=null,webmRelease=null;
 let legacyStartPending=false,legacyCancelPending=false;
 let mp4MeasuredFps=0;
 let offlineSupport=null,offlineActive=false,offlineCancelPending=false,offlineEpoch=0,offlineDownloadUrl=null,offlineReturnTime=0,experimentalOptIn=false;
 let exportChoiceExplicit=['offline','legacy'].includes(localStorage.getItem(exportModeKey));
 const webmType=window.ScoreWebmRecorder?.supportedType(true)||'';
 function webmUnavailableReason(){
   if(!webmType)return 'MediaRecorder에서 오디오 포함 WebM 코덱을 지원하지 않습니다.';
   if(typeof MediaStream==='undefined'||typeof AudioContext==='undefined')return '오디오·영상 스트림을 만들 Web Audio API를 지원하지 않습니다.';
   if(typeof HTMLCanvasElement==='undefined'||!HTMLCanvasElement.prototype.captureStream)return 'Canvas 화면 녹화를 지원하지 않습니다.';
   try{if(!document.createElement('canvas').getContext('2d'))return 'Canvas 2D 화면 합성을 지원하지 않습니다.';}catch(_){return 'Canvas 화면 합성을 사용할 수 없습니다.';}
   return '';
 }
 const webmUnavailable=webmUnavailableReason();
 let preserveLegacyWide=false,preserveCustomResolution='',exportGeometry=false;
 function syncOutputSize(){
   const aspect=$('aspectRatio').value;
   const custom=[Number($('customAspectWidth').value)||16,Number($('customAspectHeight').value)||9];
   const canonical=window.ScoreOutputSize.size(aspect,$('outputQuality').value,custom);
   const {width,height}=preserveLegacyWide&&aspect==='21:9'&&$('outputQuality').value==='1080'
     ?{width:2560,height:1080}:preserveCustomResolution&&aspect==='custom'
       ?{width:Number(preserveCustomResolution.split('x')[0]),height:Number(preserveCustomResolution.split('x')[1])}:canonical;
   $('resolution').value=`${width}x${height}`;
   $('customAspectControls').hidden=aspect!=='custom';
   $('actualOutputSize').textContent=`실제 출력 크기: ${width}×${height} · 짧은 변 ${Math.min(width,height)}p${preserveLegacyWide?' · 이전 2560×1080 유지 (비율 또는 해상도를 변경하면 정확한 21:9로 전환)':''}`;
   $('exportAspectSummary').textContent=`미리보기 화면 비율: ${aspect==='custom'?`${custom[0]}:${custom[1]}`:aspect} · 최종 ${width}×${height}`;
   $('convertExactWide').hidden=!preserveLegacyWide;
 }
 function migrateOutputSize(settings){
   if(!settings?.aspectRatio||!settings?.outputQuality){
     const legacy=window.ScoreOutputSize.migrate(settings?.resolution||'1920x1080');
     const [oldWidth,oldHeight]=String(settings?.resolution||'1920x1080').split('x').map(Number);
     const canonical=window.ScoreOutputSize.size(legacy.aspect,legacy.quality);
     if(oldWidth&&oldHeight&&(oldWidth!==canonical.width||oldHeight!==canonical.height)&&settings?.resolution!=='2560x1080'){
       $('aspectRatio').value='custom';$('customAspectWidth').value=String(oldWidth);$('customAspectHeight').value=String(oldHeight);
     }else $('aspectRatio').value=legacy.aspect;
     $('outputQuality').value=String(legacy.quality);
   }
   preserveCustomResolution=$('aspectRatio').value==='custom'&&/^\d+x\d+$/.test(settings?.resolution||'')?settings.resolution:'';
   preserveLegacyWide=settings?.resolution==='2560x1080'&&$('aspectRatio').value==='21:9'&&$('outputQuality').value==='1080';
   syncOutputSize();
 }
 function selectedExportMode(){return window.ScoreLocalProjects?.enabled?'offline':document.querySelector('input[name="exportMode"]:checked')?.value||'offline';}
 // Dynamic export labels use semantic i18n keys, never regex-translated Korean
 // templates. Keep the initial HTML labels until the language pack is ready.
 const exportT=(key,values={})=>window.ScoreI18n?.availableLocales.includes(window.ScoreI18n.locale)
   ?window.ScoreI18n.t(key,values):null;
 function updateExportUi(){
   const resolution=$('resolution').value,[width,height]=resolution.split('x').map(Number),fps=Number($('fps').value);
   const highZoom=Number($('zoom').value)>=1.5,drawScore=$('drawScore').checked;
   const verified=resolution==='1280x720'&&(fps===30||fps===60)&&!highZoom&&!drawScore;
   const experimental=!verified;
   const reason=!offlineSupport?'브라우저 인코더·모듈 확인 중':!offlineSupport.supported?offlineSupport.reason:
     project&&!project.audio_filename?'원본 오디오가 없는 프로젝트는 기존 FFmpeg 경로를 사용합니다.':'';
   const hardUnavailable=Boolean(offlineSupport&&!offlineSupport.supported||project&&!project.audio_filename);
   document.querySelector('input[name="exportMode"][value="offline"]').disabled=hardUnavailable;
   if(window.ScoreLocalProjects?.enabled){
     const legacy=document.querySelector('input[name="exportMode"][value="legacy"]');
     legacy.disabled=true;legacy.closest('label').hidden=true;
     document.querySelector('input[name="exportMode"][value="offline"]').checked=true;
   }
   if(hardUnavailable&&!window.ScoreLocalProjects?.enabled&&selectedExportMode()==='offline')document.querySelector('input[name="exportMode"][value="legacy"]').checked=true;
   else if(!hardUnavailable&&!renderUiActive&&(!exportChoiceExplicit||localStorage.getItem(exportModeKey)==='offline'))
     document.querySelector('input[name="exportMode"][value="offline"]').checked=true;
   const offline=selectedExportMode()==='offline',seconds=Number(project?.audio_duration_sec)||0;
   $('mp4OnlyOptions').hidden=offline;$('webmLengthOptions').hidden=true;
   const zoom=highZoom?(exportT('export.highZoomNote')||' · 150% 이상 악보 확대'):'';
   const exportWarning=exportT('export.experimentalWarning',{width,height,fps,zoom})
     ||`${width}×${height} · ${fps}fps${zoom} 전체 곡은 미검증입니다. 실패하거나 메모리가 부족하면 호환 렌더링을 선택하세요.`;
   const supportLabel=offlineSupport===null
     ?(exportT('export.supportChecking')||'확인 중')
     :(exportT('export.supportUnavailable')||'고속 오프라인 MP4 사용 불가');
   const supportReason=offlineSupport===null
     ?(exportT('export.checkingReason')||reason)
     :project&&!project.audio_filename?(exportT('export.noAudioFallback')||reason):reason;
   $('offlineSupportText').textContent=reason?`${supportLabel}: ${supportReason}`:
     experimental?exportWarning:
     (exportT('export.verifiedReady')||'WebCodecs H.264/AAC · OPFS 사용 가능 · 720p 전체 곡 검증 완료');
   const startText=exportT(offline?'export.fastStart':'export.compatibleStart')
     ||`${offline?'고속 오프라인':'호환 렌더링'} MP4 시작`;
   // Keep the decorative arrow separate from translated button text.
   $('exportButton').replaceChildren(document.createTextNode(startText+' '),Object.assign(document.createElement('span'),{textContent:'↗'}));
   const ratioLabel=$('aspectRatio').value==='custom'?`${$('customAspectWidth').value}:${$('customAspectHeight').value}`:$('aspectRatio').value;
   const engine=exportT(offline?'export.fastEngine':'export.compatibleEngine')
     ||(offline?'고속 오프라인 (WebCodecs)':'호환 렌더링 (FFmpeg)');
   $('selectedEngineSummary').textContent=exportT('export.plannedSummary',{aspect:ratioLabel,width,height,fps,engine})
     ||`출력 예정: ${ratioLabel} · ${width}×${height} · ${fps}fps · ${engine}`;
   $('exportButton').disabled=!project||renderUiActive||(offline&&(!offlineSupport||hardUnavailable));
   if(offline){
     $('exportEstimate').textContent=exportT('export.fastEstimate',{duration:fmt(seconds)})
       ||`${fmt(seconds)} 분량을 실제 재생 없이 프레임별로 생성합니다. 출력 시간은 컴퓨터 성능에 따라 달라집니다.`;
   }else{
     const eta=mp4MeasuredFps&&seconds?fmt(Math.ceil(seconds*fps/mp4MeasuredFps))
       :(exportT('export.firstFfmpegEstimate')||'첫 FFmpeg 출력 후 측정 가능');
     const average=mp4MeasuredFps?(exportT('export.averageFps',{fps:mp4MeasuredFps.toFixed(1)})
       ||` (이전 출력 평균 ${mp4MeasuredFps.toFixed(1)}프레임/초 기준)`):'';
     $('exportEstimate').textContent=exportT('export.compatibleEstimate',{eta,average})
       ||`예상 시간: ${eta}${average} · 기존 Chromium + FFmpeg 경로`;
   }
 }
 const renderEditTargets=()=>[document.querySelector('.sidebar'),document.querySelector('.preview-zoom-bar'),document.querySelector('.layer-selection'),...document.querySelectorAll('.preview-actions > :not(#cancelRenderButton):not(#cancelWebmButton):not(.preview-info)')].filter(Boolean);
 function setRenderUi(active,status={}){
   if(active!==renderUiActive){
     renderUiActive=active;
     document.body.classList.toggle('render-ui-active',active);
     for(const element of renderEditTargets())element.inert=active;
     if(active){window.ScoreVisualEditor?.setEditing(false);$('scoreEditOverlay').hidden=true;}
   }
   $('renderStatusBanner').hidden=!active;
   $('cancelRenderButton').hidden=!active||Boolean(status.webm);
   if(!active)return;
   const state=status.state||'queued',detail=status.message||'';
   $('renderEngineText').textContent=`실행 엔진: ${status.engine==='webcodecs'||offlineActive?'고속 WebCodecs':'호환 FFmpeg'}`;
   $('renderWarningText').textContent=status.webm?'영상 녹화 중입니다. 완료될 때까지 창이나 탭을 닫지 마세요.':'영상 렌더링 중입니다. 완료될 때까지 창이나 탭을 닫지 마세요.';
   $('renderStageText').textContent=state==='cancelling'?'렌더링 취소 중...':state==='queued'?'렌더링 준비 중':detail.split('|')[0].trim()||'영상 렌더링 중';
   const seconds=detail.match(/남은 시간(?: 약)? (\d+)초/);
   const minuteSeconds=detail.match(/남은 시간(?: 약)? (\d+)분 (\d+)초/);
   const clock=detail.match(/남은 시간 (\d{2}:\d{2}:\d{2})/);
   $('renderEtaText').textContent=clock?`남은 시간 ${clock[1]}`:minuteSeconds
     ?`남은 시간 ${fmtHms(Number(minuteSeconds[1])*60+Number(minuteSeconds[2]))}`
     :seconds?`남은 시간 ${fmtHms(seconds[1])}`:'남은 시간 계산 중';
   $('renderPercentText').textContent=`${Math.max(0,Math.min(100,Number(status.progress)||0))}%`;
 }
 window.addEventListener('beforeunload',event=>{if(!renderUiActive)return;event.preventDefault();event.returnValue='';});
 const fmt=(s)=>{const t=Math.max(0,Math.floor(Number(s)||0));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
 const fmtHms=(s)=>{const t=Math.max(0,Math.ceil(Number(s)||0));return `${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor(t/60)%60).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;};
 function exportFileName(extension){
   let name=String($('downloadName').value||project?.score_name||project?.musicxml_title||project?.midi_name||'ScoreVideo').replace(/\\/g,'/').split('/').pop();
   name=name.replace(/\.(musicxml|xml|mxl|mid|midi|mp4|webm)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'_').trim().replace(/^[. ]+|[. ]+$/g,'');
   if(!name||/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(name))name='ScoreVideo';
   if(extension!=='mp4')return `${name.slice(0,180)}.${extension}`;
   const {width,height,fps}=config(),ratio=($('aspectRatio').value==='custom'
     ?`${$('customAspectWidth').value}x${$('customAspectHeight').value}`:$('aspectRatio').value.replace(':','x'));
   return `${name.slice(0,150)}_${ratio}_${width}x${height}_${fps}fps.mp4`;
 }
 function message(text,error=false){$('message').textContent=text;$('message').classList.toggle('error',error);}
 const offset=()=>Number($('offset').value),pianoOffset=()=>Number($('pianoOffset').value),zoom=()=>Number($('zoom').value);
 function cameraPointStoreKey(){return project?`scorevideo_camera_points_${project.id}`:'';}
 function readCameraPoints(){try{const raw=JSON.parse(localStorage.getItem(cameraPointStoreKey())||'[]');return Array.isArray(raw)?raw.slice(0,500):[];}catch(_){return[];}}
 let selectedCameraPoint='',cameraPointPicking=false;
 function writeCameraPoints(points){if(!project)return;localStorage.setItem(cameraPointStoreKey(),JSON.stringify(points.slice(0,500)));stage?.setCameraPoints(points);renderCameraPointList();saveSettings();}
 function noteName(pitch){const names=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];return `${names[((pitch%12)+12)%12]}${Math.floor(pitch/12)-1}`;}
 function renderCameraPointList(){
   const list=$('cameraPointList');if(!list)return;const points=readCameraPoints();list.replaceChildren();
   for(const point of points){const button=document.createElement('button');button.type='button';button.className='camera-point-item'+(point.key===selectedCameraPoint?' selected':'');button.textContent=`${point.auto?'✦ ':''}마디 ${point.measure||'—'} · ${noteName(Number(point.pitch)||60)}`;button.title=point.auto?`자동 제안 · ${point.kind||'음표'}`:'수동 포인트';button.addEventListener('click',()=>{selectedCameraPoint=point.key;syncCameraPointControls();renderCameraPointList();const resolved=stage?.follower?.cameraPoints?.find(p=>p.key===point.key);if(resolved)seekTo(resolved.time);});list.append(button);}
   $('cameraPointControls').hidden=!points.some(p=>p.key===selectedCameraPoint);
   $('cameraPointStatus').textContent=cameraPointPicking?'미리보기에서 음표를 클릭하세요. 다시 누르면 선택을 마칩니다.':points.length?`${points.length}개 포인트 · 목록에서 줌·타이밍·지속 시간을 조절하세요.`:'포인트 없음 · Points 모드를 고르고 미리보기 음표를 눌러 추가하세요.';
   $('cameraPointModeToggle').textContent=cameraPointPicking?'✓ 음표 선택 끝내기':'＋ 프리뷰에서 음표 포인트 찍기';
   stage?.follower?.setCameraPointPicking(cameraPointPicking);
 }
 function syncCameraPointControls(){const p=readCameraPoints().find(x=>x.key===selectedCameraPoint);if(!p)return;for(const [id,key] of [['cameraPointZoom','zoom'],['cameraPointDuration','duration'],['cameraPointShake','shake'],['cameraPointTiming','timing']])$(id).value=String(p[key]??({zoom:1.3,duration:1.6,shake:0,timing:-.6}[key]));$('cameraPointZoomVal').textContent=`${Math.round(Number(p.zoom||1.3)*100)}%`;$('cameraPointDurationVal').textContent=`${Number(p.duration||1.6).toFixed(1)}초`;$('cameraPointShakeVal').textContent=`${Math.round(Number(p.shake||0)*100)}%`;const timing=Number.isFinite(Number(p.timing))?Number(p.timing):-.6;$('cameraPointTimingVal').textContent=timing<0?`${Math.abs(timing).toFixed(2)}초 먼저`:`${timing.toFixed(2)}초 뒤`;}
 window.ScoreCameraPointEditor={active:()=>cameraPointPicking&&!renderUiActive,add(data){if(renderUiActive)return;const points=readCameraPoints();let point=points.find(p=>p.key===data.key);if(!point){point={key:data.key,measure:data.measure,pitch:data.pitch,beat:data.beat,zoom:1.3,duration:1.6,shake:0,timing:-.6};points.push(point);}selectedCameraPoint=point.key;writeCameraPoints(points);if($('cameraMode').value!=='points'){$('cameraMode').value='points';if(stage?.follower)stage.follower.cameraMode='points';queueApply();}syncCameraPointControls();if(Number.isFinite(data.time))seekTo(data.time);}};
 $('cameraPointModeToggle').addEventListener('click',()=>{cameraPointPicking=!cameraPointPicking;if(cameraPointPicking&&$('cameraMode').value!=='points'){$('cameraMode').value='points';queueApply();}renderCameraPointList();});
 $('cameraPointAuto').addEventListener('click',()=>{
   const notes=stage?.follower?.noteTriggers||[];
   if(project?.has_score===false||!notes.length){$('cameraAutoStatus').textContent='MusicXML 악보와 MIDI를 불러온 뒤 사용할 수 있습니다.';return;}
   const manual=readCameraPoints().filter(p=>!p.auto);
   const suggested=window.ScoreCameraAuto.suggest(notes,{duration:project.audio_duration_sec,existing:manual});
   if(!suggested.length){$('cameraAutoStatus').textContent='이 곡에서 자동 포인트를 찾지 못했습니다. 음표를 직접 선택해 주세요.';return;}
   cameraPointPicking=false;selectedCameraPoint=suggested[0].key;
   $('cameraMode').value='points';
   writeCameraPoints([...manual,...suggested]);syncCameraPointControls();queueApply();
   $('cameraAutoStatus').textContent=`${suggested.length}개 자동 포인트를 만들었습니다. 수동 ${manual.length}개는 유지하고, 이전 자동 포인트만 새로 제안했습니다.`;
 });
 $('cameraPointAtPlayhead').addEventListener('click',()=>{const notes=stage?.follower?.noteTriggers||[],time=Number(previewTime())||0;let best=null,distance=Infinity;for(const note of notes){const d=Math.abs(note.audio-time);if(d<distance){best=note;distance=d;}}if(!best||distance>.6){message('현재 위치 근처에서 음표를 찾지 못했습니다. 재생 위치를 음표 가까이 옮겨 주세요.',true);return;}const chord=notes.filter(n=>Math.abs(n.audio-best.audio)<.055&&n.systemKey===best.systemKey);const target=chord.reduce((top,n)=>(Number(n.pitch)>Number(top.pitch)?n:top),best);window.ScoreCameraPointEditor.add({key:target.scoreKey,time:target.audio,beat:target.beat,pitch:target.pitch,measure:target.measure});});
 for(const [id,key] of [['cameraPointZoom','zoom'],['cameraPointDuration','duration'],['cameraPointShake','shake'],['cameraPointTiming','timing']])$(id).addEventListener('input',()=>{const points=readCameraPoints(),p=points.find(x=>x.key===selectedCameraPoint);if(!p)return;p[key]=Number($(id).value);p.auto=false;writeCameraPoints(points);syncCameraPointControls();});
 $('cameraPointRemove').addEventListener('click',()=>{const removed=selectedCameraPoint;selectedCameraPoint='';writeCameraPoints(readCameraPoints().filter(p=>p.key!==removed));});
 $('cameraPointClear').addEventListener('click',()=>{selectedCameraPoint='';writeCameraPoints([]);});
 $('cameraMode').addEventListener('change',()=>{if($('cameraMode').value!=='points'){cameraPointPicking=false;renderCameraPointList();}});
 function selectedLightStops(preset){
   const stops=window.ScoreFxGroups?.harmonicStops?.[preset];
   return Array.isArray(stops)?[...stops]:null;
 }
 function sceneOptions(){return {
   template:$('sceneTemplate').value,cameraMode:$('cameraMode').value,fxMode:$('fxMode').value,fxStrength:Number($('fxStrength').value),scoreImpactEnabled:$('scoreImpactEnabled').checked,scoreImpactStrength:Number($('scoreImpactStrength').value),
   scoreParticles:{on:$('scoreParticlesOn').checked,style:$('scoreParticleStyle').value,
     count:Number($('scoreParticleCount').value),size:Number($('scoreParticleSize').value),speed:Number($('scoreParticleSpeed').value),
     life:Number($('scoreParticleLife').value),brightness:Number($('scoreParticleBrightness').value)},lightColorMode:$('lightColorMode').value,velocityScale:$('velocityScale').value,lightColorPreset:$('scoreColorPreset').value,lightPaletteStops:$('lightColorMode').value==='aurora'?selectedLightStops($('scoreColorPreset').value):null,
   trailUpper:$('trailUpperColor').value,trailLower:$('trailLowerColor').value,
   trailLength:Number($('trailLength').value),trailBrightness:Number($('trailBrightness').value),
   trailThickness:Number($('trailThickness').value),trailDuration:Number($('trailDuration').value),
   auroraPreset:$('auroraPreset').value,auroraLow:$('auroraLow').value,auroraHigh:$('auroraHigh').value,
   font:$('titleFont').value,notationStyle:$('notationStyle').value,titleGap:Number($('titleGap').value),
   title:$('titleText').value,artist:$('artistText').value,credit:$('creditText').value,showText:$('showText').checked,
   animateBackground:$('animateBackground').checked,
   keyframes:[{time:0,color:$('sceneStartColor').value,glow:$('sceneStartGlow').value},
     {time:Number($('transitionTime').value),color:$('sceneEndColor').value,glow:$('sceneEndGlow').value}],
 };}
 function gpuEffects(){
   const keyboardLinked=$('keyboardPaletteLink').checked||$('keyboardColorPreset').value==='linked';
   const keyboardStops=selectedLightStops(keyboardLinked?$('scoreColorPreset').value:$('keyboardColorPreset').value);
   const result={preset:$('gpuPreset').value,pedalResonance:$('pedalResonance').checked,
     sustainAfterglow:$('sustainAfterglow').checked,
     groups:{overall:$('minimalMode').checked?'minimal':$('gpuPreset').value,
       score:{effectPreset:$('scoreFxPreset').value,colorPreset:$('scoreColorPreset').value},
       keyboard:{effectPreset:$('keyboardFxPreset').value,colorPreset:$('keyboardColorPreset').value}},
     keyboard:{colorStops:keyboardStops,colorLow:$('keyboardColorPreset').value==='linked'?null:$('keyboardColorLow').value,
       colorHigh:$('keyboardColorPreset').value==='linked'?null:$('keyboardColorHigh').value,
       velocityColor:$('keyboardVelocityColor').checked,paletteLink:$('keyboardPaletteLink').checked,
       velocityScale:$('keyboardVelocityScale').value,
       noteBarMode:$('keyboardNoteBarMode').value,noteRiseSpeed:Number($('keyboardNoteRiseSpeed').value),
       glowSize:Number($('keyboardGlowSize').value),particleDensity:Number($('keyboardParticleDensity').value),
       particleSize:Number($('keyboardParticleSize').value),particleLife:Number($('keyboardParticleLife').value),
       curlStrength:Number($('keyboardCurlStrength').value),densityFastWeight:Number($('keyboardDensityFastWeight').value),
       bloomStrength:Number($('keyboardBloomStrength').value),bloomRadius:Number($('keyboardBloomRadius').value),velocityContrast:Number($('keyboardVelocityContrast').value),
       lightingMode:$('keyboardLightingMode').value,baseBrightness:Number($('keyboardBaseBrightness').value),
       sensitivity:Number($('keyboardLightingSensitivity').value),brightnessOffset:Number($('keyboardBrightnessOffset').value),
       temperatureSync:$('keyboardTemperatureSync').checked,whiteBrightness:Number($('keyboardWhiteBrightness').value),
       blackBrightness:Number($('keyboardBlackBrightness').value),reflectionStrength:Number($('keyboardReflectionStrength').value),
       boundaryLight:{style:$('keyboardBoundaryStyle').value,strength:Number($('keyboardBoundaryStrength').value),
         thickness:Number($('keyboardBoundaryThickness').value),reaction:Number($('keyboardBoundaryReaction').value),
         speed:Number($('keyboardBoundarySpeed').value),
         colorMode:$('keyboardBoundaryColorMode').value,color:$('keyboardBoundaryColor').value}},
     cinematic:{on:$('gpuCinematicOn').checked,strength:Number($('gpuCinematicStrength').value),
       reaction:Number($('gpuMusicReaction').value)},
     glow:{core:{strength:Number($('gpuCoreStrength').value),radius:Number($('gpuCoreRadius').value)},
       mid:{strength:Number($('gpuMidStrength').value),radius:Number($('gpuMidRadius').value)},
       halo:{strength:Number($('gpuHaloStrength').value),radius:Number($('gpuHaloRadius').value)}},
     burst:{on:$('gpuBurstOn').checked,count:Number($('gpuParticleCount').value),
       size:Number($('gpuParticleSize').value),speed:Number($('gpuParticleSpeed').value),
       direction:Number($('gpuParticleDirection').value),spread:Number($('gpuParticleSpread').value),
       life:Number($('gpuParticleLife').value),brightness:Number($('gpuParticleBrightness').value)},
     volumetric:{on:$('gpuVolumetricOn').checked,strength:Number($('gpuVolumetricStrength').value)},
     chromatic:{on:$('gpuChromaticOn').checked,strength:Number($('gpuChromaticStrength').value)},
     trails:{on:$('gpuTrailOn').checked,strength:Number($('gpuTrailStrength').value),
       length:Number($('gpuTrailLength').value),duration:Number($('gpuTrailDuration').value)}};
   for(const [name,label] of [['classic','Classic'],['bloom','Bloom'],['outline','Outline'],['stardust','Stardust']])
     result[name]={on:$("gpu"+label+"On").checked,strength:Number($("gpu"+label+"Strength").value)};
   return result;
 }
 function minimalPalette(){return {mode:$('minimalPaletteMode').value,note:$('minimalNoteColor').value,
   white:$('minimalWhiteColor').value,black:$('minimalBlackColor').value,pedal:$('minimalPedalColor').value};}
 function recommendMinimalColors(){
   const recommended=window.ScoreStudio.recommendMinimalPalette($('minimalPaletteMode').value,{
     paper:$('paperColor').value,ink:$('inkColor').value,accent:$('accentColor').value,glow:$('glowColor').value,
     white:$('pianoWhiteKeyColor').value,black:$('pianoBlackKeyColor').value});
   for(const [key,id] of Object.entries({note:'minimalNoteColor',white:'minimalWhiteColor',black:'minimalBlackColor',pedal:'minimalPedalColor'}))$(id).value=recommended[key];
 }
 function config(){
   const [width,height]=$('resolution').value.split('x').map(Number);
   return {melody_highlight:window.ScoreMelodyHighlight?.getState?.(),width,height,fps:Number($('fps').value),aspect_ratio:$('aspectRatio').value,render_mode:$('renderMode').value,video_quality:$('videoQuality').value,video_bitrate:$('videoBitrate').value,fx_renderer:$('fxRenderer').value,gpu_effects:gpuEffects(),minimal_palette:minimalPalette(),download_name:$('downloadName').value,offset_sec:offset(),piano_offset_sec:pianoOffset(),zoom:zoom(),camera_points:readCameraPoints(),
      paper_color:$('paperColor').value,staff_color:$('staffColor').value,ink_color:$('inkColor').value,
      staff_colors:window.ScoreStaffColors?.getConfig?.()||{enabled:false,keyboard:false,colors:{}},
      glow_color:$('glowColor').value,cursor_color:$('cursorColor').value,cursor_visible:$('cursorVisible').checked,cursor_motion:$('cursorMotion').value,accent_color:$('accentColor').value,
      texture:'none',background_opacity:Number($('backgroundOpacity').value),background_fit:$('backgroundFit').value,background_position_x:Number($('backgroundPosX').value),background_position_y:Number($('backgroundPosY').value),
      inverted:$('inverted').checked,glitter:$('glitter').checked,sparkle:$('sparkle').checked,draw_score:$('drawScore').checked,minimal_mode:$('minimalMode').checked,
      velocity_reactive:$('velocityReactive').checked,note_motion:$('noteMotion').checked,motion_strength:Number($('motionStrength').value),
      score_visible:$('scoreVisible').checked,piano_enabled:$('pianoEnabled').checked,piano_camera:$('pianoCamera').checked,
      piano_vertical_offset_pct:Number($('pianoVerticalOffset').value),piano_key_style:$('pianoKeyStyle').value,piano_white_key_color:$('pianoWhiteKeyColor').value,piano_black_key_color:$('pianoBlackKeyColor').value,piano_light:$('pianoLight').checked,piano_light_strength:Number($('pianoLightStrength').value),
      layout_mode:$('layoutMode').value,scroll_mode:$('layoutMode').value==='singleline'?'horizontal':'vertical',score_position_x:Number($('scorePosX').value),score_position_y:Number($('scorePosY').value),score_area_x:Number($('scoreAreaX').value),score_area_width:Number($('scoreAreaWidth').value),score_area_height:Number($('scoreAreaHeight').value),score_crop_top:Number($('scoreCropTop').value),score_margin_top:Number($('scoreMarginTop').value),score_margin_bottom:Number($('scoreMarginBottom').value),score_panel_color:$('scorePanelColor').value,score_panel_opacity:Number($('scorePanelOpacity').value)/100,scene:sceneOptions()};
 }
 function previewConfig(){
   const settings=config(),short=Math.min(settings.width,settings.height),scale=Math.min(1,1080/short);
   settings.width=Math.max(200,2*Math.round(settings.width*scale/2));
   settings.height=Math.max(200,2*Math.round(settings.height*scale/2));
   return settings;
 }
 function relativeNoteheadWidth(){
   const head=stage?.scoreWindow?.querySelector('.vf-notehead');
   const note=head?.getBoundingClientRect(),frame=stage?.viewport?.getBoundingClientRect();
   return note?.width&&frame?.width?note.width/frame.width:0;
 }
 async function prepareExportStage(){
   const previewWidth=relativeNoteheadWidth();
   exportGeometry=true;resizePreview();
   let settings=config();
   await stage.setSettings(settings);
   const outputWidth=relativeNoteheadWidth();
   if(previewWidth&&outputWidth){
     const scale=Math.max(.5,Math.min(4,previewWidth/outputWidth));
     if(Math.abs(scale-1)>.01){
       settings={...settings,score_layout_scale:scale};
       await stage.setSettings(settings);
     }
   }
   return settings;
 }
 async function restorePreviewStage(){
   if(!exportGeometry)return;
   exportGeometry=false;resizePreview();
   await stage?.setSettings(previewConfig());
 }
 function saveSettings(){const item={};for(const id of persistent){const node=$(id);item[id]=node.type==='checkbox'?node.checked:node.value;}localStorage.setItem(storeKey,JSON.stringify(item));schedulePortableAutosave();}
 function useGpuRenderer(){
   // Historic project settings may store `canvas` or `auto`; only the GPU
   // renderer is implemented by the current stage. Keep the field for
   // project/schema compatibility, not as a misleading UI choice.
   $('fxRenderer').value='pixi';
 }
 function restoreSettings(){try{
   const data=JSON.parse(localStorage.getItem(storeKey)||'{}');
   if(!Object.keys(data).length)applyNewProjectDefaults();
   if(data.fxMode==='aurora'&&!data.lightColorMode){data.fxMode='bloom';data.lightColorMode='aurora';}
   for(const id of persistent){const node=$(id);if(data[id]===undefined)continue;if(node.type==='checkbox')node.checked=!!data[id];else node.value=data[id];}
   for(const id of ['scoreFxPreset','scoreColorPreset','keyboardFxPreset'])
     if(data[id]===undefined&&Object.keys(data).length)$(id).value='custom';
   // Existing saved projects with no horizon-light setting retain the original hitline.
   if(data.keyboardBoundaryStyle===undefined&&Object.keys(data).length) $('keyboardBoundaryStyle').value='none';
   if(data.keyboardColorPreset===undefined){
     const legacy=Object.keys(data).length>0;
     if(legacy){$('keyboardColorPreset').value='linked';$('keyboardPaletteLink').checked=true;}
   }
   if(data.minimalNoteColor===undefined)recommendMinimalColors();
   window.ScoreFxGroups?.syncBoundaryUi();
   window.ScoreFxGroups?.syncNoteBarUi();
   window.ScoreFxGroups?.syncLightingUi();
   window.ScoreFxGroups?.syncCustomColors();
   window.ScoreFxGroups?.syncPreview();
   migrateOutputSize(data);
 }catch(e){syncOutputSize();}useGpuRenderer();updateLabels();resizePreview();}
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
   settings.staffColors=window.ScoreStaffColors?.getConfig?.()||{enabled:false,keyboard:false,colors:{}};
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
   preset.projectName=(project.has_score===false?project.midi_name:project.score_name).replace(/\.(musicxml|xml|mxl|mid|midi)$/i,'');
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
       const meta=await response.json();await loadProject(meta);localStorage.setItem(lastProjectKey,meta.id);
     }
     for(const id of persistent){
       const node=$(id),value=preset.settings[id];if(value===undefined)continue;
       if(node.type==='checkbox')node.checked=Boolean(value);else node.value=String(value);
     }
     useGpuRenderer();
     if(preset.settings.minimalMode===undefined)$('minimalMode').checked=false;
     if(preset.settings.minimalNoteColor===undefined)recommendMinimalColors();
     migrateOutputSize(preset.settings);
     $('offset').value=String(preset.settings.offset??0);
     $('pianoOffset').value=String(preset.settings.pianoOffset??0);
     if(Array.isArray(preset.settings.cameraPoints))writeCameraPoints(preset.settings.cameraPoints);
     if(preset.settings.staffColors)window.ScoreStaffColors?.setConfig(preset.settings.staffColors);
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
   if(document.activeElement!==$('offsetNumber'))$('offsetNumber').value=offset().toFixed(2);
   if(document.activeElement!==$('pianoOffsetNumber'))$('pianoOffsetNumber').value=pianoOffset().toFixed(2);
   $('editScoreAreaButton').disabled=project?.has_score===false||!$('scoreVisible').checked;
   $('compactScoreTopButton').disabled=project?.has_score===false;
   $('scorePanelColorLink').disabled=project?.has_score===false;
   $('pianoKeyCustomColors').hidden=$('pianoKeyStyle').value!=='custom';
   $('zoomVal').textContent=`${Math.round(zoom()*100)}%`;
   $('motionStrengthVal').textContent=`${Math.round(Number($('motionStrength').value)*100)}%`;
   $('pianoLightStrengthVal').textContent=`${Math.round(Number($('pianoLightStrength').value)*100)}%`;
   const vertical=Number($('pianoVerticalOffset').value);
   $('pianoVerticalOffsetVal').textContent=`${vertical>0?'+':''}${vertical}%`;
   $('scoreImpactStrengthVal').textContent=`${Math.round(Number($('scoreImpactStrength').value)*100)}%`;
   $('backgroundOpacityVal').textContent=`${Math.round(Number($('backgroundOpacity').value)*100)}%`;
   $('backgroundPosXVal').textContent=`${$('backgroundPosX').value}%`;
   $('backgroundPosYVal').textContent=`${$('backgroundPosY').value}%`;
   $('scorePosXVal').textContent=`${$('scorePosX').value}%`;
   $('scorePosYVal').textContent=`${$('scorePosY').value}%`;
   $('titleGapVal').textContent=`${$('titleGap').value}px`;
   for(const key of ['scoreAreaX','scoreAreaWidth','scoreAreaHeight','scoreCropTop','scoreMarginTop','scoreMarginBottom','scorePanelOpacity'])$(key+'Val').textContent=`${$(key).value}%`;
   if(document.activeElement!==$('scoreCropTopNumber'))$('scoreCropTopNumber').value=$('scoreCropTop').value;
   $('auroraOptions').hidden=$('lightColorMode').value!=='aurora';
   const velocities=project?.note_events?.map(n=>Number(n.velocity)).filter(Number.isFinite)||[];
   const uniformWarning=$('velocityUniformWarning');uniformWarning.hidden=true;
   if(velocities.length){
     const lo=velocities.reduce((a,b)=>Math.min(a,b),127),hi=velocities.reduce((a,b)=>Math.max(a,b),1);
     $('velocityRangeInfo').textContent=`현재 MIDI: ${lo}~${hi} · 절대값은 1~127, 상대값은 이 범위 전체를 사용`;
     $('keyboardVelocityRangeInfo').textContent=lo===hi
       ? `MIDI 벨로시티가 모두 ${lo}로 동일합니다. 음표별 색상 변화가 불가능합니다.`
       : `현재 MIDI ${lo}~${hi} · 상대값에서는 약한 타건 ${lo}부터 강한 타건 ${hi}까지 색상 전체를 사용합니다.`;
     if($('lightColorMode').value==='aurora'&&lo===hi){
       uniformWarning.textContent=`이 MIDI의 모든 음표가 벨로시티 ${lo}로 같습니다. 강약 차이가 없어 Aurora 색상도 변하지 않습니다. 색 변화를 원하면 벨로시티가 다른 MIDI를 사용하세요.`;
       uniformWarning.hidden=false;
     }
   }
   $('fxStrengthVal').textContent=`${Math.round(Number($('fxStrength').value)*100)}%`;
   $('transitionTimeVal').textContent=`${$('transitionTime').value}초`;
   $('backgroundTrack').style.background=`linear-gradient(90deg,${$('sceneStartColor').value},${$('sceneEndColor').value})`;
   $('trailOptions').hidden=$('fxMode').value!=='trail';
   $('cameraPointTools').hidden=$('cameraMode').value!=='points';
   window.ScoreWorkspaceUi?.syncCards();
 }
 function resizePreview(){
   const {width:w,height:h}=exportGeometry?config():previewConfig();
   const surround=$('previewSurround'),frame=$('stageFrame'),viewport=$('scoreViewport');
   const avail=Math.max(140,surround.clientWidth-24);
   const desktop=window.matchMedia('(min-width:701px)').matches;
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
 // Staff-color drag is visual-only. Do not relayout the score or rebuild GPU layers.
 let staffColorsRaf=0;
 document.addEventListener('scoremotion:staffcolorschange',()=>{
   if(!project)return;
   saveProjectEffects();schedulePortableAutosave();
   if(staffColorsRaf)return;
   const projectId=project.id;
   staffColorsRaf=requestAnimationFrame(()=>{
     staffColorsRaf=0;
     if(!stage||project?.id!==projectId)return;
     try{stage.setStaffColors(window.ScoreStaffColors?.getConfig?.()||{enabled:false,keyboard:false,colors:{}},
       {redraw:previewPaused()});}
     catch(error){message(`오선 색상 미리보기 실패: ${error.message}`,true);}
   });
 });
 function queueApply(){
   revision++;
   const myRevision=revision,setting=previewConfig();
   saveSettings();saveProjectEffects();updateLabels();resizePreview();
   if(!stage){$('scoreViewport').style.backgroundColor=setting.paper_color;return;}
   $('previewInfo').textContent='설정을 미리보기에 적용 중…';
   applySerial=applySerial.catch(()=>{}).then(async()=>{
     if(myRevision!==revision||!stage)return;
     await stage.setSettings(setting);
     stage.seek(previewTime());
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
 $('scoreViewport').addEventListener('score-fx-renderer',event=>{
   const {actual,reason}=event.detail||{};
   if(reason)$('fxRendererStatus').removeAttribute('data-i18n');
   else $('fxRendererStatus').setAttribute('data-i18n',actual==='pixi'?'effects.rendererActive':'effects.rendererDefault');
   $('fxRendererStatus').textContent=reason
     ?(window.ScoreI18n?.t('effects.rendererError',{reason})||`GPU renderer error: ${reason}`)
     :actual==='pixi'?(window.ScoreI18n?.t('effects.rendererActive')||'현재 사용: PixiJS GPU')
       :(window.ScoreI18n?.t('effects.rendererDefault')||'현재 사용: 기존 Canvas2D');
 });
 $('scoreViewport').addEventListener('score-keyboard-renderer',event=>{
   const {actual,reason}=event.detail||{};
   if(actual==='dynamic'||actual==='legacy'){
     const key=actual==='dynamic'?'effects.rendererDynamic':'effects.rendererDefault';
     $('fxRendererStatus').setAttribute('data-i18n',key);
     $('fxRendererStatus').textContent=window.ScoreI18n?.t(key)||
       (actual==='dynamic'?'현재 사용: Dynamic FX v1.6':'현재 사용: 기존 건반');
   }else if(actual==='error'){
     $('fxRendererStatus').removeAttribute('data-i18n');
     $('fxRendererStatus').textContent=window.ScoreI18n?.t('effects.rendererError',{reason})||reason;
   }
 });
 for(const id of persistent){
   if(['sceneTemplate','themeColor','paletteTheme','auroraPreset','auroraLow','auroraHigh','zoom','scorePosX','scorePosY','aspectRatio','outputQuality','resolution'].includes(id))continue;
   $(id).addEventListener('input',queueApply);
   $(id).addEventListener('change',queueApply);
 }
 $('gpuPreset').addEventListener('change',()=>{
   const cinematic=window.ScorePixiFx.cinematicPresets[$('gpuPreset').value];
   if(cinematic){
     const set=(id,value)=>{const node=$(id);if(node.type==='checkbox')node.checked=Boolean(value);else node.value=String(value);};
     set('gpuCinematicOn',true);
     set('gpuCinematicStrength',cinematic.cinematic.strength);
     set('gpuMusicReaction',cinematic.cinematic.reaction);
     for(const [name,label] of [['classic','Classic'],['bloom','Bloom'],['outline','Outline'],['stardust','Stardust'],
       ['volumetric','Volumetric'],['chromatic','Chromatic']]){
       set('gpu'+label+'On',cinematic[name].on);
       set('gpu'+label+'Strength',cinematic[name].strength);
     }
     for(const [name,label] of [['core','Core'],['mid','Mid'],['halo','Halo']]){
       set('gpu'+label+'Strength',cinematic.glow[name].strength);
       set('gpu'+label+'Radius',cinematic.glow[name].radius);
     }
     for(const [name,id] of [['on','gpuBurstOn'],['count','gpuParticleCount'],['size','gpuParticleSize'],
       ['speed','gpuParticleSpeed'],['direction','gpuParticleDirection'],['spread','gpuParticleSpread'],
       ['life','gpuParticleLife'],['brightness','gpuParticleBrightness']])set(id,cinematic.burst[name]);
     for(const [name,id] of [['on','gpuTrailOn'],['strength','gpuTrailStrength'],
       ['length','gpuTrailLength'],['duration','gpuTrailDuration']])set(id,cinematic.trails[name]);
     for(const [name,id] of [['lightColorMode','lightColorMode'],['auroraLow','auroraLow'],
       ['auroraHigh','auroraHigh'],['glowColor','glowColor']])
       if(cinematic.palette?.[name]!==undefined)set(id,cinematic.palette[name]);
     if(cinematic.palette?.auroraLow)$('auroraPreset').value='custom';
     $('fxMode').value='bloom';
     queueApply();return;
   }
   const preset=window.ScorePixiFx.presets[$('gpuPreset').value];
   if(!preset||$('gpuPreset').value==='custom')return;
   for(const [name,label] of [['classic','Classic'],['bloom','Bloom'],['outline','Outline'],['stardust','Stardust']]){
     $('gpu'+label+'On').checked=preset[name]>0;
     $('gpu'+label+'Strength').value=String(preset[name]||1);
   }
   queueApply();
 });
 for(const label of ['Classic','Bloom','Outline','Stardust'])for(const suffix of ['On','Strength'])
   $('gpu'+label+suffix).addEventListener('change',()=>{$('gpuPreset').value='custom';queueApply();});
 for(const label of ['Core','Mid','Halo'])for(const suffix of ['Strength','Radius'])
   $('gpu'+label+suffix).addEventListener('change',()=>{$('gpuPreset').value='custom';queueApply();});
 for(const id of ['gpuBurstOn','gpuParticleCount','gpuParticleSize','gpuParticleSpeed',
   'gpuParticleDirection','gpuParticleSpread','gpuParticleLife','gpuParticleBrightness'])
   $(id).addEventListener('change',()=>{$('gpuPreset').value='custom';queueApply();});
 for(const id of ['gpuVolumetricOn','gpuVolumetricStrength','gpuChromaticOn','gpuChromaticStrength',
   'gpuTrailOn','gpuTrailStrength','gpuTrailLength','gpuTrailDuration',
   'gpuCinematicStrength','gpuMusicReaction','fxMode','lightColorMode','auroraLow','auroraHigh','glowColor'])
   $(id).addEventListener('change',()=>{$('gpuPreset').value='custom';queueApply();});
 $('minimalPaletteMode').addEventListener('change',()=>{recommendMinimalColors();queueApply();});
 $('scoreCropTopNumber').addEventListener('input',()=>{
   const value=Number($('scoreCropTopNumber').value);
   if(!Number.isFinite(value))return;
   $('scoreCropTop').value=String(Math.max(0,Math.min(50,value)));
   queueApply();
 });
 $('scoreCropTopNumber').addEventListener('change',()=>{
   $('scoreCropTopNumber').value=$('scoreCropTop').value;updateLabels();
 });
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
 let scorePositionDebounce=null;
 for(const id of ['scorePosX','scorePosY']){
   $(id).addEventListener('input',()=>{
     updateLabels();clearTimeout(scorePositionDebounce);
     scorePositionDebounce=setTimeout(()=>{scorePositionDebounce=null;queueApply();},180);
   });
   $(id).addEventListener('change',()=>{
     clearTimeout(scorePositionDebounce);scorePositionDebounce=null;queueApply();
   });
 }
 $('scoreReadablePreset').addEventListener('click',()=>{$('scorePanelColor').value='#0c1120';$('scorePanelOpacity').value='55';queueApply();});
 $('themeColor').addEventListener('input',saveSettings);
 $('titleText').addEventListener('input',()=>{if(project)localStorage.setItem('scorevideo_title_override_'+project.id,$('titleText').value);});
 $('resetTitleButton').addEventListener('click',()=>{
   if(!project)return;localStorage.removeItem('scorevideo_title_override_'+project.id);
   $('titleText').value=(project.has_score===false?project.midi_name:project.score_name).replace(/\.(musicxml|xml|mxl|mid|midi)$/i,'');
   queueApply();
 });
 function applyAuroraPreset(){
   const chosen=$('auroraPreset').value;
   const colors=chosen==='theme'?window.ScoreTheme.auroraPalette($('themeColor').value):window.ScoreStudio.auroraPresets[chosen];
   if(colors){$('auroraLow').value=colors.low;$('auroraHigh').value=colors.high;}
   // The advanced Aurora selector overrides the quick light-color preset.
   // Do not leave a named environment preset selected when it is no longer
   // the palette actually rendered. Linked keyboard colors follow too.
   $('scoreColorPreset').value='custom';
   window.ScoreFxGroups?.syncPreview();
   window.ScoreFxGroups?.syncCustomColors();
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
   recommendMinimalColors();
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

 // Palette source and video background are independent: A can supply the
 // colors while B remains the photo, and removing B never clears A.
 let paletteSourceFile=null,paletteArtworkURL=null,paletteSerial=0,paletteSaveTask=Promise.resolve();
 let pendingBackgroundFile=null,backgroundPreviewURL=null,backgroundSerial=0,backgroundTask=Promise.resolve();
 function paletteMessage(value,isError=false){
   $('paletteStatus').textContent=value;$('paletteStatus').classList.toggle('error',isError);
 }
 function backgroundMessage(value,isError=false){
   $('backgroundStatus').textContent=value;$('backgroundStatus').classList.toggle('error',isError);
 }
 function validImage(file,report){
   if(!file||!/\.(png|jpe?g|webp)$/i.test(file.name)){report('PNG, JPG, WebP 이미지만 사용할 수 있습니다.',true);return false;}
   if(file.size>20*1024*1024){report('이미지는 20MB 이하로 선택해 주세요.',true);return false;}
   return true;
 }
 async function uploadBackground(file,target){
   const form=new FormData();form.append('background',file,file.name);
   const response=await fetch(`/api/projects/${target.id}/background`,{method:'POST',body:form});
   const data=await response.json();
   if(!response.ok)throw Error(data.detail||'영상 배경 적용 실패');
   if(project===target){project.background_filename=data.background_filename;project.background_version=data.background_version;
     project.background_original_name=data.background_original_name||file.name;refreshBackground();}
   return data;
 }
 async function setBackground(file){
   if(!validImage(file,backgroundMessage))return;
   const serial=++backgroundSerial;
   if(!project){pendingBackgroundFile=file;refreshBackground();backgroundMessage('프로젝트를 만들면 선택한 이미지를 영상 배경으로 적용합니다.');return;}
   const target=project;
   backgroundMessage('영상 배경을 적용하고 있습니다…');
   const task=backgroundTask.catch(()=>{}).then(async()=>{
     if(serial!==backgroundSerial||project!==target)return false;
     return uploadBackground(file,target);
   });
   backgroundTask=task.catch(()=>{});
   try{const result=await task;if(result&&serial===backgroundSerial)backgroundMessage('영상 배경을 적용했습니다. 색상 추천은 그대로 유지됩니다.');}
   catch(error){if(serial===backgroundSerial)backgroundMessage('영상 배경 적용 실패: '+error.message,true);}
 }
 async function analyzePaletteImage(file){
   if(!validImage(file,paletteMessage))return;
   const serial=++paletteSerial;
   paletteSourceFile=file;
   if(project&&window.ScoreLocalProjects?.enabled){
     paletteSaveTask=window.ScoreLocalProjects.savePaletteSource(project.id,file);
     void paletteSaveTask.catch(error=>console.warn('Palette original persistence:',error));
   }
   $('paletteSetBackground').disabled=false;
   paletteMessage('이미지에서 색상 조합을 찾고 있습니다…');
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
     $('paletteColorsTitle').setAttribute('data-i18n','palette.imageColors');
     $('paletteColorsTitle').textContent=window.ScoreI18n?.t('palette.imageColors')||'추출된 대표 색상';
     $('paletteResults').hidden=false;
     paletteMessage(`${result.palette.length}개 주요 색상과 ${result.schemes.length}개 악보 조합을 찾았어요. 영상 배경은 변경하지 않았습니다.`);
   }catch(error){if(serial===paletteSerial){
     paletteMessage('색상 추출 실패: '+error.message,true);
   }}
 }
 async function showThemePalette(){
   const serial=++paletteSerial,theme=$('paletteTheme').value;
   try{
     const response=await fetch(`/api/palette/themes?theme=${encodeURIComponent(theme)}`);
     if(!response.ok)throw Error(`HTTP ${response.status}`);
     const result=await response.json();
     if(serial!==paletteSerial)return;
     window.ScoreImagePaletteUI.chips(result.palette);
     window.ScoreImagePaletteUI.schemes(result.schemes,scheme=>void applyPaletteScheme(scheme,result.primary));
     $('paletteColorsTitle').setAttribute('data-i18n','palette.themeColors');
     $('paletteColorsTitle').textContent=window.ScoreI18n?.t('palette.themeColors')||'테마 대표 색상';
     $('paletteResults').hidden=false;
     paletteMessage('테마 색상을 선택했습니다. 아래 추천 악보 디자인을 바로 적용할 수 있어요.');
   }catch(error){if(serial===paletteSerial)paletteMessage('테마 색상 불러오기 실패: '+error.message,true);}
 }
 $('paletteTheme').addEventListener('change',()=>{saveSettings();saveProjectEffects();void showThemePalette();});
 async function applyPaletteScheme(scheme,primary){
   // SCOREMOTION_COLOR_DIRECTOR_SAFE_V2
   if(!scheme?.colors)return;
   const source=scheme.colors;
   const c=window.ScorePaletteDirector?.harmonize(scheme)||source;
   const scope={score:$('paletteApplyScore')?.checked!==false,
     glow:$('paletteApplyGlow')?.checked!==false,
     keys:$('paletteApplyKeyboard')?.checked!==false,
     background:$('paletteApplyBackground')?.checked!==false};
   const count=Object.values(scope).filter(Boolean).length;
   // All OFF means no setting, event, project-palette or storage mutation.
   if(!count){paletteMessage('적용 영역이 선택되지 않아 기존 설정을 유지했습니다.');return;}
   const valid=value=>/^#[0-9a-f]{6}$/i.test(value||'');
   const put=(id,color)=>{if($(id)&&valid(color))$(id).value=color;};
   if(scope.score){
     // Only paper/ink/staff/accent/panel swatches; preserve inversion and opacity.
     for(const [id,key] of Object.entries({paperColor:'paper',inkColor:'ink',
       staffColor:'staff',accentColor:'accent',scorePanelColor:'panel'}))put(id,c[key]);
   }
   const linked=Boolean($('keyboardPaletteLink')?.checked||$('keyboardColorPreset')?.value==='linked');
   if(scope.glow){
     // Linked keyboard + keyboard scope OFF: keep linked Aurora endpoints
     // unchanged so a glow click cannot secretly recolor existing keys.
     for(const [id,key] of Object.entries({glowColor:'glow',
       trailUpperColor:'trail_upper',trailLowerColor:'trail_lower'}))put(id,c[key]);
     if(scope.keys||!linked){
       put('auroraLow',c.aurora_low);put('auroraHigh',c.aurora_high);
     }
     // Intentionally preserve fxMode, lightColorMode, auroraPreset and
     // scoreColorPreset. Existing manual staff colors also remain intact.
   }
   if(scope.background){
     // This edits scene color only. Uploaded photo/opacity/position are intact.
     const bg=valid(c.background)?c.background:c.paper;
     put('sceneStartColor',bg);put('sceneEndColor',bg);
   }
   if(scope.keys){
     // Enabling keyboard scope expressly permits palette & lighting changes.
     // Preserve existing link when both sides are requested. If only keys are
     // selected, detach to make independent keyboard colors actually render.
     if(linked&&!scope.glow){
       $('keyboardPaletteLink').checked=false;
       $('keyboardColorPreset').value='custom';
     }
     put('keyboardColorLow',c.aurora_low||c.glow);
     put('keyboardColorHigh',c.aurora_high||c.accent);
     const light=window.ScorePaletteDirector?.keyboardLighting(scheme.id);
     if(light){
       for(const [key,id] of Object.entries({baseBrightness:'keyboardBaseBrightness',
         sensitivity:'keyboardLightingSensitivity',brightnessOffset:'keyboardBrightnessOffset',
         whiteBrightness:'keyboardWhiteBrightness',blackBrightness:'keyboardBlackBrightness',
         reflectionStrength:'keyboardReflectionStrength'})){
         if($(id)&&Number.isFinite(light[key]))$(id).value=String(light[key]);
       }
       $('keyboardLightingMode').value=light.mode;
     }
     window.ScoreFxGroups?.syncLightingUi();
   }
   // Only selected regions are passed to the FX listener; it may refresh its
   // preview but must not rewrite user-selectable presets or unselected keys.
   document.dispatchEvent(new CustomEvent('score-palette-applied',{
     detail:{...c,projectId:project?.id,scope,design:scheme.id}}));
   window.ScoreFxGroups?.syncCustomColors();
   queueApply();
   const linkedNotice=scope.glow&&!scope.keys&&linked?' 연결된 건반의 색을 보존하기 위해 오로라 양끝 색은 유지했습니다.':'';
   paletteMessage(`${scheme.name} 디자인을 ${count}개 영역에 적용했습니다.${linkedNotice}`);
 }
 $('paletteImageFile').addEventListener('change',()=>{
   const file=$('paletteImageFile').files?.[0];
   $('paletteImageFile').value='';
   if(file)void analyzePaletteImage(file);
 });
 $('paletteSetBackground').addEventListener('click',()=>{if(paletteSourceFile)void setBackground(paletteSourceFile);});
 $('backgroundFile').addEventListener('change',()=>{
   const file=$('backgroundFile').files?.[0];$('backgroundFile').value='';
   if(file)void setBackground(file);
 });
 const drop=$('paletteDropZone');
 for(const eventName of ['dragenter','dragover'])drop.addEventListener(eventName,event=>{
   event.preventDefault();drop.classList.add('drag-over');
 });
 for(const eventName of ['dragleave','drop'])drop.addEventListener(eventName,event=>{
   event.preventDefault();drop.classList.remove('drag-over');
   if(eventName==='drop'){
     const file=Array.from(event.dataTransfer?.files||[])[0];
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
 $('pianoVerticalOffset').addEventListener('input',queueApply);
 $('scoreVisible').addEventListener('change',()=>{if(!$('scoreVisible').checked)window.ScoreVisualEditor?.setEditing(false);});
 for(const [sliderId,numberId] of [['offset','offsetNumber'],['pianoOffset','pianoOffsetNumber']]){
   const slider=$(sliderId),field=$(numberId);
   field.addEventListener('input',()=>{
     const value=Number(field.value);
     if(field.value===''||!Number.isFinite(value)||value < -5||value > 5)return;
     slider.value=String(Math.round(value*100)/100);
     queueApply();
   });
   field.addEventListener('change',()=>{
     const value=Number(field.value);
     slider.value=String(Math.round(Math.max(-5,Math.min(5,Number.isFinite(value)&&field.value!==''?value:Number(slider.value)))*100)/100);
     field.value=Number(slider.value).toFixed(2);
     queueApply();
   });
 }
 $('syncAdjustToggle').addEventListener('click',()=>{
   const open=$('syncAdjustPopover').hidden;
   $('syncAdjustPopover').hidden=!open;$('syncAdjustToggle').setAttribute('aria-expanded',String(open));
 });
 document.addEventListener('click',event=>{
   if(event.target.closest('.sync-adjust-control'))return;
   $('syncAdjustPopover').hidden=true;$('syncAdjustToggle').setAttribute('aria-expanded','false');
 });
 document.addEventListener('keydown',event=>{
   if(alignmentBusy)return;
   if(event.key==='Escape'&&!$('syncAdjustPopover').hidden){$('syncAdjustPopover').hidden=true;$('syncAdjustToggle').setAttribute('aria-expanded','false');}
 });
 $('removeBackground').addEventListener('click',async()=>{
   const button=$('removeBackground');button.disabled=true;++backgroundSerial;
   const target=project;
   try{
     await backgroundTask;
     if(project===target&&target?.background_filename){
       const r=await fetch(`/api/projects/${target.id}/background`,{method:'DELETE'});
       if(!r.ok)throw Error('배경 삭제 실패');
       target.background_filename=null;target.background_version=null;target.background_original_name=null;
     }
     pendingBackgroundFile=null;
     refreshBackground();backgroundMessage('영상 배경 이미지만 제거했습니다. 색상 추천은 유지됩니다.');
   }catch(e){backgroundMessage(e.message,true);}
   finally{button.disabled=false;}
 });

 async function rebuildPreview(reason='미리보기 재설정 중…'){
   if(!stage||!project)return;
   $('previewInfo').textContent=reason;
   await stage.load();
   stage.seek(previewTime()||0);
   $('previewInfo').textContent='미리보기와 MP4: 같은 설정 · 같은 장면 엔진';
 }
 $('resetPreviewButton').addEventListener('click',()=>void rebuildPreview());

 function refreshBackground(){
   const hasBackground=Boolean(project?.background_filename);
   $('paletteThemeControls').hidden=hasBackground||Boolean(pendingBackgroundFile);
   $('removeBackground').hidden=!hasBackground&&!pendingBackgroundFile;
   $('paletteFromBackground').hidden=!hasBackground;
   $('backgroundName').textContent=hasBackground?`현재 영상 배경 · ${project.background_original_name||project.background_filename}`:
     pendingBackgroundFile?`프로젝트 생성 후 적용 · ${pendingBackgroundFile.name}`:'선택된 배경 이미지 없음';
   if(backgroundPreviewURL){URL.revokeObjectURL(backgroundPreviewURL);backgroundPreviewURL=null;}
   if(hasBackground){
     $('backgroundPreview').src=window.ScoreLocalProjects?.enabled?window.ScoreLocalProjects.assetUrl(project.id,'background'):`/api/projects/${project.id}/background?v=${encodeURIComponent(project.background_version||project.background_filename)}`;
     $('backgroundPreview').hidden=false;
   }else if(pendingBackgroundFile){
     backgroundPreviewURL=URL.createObjectURL(pendingBackgroundFile);
     $('backgroundPreview').src=backgroundPreviewURL;$('backgroundPreview').hidden=false;
   }else{
     $('backgroundPreview').removeAttribute('src');$('backgroundPreview').hidden=true;
   }
   if(stage){stage.meta.background_filename=project.background_filename;stage.meta.background_version=project.background_version;queueApply();}
 }
 async function loadProject(meta){
   if(renderUiActive&&project&&meta.id!==project.id)return;
   if(portableSaveTimer!==null){clearTimeout(portableSaveTimer);portableSaveTimer=null;}
   activeProjectState=null;
   ++renderPollEpoch;
   const previousStage=stage;stage=null;revision++;await applySerial.catch(()=>{});
   previousStage?.piano?.dispose();
   ++backgroundSerial;pendingBackgroundFile=null;
   window.ScoreVisualEditor?.setEditing(false);
   $('scoreEditOverlay').hidden=true;
   project=meta;window.ScoreStaffColors?.setProject(meta);window.ScoreMelodyHighlight?.setProject?.(meta.id);
   if(meta.has_score!==false&&!meta.staff_groups?.length)await window.ScoreStaffColors?.recoverCatalog?.(meta);
   mp4MeasuredFps=0;experimentalOptIn=false;$('downloadName').value='';selectedCameraPoint='';cameraPointPicking=false;renderCameraPointList();refreshVideoPresets($('videoPresetSelect').value);pausePreview();if(liveSampler){await liveSampler.dispose();liveSampler=null;}
   for(const [id,value] of Object.entries(meta.effect_settings||{})){
     if(!effectSettingIds.includes(id))continue;
     const node=$(id);if(node.type==='checkbox')node.checked=Boolean(value);else node.value=String(value);
   }
   if(meta.background_filename){
     ++paletteSerial;
     $('paletteResults').hidden=true;
   }else if(!paletteSourceFile)void showThemePalette();
   window.ScoreFxGroups?.syncLightingUi();
   window.ScoreFxGroups?.syncCustomColors();
   window.ScoreFxGroups?.syncPreview();
   $('downloadLink').hidden=true;
   if(offlineDownloadUrl){URL.revokeObjectURL(offlineDownloadUrl);offlineDownloadUrl=null;void window.ScoreOfflineExport.release();}
   if(webmDownloadUrl){URL.revokeObjectURL(webmDownloadUrl);void webmRelease?.();webmDownloadUrl=null;webmRelease=null;$('webmDownloadLink').hidden=true;}
   const hasScore=meta.has_score!==false;
   const projectName=(hasScore?meta.score_name:meta.midi_name).replace(/\.(musicxml|xml|mxl|mid|midi)$/i,'');
   // Project filenames are user data, not interface copy.
   $('projectTitle').setAttribute('data-i18n-ignore','');
   $('projectTitle').textContent=projectName;
   const titleOverride=localStorage.getItem('scorevideo_title_override_'+meta.id);
   $('titleText').value=titleOverride!==null?titleOverride:projectName;
   const wasScoreUnavailable=$('scoreVisible').disabled;
   $('scoreVisible').disabled=!hasScore;
   if(!hasScore)$('scoreVisible').checked=false;
   else if(wasScoreUnavailable)$('scoreVisible').checked=true;
   document.querySelector('[data-editor-tab="score"]').disabled=!hasScore;
   $('editScoreFromSidebar').disabled=!hasScore;
   if(!hasScore)$('pianoEnabled').checked=true;
   const a=meta.score_alignment;
   refreshAlignmentPanel(meta);
   const alignmentText=a?
     `악보↔MIDI 매칭 ${Math.round(a.coverage*100)}% · ${a.matched_notes}/${a.total_notes}개 음표 · ${a.status==='ok'?'실제 타건 시점 적용':'매칭되지 않은 음표 있음'}`:
     '악보↔MIDI 매칭 정보 없음';
   const repeat=meta.repeat_info;
   const repeatText=repeat?.mode==='unfolded'
     ?` · 되돌이표 전개 ${repeat.source_measures}→${repeat.playback_measures}마디`
     :(repeat?.warning?` · ${repeat.warning}`:'');
   $('scoreAlignmentInfo').textContent=hasScore?(a?`매칭 ${Math.round(a.coverage*100)}%`:'매칭 정보 없음'):'MIDI 전용';
   $('scoreAlignmentInfo').title=alignmentText+repeatText;
   $('scoreAlignmentInfo').classList.toggle('error',hasScore&&a?.status!=='ok');
   $('metadata').textContent=`${meta.note_count.toLocaleString()}개 MIDI 음표 · ${fmt(meta.audio_duration_sec)} · 템포 변화 ${meta.tempo_map.length}개 · ${hasScore?`악보/MIDI 음표 매칭 ${Math.round((a?.coverage||0)*100)}%`:'건반 전용'}${meta.generated_audio?' · Salamander Grand Piano':''}`;
   if(a?.status==='needs-review')message(`악보 ↔ MIDI 매칭 주의 (${Math.round(a.coverage*100)}%): ${a.message}`,true);
   const projectAudioUrl=window.ScoreLocalProjects?.enabled?window.ScoreLocalProjects.assetUrl(meta.id,'audio'):`/api/projects/${meta.id}/audio`;
   if(projectAudioUrl)audio.src=projectAudioUrl;
       else{audio.removeAttribute('src');audio.load();}
       // Generated MIDI projects preview in real time. Existing uploaded audio
       // remains an HTML media element; MP4/WebM export still requests WAV on demand.
       if(window.ScoreLocalProjects?.enabled&&meta.generated_audio&&window.ScoreRealtimeSalamander?.Player){
         liveSampler=new window.ScoreRealtimeSalamander.Player(meta,{
           loadSample:(pitch,ctx)=>window.ScoreLocalProjects.getPianoSample(pitch,ctx),
           onState:()=>updatePlaybackUi()
         });
       }
   $('totalTime').textContent=fmt(meta.audio_duration_sec);$('currentTime').textContent='00:00';
   $('seek').max=meta.audio_duration_sec;$('seek').value=0;
   $('offset').value=0;$('pianoOffset').value=0;updateLabels();
   const storedRecord=window.ScoreLocalProjects?.enabled?await window.ScoreLocalProjects.openProject(meta.id):null;
   if(storedRecord?.state)await restoreProjectState(storedRecord.state);
   if(paletteArtworkURL){URL.revokeObjectURL(paletteArtworkURL);paletteArtworkURL=null;}
   paletteSourceFile=storedRecord?.paletteSource||null;
   if(paletteSourceFile){
     paletteArtworkURL=URL.createObjectURL(paletteSourceFile);
     $('paletteArtworkPreview').src=paletteArtworkURL;$('paletteArtworkPreview').hidden=false;
     $('paletteUploadHint').textContent=paletteSourceFile.name||'Palette image';
     $('paletteSetBackground').disabled=false;
   }else{
     $('paletteArtworkPreview').hidden=true;$('paletteUploadHint').textContent='';$('paletteSetBackground').disabled=true;
   }
   for(const id of ['playButton','previousMeasureButton','nextMeasureButton','restartButton','seek','exportButton','autoSyncButton'])$(id).disabled=false;
   $('webmRecordButton').disabled=true;
   $('autoSyncButton').disabled=Boolean(meta.generated_audio);
   $('previousMeasureButton').disabled=!hasScore;
   $('nextMeasureButton').disabled=!hasScore;
   $('placeholder').style.display='none';
   refreshBackground();resizePreview();
   stage=new window.ScoreStage.Stage({viewport:$('scoreViewport'),container:$('osmdContainer'),meta,settings:previewConfig()});
   await stage.load();window.ScoreMelodyHighlight?.bindStage?.(stage);
   const savedPlayhead=Math.max(0,Math.min(Number(activeProjectState?.preview?.playhead_sec)||0,Number(meta.audio_duration_sec)||0));
   if(savedPlayhead>0){try{setPreviewTime(savedPlayhead);}catch(_){}}
   stage.seek(savedPlayhead);$('seek').value=String(savedPlayhead);$('currentTime').textContent=fmt(savedPlayhead);
   $('cameraPointAuto').disabled=!hasScore||!stage.follower?.noteTriggers?.length;
   $('webmRecordButton').disabled=Boolean(webmUnavailable);updateExportUi();
   void fetch(`/api/projects/${meta.id}/render-diagnostics`).then(r=>r.ok?r.json():null).then(report=>{if(project?.id===meta.id&&Number(report?.frame_processing_fps)>0){mp4MeasuredFps=Number(report.frame_processing_fps);updateExportUi();}}).catch(()=>{});
   $('cameraAutoStatus').textContent=hasScore?'프레이즈 시작, 화성, 강세와 음역 변화를 골라 부드러운 카메라 경로를 제안합니다. 수동 포인트는 유지됩니다.':'자동 포인트는 MusicXML 악보와 MIDI가 함께 있을 때 사용할 수 있습니다.';
   renderCameraPointList();window.ScoreVisualEditor?.sync();syncInfo();refreshPortableAssets();
   if(!activeProjectState)schedulePortableAutosave();
   $('previewInfo').textContent='미리보기와 MP4: 같은 설정 · 같은 장면 엔진';
   if(meta.score_alignment?.status==='needs-review'){
     message(`악보/MIDI 음표 매칭 ${Math.round(meta.score_alignment.coverage*100)}% — 일치하지 않는 음표가 있어 영상 싱크를 확인해 주세요.`,true);
   }else if(meta.repeat_info?.mode==='unfolded'){
     message(`되돌이표를 MIDI 연주 순서로 전개했습니다 (${meta.repeat_info.source_measures}→${meta.repeat_info.playback_measures}마디). 미리보기·MP4에 동일 적용됩니다.`);
   }else if(meta.repeat_info?.warning){
     message(`되돌이표 확인: ${meta.repeat_info.warning}`,true);
   }else if(!hasScore)message('MIDI 건반 영상 준비 완료. Salamander 피아노 음원과 MP4 출력에 동일하게 적용됩니다.');
   else message('악보 ↔ MIDI 실제 타건 시간 매칭 완료. 미리보기와 MP4에 동일하게 반영됩니다.');
   if(liveSampler){
         message('프로젝트 준비 완료 · 미리보기는 실시간 피아노, MP4 출력 시에만 전체 음원을 생성합니다.');
         const primer=liveSampler;
         const prepare=()=>{
           if(liveSampler!==primer||document.hidden)return;
           void primer.prepare().catch(error=>console.warn('Realtime piano sample preparation:',error));
         };
         if(typeof requestIdleCallback==='function')requestIdleCallback(prepare,{timeout:1500});
         else setTimeout(prepare,650);
       }
 }
 const portableText=(key,fallback,vars={})=>{
   const translated=window.ScoreI18n?.t?.('projectIO.'+key,vars);
   return translated&&translated!=='projectIO.'+key?translated:
     fallback.replace(/\{(\w+)\}/g,(_,name)=>String(vars[name]??''));
 };
 const portableStatus=(text,isError=false)=>{
   const node=$('portableProjectStatus');if(node){
     // The initial hint uses data-i18n=projectIO.idle. Once status becomes
     // dynamic, remove that static key or the i18n MutationObserver replaces
     // every success/error message with the initial idle hint.
     node.removeAttribute('data-i18n');
     node.textContent=text;node.classList.toggle('error',isError);
   }
   message(text,isError);
 };
 const alignmentText=(key,fallback,vars={})=>{
   const t=window.ScoreI18n?.t?.('alignment.'+key,vars);
   return t&&t!=='alignment.'+key?t:fallback.replace(/\{(\w+)\}/g,(_,k)=>String(vars[k]??''));
 };
 let alignmentBusy=false;
 function refreshAlignmentPanel(meta){
   const panel=$('scoreAlignmentPanel');if(!panel)return;
   panel.hidden=!window.ScoreLocalProjects?.enabled;
   const a=meta?.score_alignment,requested=a?.requested_mode||'v1';
   if(meta?.has_score!==false&&a)$('scoreAlignmentMode').value=['auto','v1','v2a','v2b','v2c'].includes(requested)?requested:'auto';
   $('scoreAlignmentReanalyze').disabled=!meta?.has_score||alignmentBusy;
   const status=$('scoreAlignmentResult');status.textContent='';status.classList.remove('error');
   if(!a)return;
   const method=({'score-beat-v2a':'V2-A','adaptive-sequence-v2b':'V2-B','adaptive-sequence-v2c':'V2-C','pitch-onset-anchors-v1':'V1'})[a.method]||a.method||'V1';
   status.textContent=alignmentText('result','{method} · {matched}/{total} notes · {coverage}%',{method,matched:a.matched_notes,total:a.total_notes,coverage:Math.round(a.coverage*100)});
   if(Number.isFinite(a.midi_precision))status.textContent+=' · '+alignmentText('midiCoverage','MIDI {percent}%',{percent:Math.round(a.midi_precision*100)});
   if(a.limited)status.textContent+=' · '+alignmentText('limited','Search limited; V1 fallback.');
   if(a.status!=='ok')status.textContent+=' · '+alignmentText('review','Review recommended');
   const bars=(a.measure_diagnostics||[]).filter(m=>m.status!=='ok');
   if(bars.length)status.textContent+='\n'+alignmentText('bars','Review playback measures: {bars}',{bars:bars.slice(0,30).map(m=>m.measure).join(', ')+(bars.length>30?' …':'')});
   status.style.whiteSpace='pre-line';status.classList.toggle('error',a.status!=='ok'||bars.length>0);
 }
 refreshAlignmentPanel(null);
 $('scoreAlignmentReanalyze').addEventListener('click',async()=>{
   if(alignmentBusy)return;
   const oldMeta=project,mode=$('scoreAlignmentMode').value,main=document.querySelector('main');let committed=false,locked=false;
   try{
     portableLocal();if(!oldMeta?.has_score)throw Error(alignmentText('noScore','MusicXML is required.'));
     if($('uploadButton').disabled)throw Error(alignmentText('busy','Wait for current file processing.'));
     alignmentBusy=true;locked=true;main.inert=true;$('scoreAlignmentReanalyze').disabled=true;
     pausePreview();await applySerial;await backgroundTask;await paletteSaveTask;await saveCurrentProjectState();
     message(alignmentText('analyzing','Analyzing score and MIDI locally…'));
     const meta=await window.ScoreLocalProjects.reanalyzeAlignment(oldMeta.id,mode);committed=true;
     await loadProject(meta);
     message(meta.score_alignment?.status==='ok'?alignmentText('done','Score/MIDI alignment updated.'):alignmentText('review','Review recommended'),meta.score_alignment?.status!=='ok');
   }catch(error){
     if(committed){try{await loadProject(await window.ScoreLocalProjects.restoreAlignment(oldMeta.id,oldMeta.score_alignment));}catch(rollback){console.error('Alignment rollback:',rollback);}}
     message(alignmentText('failed','Alignment failed: {error}',{error:error.message}),true);
   }finally{if(locked){alignmentBusy=false;main.inert=false;refreshAlignmentPanel(project);}}
 });
 const portableLocal=()=>{
   if(!window.ScoreLocalProjects?.enabled)throw Error('프로젝트 ZIP 저장/열기는 브라우저 로컬 모드에서 지원합니다.');
   if(renderUiActive||offlineActive||webmRecorder)throw Error('영상 출력 중에는 프로젝트를 전환할 수 없습니다.');
 };
 function portableFilename(name){return String(name||'ScoreMotion').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').trim().slice(0,100)||'ScoreMotion';}
 // Archive name follows the original MusicXML filename, not its edited title.
 // The only automatic suffix is the active output aspect ratio.
 function portableArchiveName(record,state,override=''){
   const meta=record?.meta||{},controls=state?.settings?.controls||{};
   const source=override||((meta.has_score!==false&&meta.score_name)?meta.score_name:meta.midi_name)||'ScoreMotion';
   const base=portableFilename(String(source).replace(/\.(?:musicxml|xml|mxl|mid|midi|scoremotion)$/i,''));
   const aspect=String(controls.aspectRatio||$('aspectRatio')?.value||'16:9');
   const custom=aspect==='custom';
   const w=String(controls.customAspectWidth||$('customAspectWidth')?.value||'').replace(/[^0-9]/g,'');
   const h=String(controls.customAspectHeight||$('customAspectHeight')?.value||'').replace(/[^0-9]/g,'');
   const suffix=custom&&w&&h?`${w}x${h}`:aspect.replace(/:/g,'x').replace(/[^0-9x]/gi,'');
   return portableFilename(`${base} (${suffix||'16x9'})`)+'.scoremotion';
 }

 function refreshPortableAssets(){
   const list=$('portableAssets');if(!list)return;
   if(!project){list.textContent='';return;}
   const items=[['score',project.has_score?project.score_name:null],['midi',project.midi_name],
     ['audio',project.generated_audio?null:project.audio_name],['background',project.background_original_name||project.background_filename]];
   list.replaceChildren();for(const [role,name] of items){
     if(!name)continue;const row=document.createElement('div');row.className='portable-asset-row';
     const label=document.createElement('strong');label.textContent=role.toUpperCase();
     const value=document.createElement('span');value.textContent=name;row.append(label,value);list.append(row);
   }
 }
 $('savePortableCopy').addEventListener('click',async()=>{
   const button=$('savePortableCopy');button.disabled=true;
   try{
     portableLocal();if(!project)throw Error('먼저 프로젝트를 여세요.');
     const name=String($('portableCopyName').value||serializeProjectState().project_name+' Copy').trim();
     if(!name)throw Error(portableText('nameRequired','이름을 입력해 주세요.'));
     await applySerial;await backgroundTask;await paletteSaveTask;await saveCurrentProjectState();
     const record=await window.ScoreLocalProjects.openProject(project.id);
     const current=serializeProjectState();
     const forkId=crypto.randomUUID().replace(/-/g,'');
     const {blob}=await window.ScoreProjectIO.exportProject(record,{...current,project_name:name.trim()},
       {forkId,forkFrom:record.id});
     const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;
     link.download=portableArchiveName(record,current,name);document.body.append(link);link.click();link.remove();
     setTimeout(()=>URL.revokeObjectURL(url),60000);
     portableStatus(portableText('copyStarted','별도 프로젝트 ID를 가진 사본 다운로드를 요청했습니다.'));
   }catch(error){portableStatus(portableText('saveCopyFailed','사본 저장 실패: {error}',{error:error.message}),true);}finally{button.disabled=false;}
 });
 $('savePortableProject').addEventListener('click',async()=>{
   const button=$('savePortableProject');button.disabled=true;
   try{
     portableLocal();if(!project)throw Error('저장할 프로젝트를 먼저 여세요.');
     portableStatus(portableText('inspecting','원본 파일과 편집 설정을 검사하고 있습니다…'));
     await applySerial;await backgroundTask;await paletteSaveTask;await saveCurrentProjectState();
     const record=await window.ScoreLocalProjects.openProject(project.id);
     const {blob,warnings}=await window.ScoreProjectIO.exportProject(record,serializeProjectState());
     const url=URL.createObjectURL(blob),link=document.createElement('a');
     link.href=url;link.download=portableArchiveName(record,serializeProjectState());
     document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
     portableStatus(portableText('downloadStarted','프로젝트 파일 다운로드를 요청했습니다 ({size}MB).',{size:(blob.size/1024/1024).toFixed(1)})+(warnings.length?' '+warnings.map(w=>w==='score_original_missing_legacy'?portableText('legacyScore','이전 프로젝트에는 원본 MXL이 없어 변환된 MusicXML을 대신 저장했습니다.'):w).join(' '):''));
   }catch(error){portableStatus(portableText('saveFailed','프로젝트 저장 실패: {error}',{error:error.message}),true);}finally{button.disabled=false;}
 });
 $('openPortableProject').addEventListener('change',async event=>{
   const file=event.target.files?.[0];if(!file)return;
   const oldMeta=project,oldId=project?.id||null;let importedId=null;
   try{
     portableLocal();if(!/\.scoremotion$/i.test(file.name))throw Error('.scoremotion 파일을 선택해 주세요.');
     if(oldId)await saveCurrentProjectState();
     portableStatus(portableText('verifying','ZIP 안전 검사와 원본 파일 SHA-256 검증 중…'));
     const result=await window.ScoreProjectIO.readArchive(file);
     const imported=await window.ScoreLocalProjects.importRecord(result.record);importedId=imported.id;
     await loadProject(imported.meta);
     localStorage.setItem(lastProjectKey,imported.id);
     portableStatus(portableText('loadSuccess','프로젝트 복원 완료')+(imported.copied?' · '+portableText('forked','기존 프로젝트와 ID가 중복되어 사본으로 열었습니다.'):''));
   }catch(error){
     if(importedId){try{await window.ScoreLocalProjects.forget(importedId);}catch(e){console.error('Import rollback:',e);}}
     if(oldMeta&&project?.id!==oldId){try{await loadProject(oldMeta);}catch(e){console.error('Restore previous project:',e);}}
     portableStatus(portableText('openFailed','프로젝트 열기 실패: {error}',{error:error.message}),true);
   }finally{event.target.value='';}
 });
 let portableReplaceRole='';
 $('portableReplaceRole').addEventListener('change',()=>{portableReplaceRole=$('portableReplaceRole').value;});
 $('portableReplaceButton').addEventListener('click',()=>{
   try{portableLocal();if(!project)throw Error('먼저 프로젝트를 여세요.');
     portableReplaceRole=$('portableReplaceRole').value;
     const accept={score:'.xml,.musicxml,.mxl',midi:'.mid,.midi',audio:'.wav,.mp3,.m4a,.aac,.flac,.ogg',background:'image/png,image/jpeg,image/webp',palette_source:'image/png,image/jpeg,image/webp'};
     $('portableReplaceInput').accept=accept[portableReplaceRole]||'';
     $('portableReplaceInput').click();
   }catch(error){portableStatus(error.message,true);}
 });
 $('portableReplaceInput').addEventListener('change',async event=>{
   const file=event.target.files?.[0];if(!file)return;
   const role=portableReplaceRole,button=$('portableReplaceButton'),oldMeta=project;
   button.disabled=true;
   try{
     portableLocal();await backgroundTask;await paletteSaveTask;await saveCurrentProjectState();portableStatus(portableText('replacing','새 파일을 검사한 뒤 기존 설정을 유지하며 교체하고 있습니다…'));
     const result=await window.ScoreLocalProjects.replaceAsset(project.id,role,file);
     await loadProject(result.meta);
     $('portableUndoReplace').disabled=false;
     portableStatus(portableText('replaced','{file} 교체 완료',{file:file.name})+(result.reviewRequired?' · '+portableText('needsReview','동기화·카메라 매핑은 재검토가 필요합니다.'):''));
   }catch(error){
     if(oldMeta){try{const restored=await window.ScoreLocalProjects.undoReplace(oldMeta.id);await loadProject(restored);}catch(_){} }
     portableStatus(portableText('replaceFailed','파일 교체 실패: {error}',{error:error.message}),true);
   }finally{button.disabled=false;event.target.value='';}
 });
 $('portableUndoReplace').addEventListener('click',async()=>{
   try{portableLocal();if(!project)throw Error('프로젝트가 없습니다.');
     const meta=await window.ScoreLocalProjects.undoReplace(project.id);await loadProject(meta);
     $('portableUndoReplace').disabled=true;portableStatus(portableText('undone','이전 원본 파일로 복원했습니다.'));
   }catch(error){portableStatus(portableText('undoFailed','교체 취소 실패: {error}',{error:error.message}),true);}
 });
 async function importProjectFiles(files,{backgroundFile=null}={}){
   $('uploadButton').disabled=true;$('demoButton').disabled=true;message(window.ScoreLocalProjects?.enabled?'브라우저에서 MIDI·MusicXML 분석 및 로컬 저장 중…':'파일 분석 및 필요한 피아노 음원 생성 중...');
   const form=new FormData();for(const name of inputIds)if(files[name])form.append(name,files[name]);
   if(window.ScoreLocalProjects?.enabled)form.append('alignmentMode',$('scoreAlignmentMode').value);
   try{
     const r=await fetch('/api/projects',{method:'POST',body:form});const data=await r.json();if(!r.ok)throw Error(data.detail||'파일 처리 실패');
     const selectedBackground=pendingBackgroundFile||backgroundFile;
     if(selectedBackground){
       const bg=new FormData();bg.append('background',selectedBackground);
       const response=await fetch(`/api/projects/${data.id}/background`,{method:'POST',body:bg});const image=await response.json();
       if(!response.ok)throw Error(image.detail||'예제 커버 적용 실패');
       data.background_filename=image.background_filename;data.background_version=image.background_version;
       data.background_original_name=image.background_original_name||selectedBackground.name;
     }
     if(paletteSourceFile&&window.ScoreLocalProjects?.enabled)await window.ScoreLocalProjects.savePaletteSource(data.id,paletteSourceFile);
     applyNewProjectDefaults();saveSettings();updateLabels();syncOutputSize();
     localStorage.setItem(lastProjectKey,data.id);await loadProject(data);
     // The next song must begin with fresh file inputs. In particular, an
     // optional A-song audio file must never accompany B-song MIDI implicitly.
     clearUploadInputs();
   }catch(err){message(`악보 로딩 실패: ${err.message}`,true);}finally{$('uploadButton').disabled=false;$('demoButton').disabled=false;}
 }
 // Reset the current working set without deleting the saved server project.
 // Reload is intentional: it disposes WebGL, OSMD, audio, object URLs and
 // pending preview tasks together, preventing A-song state in a new B-song.
 $('resetProjectFilesButton').addEventListener('click',()=>{
   if(renderUiActive||offlineActive||webmRecorder||$('uploadButton').disabled){
     message('파일 분석 또는 영상 출력이 진행 중입니다. 완료하거나 취소한 후 초기화하세요.',true);return;
   }
   localStorage.removeItem(lastProjectKey);
   // A genuine New Project resets the visual scene, not only the uploads.
   localStorage.removeItem('scorevideo_studio_v05_settings');
   clearUploadInputs();
   for(const name of ['backgroundFile','paletteImageFile'])if($(name))$(name).value='';
   pausePreview();if(liveSampler){void liveSampler.dispose();liveSampler=null;}audio.removeAttribute('src');audio.load();
   window.location.reload();
 });
 $('uploadForm').addEventListener('submit',async e=>{
   e.preventDefault();const files=Object.fromEntries(inputIds.map(name=>[name,$(name).files?.[0]]));
   if(!files.midi){message('MIDI 파일은 필수입니다. MusicXML만으로는 업로드할 수 없습니다.',true);return;}
   await importProjectFiles(files);
 });
 async function exampleManifest(){
   const response=await fetch('/examples/manifest.json',{cache:'no-cache'});
   if(!response.ok)throw Error('예제 목록을 읽을 수 없습니다.');
   const manifest=await response.json();
   if(manifest.schema_version!==1||!Array.isArray(manifest.examples))throw Error('지원하지 않는 예제 목록 형식입니다.');
   const example=manifest.examples.find(e=>e.id===manifest.default_example)||manifest.examples[0];
   if(!example||!['score','midi'].every(kind=>/^[A-Za-z0-9_.-]+$/.test(example[kind]||'')&&!example[kind].startsWith('.')&&!example[kind].includes('..'))||
      !/^[A-Za-z0-9_-]+$/.test(example.id))throw Error('예제 파일 경로가 올바르지 않습니다.');
   return example;
 }
 $('demoButton').addEventListener('click',async()=>{
   $('demoButton').disabled=true;
   try{
     const example=await exampleManifest();
     message(`${example.title||example.id} 예제 파일을 준비하고 있습니다...`);
     const files={};
     await Promise.all(['score','midi'].map(async kind=>{
       const filename=example[kind],response=await fetch(`/examples/${example.id}/${filename}`);
       if(!response.ok)throw Error(`${filename}: HTTP ${response.status}`);
       const blob=await response.blob();files[kind]=new File([blob],filename,{type:blob.type});
     }));
     clearUploadInputs();pendingBackgroundFile=null;
     for(const name of ['score','midi']){
       const transfer=new DataTransfer();transfer.items.add(files[name]);$(name).files=transfer.files;
       const label=labelIds[inputIds.indexOf(name)];$(label).textContent=files[name].name;
     }
     await importProjectFiles(files);
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
     project.sync=null;stage?.setSync(null);schedulePortableAutosave();syncInfo();message('싱크 초기화됨.');
   }catch(e){message(e.message,true);}
 });
 function duration(){return liveSampler?liveSampler.duration:(Number.isFinite(audio.duration)?audio.duration:(Number(project?.audio_duration_sec)||0));}
 function measureAxis(){return stage?.getMeasureStarts?.()||[];}
 function updateTimeline(){
   if(!project)return;
   const t=Number(previewTime())||0;
   $('currentTime').textContent=fmt(t);$('seek').value=t;
   const current=transport.currentMeasure(t,measureAxis());
   $('measureInfo').textContent=current.total?`마디 ${current.index}/${current.total}`:'마디 —';
   stage?.seek(t);
 }
 function tick(now){if(!project||webmRecorder)return;const current=now||performance.now();if(!renderUiActive||previewPaused()||current-lastPreviewFrame>=67){updateTimeline();lastPreviewFrame=current;}if(!previewPaused())raf=requestAnimationFrame(tick);}
 function seekTo(time){
   if(!project)return;
   const target=transport.seekSeconds(0,Number(time)||0,duration());
   setPreviewTime(target);
   updateTimeline();
 }
 function moveByMeasure(direction){
   if(!project)return;
   const time=transport.seekMeasure(previewTime(),direction,measureAxis(),duration());
   if(time===null){message('마디 위치를 읽지 못했습니다. 악보 로딩 상태를 확인해 주세요.',true);return;}
   seekTo(time);
 }
 async function ensureLocalAudioReady(id){
   if(!window.ScoreLocalProjects?.enabled||!project?.generated_audio)return;
   const local=window.ScoreLocalProjects;
   let source=local.assetUrl(id,'audio');
   if(!source){
     message('Salamander 피아노 음원 생성 중… 최초 1회만 필요합니다.');
     await local.ensureAudio(id);
     if(project?.id!==id)throw Error('음원 생성 중 프로젝트가 변경되었습니다.');
     source=local.assetUrl(id,'audio');
   }
   if(!source)throw Error('생성된 피아노 음원을 찾을 수 없습니다.');
   if(audio.src!==source){audio.src=source;audio.load();}
 }
 async function toggle(){
       if(!project){message('먼저 MIDI 파일을 불러오세요.');return;}
       if(liveSampler){
         if(!liveSampler.paused){liveSampler.pause();return;}
         const current=liveSampler;
         try{await current.play();}
         catch(error){
           if(liveSampler!==current)return;
           console.warn('ScoreMotion live piano fallback:',error);
           const time=current.currentTime;
           await current.dispose();liveSampler=null;
           try{
             await ensureLocalAudioReady(project.id);
             audio.currentTime=Math.min(time,Number(audio.duration)||time);
             await audio.play();
             message('실시간 피아노 재생이 지원되지 않아 기존 WAV 방식으로 전환했습니다.');
           }catch(fallback){message('오디오 재생 실패: '+fallback.message,true);}
         }
         return;
       }
       if(audio.paused){try{await ensureLocalAudioReady(project.id);await audio.play();}catch(e){message('오디오 재생 실패: '+e.message,true);}}
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
   if(alignmentBusy)return;
   // Range inputs need their own arrow keys for 0.01-second sync tuning.
   if(e.target?.closest?.('input,select,textarea,[contenteditable="true"],[role="slider"]'))return;
   if((e.key==='f'||e.key==='F')&&!renderUiActive&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&!transport.isTextEditing(e.target)&&!e.repeat){
     e.preventDefault();e.stopImmediatePropagation();void toggleFullscreen();return;
   }
   const command=transport.shortcut(e);
   if(!command||transport.isTextEditing(e.target)||(!project))return;
   if(e.repeat&&command==='play')return;
   e.preventDefault();e.stopImmediatePropagation();
   if(command==='play')void toggle();
   else if(command==='previous-measure')moveByMeasure(-1);
   else if(command==='next-measure')moveByMeasure(1);
   else if(command==='back-five')seekTo(transport.seekSeconds(previewTime(),-5,duration()));
   else if(command==='forward-five')seekTo(transport.seekSeconds(previewTime(),5,duration()));
 },{capture:true});
 for(const id of ['play','pause','ended'])audio.addEventListener(id,updatePlaybackUi);
 $('seek').addEventListener('input',()=>seekTo(Number($('seek').value)));
 $('restartButton').addEventListener('click',()=>seekTo(0));
 async function pollStatus(){if(!project)return;const projectId=project.id,epoch=renderPollEpoch,job=renderUiJob;try{
   const r=await fetch(`/api/projects/${projectId}/status`);if(!r.ok)return;
   const s=await r.json();if(project?.id!==projectId||epoch!==renderPollEpoch||(job&&s.job_id&&job!==s.job_id))return;
   if(['queued','rendering','cancelling'].includes(s.state))setRenderUi(true,s);
   $('progressWrap').hidden=false;$('statusText').textContent=s.message||s.state;
   $('percent').textContent=`${s.progress||0}%`;$('progressBar').style.width=`${s.progress||0}%`;
   $('cancelRenderButton').hidden=!['queued','rendering','cancelling'].includes(s.state);
   $('cancelRenderButton').disabled=s.state==='cancelling';
   $('cancelRenderButton').textContent=s.state==='cancelling'?'취소 중…':'렌더링 취소';
   if(['done','error','cancelled'].includes(s.state)){
     ++renderPollEpoch;
     legacyStartPending=false;legacyCancelPending=false;
     clearInterval(polling);polling=null;
     if(s.state==='done'){
       $('downloadLink').hidden=false;
       $('downloadLink').href=`/api/projects/${projectId}/download${s.job_id?'?job_id='+encodeURIComponent(s.job_id):''}`;
       if(s.job_id&&activeDownloadJob===s.job_id&&!attemptedDownloads.has(s.job_id)){
         attemptedDownloads.add(s.job_id);
         $('downloadLink').click();
         message('자동 다운로드를 요청했습니다. 시작되지 않았다면 출력 탭의 다운로드 버튼을 누르세요.');
       }else message('MP4 영상 출력 완료. 출력 탭에서 다운로드할 수 있습니다.');
       activeDownloadJob=null;
       void fetch(`/api/projects/${projectId}/render-diagnostics`).then(r=>r.ok?r.json():null).then(report=>{if(project?.id===projectId&&Number(report?.frame_processing_fps)>0){mp4MeasuredFps=Number(report.frame_processing_fps);updateExportUi();}}).catch(()=>{});
       setRenderUi(false);
       window.ScoreVisualEditor?.selectTab(project.has_score===false?'scene':'score');
     }
     else if(s.state==='cancelled'){
       activeDownloadJob=null;$('downloadLink').hidden=true;
       setRenderUi(false);
       if(cancelReturnTime!==null){seekTo(cancelReturnTime);cancelReturnTime=null;}
       window.ScoreVisualEditor?.selectTab(project.has_score===false?'scene':'score');
       message('렌더링을 취소했습니다. 편집을 계속할 수 있습니다.');
     }else{activeDownloadJob=null;$('downloadLink').hidden=true;setRenderUi(false);message('MP4 출력 실패: '+s.message,true);}
     renderUiJob=null;updateExportUi();
   }
 }catch(e){}}
 async function startOfflineRender(){
   if(!project||renderUiActive||offlineSupport?.supported!==true)return;
   const projectId=project.id,token=++offlineEpoch,fps=Number($('fps').value),started=performance.now();
   offlineActive=true;offlineCancelPending=false;offlineReturnTime=Number(previewTime())||0;pausePreview();
   if(offlineDownloadUrl){URL.revokeObjectURL(offlineDownloadUrl);offlineDownloadUrl=null;}
   $('downloadLink').hidden=true;$('cancelRenderButton').hidden=false;$('cancelRenderButton').disabled=false;
   setRenderUi(true,{state:'queued',message:'WebCodecs MP4 준비 중',progress:0});
   $('progressWrap').hidden=false;$('progressBar').style.width='0%';$('percent').textContent='0%';
   try{
     // Generated MIDI previews use real-time sampling. During MP4 export,
     // synthesize bounded PCM chunks concurrently with video: no giant WAV.
     if(!(window.ScoreLocalProjects?.enabled&&project?.generated_audio&&window.__scoreMotionParallelAudioEnabled!==false))
       await ensureLocalAudioReady(projectId);
     await applySerial;
     if(project?.id!==projectId)throw Error('프로젝트가 변경되었습니다.');
     const [width,height]=$('resolution').value.split('x').map(Number);
     const supported=await window.ScoreOfflineExport.probe(width,height,fps,$('videoBitrate').value);
     if(offlineCancelPending)throw Error('Cancelled');
     if(!supported.supported)throw Error(supported.reason);
     await prepareExportStage();
     if(offlineCancelPending)throw Error('Cancelled');
     const phaseNames={preparing:'인코딩 준비 중',rendering:'영상 프레임 생성 중',
       'draining-video':'남은 H.264 프레임 처리 중','draining-encoder':'직접 인코더 완료 대기 중','draining-audio':'AAC 오디오 처리 완료 대기 중',
       'finalizing-mp4':'MP4 파일 마무리 중','reading-file':'완성된 MP4 파일 확인 중',
       completed:'출력 완료',failed:'출력 실패'};
     const {file,metrics}=await window.ScoreOfflineExport.run({fps,quality:$('videoQuality').value,bitrate:$('videoBitrate').value,videoEngine:$('mp4EncoderEngine')?.value||'canvas',onProgress({completed=0,frameCount=1,phase='rendering',phaseStartedMs}){
       if(token!==offlineEpoch||!offlineActive)return;
       const progress=Math.min(99,Math.floor(completed/Math.max(1,frameCount)*100));
       const elapsed=(performance.now()-started)/1000;
       const remaining=completed>0&&phase==='rendering'?Math.ceil((frameCount-completed)*elapsed/completed):null;
       const finalPhase=phase!=='rendering'&&phase!=='preparing';
       const phaseElapsed=finalPhase&&Number.isFinite(phaseStartedMs)?Math.floor((performance.now()-phaseStartedMs)/1000):0;
       const detail=phase==='rendering'
         ?`WebCodecs H.264/AAC · ${completed}/${frameCount}프레임 | 남은 시간 ${remaining===null?'계산 중':fmtHms(remaining)}`
         :`WebCodecs H.264/AAC · ${phaseNames[phase]||phase}${finalPhase?` (${fmtHms(phaseElapsed)} 경과)`:''} | ${completed}/${frameCount}프레임`;
       setRenderUi(true,{state:'rendering',message:detail,progress});
       $('statusText').textContent=detail;$('percent').textContent=`${progress}%`;$('progressBar').style.width=`${progress}%`;
     }});
     if(token!==offlineEpoch||project?.id!==projectId){await window.ScoreOfflineExport.release();return;}
     offlineDownloadUrl=URL.createObjectURL(file);
     const link=$('downloadLink');link.href=offlineDownloadUrl;link.download=exportFileName('mp4');link.hidden=false;
     const jobId=`offline-${crypto.randomUUID()}`;
     if(!attemptedDownloads.has(jobId)){attemptedDownloads.add(jobId);link.click();}
     $('statusText').textContent=`완료 · WebCodecs H.264/AAC · ${metrics.frames}프레임`;
     $('percent').textContent='100%';$('progressBar').style.width='100%';
     message('고속 MP4 자동 다운로드를 요청했습니다. 저장이 시작되지 않았다면 출력 탭의 다운로드 버튼을 누르세요.');
     const diagnostics={...metrics,engine:'webcodecs',job_id:jobId,project_id:projectId};
     void fetch(`/api/projects/${projectId}/render-diagnostics`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(diagnostics)}).catch(()=>{});
   }catch(error){
     if(token!==offlineEpoch)return;
     if(error.message==='Cancelled')message('렌더링을 취소했습니다. 편집을 계속할 수 있습니다.');
     else{
       message(`고속 MP4 출력 실패: ${error.message}${window.ScoreLocalProjects?.enabled?' · 브라우저 인코더·메모리 상태를 확인하세요.':' · 호환 렌더링을 선택해 다시 시도할 수 있습니다.'}`,true);
       if(!window.ScoreLocalProjects?.enabled)document.querySelector('input[name="exportMode"][value="legacy"]').checked=true;
     }
     await window.ScoreOfflineExport.release();
   }finally{
     try{await restorePreviewStage();}catch(error){
      const details={at:new Date().toISOString(),message:String(error?.message||error),
        stack:String(error?.stack||''),exportGeometry,
        stage:{width:stage?.settings?.width,height:stage?.settings?.height,
          scoreGpu:!!stage?.scoreGpu,scoreGpuEpoch:stage?.scoreGpuEpoch,
          pianoGpu:!!stage?.piano?.gpu,notesGpu:!!stage?.piano?.notesGpu,
          keyboard3d:!!stage?.piano?.keyboard3d,dynamic:!!stage?.piano?.dynamic},
        exportStats:window.__scoreMotionExportGpuStats||null};
      window.__scoreMotionPreviewRestoreError=details;
      console.error('[ScoreMotion preview restore]',error,details);
      message(`미리보기 복원 실패: ${error.message}`,true);
    }
     if(token===offlineEpoch){offlineActive=false;offlineCancelPending=false;$('cancelRenderButton').hidden=true;
       $('cancelRenderButton').disabled=false;$('cancelRenderButton').textContent='렌더링 취소';
       setRenderUi(false);updateExportUi();seekTo(offlineReturnTime);
       window.ScoreVisualEditor?.selectTab(project?.has_score===false?'scene':'score');}
   }
 }
 $('exportButton').addEventListener('click',async()=>{
   if(selectedExportMode()==='offline'){void startOfflineRender();return;}
   if(!project||renderUiActive)return;const projectId=project.id,epoch=++renderPollEpoch;cancelReturnTime=null;activeDownloadJob=null;renderUiJob=null;legacyStartPending=true;legacyCancelPending=false;$('exportButton').disabled=true;$('downloadLink').hidden=true;
   if(offlineDownloadUrl){URL.revokeObjectURL(offlineDownloadUrl);offlineDownloadUrl=null;await window.ScoreOfflineExport.release();}
   setRenderUi(true,{state:'queued',message:'영상 설정 저장 중',progress:0});
   $('progressWrap').hidden=false;$('statusText').textContent='영상 설정 저장 중';$('progressBar').style.width='0%';
   try{await applySerial;if(legacyCancelPending)throw Error('Cancelled');
     let payload;
     try{payload=await prepareExportStage();}
     finally{await restorePreviewStage();}
     if(legacyCancelPending)throw Error('Cancelled');
     const r=await fetch(`/api/projects/${projectId}/render`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
     const result=await r.json();if(project?.id!==projectId||epoch!==renderPollEpoch)return;legacyStartPending=false;if(!r.ok)throw Error(result.detail||'출력 실패');
     activeDownloadJob=result.job_id;renderUiJob=result.job_id;
     if(legacyCancelPending){await fetch(`/api/projects/${projectId}/render/cancel`,{method:'POST'});}
     clearInterval(polling);polling=setInterval(pollStatus,750);pollStatus();message('미리보기와 같은 설정으로 프레임별 영상 출력 중입니다.');
   }catch(e){if(epoch!==renderPollEpoch)return;legacyStartPending=false;legacyCancelPending=false;setRenderUi(false);message(e.message==='Cancelled'?'렌더링을 취소했습니다. 편집을 계속할 수 있습니다.':e.message,e.message!=='Cancelled');updateExportUi();$('cancelRenderButton').hidden=true;$('cancelRenderButton').disabled=false;$('cancelRenderButton').textContent='렌더링 취소';}
 });
 $('webmRecordButton').addEventListener('click',async()=>{
   if(!project||renderUiActive||webmUnavailable)return;
   const selection=$('webmTestSeconds').value,seconds=selection==='full'?duration():Math.min(duration(),Number(selection)),projectId=project.id;
   if(!Number.isFinite(seconds)||seconds<=0){message('오디오 길이를 확인할 수 없습니다.',true);return;}
   webmPosition=0;
   pausePreview();$('webmRecordButton').disabled=true;$('exportButton').disabled=true;$('cancelWebmButton').hidden=false;
   setRenderUi(true,{webm:true,state:'queued',message:'녹화 장면 준비 중',progress:0});
   try{
     await ensureLocalAudioReady(projectId);
     const recorder=webmRecorder=new window.ScoreWebmRecorder.Recorder(stage,{
       seconds,fps:Number($('fps').value),audio,onFrame(time){webmPosition=time;$('currentTime').textContent=fmt(time);$('seek').value=time;},
       onProgress({elapsed,total,progress,frames,dropped,stalls,hiddenSeconds}){
         setRenderUi(true,{webm:true,state:'recording',message:`녹화 중 ${fmt(elapsed)} / ${fmt(total)} · 화면 갱신 ${frames}회 · 건너뜀 ${dropped}회${stalls?` · 화면 지연 ${stalls}회`:''}`,progress});
         $('renderEtaText').textContent=`남은 시간 ${fmtHms(total-elapsed)}`;
         if(hiddenSeconds>=1)$('renderStageText').textContent+=' · 탭 전환으로 프레임이 누락될 수 있습니다';
       }
     });
     recorder.prepareAudio();
     await applySerial;
     if(project?.id!==projectId)throw Error('프로젝트가 변경되었습니다.');
     const result=await recorder.start();
     if(result&&!recorder.cancelled){
       if(webmDownloadUrl){URL.revokeObjectURL(webmDownloadUrl);void webmRelease?.();}
       webmDownloadUrl=URL.createObjectURL(result.blob);webmRelease=result.release;
       const link=$('webmDownloadLink');link.href=webmDownloadUrl;link.download=exportFileName('webm');link.hidden=false;link.click();
       message(`오디오 포함 WebM 다운로드 요청 · ${result.elapsed.toFixed(1)}초 · 화면 갱신 ${result.frames}회 · 건너뜀 ${result.dropped}회 · 화면 지연 ${result.stalls}회 · 탭 비활성 ${result.hiddenSeconds.toFixed(1)}초 · ${result.storage.toUpperCase()} 임시 저장 (실제 인코딩 프레임 수는 다를 수 있음)`);
     }else message('WebM 녹화를 취소했습니다. 편집을 계속할 수 있습니다.');
   }catch(error){if(webmRecorder?.error||!webmRecorder?.cancelled)message('WebM 녹화 실패: '+error.message,true);else message('WebM 녹화를 취소했습니다. 편집을 계속할 수 있습니다.');}
   finally{
     if(webmRecorder&&!webmRecorder.finished){webmRecorder.cancel();webmRecorder.cleanup();}
     const cancelled=webmRecorder?.cancelled;webmRecorder=null;$('cancelWebmButton').hidden=true;$('cancelWebmButton').disabled=false;$('cancelWebmButton').textContent='녹화 취소하고 편집하기';
     $('webmRecordButton').disabled=Boolean(webmUnavailable);setRenderUi(false);updateExportUi();
     seekTo(webmPosition);
   }
 });
 $('cancelWebmButton').addEventListener('click',()=>{
   if(!webmRecorder||$('cancelWebmButton').disabled)return;
   $('cancelWebmButton').disabled=true;$('cancelWebmButton').textContent='녹화 취소 중...';
   webmRecorder.cancel();
 });
 $('cancelRenderButton').addEventListener('click',async()=>{
   if(!project||$('cancelRenderButton').disabled)return;
   if(offlineActive){
     offlineCancelPending=true;
     const progress=window.__offlineProgress;
     offlineReturnTime=progress?.completed&&progress?.frameCount?Math.min(duration(),progress.completed/Number($('fps').value)):offlineReturnTime;
     $('cancelRenderButton').disabled=true;$('cancelRenderButton').textContent='취소 중…';
     setRenderUi(true,{state:'cancelling',progress:Number($('percent').textContent.replace('%',''))||0});
     window.ScoreOfflineExport.cancel();
     return;
   }
   cancelReturnTime=previewTime();pausePreview();
   $('cancelRenderButton').disabled=true;$('cancelRenderButton').textContent='취소 중…';
   setRenderUi(true,{state:'cancelling',progress:Number($('percent').textContent.replace('%',''))||0});
   if(legacyStartPending){legacyCancelPending=true;return;}
   try{
     const r=await fetch(`/api/projects/${project.id}/render/cancel`,{method:'POST'});
     if(!r.ok)throw Error('렌더링 취소 요청에 실패했습니다');
     await pollStatus();
   }catch(e){message(e.message,true);$('cancelRenderButton').disabled=false;$('cancelRenderButton').textContent='렌더링 취소';}
 });
 window.ScoreVisualEditor=window.createScoreVisualEditor({
   frame:$('stageFrame'),overlay:$('scoreEditOverlay'),box:$('scoreEditBox'),
   editButton:$('editScoreAreaButton'),
   controls:{x:$('scoreAreaX'),width:$('scoreAreaWidth'),height:$('scoreAreaHeight'),
     top:$('scoreMarginTop'),bottom:$('scoreMarginBottom')},
   getResolution:()=>({width:config().width,height:config().height}),
   getStage:()=>stage,commit:queueApply,label:()=>updateLabels(),
 });
 $('editScoreFromSidebar').addEventListener('click',()=>window.ScoreVisualEditor?.activate());
 $('compactScoreTopButton').addEventListener('click',()=>{
   $('scoreMarginTop').value='4';updateLabels();queueApply();
   message('악보 영역의 위쪽 여백을 4%로 줄였습니다.');
 });
 $('scorePanelColorLink').addEventListener('click',()=>{
   if(project?.has_score===false)return;
   window.ScoreVisualEditor?.setEditing(false);
   window.ScoreVisualEditor?.selectTab('score');
   const section=document.querySelector('.score-region-options');
   section.open=true;
   requestAnimationFrame(()=>{
     $('scorePanelColor').scrollIntoView({behavior:'smooth',block:'center'});
     $('scorePanelColor').focus({preventScroll:true});
   });
 });
 for(const radio of document.querySelectorAll('input[name="exportMode"]'))radio.addEventListener('change',()=>{
   if(!radio.checked||renderUiActive)return;
   experimentalOptIn=radio.value==='offline';
   exportChoiceExplicit=true;
   localStorage.setItem(exportModeKey,radio.value);updateExportUi();
 });
 const savedExportMode=localStorage.getItem(exportModeKey);
 document.querySelector(`input[name="exportMode"][value="${savedExportMode==='legacy'?'legacy':'offline'}"]`).checked=true;
 let offlineProbeEpoch=0;
 async function refreshOfflineSupport(){
   const epoch=++offlineProbeEpoch,[width,height]=$('resolution').value.split('x').map(Number),fps=Number($('fps').value);
   offlineSupport=null;updateExportUi();
   const result=await window.ScoreOfflineExport.probe(width,height,fps,$('videoBitrate').value);
   if(epoch===offlineProbeEpoch){offlineSupport=result;updateExportUi();}
 }
 $('retryOfflineSupport').addEventListener('click',()=>{if(!renderUiActive)void refreshOfflineSupport();});
 for(const id of ['aspectRatio','outputQuality','customAspectWidth','customAspectHeight'])$(id).addEventListener('change',()=>{
   preserveLegacyWide=false;preserveCustomResolution='';syncOutputSize();experimentalOptIn=false;queueApply();void refreshOfflineSupport();
 });
 $('convertExactWide').addEventListener('click',()=>{preserveLegacyWide=false;syncOutputSize();queueApply();void refreshOfflineSupport();});
 $('resolution').addEventListener('change',()=>{migrateOutputSize({resolution:$('resolution').value});experimentalOptIn=false;queueApply();void refreshOfflineSupport();});
 $('fps').addEventListener('change',()=>{experimentalOptIn=false;void refreshOfflineSupport();});
 $('videoBitrate').addEventListener('change',()=>{void refreshOfflineSupport();});
 for(const id of ['drawScore','zoom'])$(id).addEventListener('change',()=>{experimentalOptIn=false;updateExportUi();});
 // The localization runtime updates static DOM content; export statuses are
 // calculated from live settings and must be rebuilt when locale changes.
 document.addEventListener('scorevideo:languagechange',updateExportUi);
 refreshVideoPresets();restoreSettings();void showThemePalette();void refreshOfflineSupport();window.addEventListener('resize',resizePreview);
 if(typeof ResizeObserver!=='undefined'){
   let lastWidth=0,lastHeight=0;
   new ResizeObserver(entries=>{
     const box=entries[0]?.contentRect;
     if(!box||Math.abs(box.width-lastWidth)<1&&Math.abs(box.height-lastHeight)<1)return;
     lastWidth=box.width;lastHeight=box.height;resizePreview();
   }).observe($('previewSurround'));
 }
 (async()=>{
   const id=localStorage.getItem(lastProjectKey);if(!id)return;
   try{const r=await fetch(`/api/projects/${id}`);if(!r.ok)return;await loadProject(await r.json());
     const s=await fetch(`/api/projects/${id}/status`).then(r=>r.json());
     if(['queued','rendering','cancelling'].includes(s.state)){activeDownloadJob=s.job_id||null;renderUiJob=s.job_id||null;polling=setInterval(pollStatus,750);pollStatus();}
     else if(s.state==='done'){
       const diagnostics=await fetch(`/api/projects/${id}/render-diagnostics`).then(r=>r.ok?r.json():null).catch(()=>null);
       if(diagnostics?.engine!=='webcodecs'){$('downloadLink').hidden=false;$('downloadLink').href=`/api/projects/${id}/download${s.job_id?'?job_id='+encodeURIComponent(s.job_id):''}`;}
     }
   }catch(e){message('이전 프로젝트 복원 실패: '+e.message,true);}
 })();
 // SCOREMOTION_MELODY_BETA_V1
 window.ScoreMelodyHighlight?.init?.({getStage:()=>stage,onChange:()=>schedulePortableAutosave()});
 document.addEventListener('scorevideo:languagechange',()=>window.ScoreMelodyHighlight?.bindStage?.(stage));
 // A narrow debug hook to verify preview/export settings parity in browser tests.
 window.__scoreVideoDebug={serializeProjectState,restoreProjectState,validateProjectState,config,sceneOptions,getStage:()=>stage,resizePreview,transport,seekTo,moveByMeasure,measureAxis,visualEditor:()=>window.ScoreVisualEditor};
})();
