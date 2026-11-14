"""Exercise cancellation, immediate retry and OPFS cleanup in one browser."""
import json
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright


base=Path(__file__).resolve().parent
project_id=sys.argv[1]
url='http://127.0.0.1:8766'
with sync_playwright() as playwright:
    browser=playwright.chromium.launch(headless=True)
    page=browser.new_page()
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    def local_module(name):
        return lambda route: route.fulfill(path=str(base/name),content_type='text/javascript')
    for name in ('offline.js','offline-audio.js','score-glow-overlay.js','score-static-heads.js'):
        page.route(f'**/__offline_probe/{name}',local_module(name))
    page.route('**/__offline_probe/mediabunny.mjs',lambda route: route.fulfill(
        path=str(base/'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs'),
        content_type='text/javascript'))
    page.goto(url+'/',wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.follower?.noteTriggers?.length>1000',timeout=90000)
    page.locator('[data-editor-tab="export"]').click()
    page.locator('#resolution').select_option('1280x720')
    page.wait_for_function('window.__scoreVideoDebug.getStage().settings.width===1280')
    page.add_script_tag(url=url+'/__offline_probe/offline.js',type='module')
    page.wait_for_function('window.ScoreOfflinePrototype != null')
    result=page.evaluate('''async () => {
      const api=window.ScoreOfflinePrototype,steps=[];
      const temps=async()=>{const names=[];for await(const [name] of await navigator.storage.getDirectory())
        if(name.startsWith('scorevideo-offline-'))names.push(name);return names;};
      const options={fps:30,seconds:30,audioMode:'source',storage:'opfs',pianoMode:'shadow-sprite'};
      const cancelled=async(label,at)=>{
        let error=null;
        try{await api.run('full',{...options,cancelAtFrame:at});}catch(e){error=e.message;}
        steps.push({label,error,resultPresent:!!window.__offlineResult,
          progress:window.__offlineProgress,temps:await temps()});
      };
      await cancelled('early_frame_1',1);
      await cancelled('middle_frame_450',450);
      for(const label of ['retry_after_cancel','normal_then_rerender']){
        const output=await api.run('full',{...options,seconds:1});
        const beforeRelease=await temps();
        await api.release();
        steps.push({label,frames:output.frames,bytes:output.bytes,
          beforeRelease,afterRelease:await temps(),resultPresent:!!window.__offlineResult});
      }
      return {steps,heap:performance.memory?.usedJSHeapSize||null};
    }''')
    print(json.dumps(result,ensure_ascii=False),flush=True)
    for step in result['steps']:
        if step['label'].startswith(('early','middle')):
            assert step['error']=='Cancelled' and not step['resultPresent']
            assert step['progress'] is None and not step['temps']
        else:
            assert step['frames']==30 and step['bytes']>0
            assert len(step['beforeRelease'])==1 and not step['afterRelease']
            assert not step['resultPresent']
    browser.close()
