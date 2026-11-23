"""Run .venv/bin/python tests/validate_local_mp4_audio_browser.py
E2E: real-time piano preview, on-demand WAV, IndexedDB audio API, and decoder.
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
            try:
                page.wait_for_function('window.__scoreVideoDebug?.getStage()?.meta?.id && !document.querySelector("#uploadButton").disabled',timeout=20000)
            except Exception as exc:
                state=page.evaluate("""() => ({message:document.querySelector('#message')?.textContent,
                  disabled:document.querySelector('#uploadButton')?.disabled,
                  project:window.__scoreVideoDebug?.getStage()?.meta?.id,
                  local:window.ScoreLocalProjects?.enabled})""")
                raise AssertionError(f'Project creation timed out: {state}, page errors: {errors}') from exc
            before=page.evaluate("""async () => {
              const meta=window.__scoreVideoDebug.getStage().meta;
              return {generated:meta.generated_audio,hasAudio:!!(await window.ScoreLocalProjects.openProject(meta.id))?.audio,
                livePlayer:typeof window.ScoreRealtimeSalamander?.Player==='function'};
            }""")
            assert before=={'generated':True,'hasAudio':False,'livePlayer':True},before
            page.locator('#playButton').click()
            page.wait_for_function('document.querySelector("#playButton")?.getAttribute("aria-label")==="일시정지"',timeout=30000)
            preview=page.evaluate("""async () => {
              const id=window.__scoreVideoDebug.getStage().meta.id;
              return {audioStored:!!(await window.ScoreLocalProjects.openProject(id))?.audio,
                htmlAudioSrc:document.querySelector('#audioPlayer').getAttribute('src')};
            }""")
            assert preview=={'audioStored':False,'htmlAudioSrc':None},preview
            page.locator('#playButton').click()
            page.evaluate("""async () => {
              const id=window.__scoreVideoDebug.getStage().meta.id;
              await window.ScoreLocalProjects.ensureAudio(id);
            }""")
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
            reused=page.evaluate("""async midiBytes => {
              const firstId=window.__scoreVideoDebug.getStage().meta.id;
              const first=await window.ScoreLocalProjects.openProject(firstId);
              const next=await window.ScoreLocalProjects.createProject({
                midi:new File([new Uint8Array(midiBytes)],'short.mid',{type:'audio/midi'})});
              const wav=await window.ScoreLocalProjects.ensureAudio(next.id);
              const oldBytes=new Uint8Array(await first.audio.arrayBuffer());
              const newBytes=new Uint8Array(await wav.arrayBuffer());
              return {cached:window.__scoreMotionSalamanderPerf?.cachedSamples,
                identical:oldBytes.length===newBytes.length&&oldBytes.every((value,i)=>value===newBytes[i])};
            }""",list(midi_bytes))
            assert reused['cached']>=1 and reused['identical'],reused
            assert not errors,errors
            print('PASS browser: real-time MIDI preview without WAV; on-demand IndexedDB audio -> MP4 decoder; cached WAV identical',result)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
