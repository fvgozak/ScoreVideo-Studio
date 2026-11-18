"""Audit remaining Hangul in a Japanese-only mock DOM without changing app state."""
import json, re, os, shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
R=Path(__file__).resolve().parents[1]/'static'
html=(R/'index.html').read_text()
html=re.sub(r'<script\s+src="[^"]+"\s*>\s*</script>','',html)
html=html.replace('<head>','<head><base href="http://scorevideo.local/">',1)
packs={lang:json.loads((R/'locales'/f'{lang}.json').read_text()) for lang in ('ko','en','ja')}
with sync_playwright() as playwright:
  browser=playwright.chromium.launch(headless=True,executable_path=shutil.which('chromium') or None,args=['--no-sandbox'])
  page=browser.new_page()
  page.set_content(html)
  page.evaluate("""packs => {window.fetch = async url => {const lang = new URL(url).pathname.split('/').pop().slice(0,2);
     return new Response(JSON.stringify(packs[lang]), {status:200,headers:{'Content-Type':'application/json'}});};}""",packs)
  page.add_script_tag(content=(R/'i18n.js').read_text())
  page.wait_for_function('ScoreI18n.loaded')
  page.locator('#languageSelect').select_option('ja')
  page.wait_for_function('document.documentElement.lang === "ja" && document.querySelector("label[for=scoreCropTop]").textContent.includes("楽譜の上部")')
  raw=page.evaluate("""() => {const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const found=[];
    while(walker.nextNode()){const el=walker.currentNode.parentElement,s=walker.currentNode.nodeValue.trim();
      if(!/[가-힣]/.test(s)||el.closest('script,style,svg,#osmdContainer,#projectTitle,#languageSelect,[data-i18n-ignore]'))continue;
      found.push(s);
    }return [...new Set(found)];}""")
  print(json.dumps({'remainingHangul':len(raw),'examples':raw[:60]},ensure_ascii=False,indent=2))
  browser.close()
