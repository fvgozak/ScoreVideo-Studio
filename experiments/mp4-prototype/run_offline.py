"""Run the isolated browser-only MP4 experiment against a running ScoreVideo server.

Usage: .venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID MODE [RESOLUTION]
MODE is simple, compose, or full. The server must run at SCOREVIDEO_BASE_URL (default :8766).
"""
import json
import os
from pathlib import Path
import sys
from playwright.sync_api import sync_playwright

BASE = Path(__file__).resolve().parent
PROJECT_ID = sys.argv[1]
MODE = sys.argv[2]
RESOLUTION = sys.argv[3] if len(sys.argv) > 3 else '1280x720'
CANCEL_AT = int(os.environ['SCOREVIDEO_CANCEL_AT']) if 'SCOREVIDEO_CANCEL_AT' in os.environ else None
FPS = int(os.environ.get('SCOREVIDEO_FPS', '30'))
SECONDS = float(os.environ.get('SCOREVIDEO_SECONDS', '30'))
PIANO_MODE = os.environ.get('SCOREVIDEO_PIANO_MODE', 'baseline')
SCORE_GLOW = os.environ.get('SCOREVIDEO_SCORE_GLOW', '1') != '0'
START_SECONDS = float(os.environ.get('SCOREVIDEO_START_SECONDS', '0'))
DISABLE_SPARKLE = os.environ.get('SCOREVIDEO_DISABLE_SPARKLE', '') == '1'
DISABLE_NOTE_MOTION = os.environ.get('SCOREVIDEO_DISABLE_NOTE_MOTION', '') == '1'
MOTION_STRENGTH = os.environ.get('SCOREVIDEO_MOTION_STRENGTH')
RUN_TAG = os.environ.get('SCOREVIDEO_RUN_TAG', '').strip()
COMPARE = os.environ.get('SCOREVIDEO_COMPARE', '') == '1'
COMPARE_MODE = os.environ.get('SCOREVIDEO_COMPARE_MODE', 'shadow-sprite')
CLEAR_NOTES = os.environ.get('SCOREVIDEO_CLEAR_NOTES', '') == '1'
FULL_SONG = os.environ.get('SCOREVIDEO_FULL_SONG', '') == '1'
AUDIO_MODE = os.environ.get('SCOREVIDEO_AUDIO_MODE', 'source' if MODE == 'full' else 'none')
STORAGE = os.environ.get('SCOREVIDEO_STORAGE', 'opfs' if FULL_SONG else 'memory')
SIMULATE_MISSING_AUDIO = os.environ.get('SCOREVIDEO_SIMULATE_MISSING_AUDIO', '') == '1'
URL = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8766').rstrip('/')
assert MODE in ('simple', 'compose', 'full')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(accept_downloads=True)
    page.set_default_timeout(30000)
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(PROJECT_ID)})")
    page.route('**/__offline_probe/offline.js', lambda route: route.fulfill(path=str(BASE / 'offline.js'), content_type='text/javascript'))
    page.route('**/__offline_probe/offline-audio.js', lambda route: route.fulfill(path=str(BASE / 'offline-audio.js'), content_type='text/javascript'))
    page.route('**/__offline_probe/score-glow-overlay.js', lambda route: route.fulfill(path=str(BASE / 'score-glow-overlay.js'), content_type='text/javascript'))
    page.route('**/__offline_probe/score-static-heads.js', lambda route: route.fulfill(path=str(BASE / 'score-static-heads.js'), content_type='text/javascript'))
    page.route('**/__offline_probe/mediabunny.mjs', lambda route: route.fulfill(path=str(BASE / 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs'), content_type='text/javascript'))
    page.goto(URL+'/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage() != null', timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#resolution').select_option(RESOLUTION)
    fps_options = page.locator('#fps option').evaluate_all('(options) => options.map(option => option.value)')
    if str(FPS) in fps_options:
        page.locator('#fps').select_option(str(FPS))
    page.wait_for_function('(resolution) => {const [width,height]=resolution.split("x").map(Number);const s=window.__scoreVideoDebug?.getStage()?.settings;return s?.width===width&&s?.height===height}', arg=RESOLUTION, timeout=30000)
    if DISABLE_SPARKLE or DISABLE_NOTE_MOTION:
        page.wait_for_function("document.getElementById('previewInfo').textContent.includes('같은 설정')", timeout=30000)
        page.evaluate('''({sparkle,motion}) => {
            const stage=window.__scoreVideoDebug.getStage();
            stage.follower.setEffects({sparkle:!sparkle,noteMotion:!motion});
        }''', {'sparkle': DISABLE_SPARKLE, 'motion': DISABLE_NOTE_MOTION})
    if MOTION_STRENGTH is not None:
        page.evaluate('''strength => window.__scoreVideoDebug.getStage().follower
            .setEffects({motionStrength:strength})''', float(MOTION_STRENGTH))
    page.add_script_tag(url=URL+'/__offline_probe/offline.js', type='module')
    page.wait_for_function('window.ScoreOfflinePrototype != null')
    if SIMULATE_MISSING_AUDIO:
        result = page.evaluate('''async () => {
            window.__scoreVideoDebug.getStage().meta.audio_filename='';
            try{await window.ScoreOfflinePrototype.run('full',{seconds:1,audioMode:'source'});}
            catch(error){return {message:error.message,resultPresent:!!window.__offlineResult,
                progress:window.__offlineProgress};}
            return {message:'unexpected completion'};
        }''')
        print(json.dumps(result), flush=True)
        browser.close()
        sys.exit(0 if result['message'] == 'This project has no source audio file.'
                 and not result['resultPresent'] and result['progress'] is None else 1)
    if COMPARE:
        if CLEAR_NOTES:
            page.evaluate('''() => {const piano=window.__scoreVideoDebug.getStage().piano;
                piano.notes=[];piano.longestDuration=.35;}''')
        result=page.evaluate('''async ({seconds,pianoMode}) => {
            await window.ScoreOfflinePrototype.run('compose',{seconds,capturePixels:true});
            const before=window.__offlinePixels;
            await window.ScoreOfflinePrototype.run('compose',{seconds,pianoMode,capturePixels:true});
            const after=window.__offlinePixels;
            let changed=0,totalDifference=0,maxDifference=0;
            for(let index=0;index<before.length;index++){
                const difference=Math.abs(before[index]-after[index]);
                if(difference)changed++;
                totalDifference+=difference;maxDifference=Math.max(maxDifference,difference);
            }
            return {pixels:before.length/4,changedChannels:changed,
                meanChannelDifference:totalDifference/before.length,maxChannelDifference:maxDifference};
        }''', {'seconds':SECONDS,'pianoMode':COMPARE_MODE})
        print(json.dumps(result, ensure_ascii=False), flush=True)
        browser.close()
        sys.exit(0)
    if CANCEL_AT is not None:
        result = page.evaluate('''async ({mode,cancelAtFrame,pianoMode,fps,seconds,fullSong,audioMode,storage}) => {
            const remainingTemps=async()=>{if(!navigator.storage?.getDirectory)return [];
                const names=[];for await(const [name] of await navigator.storage.getDirectory())
                    if(name.startsWith('scorevideo-offline-'))names.push(name);
                return names;};
            try { await window.ScoreOfflinePrototype.run(mode,{cancelAtFrame,pianoMode,fps,seconds,fullSong,audioMode,storage}); }
            catch (error) { return {cancelled:error.message==='Cancelled',message:error.message,
                resultPresent:!!window.__offlineResult,progress:window.__offlineProgress,
                opfsTemps:await remainingTemps()}; }
            return {cancelled:false,message:'unexpected completion'};
        }''', {'mode':MODE,'cancelAtFrame':CANCEL_AT,'pianoMode':PIANO_MODE,'fps':FPS,
               'seconds':SECONDS,'fullSong':FULL_SONG,'audioMode':AUDIO_MODE,'storage':STORAGE})
        print(json.dumps(result, ensure_ascii=False), flush=True)
        browser.close()
        sys.exit(0 if result['cancelled'] and not result['resultPresent']
                 and result['progress'] is None and not result['opfsTemps'] else 1)
    result = page.evaluate('({mode,fps,seconds,pianoMode,fullSong,audioMode,storage,scoreGlow,startSeconds}) => window.ScoreOfflinePrototype.run(mode,{fps,seconds,pianoMode,fullSong,audioMode,storage,scoreGlow,startSeconds})',
                           {'mode':MODE,'fps':FPS,'seconds':SECONDS,'pianoMode':PIANO_MODE,
                            'fullSong':FULL_SONG,'audioMode':AUDIO_MODE,'storage':STORAGE,
                            'scoreGlow':SCORE_GLOW,'startSeconds':START_SECONDS})
    print(json.dumps(result, ensure_ascii=False), flush=True)
    if MODE != 'compose':
        with page.expect_download() as event:
            page.evaluate('''() => {const a=document.createElement('a');a.href=URL.createObjectURL(window.__offlineResult);a.download='scorevideo-offline-prototype.mp4';a.click();}''')
        suffix=f'-{RUN_TAG}' if RUN_TAG else ''
        target=Path('/tmp')/f'scorevideo-offline-{MODE}-{PIANO_MODE}-{AUDIO_MODE}-{RESOLUTION}-{FPS}fps{suffix}.mp4'
        event.value.save_as(target)
        print(target, flush=True)
        page.evaluate('window.ScoreOfflinePrototype.release()')
        if STORAGE == 'opfs':
            remaining = page.evaluate('''async () => {const names=[];
                for await(const [name] of await navigator.storage.getDirectory())
                    if(name.startsWith('scorevideo-offline-'))names.push(name);
                return names;}''')
            print(json.dumps({'opfsTempsAfterRelease': remaining}), flush=True)
            assert not remaining, 'OPFS temporary output was not removed after download'
    browser.close()
