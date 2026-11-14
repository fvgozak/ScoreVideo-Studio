"""Check that Chromium can seek and finish a locally produced MP4.

Usage: python check_browser_playback.py /path/to/output.mp4
This is metadata/seek/playback validation, not a listening test.
"""
import json
from pathlib import Path
import sys

from playwright.sync_api import sync_playwright


path = Path(sys.argv[1]).resolve()
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True,
                                         args=['--autoplay-policy=no-user-gesture-required'])
    page = browser.new_page()
    page.goto(path.as_uri())
    page.wait_for_function("document.querySelector('video')?.readyState >= 1")
    result = page.evaluate('''async () => {
        const video=document.querySelector('video');video.muted=true;
        const duration=video.duration;
        video.currentTime=Math.max(0,duration-.06);
        await new Promise((resolve,reject)=>{video.onseeked=resolve;video.onerror=reject;});
        await video.play();
        await Promise.race([new Promise(resolve=>{video.onended=resolve;}),
                            new Promise((_,reject)=>setTimeout(()=>reject(Error('playback timeout')),3000))]);
        return {duration,currentTime:video.currentTime,ended:video.ended,
            videoWidth:video.videoWidth,videoHeight:video.videoHeight};
    }''')
    print(json.dumps(result))
    browser.close()
