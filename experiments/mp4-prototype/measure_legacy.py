"""Measure the unchanged screenshot→FFmpeg MP4 frame path for 30 seconds."""
import json
from pathlib import Path
import sys
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from playwright.sync_api import sync_playwright
from render_adaptive import Pipeline, target_bitrate
from render_video import stream_frames

project = sys.argv[1]
folder = Path('data/projects') / project
settings = SimpleNamespace(width=1280, height=720, fps=30)
pipeline = Pipeline('jpeg', 'libx264', target_bitrate(1280, 720, 30), 96)
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1280,'height':720})
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project)})")
    page.goto('http://127.0.0.1:8766/',wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage() != null',timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#resolution').select_option('1280x720')
    page.locator('#fps').select_option('30')
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.width===1280')
    config=page.evaluate('window.__scoreVideoDebug.config()')
    render_page=browser.new_page(viewport={'width':1280,'height':720})
    render_page.route(f'**/api/projects/{project}/render-config',lambda route:route.fulfill(json=config,content_type='application/json'))
    render_page.goto(f'http://127.0.0.1:8766/render/{project}',wait_until='domcontentloaded')
    render_page.wait_for_function('window.__ready === true || !!window.__renderError',timeout=90000)
    if render_page.evaluate('window.__renderError'):
        raise RuntimeError(render_page.evaluate('window.__renderError'))
    output=Path('/tmp/scorevideo-legacy-30.mp4')
    result=stream_frames(render_page,render_page.locator('#scoreViewport'),pipeline,settings,folder/'audio.wav',30,output,lambda *_:None)
    print(json.dumps(result),flush=True)
    print(output,output.stat().st_size,flush=True)
    browser.close()
