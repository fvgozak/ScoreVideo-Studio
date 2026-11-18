"""Real Chromium WebAudio synthesis test, with a local in-memory MP3 response.

Runs without a network server. The browser inside CI may block localhost URLs,
so a fetch stub supplies the bundled CC-BY-3.0 A4 sample.
"""
from __future__ import annotations
import base64
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[1]


def test_salamander_web_audio_wav_and_offline_decoder():
    playwright=pytest.importorskip('playwright.sync_api')
    from playwright.sync_api import sync_playwright
    sample=(ROOT/'static/audio/salamander/A4.mp3').read_bytes()
    source=(ROOT/'static/browser-salamander.js').read_text(encoding='utf8')
    offline_src=(ROOT/'static/offline/offline-audio.js').read_text(encoding='utf8')
    # Isolate the pure decoder; AudioSample/Quality are required only for encoding.
    offline_src=offline_src.replace("import {AudioSample,AudioSampleSource,Quality} from './mediabunny.min.mjs';",'')
    offline_src=offline_src.replace('export async function decodeProjectAudio','async function decodeProjectAudio')
    offline_src=offline_src.split('export function createAacSource')[0]
    offline_src+='\nwindow.testDecodeProjectAudio=decodeProjectAudio;\n'
    with sync_playwright() as p:
        try:
            browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
        except Exception:
            pytest.skip('System Chromium is unavailable in this environment')
        try:
            page=browser.new_page()
            page.goto('about:blank')
            page.evaluate('''encoded=>{
                window.fetch=async ()=>new Response(
                    Uint8Array.from(atob(encoded),c=>c.charCodeAt(0)),
                    {status:200,headers:{'Content-Type':'audio/mpeg'}});
            }''',base64.b64encode(sample).decode())
            page.add_script_tag(content=source)
            page.add_script_tag(content=offline_src)
            result=page.evaluate('''async ()=>{
                const meta={id:'test-midi',audio_filename:'audio.wav',midi_duration_sec:1.0,note_events:[
                    {pitch:69,second:0,velocity:90,end_second:.5,sustain_end_second:.5}
                ]};
                const output=await window.ScoreBrowserSalamander.ensure(meta);
                const head=new DataView(await output.blob.slice(0,44).arrayBuffer());
                const decoded=await window.testDecodeProjectAudio(meta,new AbortController().signal);
                const pcm=decoded.buffer.getChannelData(0);
                let rms=0;for(const x of pcm)rms+=x*x;
                return {bytes:output.blob.size,duration:output.duration,
                    sampleRate:head.getUint32(24,true),
                    pcmRate:decoded.buffer.sampleRate,rms:Math.sqrt(rms/pcm.length),
                    local:!!window.ScoreBrowserSalamander.get(meta.id)};
            }''')
            assert result['bytes']>100_000
            assert result['sampleRate']==32000
            assert result['pcmRate']==48000
            assert result['rms']>.0001, 'Browser synthesized audio is silent'
            assert result['duration']==2.5 and result['local']
        finally:
            browser.close()
