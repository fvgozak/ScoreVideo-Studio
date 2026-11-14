"""Separate browser MP3 decode, AAC encode/mux, and configured stage clocks.

Usage: python av_sync_probe.py PROJECT_ID SOURCE_MP3 OUTPUT_MP4 [times ...]
The ScoreVideo test server must be running at SCOREVIDEO_BASE_URL (default :8766).
"""
import base64
import json
import os
from pathlib import Path
import sys

import numpy as np
from playwright.sync_api import sync_playwright

from check_audio_sync import RATE, decode, measure


project_id, source_path, output_path = sys.argv[1:4]
positions = [float(value) for value in sys.argv[4:]] or [3, 100, 190]
source, output = decode(source_path), decode(output_path)
url = os.environ.get('SCOREVIDEO_BASE_URL', 'http://127.0.0.1:8766').rstrip('/')
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.add_init_script(f"localStorage.setItem('scorevideo_last_project',{json.dumps(project_id)})")
    page.goto(url + '/', wait_until='domcontentloaded')
    page.wait_for_function('window.__scoreVideoDebug?.getStage()?.piano?.notes?.length > 0',
                           timeout=90000)
    browser_data = page.evaluate('''async ({positions,projectId}) => {
        const stage=window.__scoreVideoDebug.getStage();
        const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/audio`);
        const context=new AudioContext({sampleRate:48000});
        let buffer;
        try{buffer=await context.decodeAudioData(await response.arrayBuffer());}
        finally{await context.close();}
        const clips=positions.map(position=>{
            const start=Math.max(0,Math.round((position-.75)*buffer.sampleRate));
            const frames=Math.min(Math.round(1.5*buffer.sampleRate),buffer.length-start);
            const mono=new Float32Array(frames),channel=new Float32Array(frames);
            for(let i=0;i<buffer.numberOfChannels;i++){
                buffer.copyFromChannel(channel,i,start);
                for(let j=0;j<frames;j++)mono[j]+=channel[j]/buffer.numberOfChannels;
            }
            const bytes=new Uint8Array(mono.buffer);let binary='';
            for(let i=0;i<bytes.length;i+=8192)
                binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
            return {start,frames,pcm:btoa(binary)};
        });
        return {sampleRate:buffer.sampleRate,decodedDuration:buffer.duration,
            mediaDuration:document.getElementById('audioPlayer')?.duration,
            scoreOffsetSec:stage.settings.offsetSec,
            pianoOffsetSec:stage.settings.piano.offsetSec,
            scoreSparkle:stage.settings.effects.sparkle,
            scoreDrawAnimation:stage.settings.effects.drawScore,
            scoreVisible:stage.settings.scoreVisible,
            syncAnchors:stage.meta.sync?.anchors||null,
            noteTriggerCount:stage.follower?.noteTriggers?.length||0,
            pianoNoteCount:stage.piano.notes.length,
            mappedEvents:positions.map(position=>{
                const note=stage.piano.notes.reduce((best,note)=>
                    Math.abs(note.audio-position)<Math.abs(best.audio-position)?note:best,
                    stage.piano.notes[0]);
                const score=stage.follower.noteTriggers?.find(item=>
                    item.pitch===note.pitch&&Math.abs(item.audio-note.audio)<.001);
                return {requested:position,pitch:note.pitch,pianoTime:note.audio,
                    scoreTime:score?.audio??null};
            }),clips};
    }''', {'positions': positions, 'projectId': project_id})
    browser.close()

assert browser_data['sampleRate'] == RATE
rows = []
for second, clip in zip(positions, browser_data.pop('clips')):
    browser_pcm = np.frombuffer(base64.b64decode(clip['pcm']), dtype='<f4')
    start = clip['start']
    length = clip['frames']
    original_pcm = source[start:start + length]
    aac_pcm = output[start:start + length]
    rows.append({'at_sec': second,
                 'browser_minus_ffmpeg_source': measure(original_pcm, browser_pcm, .75),
                 'aac_minus_browser': measure(browser_pcm, aac_pcm, .75),
                 'aac_minus_ffmpeg_source': measure(original_pcm, aac_pcm, .75)})
print(json.dumps({'projectId': project_id, 'sourceDuration': len(source) / RATE,
                  'aacDuration': len(output) / RATE, 'browser': browser_data,
                  'windows': rows}, indent=2))
