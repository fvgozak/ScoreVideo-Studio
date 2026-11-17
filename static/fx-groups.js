/* Effect controls retain their existing IDs, handlers and export settings. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const panel=document.querySelector('[data-editor-panel="effects"] .panel:not(.image-palette-studio):not(.video-background-panel)');
  const basics=panel?.querySelector('.effect-basics'),legacy=panel?.querySelector('.effect-advanced');
  if(!basics||!legacy)return;
  const field=id=>$(id)?.closest('.field,.toggle-line,.trail-options');
  // Progressive disclosure: common changes remain visible; every legacy control
  // keeps its original ID, listeners and save/export semantics in one drawer.
  const section=(title,kind,presets)=>{
    const node=document.createElement('section');node.className='fx-group fx-quick-group';node.dataset.fxGroup=kind;
    const summary=kind==='score'?'음표의 발광·반짝임과 색상':'건반 타건광·낙하 노트·파티클';
    node.innerHTML=`<div class="fx-group-heading"><h3>${title}</h3><small>${summary}</small></div><div class="field"><label for="${kind}FxPreset">효과 스타일</label><select id="${kind}FxPreset">${presets.map(([id,name])=>`<option value="${id}">${name}</option>`).join('')}<option value="custom">직접 조정</option></select></div><div class="field"><label for="${kind}ColorPreset">빛 색상</label><select id="${kind}ColorPreset"><option value="project">프로젝트 팔레트</option><option value="aurora">Aurora</option><option value="warm">Warm</option>${kind==='keyboard'?'<option value="linked">악보 색상 연동</option>':''}<option value="custom">직접 선택</option></select></div><div class="fx-color-preview" aria-label="선택한 색상 미리보기"></div><div class="fx-basic"></div><div class="fx-custom-colors" hidden><small>약한 타건과 강한 타건의 색상을 지정합니다.</small></div>`;
    panel.insertBefore(node,legacy);return node;
  };
  const score=section('악보 효과 · Score FX','score',[
    ['clean','Clean'],['soft','Soft Glow'],['shimmer','Shimmer'],['resonance','Resonance']]);
  const keyboard=section('건반 효과 · Keyboard FX','keyboard',[
    ['clean','Clean'],['glow','Key Glow'],['resonance','Resonance'],['burst','Particle Burst']]);
  const advancedHub=document.createElement('details');
  advancedHub.className='compact-details fx-all-advanced';
  advancedHub.innerHTML='<summary>고급 설정 · 세부 조정</summary><p class="fx-advanced-help">기본 화면에서는 자주 사용하는 옵션만 표시합니다. 세부 발광·입자·밝기와 기존 설정은 이곳에서 조정할 수 있습니다.</p>';
  panel.insertBefore(advancedHub,legacy);
  const advancedSection=(kind,title)=>{
    const node=document.createElement('details');
    node.className='compact-details fx-group fx-advanced-panel';
    node.dataset.fxGroup=kind;
    node.innerHTML=`<summary>${title}</summary><div class="fx-advanced-body"></div>`;
    advancedHub.appendChild(node);
    return {node,body:node.querySelector('.fx-advanced-body')};
  };
  const scoreAdvanced=advancedSection('score','악보 효과 · 상세 설정');
  const keyboardAdvanced=advancedSection('keyboard','건반 효과 · 상세 설정');
  const move=(ids,to)=>{for(const id of ids){const block=field(id)||$(id);if(block&&!to.contains(block))to.append(block)}};
  move(['scoreImpactEnabled','scoreImpactStrength'],score.querySelector('.fx-basic'));
  move(['pianoLight','pianoLightStrength'],keyboard.querySelector('.fx-basic'));
  // The real color inputs are moved, not cloned: there is still one source of
  // truth for project saves, render settings, and preview controls.
  const auroraColors=$('auroraOptions')?.querySelector('.color-grid');
  if(auroraColors)score.querySelector('.fx-custom-colors').append(auroraColors);
  scoreAdvanced.body.insertAdjacentHTML('afterbegin','<div class="fx-advanced-heading">악보 발광 · 색상 반응</div>');
  move(['lightColorMode','auroraOptions'],scoreAdvanced.body);
  const glowLabel=$('glowColor')?.closest('label');
  if(glowLabel){const grid=document.createElement('div');grid.className='color-grid';grid.append(glowLabel);scoreAdvanced.body.append(grid);}
  move(['fxStrength','fxMode','glitter','sparkle','noteMotion','gpuCinematicOn','gpuPreset','gpuCinematicStrength','gpuMusicReaction','gpuClassicOn','gpuCoreStrength','gpuMidStrength','gpuHaloStrength','gpuBloomOn','gpuOutlineOn','gpuStardustOn','gpuVolumetricOn','gpuChromaticOn','gpuTrailOn','gpuBurstOn','gpuParticleCount','fxRenderer','trailOptions','velocityScale','motionStrength','velocityReactive'],scoreAdvanced.body);
  move(['pedalResonance','sustainAfterglow'],keyboardAdvanced.body);
  legacy.querySelector('summary').textContent='기타 기존 효과 · 제목 · 장면 옵션';
  scoreAdvanced.body.append(legacy);
  keyboard.querySelector('.fx-basic').insertAdjacentHTML('beforeend','<label class="fx-check"><input id="keyboardVelocityColor" type="checkbox" checked> 벨로시티 색상 변화</label>');
  // Keyboard horizon glow: intentionally only two everyday controls; all
  // tuning lives in the existing Advanced Settings drawer.
  keyboard.querySelector('.fx-basic').insertAdjacentHTML('beforeend',`<div class="fx-boundary-quick">
    <div class="fx-boundary-title">건반 경계 빛 <small>Horizon Light</small></div>
    <div class="field"><label for="keyboardBoundaryStyle">스타일</label>
      <select id="keyboardBoundaryStyle"><option value="none">끔 · 기존 타건선</option>
        <option value="clean" selected>Clean Glow · 은은한 빛</option>
        <option value="aurora">Aurora Edge · 컬러 그라데이션</option>
        <option value="resonance">Resonance Beam · 타건 반응</option>
        <option value="mist">Mist Horizon · 빛 안개</option>
        <option value="prism">Prism Line · 다중 프리즘</option>
        <option value="velvet">Velvet Shadow · 빛과 그림자</option>
        <option value="ripple">Ripple Flow · 잔물결과 빛 입자</option>
        <option value="electric">Electric Current · 흐르는 전류</option></select></div>
    <div class="field"><label for="keyboardBoundaryStrength">경계 빛 강도</label>
      <input id="keyboardBoundaryStrength" type="range" min="0" max="2" step="0.05" value="0.8"></div>
    <small class="fx-boundary-help">건반 타건선 위치에 맞춰 표시하며 현재 빛 팔레트와 자동 연동됩니다.</small>
  </div>`);
  keyboardAdvanced.body.insertAdjacentHTML('beforeend',`<div class="fx-advanced-heading">경계 빛 · 세부 설정</div>
    <div class="field"><label for="keyboardBoundaryThickness">경계선 두께</label>
      <input id="keyboardBoundaryThickness" type="range" min="0.5" max="5" step="0.1" value="1.8"></div>
    <div class="field"><label for="keyboardBoundarySpeed">빛 움직임 속도</label>
      <input id="keyboardBoundarySpeed" type="range" min="0" max="2.5" step="0.05" value="1"></div>
    <div class="field"><label for="keyboardBoundaryReaction">MIDI 타건 반응</label>
      <input id="keyboardBoundaryReaction" type="range" min="0" max="2" step="0.05" value="0.85"></div>
    <div class="field"><label for="keyboardBoundaryColorMode">경계선 색상</label>
      <select id="keyboardBoundaryColorMode"><option value="palette">자동 · 건반 팔레트 연동</option>
        <option value="custom">직접 선택</option></select></div>
    <div class="field" id="keyboardBoundaryCustomColor" hidden><label for="keyboardBoundaryColor">경계선 직접 색상</label>
      <input id="keyboardBoundaryColor" type="color" value="#73c9ed"></div>`);
  const syncBoundaryUi=()=>{
    const off=$('keyboardBoundaryStyle').value==='none';
    $('keyboardBoundaryStrength').disabled=off;
    $('keyboardBoundaryThickness').disabled=off;
    $('keyboardBoundarySpeed').disabled=off;
    $('keyboardBoundaryReaction').disabled=off||!['resonance','ripple','electric'].includes($('keyboardBoundaryStyle').value);
    $('keyboardBoundaryColorMode').disabled=off;
    $('keyboardBoundaryCustomColor').hidden=off||$('keyboardBoundaryColorMode').value!=='custom';
  };
  $('keyboardBoundaryStyle').addEventListener('change',syncBoundaryUi);
  $('keyboardBoundaryColorMode').addEventListener('change',syncBoundaryUi);

  keyboard.querySelector('.fx-custom-colors').insertAdjacentHTML('beforeend','<div class="color-grid"><label>약한 타건<input id="keyboardColorLow" type="color" value="#3ac7db"></label><label>강한 타건<input id="keyboardColorHigh" type="color" value="#ffbf71"></label></div>');
  keyboardAdvanced.body.insertAdjacentHTML('afterbegin','<label class="fx-check"><input id="keyboardPaletteLink" type="checkbox"> 악보 팔레트와 연동</label><small id="keyboardVelocityRangeInfo">MIDI 데이터를 불러오면 색상 분포를 표시합니다.</small>');
  keyboardAdvanced.body.insertAdjacentHTML('beforeend',`<div class="field"><label for="keyboardVelocityScale">건반 벨로시티 색상 기준</label><select id="keyboardVelocityScale"><option value="relative">상대값 · 곡의 최저~최고 (권장)</option><option value="absolute">절대값 · MIDI 1~127</option><option value="follow-score">악보 설정 따라가기</option></select><small>벨로시티가 다른 음표에 실제로 서로 다른 색을 표시합니다. 이 설정은 악보의 색상 기준과 독립적입니다.</small></div><div class="field"><label for="keyboardGlowSize">건반 발광 크기</label><input id="keyboardGlowSize" type="range" min="0.5" max="2" step="0.05" value="1"></div><div class="field"><label for="keyboardParticleDensity">파티클 수</label><input id="keyboardParticleDensity" type="range" min="0" max="3" step="0.1" value="1"></div><div class="field"><label for="keyboardParticleSize">파티클 크기</label><input id="keyboardParticleSize" type="range" min="0.5" max="2" step="0.05" value="1"></div><div class="field"><label for="keyboardParticleLife">파티클 수명</label><input id="keyboardParticleLife" type="range" min="0.2" max="3" step="0.05" value="1.25"></div><div class="field"><label for="keyboardCurlStrength">Curl Flow 강도</label><input id="keyboardCurlStrength" type="range" min="0" max="3" step="0.05" value="1.05"></div><div class="field"><label for="keyboardDensityFastWeight">최근 2초 밀도 비중</label><input id="keyboardDensityFastWeight" type="range" min="0" max="1" step="0.05" value="0.35"><small>나머지는 최근 10초 밀도에 적용됩니다.</small></div><div class="field"><label for="keyboardBloomStrength">Bloom 강도</label><input id="keyboardBloomStrength" type="range" min="0" max="2" step="0.05" value="0.7"></div><div class="field"><label for="keyboardBloomRadius">Bloom 반경</label><input id="keyboardBloomRadius" type="range" min="0.5" max="2" step="0.05" value="1"></div><div class="field"><label for="keyboardVelocityContrast">벨로시티 반응 곡선</label><input id="keyboardVelocityContrast" type="range" min="0.4" max="2.5" step="0.05" value="1"></div>`);
  keyboardAdvanced.body.insertAdjacentHTML('afterbegin',`<div class="field"><label for="keyboardLightingMode">건반 밝기 제어</label><select id="keyboardLightingMode"><option value="auto">자동</option><option value="manual">수동</option><option value="auto-offset">자동 + 보정</option></select></div><div class="field"><label for="keyboardBaseBrightness">건반 기본 밝기</label><input id="keyboardBaseBrightness" type="range" min="0.15" max="1.5" step="0.05" value="1"></div><div class="field"><label for="keyboardLightingSensitivity">자동 조절 민감도</label><input id="keyboardLightingSensitivity" type="range" min="0" max="2" step="0.05" value="1"></div><div class="field"><label for="keyboardBrightnessOffset">밝기 보정</label><input id="keyboardBrightnessOffset" type="range" min="-0.4" max="0.4" step="0.02" value="0"></div><label class="fx-check"><input id="keyboardTemperatureSync" type="checkbox" checked> 배경 색온도 반영</label><div class="field"><label for="keyboardWhiteBrightness">흰 건반 표면 밝기</label><input id="keyboardWhiteBrightness" type="range" min="0.3" max="1.4" step="0.05" value="1"></div><div class="field"><label for="keyboardBlackBrightness">검은 건반 표면 밝기</label><input id="keyboardBlackBrightness" type="range" min="0.2" max="1.8" step="0.05" value="1"></div><div class="field"><label for="keyboardReflectionStrength">건반 반사광</label><input id="keyboardReflectionStrength" type="range" min="0" max="2" step="0.05" value="1"><small>타건 발광·파티클·Bloom은 아래 설정과 독립적으로 유지됩니다.</small></div>`);
  const syncLightingUi=()=>{const mode=$('keyboardLightingMode').value;
    $('keyboardLightingSensitivity').disabled=mode==='manual';
    $('keyboardBrightnessOffset').disabled=mode!=='auto-offset';};
  $('keyboardLightingMode').addEventListener('change',syncLightingUi);
  const set=(id,value)=>{const el=$(id);if(!el)return;el.type==='checkbox'?el.checked=Boolean(value):el.value=String(value)};
  const applyScore=()=>{const preset=$('scoreFxPreset').value;
    const values={clean:['none',false,false,0,0,false,false],soft:['bloom',true,false,.8,.8,true,false],shimmer:['glitter',true,true,1,1,true,true],resonance:['resonance',true,true,1.25,1.2,true,false]}[preset];
    if(!values)return;set('fxMode',values[0]);set('scoreImpactEnabled',values[1]);set('sparkle',values[2]);set('scoreImpactStrength',values[3]);
    set('fxStrength',values[4]);set('gpuCinematicOn',values[5]);set('gpuStardustOn',values[6]);
  };
  const applyKeyboard=()=>{const preset=$('keyboardFxPreset').value;
    const values={clean:[false,0,0,.7,1,0,.7],glow:[true,1.7,.6,.8,1.25,.9,.8],resonance:[true,1.1,1.2,2,1.25,1.1,1.15],burst:[true,1.6,2.6,1.1,1.55,1.35,1.4]}[preset];
    if(!values)return;set('pianoLight',values[0]);set('pianoLightStrength',values[1]);set('keyboardParticleDensity',values[2]);set('keyboardParticleLife',values[3]);
    set('keyboardGlowSize',values[4]);set('keyboardBloomStrength',values[5]);set('keyboardCurlStrength',values[6]);
  };
  const colors={aurora:['#3ac7db','#aa80e8'],warm:['#eabf78','#ff704e']};
  const syncPreview=()=>{for(const [kind,low,high] of [['score',$('auroraLow')?.value,$('auroraHigh')?.value],['keyboard',$('keyboardColorLow').value,$('keyboardColorHigh').value]])
    $(kind+'ColorPreset').closest('.fx-group').querySelector('.fx-color-preview').style.background=`linear-gradient(90deg,${low||'#3ac7db'},${high||'#aa80e8'})`;};
  const onScoreInput=e=>{if(e.target.id==='scoreFxPreset'||e.target.id==='scoreColorPreset')return;
    if(['auroraLow','auroraHigh','glowColor','lightColorMode'].includes(e.target.id))set('scoreColorPreset','custom');
    else set('scoreFxPreset','custom');
    if($('keyboardPaletteLink').checked&&['auroraLow','auroraHigh'].includes(e.target.id)){
      set('keyboardColorLow',$('auroraLow').value);set('keyboardColorHigh',$('auroraHigh').value);
    }
    syncPreview();syncCustomColors();};
  const onKeyboardInput=e=>{if(e.target.id==='keyboardFxPreset'||e.target.id==='keyboardColorPreset')return;
    if(['keyboardColorLow','keyboardColorHigh','keyboardPaletteLink'].includes(e.target.id))set('keyboardColorPreset','custom');
    else if(e.target.id!=='keyboardVelocityColor'&&!e.target.id.startsWith('keyboardBoundary'))set('keyboardFxPreset','custom');syncPreview();syncLightingUi();syncCustomColors();syncBoundaryUi();};
  for(const group of [score,scoreAdvanced.node])group.addEventListener('input',onScoreInput);
  for(const group of [keyboard,keyboardAdvanced.node])group.addEventListener('input',onKeyboardInput);
  const syncCustomColors=()=>{
    for(const group of [score,keyboard]){
      const kind=group.dataset.fxGroup;
      group.querySelector('.fx-custom-colors').hidden=$(kind+'ColorPreset').value!=='custom';
    }
  };
  $('scoreFxPreset').addEventListener('change',applyScore);
  $('keyboardFxPreset').addEventListener('change',applyKeyboard);
  const paletteKey=()=>`scorevideo_fx_palette_${localStorage.getItem('scorevideo_last_project')||'current'}`;
  for(const kind of ['score','keyboard'])$(kind+'ColorPreset').addEventListener('change',()=>{
    const value=$(kind+'ColorPreset').value;
    let project=null;try{project=JSON.parse(localStorage.getItem(paletteKey())||'null')}catch(_){}
    const pair=colors[value]||(value==='project'&&project?[project.aurora_low||project.glow,project.aurora_high||project.accent]:null);
    if(pair){set(kind==='score'?'auroraLow':'keyboardColorLow',pair[0]);set(kind==='score'?'auroraHigh':'keyboardColorHigh',pair[1]);}
    if(kind==='score')set('lightColorMode','aurora');
    else set('keyboardPaletteLink',value==='linked');
    syncPreview();syncCustomColors();
  });
  $('keyboardPaletteLink').addEventListener('change',()=>{if($('keyboardPaletteLink').checked){set('keyboardColorPreset','linked');set('keyboardColorLow',$('auroraLow').value);set('keyboardColorHigh',$('auroraHigh').value);syncPreview();syncCustomColors()}});
  document.querySelectorAll('[data-visual-preset]').forEach(card=>card.addEventListener('click',()=>{
    const pair={minimal:['clean','clean'],starlight:['shimmer','glow'],aurora:['soft','resonance'],dreamscape:['resonance','burst']}[card.dataset.visualPreset];
    if(!pair)return;set('scoreFxPreset',pair[0]);set('keyboardFxPreset',pair[1]);
    $('scoreFxPreset').dispatchEvent(new Event('change',{bubbles:true}));
    $('keyboardFxPreset').dispatchEvent(new Event('change',{bubbles:true}));
    set('keyboardBoundaryStyle',({minimal:'none',starlight:'clean',aurora:'aurora',dreamscape:'mist'})[card.dataset.visualPreset]);
    syncBoundaryUi();
  }));
  document.addEventListener('score-palette-applied',event=>{const c=event.detail||{};
    if(c.projectId)localStorage.setItem(`scorevideo_fx_palette_${c.projectId}`,JSON.stringify(c));
    set('scoreColorPreset','project');
    if($('keyboardColorPreset').value==='project'||$('keyboardPaletteLink').checked){set('keyboardColorLow',c.aurora_low||c.glow||'#3ac7db');set('keyboardColorHigh',c.aurora_high||c.accent||'#aa80e8');}
    syncPreview();syncCustomColors();
  });
  syncPreview();syncLightingUi();syncCustomColors();syncBoundaryUi();
  window.ScoreFxGroups={syncPreview,syncLightingUi,syncCustomColors,syncBoundaryUi,applyScore,applyKeyboard};
})();
