"""Read preview-stage timing for selected MIDI notes without changing settings.

Usage: python inspect_stage_clock.py PROJECT_ID fps second:pitch [second:pitch ...]
The local ScoreVideo test server must run at SCOREVIDEO_BASE_URL (default :8766).
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright


project_id, fps = sys.argv[1], int(sys.argv[2])
targets = [{'second': float(item.split(':')[0]), 'pitch': int(item.split(':')[1])}
           for item in sys.argv[3:]]
url = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8766').rstrip('/')
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.goto(url + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.piano?.notes?.length > 0',
                           timeout=90000)
    page.evaluate('''() => {const stage=window.__scoreVideoDebug.getStage();
        window.__syncPreviousFollower=stage.follower;
        window.__syncPreviousWidth=stage.settings.width;}''')
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#resolution').select_option('1280x720')
    page.wait_for_function('''() => {const stage=window.__scoreVideoDebug.getStage();
        return stage.settings.width===1280&&stage.follower?.noteTriggers?.length>1000&&
          (window.__syncPreviousWidth===1280||stage.follower!==window.__syncPreviousFollower);}''',
                           timeout=90000)
    result = page.evaluate('''({targets,fps}) => {
        const stage=window.__scoreVideoDebug.getStage();
        const output=[];
        for(const target of targets){
            const piano=stage.piano.notes.filter(note=>note.pitch===target.pitch)
                .reduce((best,note)=>!best||Math.abs(note.audio-target.second)<
                    Math.abs(best.audio-target.second)?note:best,null);
            const score=stage.follower.noteTriggers.filter(note=>note.pitch===target.pitch)
                .reduce((best,note)=>!best||Math.abs(note.audio-target.second)<
                    Math.abs(best.audio-target.second)?note:best,null);
            const first=Math.ceil(piano.audio*fps-1e-9);
            const samples=[first-1,first,first+1].map(frame=>{
                const time=frame/fps;stage.seek(time);
                const glow=Boolean(score?.headEl?.classList.contains('score-glowing'));
                const dyn=score?window.ScoreFollower.dynamics(score.velocity,time-score.audio,
                    stage.follower.effects):null;
                const impact=window.ScorePianoFall.impactEnvelope(time-piano.audio,
                    piano.endAudio-piano.audio,piano.velocity/127);
                return {frame,time,scoreGlowClass:glow,scoreOpacity:dyn?.opacity||0,
                    pianoImpact:impact};
            });
            output.push({requested:target,pianoTime:piano.audio,scoreTime:score?.audio??null,
                scoreHasHead:Boolean(score?.headEl),samples});
        }
        return {fps,width:stage.settings.width,height:stage.settings.height,
            scoreOffset:stage.settings.offsetSec,pianoOffset:stage.settings.piano.offsetSec,
            scoreDrawAnimation:stage.settings.effects.drawScore,
            scoreSparkle:stage.settings.effects.sparkle,output};
    }''', {'targets': targets, 'fps': fps})
    print(json.dumps(result, indent=2))
    capture = os.environ.get('SCOREVIDEO_CAPTURE_PREVIEW')
    if capture:
        page.evaluate('(second) => window.__scoreVideoDebug.getStage().seek(second)',
                      float(capture))
        path = f'/tmp/scorevideo-preview-{capture}.png'
        page.locator('#scoreViewport').screenshot(path=path)
        print(path)
    browser.close()
