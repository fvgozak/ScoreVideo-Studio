"""Run the split-size export matrix against the real run.command server."""
import json
import os
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

url = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
project_id = '011dd715320d4cf8b75392440b979e5e'
cases = [
    ('16:9', 720, 30, 'offline', 1280, 720),
    ('9:16', 720, 30, 'offline', 720, 1280),
    ('1:1', 720, 30, 'offline', 720, 720),
    ('16:9', 720, 60, 'offline', 1280, 720),
    ('16:9', 1080, 30, 'legacy', 1920, 1080),
    ('9:16', 1080, 30, 'legacy', 1080, 1920),
][int(os.environ.get('CASE_START','0')):]
results=[]
with tempfile.TemporaryDirectory(prefix='scorevideo-output-matrix-') as temp, sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True,args=['--autoplay-policy=no-user-gesture-required'])
    page=browser.new_page(accept_downloads=True)
    errors=[]
    downloads=[]
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.on('download',lambda download: downloads.append(download))
    page.add_init_script("localStorage.setItem('scorevideo_last_project',"+json.dumps(project_id)+");")
    page.goto(url+'/',wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower != null',timeout=90000)
    for aspect,quality,fps,engine,width,height in cases:
        page.locator('[data-editor-tab="export"]').click()
        page.locator('#aspectRatio').select_option(aspect)
        page.locator('#outputQuality').select_option(str(quality))
        page.locator('#fps').select_option(str(fps))
        page.wait_for_function('''([w,h]) => {
          const stage=window.__scoreVideoDebug?.getStage();
          return stage?.settings.width===w && stage?.settings.height===h;
        }''',arg=[width,height],timeout=60000)
        radio=page.locator(f'input[name="exportMode"][value="{engine}"]')
        if engine=='offline':
            page.wait_for_function("!document.querySelector('input[value=offline]').disabled",timeout=30000)
        radio.check()
        selected=page.locator('#selectedEngineSummary').inner_text()
        assert f'{width}×{height}' in selected and f'{fps}fps' in selected,selected
        before=len(downloads)
        page.locator('#exportButton').click()
        page.wait_for_function("document.body.classList.contains('render-ui-active')",timeout=30000)
        page.wait_for_function("!document.body.classList.contains('render-ui-active')",timeout=240000)
        page.wait_for_timeout(300)
        message=page.locator('#message').inner_text()
        assert len(downloads)==before+1,(aspect,quality,engine,message)
        download=downloads[-1]
        expected=f'small_morning_{aspect.replace(":","x")}_{width}x{height}_{fps}fps.mp4'
        assert download.suggested_filename==expected,(download.suggested_filename,expected)
        target=Path(temp)/expected
        download.save_as(target)
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries',
          'stream=codec_name,codec_type,width,height,avg_frame_rate,nb_frames','-of','json',str(target)],text=True))
        video=next(stream for stream in probe['streams'] if stream['codec_type']=='video')
        audio=next(stream for stream in probe['streams'] if stream['codec_type']=='audio')
        assert (video['width'],video['height'])==(width,height),video
        assert video['avg_frame_rate']==f'{fps}/1',video
        assert video['codec_name']=='h264' and audio['codec_name']=='aac',probe
        if engine=='legacy':
            report=page.evaluate(f"async () => (await fetch('/api/projects/{project_id}/render-diagnostics')).json()")
            assert report['engine']=='ffmpeg',report.get('engine')
        if (aspect,quality,fps) in [('16:9',720,30),('16:9',1080,30),('9:16',1080,30)]:
            page.locator('[data-editor-tab="export"]').click()
            with page.expect_download(timeout=30000) as repeat:
                page.locator('#downloadLink').click()
            assert repeat.value.suggested_filename==expected
        results.append({'aspect':aspect,'quality':quality,'fps':fps,'engine':engine,
          'width':width,'height':height,'frames':video.get('nb_frames'),'bytes':target.stat().st_size,
          'filename':download.suggested_filename})
        print(json.dumps(results[-1],ensure_ascii=False),flush=True)
    assert not errors,errors
    page.evaluate('window.ScoreOfflineExport.release()')
    browser.close()
print(json.dumps({'results':results,'page_errors':errors},ensure_ascii=False))
