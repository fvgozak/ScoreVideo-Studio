"""Run .venv/bin/python tests/validate_local_mp4_audio_browser.py
E2E: use the real local IndexedDB /api/projects/:id/audio shim and offline decoder.
"""
import pathlib, functools, threading, tempfile, struct, shutil
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parent.parent
class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass
# Minimal MIDI with one C4 note and enough audio for the offline decoder.
track=bytes.fromhex('00 90 3c 40 83 60 80 3c 40 00 ff 2f 00')
midi_bytes=b'MThd'+struct.pack('>IHHH',6,0,1,480)+b'MTrk'+struct.pack('>I',len(track))+track
with tempfile.TemporaryDirectory() as tmp:
    tmp=pathlib.Path(tmp)
    midi=tmp/'short.mid';midi.write_bytes(midi_bytes)
    server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=str(root)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    try:
        with sync_playwright() as p:
            exe=shutil.which('chromium')
            browser=p.chromium.launch(headless=True,executable_path=exe,args=['--no-sandbox'] if exe else [])
            page=browser.new_page();errors=[]
            page.on('pageerror', lambda err:errors.append(str(err)))
            page.goto(f'http://127.0.0.1:{server.server_port}/static/index.html?browser-local',wait_until='domcontentloaded')
            page.wait_for_function('window.ScoreLocalProjects?.enabled === true && typeof window.ScoreLocalProjects?.openProject === "function"',timeout=30000)
            page.locator('#midi').set_input_files(str(midi));page.locator('#uploadButton').click()
            page.wait_for_function('window.__scoreVideoDebug?.getStage()?.meta?.id && !document.querySelector("#uploadButton").disabled',timeout=65000)
            result=page.evaluate("""async () => {
              const meta=window.__scoreVideoDebug.getStage().meta;
              const record=await window.ScoreLocalProjects.openProject(meta.id);
              if(!record?.audio)throw Error('IndexedDB record contains no audio');
              const fetched=await fetch('/api/projects/'+meta.id+'/audio');
              if(!fetched.ok)throw Error('local project API audio fetch returned '+fetched.status);
              const mod=await import('/static/offline/offline-audio.js');
              const decoded=await mod.decodeProjectAudio(meta,new AbortController().signal);
              return {generated:meta.generated_audio,inputBytes:decoded.inputBytes,
                duration:decoded.buffer.duration,storedBytes:record.audio.size,
                fetchedBytes:(await fetched.arrayBuffer()).byteLength};
            }""")
            assert result['generated'] is True,result
            assert result['inputBytes']==result['storedBytes']==result['fetchedBytes'],result
            assert result['duration']>0,result
            assert not errors,errors
            print('PASS browser: browser-local MIDI -> IndexedDB Salamander WAV -> offline MP4 audio decoder',result)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
