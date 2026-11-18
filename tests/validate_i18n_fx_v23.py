"""Regression: export dynamic messages + v21 FX menus translated in ko/en/ja."""
import json,re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]/'static'
html=(root/'index.html').read_text()
html=re.sub(r'<script[^>]*src=[^>]*></script>','',html)
html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>','',html)
html=html.replace('<head>','<head><base href="http://scorevideo.local/">',1)
packs={x:json.loads((root/'locales'/f'{x}.json').read_text()) for x in ('ko','en','ja')}
with sync_playwright() as pw:
 exe=shutil.which('chromium') or shutil.which('chromium-browser')
 browser=pw.chromium.launch(headless=True, executable_path=exe, args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page()
 errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
 page.set_content(html)
 page.evaluate('''packs => {window.fetch = async url => {
  const lang = new URL(url).pathname.split('/').pop().slice(0,2);
  return new Response(JSON.stringify(packs[lang]), {status:200,headers:{'Content-Type':'application/json'}});
 };}''',packs)
 page.add_script_tag(content=(root/'i18n.js').read_text())
 page.wait_for_function('ScoreI18n.loaded')
 page.add_script_tag(content=(root/'workspace-ui.js').read_text())
 page.add_script_tag(content=(root/'fx-groups.js').read_text())
 assert page.locator("#scoreColorPreset option[value=glacier]").count()==1
 test_text='렌더링 취소 요청에 실패했습니다: test error'
 assert page.evaluate('(s)=>ScoreI18n.translate(s)',test_text)==test_text
 assert page.evaluate('ScoreI18n.translate("완료: 14 / 20")')=='완료: 14 / 20'
 page.locator('#languageSelect').select_option('ja')
 page.wait_for_function('document.querySelector("#scoreColorPreset optgroup")?.label === "基本カラー"')
 assert page.locator('#scoreColorPreset optgroup').evaluate_all('(els)=>els.slice(0,3).map(el=>el.label)')==['基本カラー','自然と風景','時間と季節']
 assert page.locator('#keyboardColorPreset optgroup').evaluate_all('(els)=>els.map(el=>el.label)')==['基本カラー','自然と風景','時間と季節']
 # Newly inserted optgroups must also receive the selected locale.
 page.evaluate('''() => {const el=document.createElement('optgroup');el.label='자연과 풍경';el.id='newDynamicGroup';document.querySelector('#scoreColorPreset').append(el);}''')
 page.wait_for_function('document.querySelector("#newDynamicGroup")?.label === "自然と風景"')
 page.wait_for_function('document.querySelector("#scoreColorPreset option[value=glacier]").textContent.includes("氷河")')
 assert page.locator('.fx-quick-group[data-fx-group=score] h3').inner_text()=='楽譜エフェクト'
 assert page.locator('label[for=scoreColorPreset]').inner_text()=='光の色'
 assert page.locator('#scoreColorPreset option[value=space]').inner_text().startswith('宇宙')
 assert page.locator('#keyboardNoteBarMode option[value=rise]').inner_text().startswith('打鍵後')
 assert page.locator('#keyboardVelocityColor').locator('xpath=..').inner_text().find('ベロシティ')>=0
 assert '弱い音' in page.locator('.fx-color-preview').first.get_attribute('title')
 page.locator('#languageSelect').select_option('en')
 page.wait_for_function('document.querySelector("#scoreColorPreset optgroup")?.label === "Basic colors"')
 assert page.locator('#scoreColorPreset optgroup').evaluate_all('(els)=>els.slice(0,3).map(el=>el.label)')==['Basic colors','Nature & landscapes','Time & seasons']
 assert page.locator('#newDynamicGroup').get_attribute('label')=='Nature & landscapes'
 page.wait_for_function('document.querySelector("#scoreColorPreset option[value=glacier]").textContent.includes("Glacier")')
 assert page.locator('label[for=scoreColorPreset]').inner_text()=='Light colors'
 assert page.locator('label[for=keyboardNoteBarMode]').inner_text()=='Note bar animation'
 page.locator('#languageSelect').select_option('ko')
 page.wait_for_function('document.querySelector("#scoreColorPreset optgroup")?.label === "기본 색상"')
 assert page.locator('#scoreColorPreset optgroup').evaluate_all('(els)=>els.slice(0,3).map(el=>el.label)')==['기본 색상','자연과 풍경','시간과 계절']
 assert page.locator('#newDynamicGroup').get_attribute('label')=='자연과 풍경'
 page.wait_for_function('document.querySelector("#scoreColorPreset option[value=glacier]").textContent.includes("빙하")')
 assert page.evaluate('ScoreI18n.translate("완료: 14 / 20")')=='완료: 14 / 20'
 assert not errors,errors
 browser.close()
print('v23.1 i18n FX regression OK: dynamic export, score/keyboard FX options, ko-en-ja switch')
