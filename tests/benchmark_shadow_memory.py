"""Play the real Dream Journey audio for three minutes and sample preview cache usage."""
import json
import os
import subprocess
import threading
import time
from playwright.sync_api import sync_playwright

base = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8765').rstrip('/')
project = '25686521bdd845809347d6670c54ee7d'


def chromium_rss():
    """Approximate RSS of this test's Chromium descendants (shared pages may overlap)."""
    rows = []
    for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss=,command='], text=True).splitlines():
        fields = line.split(None, 3)
        if len(fields) == 4 and all(field.isdigit() for field in fields[:3]):
            rows.append((int(fields[0]), int(fields[1]), int(fields[2]), fields[3]))
    descendants = {os.getpid()}
    for _ in range(6):
        descendants.update(pid for pid, ppid, _, _ in rows if ppid in descendants)
    chrome = [row for row in rows if row[0] in descendants and 'chrome-headless-shell' in row[3]]
    renderers = [row for row in chrome if '--type=renderer' in row[3]]
    return {'chromiumKiB': sum(row[2] for row in chrome),
            'rendererKiB': sum(row[2] for row in renderers),
            'processes': len(chrome)}


rss_samples = []
stop_rss = threading.Event()


def sample_rss():
    started = time.monotonic()
    while not stop_rss.is_set():
        sample = {'elapsedSeconds': round(time.monotonic() - started), **chromium_rss()}
        rss_samples.append(sample)
        print('shadow-rss ' + json.dumps(sample), flush=True)
        stop_rss.wait(30)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page(viewport={'width': 1600, 'height': 1000})
    page.set_default_timeout(230000)
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project)})")
    page.on('console', lambda message: print(message.text, flush=True)
            if message.text.startswith('shadow-memory ') else None)
    page.goto(base + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.piano?.notes?.length > 1000', timeout=90000)
    rss_thread = threading.Thread(target=sample_rss, daemon=True)
    rss_thread.start()
    samples = page.evaluate('''async () => {
      const stage=window.__scoreVideoDebug.getStage(),audio=document.querySelector('#audioPlayer');
      stage.piano.shadowCache.clear();audio.currentTime=0;await audio.play();
      const points=[];
      for(let i=0;i<=6;i++){
        if(i)await new Promise(resolve=>setTimeout(resolve,30000));
        const cache=stage.piano.shadowCache.stats();
        const sample={elapsedSeconds:i*30,audioTime:+audio.currentTime.toFixed(2),
          cacheBytes:cache.bytes,peakBytes:cache.peakBytes,entries:cache.entries,
          hits:cache.hits,evictions:cache.evictions,
          jsHeap:performance.memory?.usedJSHeapSize||null};
        points.push(sample);console.log('shadow-memory '+JSON.stringify(sample));
      }
      audio.pause();return points;
    }''')
    assert all(sample['cacheBytes'] <= 48*1024*1024 for sample in samples)
    stop_rss.set()
    rss_thread.join(timeout=5)
    print(json.dumps({'samples': samples, 'rss': rss_samples}, ensure_ascii=False), flush=True)
    browser.close()
