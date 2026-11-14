"""Manual local integration check: python tests/validate_offline_export_ui.py 30|60.

Uses the existing 9.98-second Small Morning project, never Dream Journey.
The local ScoreVideo server must be running on SCOREVIDEO_BASE_URL (default :8766).
"""
import json
import os
from pathlib import Path
import subprocess
import sys

from playwright.sync_api import sync_playwright


fps = int(sys.argv[1])
assert fps in (30, 60)
project_id = "011dd715320d4cf8b75392440b979e5e"
url = os.environ.get("SCOREVIDEO_BASE_URL", "http://127.0.0.1:8766").rstrip("/")
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--autoplay-policy=no-user-gesture-required"])
    page = browser.new_page(accept_downloads=True)
    errors = []
    console_errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.goto(url + "/", wait_until="domcontentloaded")
    page.wait_for_function("window.__scoreVideoDebug?.getStage()?.follower != null", timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator("#resolution").select_option("1280x720")
    page.locator("#fps").select_option(str(fps))
    page.wait_for_function("""() => document.querySelector('input[value="offline"]').checked &&
        !document.querySelector('input[value="offline"]').disabled""", timeout=30000)
    with page.expect_download(timeout=180000) as download_event:
        page.locator("#exportButton").click()
    download = download_event.value
    target = Path(f"/tmp/scorevideo-service-offline-720p{fps}.mp4")
    download.save_as(target)
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=30000)
    page.locator('[data-editor-tab="export"]').click()
    with page.expect_download(timeout=30000) as manual_event:
        page.locator("#downloadLink").click()
    manual = manual_event.value
    manual_target = Path(f"/tmp/scorevideo-service-offline-720p{fps}-manual.mp4")
    manual.save_as(manual_target)
    page.wait_for_function("""async () => {
      const response=await fetch('/api/projects/011dd715320d4cf8b75392440b979e5e/render-diagnostics');
      return response.ok&&(await response.json()).engine==='webcodecs';
    }""", timeout=30000)
    state = page.evaluate("""async () => {
      const temps=[];for await(const [name] of await navigator.storage.getDirectory())
        if(name.startsWith('scorevideo-offline-'))temps.push(name);
      return {temps,mode:document.querySelector('input[name="exportMode"]:checked').value,
        filename:document.getElementById('downloadLink').download,
        message:document.getElementById('message').textContent,
        locked:document.body.classList.contains('render-ui-active')};
    }""")
    if fps == 30:
        with page.expect_download(timeout=180000) as repeat_event:
            page.locator("#exportButton").click()
        repeat_target = Path("/tmp/scorevideo-service-offline-720p30-repeat.mp4")
        repeat_event.value.save_as(repeat_target)
        page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=30000)
        state["temps_after_repeat"] = page.evaluate("""async () => {
          const names=[];for await(const [name] of await navigator.storage.getDirectory())
            if(name.startsWith('scorevideo-offline-'))names.push(name);return names;
        }""")
        assert repeat_target.stat().st_size > 4096
    page.evaluate("window.ScoreOfflineExport.release()")
    state["temps_after_release"] = page.evaluate("""async () => {
      const names=[];for await(const [name] of await navigator.storage.getDirectory())
        if(name.startsWith('scorevideo-offline-'))names.push(name);return names;
    }""")
    diagnostics = page.evaluate(f"""async () => (await fetch('{url}/api/projects/{project_id}/render-diagnostics')).json()""")
    browser.close()
assert not errors, errors
assert not console_errors, console_errors
assert state["mode"] == "offline" and not state["locked"] and len(state["temps"]) == 1 and not state["temps_after_release"], state
if fps == 30:
    assert len(state["temps_after_repeat"]) == 1 and state["temps_after_repeat"] != state["temps"], state
assert target.stat().st_size == manual_target.stat().st_size > 4096
probe = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-show_entries",
    "stream=codec_name,codec_type,width,height,avg_frame_rate,nb_frames,duration",
    "-of", "json", str(target)], text=True))
print(json.dumps({"fps": fps, "file": str(target), "bytes": target.stat().st_size,
                  "state": state, "streams": probe["streams"],
                  "diagnostic_engine": diagnostics.get("engine"),
                  "diagnostic_frames": diagnostics.get("frames"),
                  "console_errors": console_errors}, ensure_ascii=False))
