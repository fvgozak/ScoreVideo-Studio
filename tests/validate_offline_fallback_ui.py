"""Check production module failure reason, FFmpeg fallback, and retry recovery."""
import json
import os

from playwright.sync_api import sync_playwright


project_id = "011dd715320d4cf8b75392440b979e5e"
url = os.environ.get("SCOREVIDEO_BASE_URL", "http://127.0.0.1:8765").rstrip("/")
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.route("**/static/offline/offline.js?v=2*", lambda route: route.fulfill(
        status=404, body='{"detail":"Not Found"}', content_type="application/json"))
    page.goto(url + "/", wait_until="domcontentloaded")
    page.wait_for_function("window.__scoreVideoDebug?.getStage()?.follower != null", timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator("#resolution").select_option("1280x720")
    page.wait_for_function("document.querySelector('input[value=offline]').disabled", timeout=30000)
    reason = page.locator("#offlineSupportText").inner_text()
    assert "HTTP 404" in reason and "application/json" in reason, reason
    assert page.locator('input[value="legacy"]').is_checked()
    page.unroute("**/static/offline/offline.js?v=2*")
    page.locator("#retryOfflineSupport").click()
    page.wait_for_function("!document.querySelector('input[value=offline]').disabled", timeout=30000)
    page.locator('input[value="offline"]').check()
    recovered = page.locator('input[value="offline"]').is_checked()
    page.evaluate("""() => {const input=document.getElementById('drawScore');
      input.checked=true;input.dispatchEvent(new Event('change',{bubbles:true}));}""")
    page.wait_for_function("document.querySelector('input[value=offline]').disabled", timeout=30000)
    draw_score_reason = page.locator("#offlineSupportText").inner_text()
    assert "drawScore" in draw_score_reason, draw_score_reason
    result = {"failure_reason": reason, "recovered": recovered,
              "draw_score_reason": draw_score_reason}
    browser.close()
assert result["recovered"]
print(json.dumps(result, ensure_ascii=False))
