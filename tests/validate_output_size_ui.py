"""Browser check of split controls, old settings/presets, and stage sizing."""
import json
import os

from playwright.sync_api import sync_playwright

url = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
project_id = '011dd715320d4cf8b75392440b979e5e'
old_preset = {'id':'legacy-wide','name':'Old wide','projectId':project_id,'projectName':'Small Morning',
              'settings':{'resolution':'2560x1080','fps':'30'}}
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script("localStorage.setItem('scorevideo_last_project'," + json.dumps(project_id) + ");"
      + "if(!localStorage.getItem('scorevideo_studio_v05_settings'))localStorage.setItem('scorevideo_studio_v05_settings'," + json.dumps(json.dumps({'resolution':'2560x1080','fps':'30'})) + ");"
      + "if(!localStorage.getItem('scorevideo_named_video_presets_v1'))localStorage.setItem('scorevideo_named_video_presets_v1'," + json.dumps(json.dumps([old_preset])) + ");")
    page.goto(url+'/',wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower != null',timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    assert page.locator('#aspectRatio').input_value() == '21:9'
    assert page.locator('#outputQuality').input_value() == '1080'
    assert page.locator('#resolution').input_value() == '2560x1080'
    assert '이전 2560×1080 유지' in page.locator('#actualOutputSize').inner_text()
    assert page.locator('#convertExactWide').is_visible()
    page.locator('#convertExactWide').click()
    assert page.locator('#resolution').input_value() == '2520x1080'
    page.locator('#videoPresetSelect').select_option('legacy-wide')
    page.locator('#loadVideoPreset').click()
    assert page.locator('#resolution').input_value() == '2560x1080'
    page.locator('#outputQuality').select_option('720')
    assert page.locator('#resolution').input_value() == '1680x720'
    page.locator('#outputQuality').select_option('1080')
    assert page.locator('#resolution').input_value() == '2520x1080'
    page.locator('#aspectRatio').select_option('9:16')
    assert page.locator('#resolution').input_value() == '1080x1920'
    page.locator('#outputQuality').select_option('720')
    assert page.locator('#resolution').input_value() == '720x1280'
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.width===720 && window.__scoreVideoDebug.getStage().settings.height===1280')
    assert page.evaluate('window.__scoreVideoDebug.config().width') == 720
    page.locator('#stageFrame').screenshot(path='/tmp/scorevideo-portrait-720-preview.png')
    page.locator('#aspectRatio').select_option('1:1')
    assert page.locator('#resolution').input_value() == '720x720'
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.width===720 && window.__scoreVideoDebug.getStage().settings.height===720')
    page.locator('#stageFrame').screenshot(path='/tmp/scorevideo-square-720-preview.png')
    page.locator('#videoPresetName').fill('New square')
    page.locator('#saveVideoPreset').click()
    assert page.locator('#videoPresetSelect').input_value() != 'legacy-wide'
    page.locator('#videoPresetSelect').select_option('legacy-wide')
    page.locator('#loadVideoPreset').click()
    assert page.locator('#resolution').input_value() == '2560x1080'
    assert page.locator('#aspectRatio').input_value() == '21:9'
    page.reload(wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower != null',timeout=90000)
    assert page.locator('#resolution').input_value() == '2560x1080'
    page.locator('[data-editor-tab="export"]').click()
    options=page.locator('#videoPresetSelect option').all_text_contents()
    assert any('New square' in label for label in options), options
    new_id=page.locator('#videoPresetSelect option').filter(has_text='New square').get_attribute('value')
    assert new_id
    page.locator('#videoPresetSelect').select_option(new_id)
    page.locator('#loadVideoPreset').click()
    assert page.locator('#aspectRatio').input_value() == '1:1'
    assert page.locator('#outputQuality').input_value() == '720'
    assert page.locator('#resolution').input_value() == '720x720'
    assert not errors, errors
    print(json.dumps({'legacy_2560_preserved':True,'canonical_21x9':'2520x1080',
                      'portrait':'720x1280','square':'720x720','preset_reload':True,
                      'browser_errors':errors},ensure_ascii=False))
    browser.close()
