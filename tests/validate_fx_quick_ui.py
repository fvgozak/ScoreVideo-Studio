"""Check the FX panel progressive-disclosure UI without requiring a running server.

Run: python tests/validate_fx_quick_ui.py
"""
from pathlib import Path
import re
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / 'static'
html = (ROOT / 'index.html').read_text()
html = re.sub(r'<script[^>]*src=[^>]*></script>', '', html)
html = re.sub(r'<link[^>]*rel="stylesheet"[^>]*>', '', html)
with sync_playwright() as playwright:
    system_chromium = shutil.which('chromium') or shutil.which('chromium-browser')
    browser = playwright.chromium.launch(headless=True, **({'executable_path': system_chromium, 'args': ['--no-sandbox']} if system_chromium else {}))
    page = browser.new_page(viewport={"width": 1100, "height": 1050})
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.set_content(html)
    for css in ('style.css', 'effects.css', 'workspace-ui.css'):
        page.add_style_tag(content=(ROOT / css).read_text())
    for js in ('workspace-ui.js', 'fx-groups.js'):
        page.add_script_tag(content=(ROOT / js).read_text())
    page.evaluate('''() => {
      document.querySelectorAll('.editor-tab-panel').forEach(el => el.hidden=true);
      document.querySelector('[data-editor-panel="effects"]').hidden=false;
    }''')
    assert not errors, errors
    assert page.locator('.fx-quick-group').count() == 2
    assert page.locator('.fx-all-advanced').count() == 1
    assert page.locator('.fx-all-advanced').get_attribute('open') is None
    ids = page.evaluate('''() => [...document.querySelectorAll('[id]')].map(el=>el.id)''')
    assert len(ids) == len(set(ids)), 'duplicate input ID'
    for id in ('fxMode', 'gpuParticleCount', 'keyboardLightingMode', 'keyboardVelocityScale'):
        assert page.locator(f'.fx-all-advanced #{id}').count() == 1, id
    for id in ('scoreImpactEnabled', 'scoreImpactStrength', 'pianoLight', 'pianoLightStrength', 'keyboardVelocityColor'):
        assert page.locator(f'.fx-quick-group #{id}').count() == 1, id
    for kind in ('score', 'keyboard'):
        group = page.locator(f'.fx-quick-group[data-fx-group="{kind}"]')
        assert group.locator('.fx-custom-colors').is_hidden()
        page.locator(f'#{kind}ColorPreset').select_option('custom')
        assert group.locator('.fx-custom-colors').is_visible()
    page.locator('#keyboardColorPreset').select_option('aurora')
    page.locator('#keyboardVelocityColor').uncheck()
    assert page.locator('#keyboardColorPreset').input_value() == 'aurora'
    page.locator('#keyboardVelocityColor').check()
    assert page.locator('#keyboardColorPreset').input_value() == 'aurora'
    page.locator('#scoreFxPreset').select_option('shimmer')
    assert page.locator('#sparkle').is_checked()
    page.locator('#keyboardFxPreset').select_option('burst')
    assert page.locator('#keyboardParticleDensity').input_value() == '2.6'
    # Every persisted FX field remains inside an .fx-group, including advanced controls.
    for id in ('scoreFxPreset','auroraLow','keyboardColorLow','keyboardLightingMode','gpuParticleCount'):
        assert page.locator(f'#{id}').evaluate('e=>Boolean(e.closest(".fx-group"))'), id
    assert not errors, errors
    browser.close()
print('PASS: FX quick panel structure, presets, custom colors, and control IDs')
