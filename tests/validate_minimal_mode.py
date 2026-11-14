"""Run against the real run.command server; uses the existing short project."""
import json
import os

from playwright.sync_api import sync_playwright


BASE = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
PROJECT = '011dd715320d4cf8b75392440b979e5e'

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(PROJECT)})")
    page.goto(BASE + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length > 0', timeout=90000)
    page.locator('[data-editor-tab="design"]').click()
    page.locator('#languageSelect').select_option('en')
    assert 'Minimal mode' in page.locator('#minimalMode').locator('xpath=..').inner_text()
    page.locator('#languageSelect').select_option('ko')
    before = page.evaluate('window.__scoreVideoDebug.config()')
    page.locator('#minimalMode').check()
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.effects.minimalMode')
    state = page.evaluate('''() => {
      const stage=window.__scoreVideoDebug.getStage();
      const event=stage.follower.noteTriggers.find(note=>note.audio>.3 && note.endAudio-note.audio>.08);
      stage.seek(event.audio+.03);
      const head=stage.follower.activeNodes.find(note=>note.el===event.headEl || note.el===event.el)?.el;
      const piano=stage.piano.canvas,ctx=piano.getContext('2d');
      return {eventTime:event.audio,active:stage.follower.activeNodes.length,
        headActive:Boolean(head?.classList.contains('score-minimal-active')),
        headColor:head?.style.getPropertyValue('--score-minimal-color'),
        glowing:stage.follower.activeNodes.some(note=>note.el.classList.contains('score-glowing')),
        particles:stage.follower.overlay?.childElementCount,
        minimal:stage.settings.effects.minimalMode,
        pianoMinimal:stage.settings.piano.minimalMode,
        sceneMinimal:stage.settings.scene.minimalMode,
        canvasVisible:getComputedStyle(piano).display!=='none',
        palette:stage.follower.colors(),
        saved:JSON.parse(localStorage.getItem('scorevideo_studio_v05_settings')).minimalMode};
    }''')
    assert state['active'] > 0 and state['headActive'] and state['headColor'], state
    assert not state['glowing'] and state['particles'] == 0, state
    assert state['minimal'] and state['pianoMinimal'] and state['sceneMinimal'] and state['canvasVisible'], state
    page.locator('#stageFrame').screenshot(path='/tmp/scorevideo-minimal-preview.png')
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#videoPresetName').fill('Minimal check')
    page.locator('#saveVideoPreset').click()
    saved_preset = page.locator('#videoPresetSelect').input_value()
    assert saved_preset
    page.locator('[data-editor-tab="design"]').click()
    page.locator('#minimalMode').uncheck()
    page.wait_for_function('!window.__scoreVideoDebug.getStage().settings.effects.minimalMode')
    after = page.evaluate('window.__scoreVideoDebug.config()')
    assert before['sparkle'] == after['sparkle'] and before['piano_light'] == after['piano_light']
    assert before['scene'] == after['scene']
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#videoPresetSelect').select_option(saved_preset)
    page.locator('#loadVideoPreset').click()
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.effects.minimalMode')
    page.evaluate('''() => {
      const project='011dd715320d4cf8b75392440b979e5e';
      const key='scorevideo_named_video_presets_v1';
      const items=JSON.parse(localStorage.getItem(key)||'[]');
      items.push({id:'old-minimal-check',name:'Old preset',projectId:project,
        projectName:'Small Morning',settings:{resolution:'1280x720',fps:'30'}});
      localStorage.setItem(key,JSON.stringify(items));
    }''')
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length > 0', timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#videoPresetSelect').select_option('old-minimal-check')
    page.locator('#loadVideoPreset').click()
    page.wait_for_function('!window.__scoreVideoDebug.getStage().settings.effects.minimalMode')
    page.locator('[data-editor-tab="design"]').click()
    assert not page.locator('#minimalMode').is_checked()
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length > 0', timeout=90000)
    assert not page.locator('#minimalMode').is_checked()
    assert not errors, errors
    print(json.dumps({'state':state,'restored_effect_settings':True,'errors':errors}, ensure_ascii=False))
    browser.close()
