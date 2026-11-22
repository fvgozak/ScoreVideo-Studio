/* Effect controls retain their existing IDs, handlers and export settings. */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const panel=document.querySelector('[data-editor-panel="effects"] .panel:not(.image-palette-studio):not(.video-background-panel)');
  const basics=panel?.querySelector('.effect-basics'),legacy=panel?.querySelector('.effect-advanced');
  if(!basics||!legacy)return;
  const field=id=>$(id)?.closest('.field,.toggle-line,.trail-options');
  // Color-only presets: independent of effect style, background, and keyboard
  // material. Every pair is an actual low/high MIDI velocity gradient, shared
  // by the score glow, note bars and keyboard effects when explicitly linked.
  const lightPalettes=Object.freeze({
    aurora:['#3ac7db','#aa80e8'],
    warm:['#eabf78','#ff704e'],
    space:['#5668d4','#d17bf2'],        // nebula / distant stars
    forest:['#2c9279','#b6d779'],       // moss / sun through leaves
    wood:['#986945','#e4b47d'],         // cedar / golden sunlight
    ocean:['#207bb8','#47d5cb'],        // deep blue / sea foam
    sky:['#559fe3','#c2e5fa'],          // clear sky / cloud light
    deepsea:['#27528d','#55bdd6'],      // deep water / bioluminescence
    moonlight:['#6175ab','#d0d8f1'],    // moon shadow / silver light
    sunrise:['#7c9bd5','#ffcf94'],      // morning lavender / sun
    sunset:['#bc709c','#ffa76a'],       // dusk mauve / orange
    autumn:['#a36c45','#eac36f'],       // maple / gold
    glacier:['#4aaac5','#b6f0ed'],      // ice blue / crystal
    blossom:['#be7aaf','#ffc1d6'],      // flower pink / petals
    meadow:['#4b9f83','#f0d57a']        // grass / warm yellow
  });
  // Full chromatic journeys. Public lightPalettes stays a 2-endpoint legacy
  // API; these 4 stops are used only for explicitly selected named themes.
  const harmonicStops=Object.freeze({
    aurora:['#3ac7db','#528fe9','#e3a1d6','#aa80e8'],
    warm:['#eabf78','#e1a581','#d88295','#ff704e'],
    space:['#5668d4','#478ec8','#a579d6','#d17bf2'],
    forest:['#2c9279','#49ad9c','#9bc987','#b6d779'],
    wood:['#986945','#b5836d','#cf9b87','#e4b47d'],
    ocean:['#207bb8','#4f95d4','#389fa8','#47d5cb'],
    sky:['#559fe3','#75a4db','#a4afd5','#c2e5fa'],
    deepsea:['#27528d','#385fc5','#3199ae','#55bdd6'],
    moonlight:['#6175ab','#678bc1','#a999d2','#d0d8f1'],
    sunrise:['#7c9bd5','#a893d3','#e0a6b7','#ffcf94'],
    sunset:['#bc709c','#8774bb','#eb7791','#ffa76a'],
    autumn:['#a36c45','#be7964','#d99d6e','#eac36f'],
    glacier:['#4aaac5','#7b9ed9','#9bc9db','#b6f0ed'],
    blossom:['#be7aaf','#b790da','#e9a2ba','#ffc1d6'],
    meadow:['#4b9f83','#60bda9','#b7c77d','#f0d57a']
  });
  const randomSwatches=['#53bde4','#988ce8','#e799bc','#f0c57e','#5ac8ad','#748de6','#ce92ce','#ef9488','#a6cb81','#72cad4','#d9a67e','#b0a6f2'];
  const colorOptions=`<optgroup label="기본 색상">
      <option value="project">프로젝트 팔레트</option>
      <option value="random">랜덤 · 음표마다 다양한 색상</option>
      <option value="aurora">Aurora · 청록 / 보라</option>
      <option value="warm">Warm · 금빛 / 주황</option>
    </optgroup><optgroup label="자연과 풍경">
      <option value="space">우주 · 성운 / 별빛</option>
      <option value="forest">숲 · 이끼 / 햇살</option>
      <option value="wood">나무 · 삼나무 / 황금빛</option>
      <option value="ocean">바다 · 푸른 물결 / 물보라</option>
      <option value="sky">하늘 · 맑은 파랑 / 구름빛</option>
      <option value="deepsea">심해 · 심해청 / 생물발광</option>
      <option value="meadow">초원 · 풀잎 / 햇살</option>
    </optgroup><optgroup label="시간과 계절">
      <option value="moonlight">달빛 · 남색 / 은빛</option>
      <option value="sunrise">새벽 · 연보라 / 해돋이</option>
      <option value="sunset">노을 · 자주 / 주황</option>
      <option value="autumn">가을 · 단풍 / 금빛</option>
      <option value="glacier">빙하 · 얼음 / 수정빛</option>
      <option value="blossom">벚꽃 · 분홍 / 꽃잎</option>
    </optgroup>`;
  // Progressive disclosure: common changes remain visible; every legacy control
  // keeps its original ID, listeners and save/export semantics in one drawer.
  const section=(title,kind,presets)=>{
    const node=document.createElement('section');node.className='fx-group fx-quick-group';node.dataset.fxGroup=kind;
    const summary=kind==='score'?'음표의 발광·반짝임과 색상':'건반 타건광·낙하 노트·파티클';
    node.innerHTML=`<div class="fx-group-heading"><h3>${title}</h3><small>${summary}</small></div><div class="field"><label for="${kind}FxPreset">효과 스타일</label><select id="${kind}FxPreset">${presets.map(([id,name])=>`<option value="${id}"${kind==='score'&&id==='particles'?' data-i18n="effects.scoreParticlePreset"':''}>${name}</option>`).join('')}<option value="custom">직접 조정</option></select></div><div class="field"><label for="${kind}ColorPreset">빛 색상</label><select id="${kind}ColorPreset">${colorOptions}${kind==='keyboard'?'<option value="linked">악보 색상 연동</option>':''}<option value="custom">직접 선택</option></select><small data-i18n="effects.paletteHelpFourColors">테마는 벨로시티에 따라 4색 변화, 랜덤은 타건마다 색상이 결정되어 미리보기·출력에서 동일하게 재현됩니다.</small></div><div class="fx-color-preview" aria-label="선택한 색상 미리보기"></div><div class="fx-basic"></div><div class="fx-custom-colors" hidden><small>약한 타건과 강한 타건의 색상을 지정합니다.</small></div>`;
    panel.insertBefore(node,legacy);return node;
  };
  const score=section('악보 효과 · Score FX','score',[
    ['clean','Clean'],['soft','Soft Glow'],['shimmer','Shimmer'],['resonance','Resonance'],['particles','Particle Glow']]);
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
  // Score-only GPU particles: do not borrow the keyboard emitter or global
  // cinematic burst controls, so both can be configured independently.
  score.querySelector('.fx-basic').insertAdjacentHTML('beforeend',
    '<label class="fx-check"><input id="scoreParticlesOn" type="checkbox"> <span data-i18n="effects.scoreParticlesOn">음표 파티클</span></label>');
  scoreAdvanced.body.insertAdjacentHTML('beforeend',`<div class="fx-advanced-heading" data-i18n="effects.scoreParticlesTitle">악보 파티클 · 세부 설정</div>
    <div class="field"><label for="scoreParticleStyle" data-i18n="effects.scoreParticleStyle">파티클 움직임</label><select id="scoreParticleStyle"><option value="dust" data-i18n="effects.scoreParticleDust">빛가루 · 부드럽게 확산</option><option value="rise" data-i18n="effects.scoreParticleRise">반딧불 · 위로 떠오름</option><option value="spark" data-i18n="effects.scoreParticleSpark">별가루 · 사방으로 반짝임</option></select></div>
    <div class="field"><label for="scoreParticleCount" data-i18n="effects.scoreParticleCount">음표당 파티클 수</label><input id="scoreParticleCount" type="range" min="2" max="24" step="1" value="12"></div>
    <div class="field"><label for="scoreParticleSize" data-i18n="effects.scoreParticleSize">파티클 크기</label><input id="scoreParticleSize" type="range" min="0.35" max="2" step="0.05" value="0.8"></div>
    <div class="field"><label for="scoreParticleSpeed" data-i18n="effects.scoreParticleSpeed">퍼지는 속도</label><input id="scoreParticleSpeed" type="range" min="4" max="100" step="1" value="34"></div>
    <div class="field"><label for="scoreParticleLife" data-i18n="effects.scoreParticleLife">파티클 지속 시간</label><input id="scoreParticleLife" type="range" min="0.15" max="1.5" step="0.05" value="0.75"></div>
    <div class="field"><label for="scoreParticleBrightness" data-i18n="effects.scoreParticleBrightness">파티클 밝기</label><input id="scoreParticleBrightness" type="range" min="0.1" max="2" step="0.05" value="1.2"></div>`);

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
  // Music-reactive bars are a distinct choice from keyboard glow presets:
  // "rise" grows from the struck key, complementing score-drawing animation.
  keyboard.querySelector('.fx-basic').insertAdjacentHTML('beforeend',`<div class="field">
    <label for="keyboardNoteBarMode">음표 바 애니메이션</label>
    <select id="keyboardNoteBarMode">
      <option value="fall">타건 전에 내려오기 · 기본</option>
      <option value="rise">타건 후 건반에서 솟아오르기</option>
      <option value="both">내려오기 + 솟아오르기</option>
      <option value="off">음표 바 끄기</option>
    </select>
    <small>악보 그리기와 함께 사용하려면 '타건 후 건반에서 솟아오르기'를 선택하세요.</small>
  </div>`);
  keyboardAdvanced.body.insertAdjacentHTML('beforeend',`<div class="field">
    <label for="keyboardNoteRiseSpeed">상승 바 속도</label>
    <input id="keyboardNoteRiseSpeed" type="range" min="0.35" max="2" step="0.05" value="1">
    <small>음표가 눌려 있는 동안 위로 성장하고, 손을 떼면 꼬리가 따라 올라갑니다.</small>
  </div>`);
  const syncNoteBarUi=()=>{
    $('keyboardNoteRiseSpeed').disabled=!['rise','both'].includes($('keyboardNoteBarMode').value);
  };
  $('keyboardNoteBarMode').addEventListener('change',syncNoteBarUi);

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
    const values={clean:['none',false,false,0,0,false,false,false],soft:['bloom',true,false,.8,.8,true,false,false],shimmer:['glitter',true,true,1,1,true,true,false],resonance:['resonance',true,true,1.25,1.2,true,false,false],particles:['bloom',true,true,1.2,1.1,true,false,true]}[preset];
    if(!values)return;set('fxMode',values[0]);set('scoreImpactEnabled',values[1]);set('sparkle',values[2]);set('scoreImpactStrength',values[3]);
    set('fxStrength',values[4]);set('gpuCinematicOn',values[5]);set('gpuStardustOn',values[6]);set('scoreParticlesOn',values[7]);
  };
  const applyKeyboard=()=>{const preset=$('keyboardFxPreset').value;
    const values={clean:[false,0,0,.7,1,0,.7],glow:[true,1.7,.6,.8,1.25,.9,.8],resonance:[true,1.1,1.2,2,1.25,1.1,1.15],burst:[true,1.6,2.6,1.1,1.55,1.35,1.4]}[preset];
    if(!values)return;set('pianoLight',values[0]);set('pianoLightStrength',values[1]);set('keyboardParticleDensity',values[2]);set('keyboardParticleLife',values[3]);
    set('keyboardGlowSize',values[4]);set('keyboardBloomStrength',values[5]);set('keyboardCurlStrength',values[6]);
  };
  const syncLinkedKeyboard=()=>{
    if(!$('keyboardPaletteLink').checked&&$('keyboardColorPreset').value!=='linked')return;
    set('keyboardColorLow',$('auroraLow').value);
    set('keyboardColorHigh',$('auroraHigh').value);
  };
  const syncPreview=(options={})=>{
    if(options.syncKeyboard!==false)syncLinkedKeyboard();
    for(const [kind,low,high] of [['score',$('auroraLow')?.value,$('auroraHigh')?.value],['keyboard',$('keyboardColorLow').value,$('keyboardColorHigh').value]]){
      const preview=$(kind+'ColorPreset').closest('.fx-group').querySelector('.fx-color-preview');
      const preset=$(kind+'ColorPreset').value;
      const linked=kind==='keyboard'&&(preset==='linked'||$('keyboardPaletteLink').checked);
      const chosen=linked?$('scoreColorPreset').value:preset;
      const stops=chosen==='random'?randomSwatches:(harmonicStops[chosen]||[low||'#3ac7db',high||'#aa80e8']);
      preview.style.background=`linear-gradient(90deg,${stops.join(',')})`;
      // Tooltips are created dynamically, so translate them through semantic
      // messages instead of leaving Korean strings outside the locale packs.
      const i18n=window.ScoreI18n;
      const t=(key,fallback,vars)=>i18n?.loaded?i18n.t(key,vars):fallback;
      preview.title=chosen==='random'
        ?t('effects.paletteRandomTooltip','각 음표에 고정된 랜덤 색상 · 벨로시티는 밝기에 반영')
        :t('effects.paletteGradientTooltip',`약한 음 ${low} → ${stops.slice(1,-1).join(' → ')} → 강한 음 ${high}`,
            {low,middle:stops.slice(1,-1).join(' → '),high});
    }
  };
  const onScoreInput=e=>{if(e.target.id==='scoreFxPreset'||e.target.id==='scoreColorPreset')return;
    if(['auroraLow','auroraHigh','glowColor','lightColorMode'].includes(e.target.id))set('scoreColorPreset','custom');
    else set('scoreFxPreset','custom');
    if($('keyboardPaletteLink').checked&&['auroraLow','auroraHigh'].includes(e.target.id)){
      set('keyboardColorLow',$('auroraLow').value);set('keyboardColorHigh',$('auroraHigh').value);
    }
    syncPreview();syncCustomColors();};
  const onKeyboardInput=e=>{if(e.target.id==='keyboardFxPreset'||e.target.id==='keyboardColorPreset')return;
    if(['keyboardColorLow','keyboardColorHigh'].includes(e.target.id)){
      // Direct edits must detach the palette link, otherwise the next UI
      // refresh immediately overwrites the selected colors.
      set('keyboardPaletteLink',false);
      set('keyboardColorPreset','custom');
    }else if(e.target.id==='keyboardPaletteLink')set('keyboardColorPreset',$('keyboardPaletteLink').checked?'linked':'custom');
    else if(!['keyboardVelocityColor','keyboardNoteBarMode','keyboardNoteRiseSpeed'].includes(e.target.id)&&!e.target.id.startsWith('keyboardBoundary'))set('keyboardFxPreset','custom');
    syncPreview();syncLightingUi();syncCustomColors();syncBoundaryUi();};
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
    const pair=lightPalettes[value]||(value==='project'&&project?[project.aurora_low||project.glow,project.aurora_high||project.accent]:null);
    if(pair){
      set(kind==='score'?'auroraLow':'keyboardColorLow',pair[0]);
      set(kind==='score'?'auroraHigh':'keyboardColorHigh',pair[1]);
      if(kind==='score'){
        set('glowColor',value==='project'&&project?.glow?project.glow:pair[1]);
        set('auroraPreset','custom');
      }
    }
    if(kind==='score'){set('lightColorMode','aurora');if(harmonicStops[value])set('velocityScale','relative');}
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
    // SCOREMOTION_COLOR_DIRECTOR_SAFE_V2: do not mutate any preset or keyboard
    // color here. The recommendation's checked scopes were applied in app.js.
    // Keep legacy project palette data for the existing 'project' color preset
    // only when the user has explicitly applied score/glow colors.
    if(c.projectId&&c.scope?.glow===true)
      localStorage.setItem(`scorevideo_fx_palette_${c.projectId}`,JSON.stringify(c));
    syncPreview({syncKeyboard:c.scope?.keys===true});syncCustomColors();
  });
  // Recompute tooltip text when users switch ko/en/ja without reloading.
  document.addEventListener('scorevideo:languagechange',()=>syncPreview({syncKeyboard:false}));
  syncPreview();syncLightingUi();syncCustomColors();syncBoundaryUi();syncNoteBarUi();
  window.ScoreFxGroups={syncPreview,syncLightingUi,syncCustomColors,syncBoundaryUi,syncNoteBarUi,applyScore,applyKeyboard,lightPalettes,harmonicStops};
})();
