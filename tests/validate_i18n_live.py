"""Check JSON language packs in the real ScoreVideo app served by run.command."""
import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
project = '011dd715320d4cf8b75392440b979e5e'
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project)});")
    page.goto(base + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.ScoreI18n?.loaded && window.__scoreVideoDebug?.getStage()?.follower', timeout=90000)
    original_title = page.locator('#projectTitle').inner_text()
    page.locator('#languageSelect').select_option('en')
    page.wait_for_function('document.querySelector("label[for=scoreCropTop]").textContent.includes("Crop top")')
    assert page.locator('html').get_attribute('lang') == 'en'
    assert page.locator('#projectTitle').inner_text() == original_title
    page.locator('#languageSelect').select_option('ja')
    page.wait_for_function('document.querySelector("label[for=scoreCropTop]").textContent.includes("楽譜の上部")')
    assert page.locator('#projectTitle').inner_text() == original_title
    page.locator('#languageSelect').select_option('ko')
    page.wait_for_function('document.querySelector("label[for=scoreCropTop]").textContent.includes("악보 상단 자르기")')
    assert page.locator('#projectTitle').inner_text() == original_title
    assert not errors, errors
    print(json.dumps({'ko_en_ja_switch': 'passed', 'project_title_preserved': original_title,
                      'page_errors': errors}, ensure_ascii=False))
    browser.close()
