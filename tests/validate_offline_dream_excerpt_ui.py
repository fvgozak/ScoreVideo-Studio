"""Manual 3-second integration excerpt with Dream Journey's real rich scene.

The test overrides duration only in its Playwright page; it does not rerender
the whole song or persist test settings/diagnostics to the project.
"""
import json
import os
from pathlib import Path
import subprocess

from playwright.sync_api import sync_playwright


project_id = "06e86ec0153a4b8c9eac09f53ba403c9"
url = os.environ.get("SCOREVIDEO_BASE_URL", "http://127.0.0.1:8766").rstrip("/")
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1800, "height": 1200}, accept_downloads=True)
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.route("**/render-diagnostics", lambda route: route.fulfill(status=200, body='{"saved":true}')
               if route.request.method == "POST" else route.continue_())
    page.goto(url + "/", wait_until="domcontentloaded")
    page.wait_for_function("window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length > 1000", timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator("#resolution").select_option("1280x720")
    page.locator("#fps").select_option("30")
    page.wait_for_function("""() => document.querySelector('input[value=offline]').checked &&
        !document.querySelector('input[value=offline]').disabled""")
    page.evaluate("""async () => {
      await import('/static/offline/offline.js');
      const api=window.ScoreOfflinePrototype,original=api.run.bind(api);
      api.run=(mode,options)=>original(mode,{...options,fullSong:false,seconds:3});
    }""")
    with page.expect_download(timeout=180000) as download_event:
        page.locator("#exportButton").click()
    target = Path("/tmp/scorevideo-service-dream-3sec.mp4")
    download_event.value.save_as(target)
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=30000)
    page.evaluate("window.ScoreOfflineExport.release()")
    page.evaluate("window.__scoreVideoDebug.getStage().seek(2)")
    page.locator("#scoreViewport").screenshot(path="/tmp/scorevideo-service-dream-preview-2sec.png")
    browser.close()
probe = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_entries", "stream=codec_name,codec_type,nb_frames",
    "-of", "json", str(target)], text=True))
assert probe["streams"][0]["nb_frames"] == "90"
assert {stream["codec_name"] for stream in probe["streams"]} == {"h264", "aac"}
subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", "2", "-i", str(target),
                "-frames:v", "1", "-y", "/tmp/scorevideo-service-dream-mp4-2sec.png"], check=True)
print(json.dumps({"file": str(target), "bytes": target.stat().st_size,
                  "streams": probe["streams"],
                  "preview": "/tmp/scorevideo-service-dream-preview-2sec.png",
                  "video_frame": "/tmp/scorevideo-service-dream-mp4-2sec.png"}))
