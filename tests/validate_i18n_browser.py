"""Offline Playwright smoke test for the UI language switch.

Run: python tests/validate_i18n_browser.py
Requires Playwright and a Chromium executable. Does not run app.py or touch projects.
"""
import json
import os
import re
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parents[1] / 'static'
BROWSER = os.environ.get('CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('google-chrome')
if not BROWSER:
    raise SystemExit('Chromium not found; set CHROMIUM_EXECUTABLE')
html = (BASE / 'index.html').read_text()
html = re.sub(r'<script\s+src="[^"]+"\s*>\s*</script>', '', html)
html = html.replace('<head>', '<head><base href="http://scorevideo.local/">', 1)
packs = {code: json.loads((BASE / 'locales' / f'{code}.json').read_text()) for code in ('ko', 'en')}
with sync_playwright() as browser:
    chromium = browser.chromium.launch(headless=True, executable_path=BROWSER, args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = chromium.new_page()
    errors = []
    page.on('pageerror', lambda exc: errors.append(str(exc)))
    page.set_content(html)
    # Simulate the same-origin JSON responses without running the server.
    page.evaluate("""packs => {window.fetch = async url => {
       const lang = new URL(url).pathname.split('/').pop().slice(0,2);
       return new Response(JSON.stringify(packs[lang]), {status:200,headers:{'Content-Type':'application/json'}});
    };}""", packs)
    page.add_script_tag(content=(BASE / 'i18n.js').read_text())
    page.wait_for_function('ScoreI18n.loaded')
    assert page.evaluate('ScoreI18n.t("export.progress",{percent:50})') == '렌더링 중... 50%'
    page.locator('#languageSelect').select_option('en')
    page.wait_for_function('document.querySelector("label[for=scoreCropTop]").textContent.includes("Crop top")')
    assert page.locator('html').get_attribute('lang') == 'en'
    assert page.evaluate('ScoreI18n.t("export.progress",{percent:50})') == 'Rendering... 50%'
    assert page.locator('#projectTitle').inner_text() == 'Score preview'
    assert page.locator('#compactScoreTopButton').get_attribute('title') == 'Reduce the score area’s top gap to 4%'
    page.evaluate("document.querySelector('#message').textContent = '렌더링 취소 중...'")
    page.wait_for_function('document.querySelector("#message").textContent === "Canceling rendering..."')
    page.evaluate("""() => {
        const projectTitle = document.querySelector('#projectTitle');
        projectTitle.setAttribute('data-i18n-ignore','');
        projectTitle.textContent='악보';  // User-authored project name; not a UI string.
        document.querySelector('#osmdContainer').innerHTML='<svg><text>악보</text></svg>';
    }""")
    page.locator('#languageSelect').select_option('ko')
    page.wait_for_function('document.querySelector("#message").textContent === "렌더링 취소 중..."')
    assert page.locator('#projectTitle').inner_text() == '악보'
    page.locator('#languageSelect').select_option('en')
    page.wait_for_function('document.querySelector("#message").textContent === "Canceling rendering..."')
    assert page.locator('#projectTitle').inner_text() == '악보'
    assert page.locator('#osmdContainer text').text_content() == '악보'
    remaining = page.evaluate("""() => {
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const out=[];
        while(walker.nextNode()){
            const el=walker.currentNode.parentElement, s=walker.currentNode.nodeValue.trim();
            if(/[가-힣]/.test(s) && !el.closest('script,style,svg,#osmdContainer,[data-i18n-ignore]') && s!=='한국어')out.push(s);
        }
        return out;
    }""")
    assert not remaining, f'Untranslated UI text: {remaining}'
    assert not errors, f'Page errors: {errors}'
    print('i18n browser OK: ko ↔ en, static/attribute/dynamic UI, musical SVG and project title preserved')
    chromium.close()
