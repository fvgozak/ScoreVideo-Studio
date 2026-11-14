"""Exercise production MP4 engine choice, cancellation, and retry on run.command."""
import json
import os

from playwright.sync_api import sync_playwright


url = os.environ.get("SCOREVIDEO_BASE_URL", "http://127.0.0.1:8765").rstrip("/")
project_id = "011dd715320d4cf8b75392440b979e5e"
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(accept_downloads=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.goto(url + "/", wait_until="domcontentloaded")
    page.wait_for_function("window.__scoreVideoDebug?.getStage()?.follower != null", timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator("#resolution").select_option("1280x720")
    page.locator("#fps").select_option("30")
    page.wait_for_function("!document.querySelector('input[value=offline]').disabled && !document.querySelector('#exportButton').disabled")
    for mode in ("legacy", "offline", "legacy", "offline"):
        page.locator(f'input[name="exportMode"][value="{mode}"]').check()
        assert ("WebCodecs" if mode == "offline" else "FFmpeg") in page.locator("#selectedEngineSummary").inner_text()

    page.locator("#resolution").select_option("1920x1080")
    page.wait_for_function("!document.querySelector('input[value=offline]').disabled", timeout=30000)
    page.locator('input[value="offline"]').check()
    assert "미검증" in page.locator("#offlineSupportText").inner_text()
    page.locator("#fps").select_option("60")
    page.wait_for_function("document.querySelector('input[value=offline]').disabled", timeout=30000)
    assert "검증 범위 밖" in page.locator("#offlineSupportText").inner_text()
    page.locator("#resolution").select_option("1280x720")
    page.locator("#fps").select_option("30")
    page.wait_for_function("!document.querySelector('input[value=offline]').disabled", timeout=30000)

    page.locator('input[value="legacy"]').check()
    page.locator("#exportButton").click()
    page.locator("#cancelRenderButton").wait_for(state="visible", timeout=30000)
    assert "FFmpeg" in page.locator("#renderEngineText").inner_text()
    page.locator("#cancelRenderButton").click()
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=60000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator('input[value="offline"]').check()
    assert not page.locator("#exportButton").is_disabled()
    with page.expect_download(timeout=180000) as download_event:
        page.locator("#exportButton").click()
    download_event.value.delete()
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=90000)

    page.locator('[data-editor-tab="export"]').click()
    page.locator('input[value="offline"]').check()
    page.locator("#exportButton").click()
    page.locator("#cancelRenderButton").wait_for(state="visible", timeout=30000)
    assert "WebCodecs" in page.locator("#renderEngineText").inner_text()
    page.locator("#cancelRenderButton").click()
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=60000)
    page.locator('[data-editor-tab="export"]').click()
    opfs = page.evaluate("""async () => {
      const names=[];for await(const [name] of await navigator.storage.getDirectory())
        if(name.startsWith('scorevideo-offline-'))names.push(name);return names;
    }""")
    assert not opfs, opfs
    page.locator('input[value="legacy"]').check()
    assert not page.locator("#exportButton").is_disabled()
    downloads = []
    page.on("download", lambda download: downloads.append(download))
    page.locator("#exportButton").click()
    page.wait_for_function("!document.body.classList.contains('render-ui-active')", timeout=90000)
    final_state = page.evaluate("""() => ({message:document.getElementById('message').textContent,
      status:document.getElementById('statusText').textContent,
      href:document.getElementById('downloadLink').getAttribute('href'),
      visible:!document.getElementById('downloadLink').hidden})""")
    assert downloads and final_state["visible"], final_state
    downloads[0].delete()
    assert not errors, errors
    print(json.dumps({"switches": "offline → legacy → offline", "legacy_cancel_to_offline": True,
                      "offline_cancel_to_legacy": True, "opfs_after_cancel": opfs,
                      "1080p30_manual": True, "1080p60_disabled": True,
                      "final_state": final_state}, ensure_ascii=False))
    browser.close()
