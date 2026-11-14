"""Manual local check of the FFmpeg fallback after browser MP4 integration."""
import json
import os
from pathlib import Path
import subprocess

from playwright.sync_api import sync_playwright


project_id = "011dd715320d4cf8b75392440b979e5e"
url = os.environ.get("SCOREVIDEO_BASE_URL", "http://127.0.0.1:8766").rstrip("/")
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    page = browser.new_page(accept_downloads=True)
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.goto(url + "/", wait_until="domcontentloaded")
    page.wait_for_function("window.__scoreVideoDebug?.getStage()?.follower != null", timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator("#resolution").select_option("1280x720")
    page.locator("#fps").select_option("30")
    page.locator('input[name="exportMode"][value="legacy"]').check()
    with page.expect_download(timeout=240000) as download_event:
        page.locator("#exportButton").click()
    download = download_event.value
    target = Path("/tmp/scorevideo-service-legacy-720p30.mp4")
    download.save_as(target)
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=30000)
    report = page.evaluate(f"""async () => (await fetch('{url}/api/projects/{project_id}/render-diagnostics')).json()""")
    state = page.evaluate("""() => ({mode:document.querySelector('input[name="exportMode"]:checked').value,
      locked:document.body.classList.contains('render-ui-active'),message:document.getElementById('message').textContent})""")
    browser.close()
probe = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_entries", "stream=codec_name,codec_type,nb_frames",
    "-of", "json", str(target)], text=True))
assert state["mode"] == "legacy" and not state["locked"] and target.stat().st_size > 4096
assert report["engine"] == "ffmpeg"
print(json.dumps({"state": state, "bytes": target.stat().st_size,
                  "diagnostic_engine": report["engine"], "streams": probe["streams"]}, ensure_ascii=False))
