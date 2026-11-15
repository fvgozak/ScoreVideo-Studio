"""Capture the same real-app piano frame with and without the shared cache."""
import json
import os
from playwright.sync_api import sync_playwright

base = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
project = '25686521bdd845809347d6670c54ee7d'
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width': 1600, 'height': 1000})
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project)})")
    page.goto(base + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.piano?.notes?.length > 1000', timeout=90000)
    for enabled, name in [(False, 'baseline'), (True, 'cached')]:
        page.evaluate('''enabled => {const stage=window.__scoreVideoDebug.getStage();
          stage.piano.shadowCache.enabled=enabled;stage.piano.shadowCache.clear();stage.seek(105.04);
        }''', enabled)
        page.locator('.piano-fall-canvas').screenshot(path=f'/tmp/scorevideo-shadow-{name}.png')
    browser.close()
print('/tmp/scorevideo-shadow-baseline.png /tmp/scorevideo-shadow-cached.png')
