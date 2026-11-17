/* Presentation-only grouping. Existing controls keep their IDs and listeners. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const scenePanel = document.querySelector('[data-editor-panel="scene"]');
  const backgroundPanel = document.querySelector('[data-editor-panel="background"]');
  const effectsPanel = document.querySelector('[data-editor-panel="effects"]');
  const scorePanel = document.querySelector('[data-editor-panel="score"] > .panel');
  if (!scenePanel || !backgroundPanel || !effectsPanel || !scorePanel) return;
  const source = [...effectsPanel.children].find(node => node.matches('.panel:not(.image-palette-studio):not(.video-background-panel)'));
  const background = effectsPanel.querySelector('.video-background-panel');
  const palette = effectsPanel.querySelector('.image-palette-studio');
  if (!source || !background || !palette) return;

  const directBlock = id => {
    let node = byId(id);
    while (node && node.parentElement !== source) node = node.parentElement;
    return node;
  };
  const scene = document.createElement('section');
  scene.className = 'panel scene-controls';
  scene.innerHTML = '<div class="panel-title"><h2 data-i18n="nav.scene">장면</h2></div>';
  scenePanel.appendChild(scene);
  backgroundPanel.append(palette, background);
  for (const id of ['sceneTemplate', 'cameraMode', 'cameraPointTools', 'pianoKeyStyle', 'titleText']) {
    const block = directBlock(id);
    if (block) scene.appendChild(block);
  }
  const drawScore = directBlock('drawScore');
  if (drawScore) scorePanel.appendChild(drawScore);
  scene.querySelectorAll('details').forEach(details => { details.open = false; });

  const title = source.querySelector(':scope > .panel-title h2');
  if (title) {
    title.textContent = '효과';
    title.dataset.i18n = 'nav.effects';
  }
  const basics = document.createElement('div');
  basics.className = 'effect-basics';
  basics.innerHTML = `<div class="effect-preset-grid" role="group" aria-label="시각 효과 프리셋" data-i18n-aria-label="effects.presetGroup">
    <button class="effect-preset-card" data-visual-preset="minimal" type="button" aria-pressed="false"><span class="preset-mark" aria-hidden="true">●</span><span>Minimal</span></button>
    <button class="effect-preset-card" data-visual-preset="starlight" type="button" aria-pressed="false"><span class="preset-mark" aria-hidden="true">✧</span><span>Cinematic</span></button>
    <button class="effect-preset-card" data-visual-preset="aurora" type="button" aria-pressed="false"><span class="preset-mark" aria-hidden="true">≋</span><span>Aurora</span></button>
    <button class="effect-preset-card" data-visual-preset="dreamscape" type="button" aria-pressed="false"><span class="preset-mark" aria-hidden="true">✦</span><span>Dreamscape</span></button>
  </div>`;
  source.insertBefore(basics, source.querySelector(':scope > .panel-title')?.nextSibling || source.firstChild);
  const gpuDetails = byId('gpuPreset')?.closest('details');
  for (const id of ['gpuCinematicOn', 'gpuPreset', 'gpuCinematicStrength', 'gpuParticleCount']) {
    const control = byId(id);
    const block = control?.closest('.field');
    if (block && gpuDetails?.contains(block)) basics.appendChild(block);
  }
  const advanced = document.createElement('details');
  advanced.className = 'compact-details effect-advanced';
  advanced.innerHTML = '<summary data-i18n="effects.advanced">고급 효과 설정</summary>';
  for (const node of [...source.children]) {
    if (node.classList?.contains('panel-title') || node === basics) continue;
    advanced.appendChild(node);
  }
  source.appendChild(advanced);

  const minimal = byId('minimalMode');
  const preset = byId('gpuPreset');
  const cinematic = byId('gpuCinematicOn');
  const cards = [...basics.querySelectorAll('[data-visual-preset]')];
  const syncCards = () => {
    const selected = minimal?.checked ? 'minimal' : preset?.value;
    for (const card of cards) card.setAttribute('aria-pressed', String(card.dataset.visualPreset === selected));
  };
  for (const card of cards) card.addEventListener('click', () => {
    const value = card.dataset.visualPreset;
    if (minimal) {
      minimal.checked = value === 'minimal';
      minimal.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (value !== 'minimal' && preset && cinematic) {
      cinematic.checked = true;
      cinematic.dispatchEvent(new Event('change', { bubbles: true }));
      preset.value = value;
      preset.dispatchEvent(new Event('change', { bubbles: true }));
    }
    syncCards();
  });
  minimal?.addEventListener('change', syncCards);
  preset?.addEventListener('change', syncCards);
  syncCards();
  const projectPanel = document.querySelector('[data-editor-panel="project"] > .panel');
  const fileHints = [...projectPanel?.querySelectorAll(':scope > .hint') || []];
  if (projectPanel && fileHints.length) {
    const help = document.createElement('details');
    help.className = 'compact-details file-help';
    help.innerHTML = '<summary data-i18n="nav.fileHelp">파일 안내</summary>';
    fileHints.forEach(hint => help.appendChild(hint));
    projectPanel.appendChild(help);
  }
  const toolbar = document.querySelector('.preview-zoom-bar');
  if (toolbar) {
    const zoomControls = document.createElement('div');
    zoomControls.className = 'preview-inline-zoom';
    zoomControls.append(
      toolbar.querySelector('label[for="zoom"]'),
      byId('zoomOutButton'), byId('zoom'), byId('zoomInButton'), byId('zoomVal')
    );
    toolbar.insertBefore(zoomControls, byId('zoomResetButton'));
    scorePanel.insertBefore(byId('zoomResetButton'), scorePanel.querySelector('.direct-edit-card'));
    const sync = toolbar.querySelector('.sync-quick-controls');
    const header = document.querySelector('.workspace-header');
    if (sync && header) header.appendChild(sync);
  }
  const message = byId('message');
  const workspace = document.querySelector('.workspace');
  if (message && workspace) workspace.appendChild(message);
  byId('openExportTab')?.addEventListener('click', () => window.ScoreVisualEditor?.selectTab('export'));
  window.ScoreWorkspaceUi = { syncCards };
})();
