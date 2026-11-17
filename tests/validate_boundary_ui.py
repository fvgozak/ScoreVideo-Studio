from pathlib import Path
from playwright.sync_api import sync_playwright
import re, shutil
root=Path(__file__).resolve().parents[1]/'static'
html=(root/'index.html').read_text()
html=re.sub(r'<script[^>]*src=[^>]*></script>', '', html)
html=re.sub(r'<link[^>]*rel="stylesheet"[^>]*>', '', html)
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=shutil.which('chromium'),args=['--no-sandbox'])
  page=browser.new_page()
  errors=[];page.on('pageerror',lambda err:errors.append(str(err)))
  page.set_content(html)
  for css in ('style.css','effects.css','workspace-ui.css'):page.add_style_tag(content=(root/css).read_text())
  for js in ('workspace-ui.js','fx-groups.js'):page.add_script_tag(content=(root/js).read_text())
  page.evaluate('''() => {document.querySelectorAll('.editor-tab-panel').forEach(el=>el.hidden=true);
    document.querySelector('[data-editor-panel="effects"]').hidden=false;}''')
  select=page.locator('#keyboardBoundaryStyle')
  assert select.locator('option').count()==9
  for value in ['none','clean','aurora','resonance','mist','prism','velvet','ripple','electric']:
    select.select_option(value)
    assert select.input_value()==value
    assert page.locator('#keyboardBoundaryStrength').is_disabled()==(value=='none')
    assert page.locator('#keyboardBoundaryReaction').is_disabled()==(value not in ('resonance','ripple','electric'))
  page.evaluate('''() => {document.querySelector('.fx-all-advanced').open=true;
    document.querySelector('.fx-advanced-panel[data-fx-group="keyboard"]').open=true;}''')
  page.locator('#keyboardBoundaryColorMode').select_option('custom')
  assert page.locator('#keyboardBoundaryCustomColor').is_visible()
  assert page.locator('#keyboardBoundarySpeed').is_enabled()
  page.locator('#keyboardBoundaryColorMode').select_option('palette')
  assert page.locator('#keyboardBoundaryCustomColor').is_hidden()
  assert page.locator('.fx-quick-group #keyboardBoundaryStyle').count()==1
  assert page.locator('.fx-all-advanced #keyboardBoundaryThickness').count()==1
  ids=page.evaluate('''() => [...document.querySelectorAll('[id]')].map(e=>e.id)''')
  assert len(ids)==len(set(ids)), 'duplicate IDs'
  assert not errors,errors
  browser.close()
print('PASS boundary FX UI, nine states, no duplicate IDs, advanced color controls')
