"""ScoreMotion v21: test light-color theme palettes in real FX controls."""
from pathlib import Path
import re
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'static'
html = (ROOT / 'index.html').read_text()
html = re.sub(r'<script[^>]*src=[^>]*></script>', '', html)
html = re.sub(r'<link[^>]*rel="stylesheet"[^>]*>', '', html)
with sync_playwright() as playwright:
    exe = shutil.which('chromium') or shutil.which('chromium-browser')
    browser = playwright.chromium.launch(headless=True, **(
        {'executable_path': exe, 'args': ['--no-sandbox']} if exe else {}))
    page = browser.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html)
    page.add_script_tag(content=(ROOT / 'workspace-ui.js').read_text())
    page.add_script_tag(content=(ROOT / 'fx-groups.js').read_text())
    page.evaluate("""() => {document.querySelectorAll('.editor-tab-panel').forEach(el=>el.hidden=true);document.querySelector('[data-editor-panel=\"effects\"]').hidden=false;}""")
    assert not errors, errors
    all_presets = page.evaluate('window.ScoreFxGroups.lightPalettes')
    mandatory = ['space', 'forest', 'wood', 'ocean', 'sky']
    assert all(key in all_presets for key in mandatory)
    assert len(all_presets) >= 12
    assert all(len(pair) == 2 and all(re.fullmatch(r'#[0-9a-f]{6}', x) for x in pair)
               and pair[0] != pair[1] for pair in all_presets.values())
    assert set(all_presets).issubset(set(page.locator('#scoreColorPreset option').evaluate_all('els=>els.map(e=>e.value)')))
    assert set(all_presets).issubset(set(page.locator('#keyboardColorPreset option').evaluate_all('els=>els.map(e=>e.value)')))
    # Styles, backgrounds, and note bars never change when the light palette changes.
    initial = page.evaluate('''() => ({style:document.getElementById('scoreFxPreset').value,
      keyboardStyle:document.getElementById('keyboardFxPreset').value,
      background:document.getElementById('backgroundOpacity').value,
      bars:document.getElementById('keyboardNoteBarMode').value})''')
    page.locator('#keyboardColorPreset').select_option('linked')
    assert page.locator('#keyboardPaletteLink').is_checked()
    for key, pair in all_presets.items():
        page.locator('#scoreColorPreset').select_option(key)
        assert page.locator('#auroraLow').input_value() == pair[0]
        assert page.locator('#auroraHigh').input_value() == pair[1]
        assert page.locator('#glowColor').input_value() == pair[1]
        assert page.locator('#lightColorMode').input_value() == 'aurora'
        assert page.locator('#keyboardColorLow').input_value() == pair[0]
        assert page.locator('#keyboardColorHigh').input_value() == pair[1]
        info = page.locator('[data-fx-group="score"] .fx-color-preview').get_attribute('title')
        assert pair[0] in info and pair[1] in info
    # Keyboard color can be independent, without mutating the score palette.
    page.locator('#keyboardColorPreset').select_option('ocean')
    assert not page.locator('#keyboardPaletteLink').is_checked()
    assert page.locator('#keyboardColorLow').input_value() == all_presets['ocean'][0]
    page.locator('#scoreColorPreset').select_option('space')
    assert page.locator('#keyboardColorLow').input_value() == all_presets['ocean'][0]
    # A manual keyboard color edit detaches the link rather than being overwritten.
    page.locator('#keyboardColorPreset').select_option('linked')
    page.locator('#keyboardColorLow').evaluate('''el=>{
       el.value='#123456';el.dispatchEvent(new Event('input',{bubbles:true}));
    }''')
    assert page.locator('#keyboardColorPreset').input_value() == 'custom'
    assert not page.locator('#keyboardPaletteLink').is_checked()
    assert page.locator('#keyboardColorLow').input_value() == '#123456'
    # Existing combinations remain supported.
    page.locator('#keyboardColorPreset').select_option('aurora')
    assert page.locator('#keyboardColorLow').input_value() == all_presets['aurora'][0]
    result = page.evaluate('''() => ({style:document.getElementById('scoreFxPreset').value,
      keyboardStyle:document.getElementById('keyboardFxPreset').value,
      background:document.getElementById('backgroundOpacity').value,
      bars:document.getElementById('keyboardNoteBarMode').value})''')
    assert initial == result, (initial, result)
    assert not errors, errors
    browser.close()
print('PASS v21: 15 nature/sky/light presets, independent/linked color, manual override, unchanged FX and note bars')
