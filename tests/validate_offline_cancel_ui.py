"""Manual local check of cancel/retry through the production export UI."""
import json
import os
from pathlib import Path

from playwright.sync_api import sync_playwright


project_id = "011dd715320d4cf8b75392440b979e5e"
url = os.environ.get("SCOREVIDEO_BASE_URL", "http://127.0.0.1:8766").rstrip("/")
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(accept_downloads=True)
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.goto(url + "/", wait_until="domcontentloaded")
    page.wait_for_function("window.__scoreVideoDebug?.getStage()?.follower != null", timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator("#resolution").select_option("1280x720")
    page.locator("#fps").select_option("30")
    page.wait_for_function("""() => document.querySelector('input[value="offline"]').checked &&
        !document.querySelector('input[value="offline"]').disabled""")
    original = page.evaluate("window.__scoreVideoDebug.config()")
    page.locator("#exportButton").click()
    page.locator("#cancelRenderButton").click()
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=60000)
    early = page.evaluate("""async () => {
      const temps=[];for await(const [name] of await navigator.storage.getDirectory())
        if(name.startsWith('scorevideo-offline-'))temps.push(name);
      return {temps,result:!!window.__offlineResult,progress:window.__offlineProgress};
    }""")
    assert not early["temps"] and not early["result"] and early["progress"] is None
    page.locator('[data-editor-tab="export"]').click()
    page.locator("#exportButton").click()
    page.wait_for_function("window.__offlineProgress?.completed >= 1", timeout=60000)
    page.locator("#cancelRenderButton").click()
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=60000)
    cancelled = page.evaluate("""async () => {
      const temps=[];for await(const [name] of await navigator.storage.getDirectory())
        if(name.startsWith('scorevideo-offline-'))temps.push(name);
      return {temps,result:!!window.__offlineResult,progress:window.__offlineProgress,
        project:window.__scoreVideoDebug.getStage().meta.id,
        config:window.__scoreVideoDebug.config(),
        message:document.getElementById('message').textContent};
    }""")
    assert not cancelled["temps"] and not cancelled["result"] and cancelled["progress"] is None
    assert cancelled["project"] == project_id and cancelled["config"] == original
    page.locator('[data-editor-tab="export"]').click()
    with page.expect_download(timeout=180000) as download_event:
        page.locator("#exportButton").click()
    target = Path("/tmp/scorevideo-service-offline-after-cancel.mp4")
    download_event.value.save_as(target)
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=30000)
    page.evaluate("window.ScoreOfflineExport.release()")
    browser.close()
assert target.stat().st_size > 4096
print(json.dumps({"early_cancel": early,
                  "cancelled": {key: value for key, value in cancelled.items() if key != "config"},
                  "retry_bytes": target.stat().st_size}, ensure_ascii=False))
