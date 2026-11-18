"""Hybrid Cloudflare beta: no mandatory Python sample render at upload time."""
from __future__ import annotations
import io
import json
import struct

import mido
from fastapi.testclient import TestClient
import app
from sample_audio import salamander_duration
from scripts.build_cloudflare_pages import build


def midi_bytes():
    source=mido.MidiFile(ticks_per_beat=480)
    track=mido.MidiTrack()
    source.tracks.append(track)
    track.extend([
        mido.Message('note_on',note=69,velocity=80,time=0),
        mido.Message('note_off',note=69,velocity=0,time=480),
    ])
    out=io.BytesIO();source.save(file=out);return out.getvalue()


def test_browser_engine_saves_only_metadata_until_requested(monkeypatch,tmp_path):
    monkeypatch.setattr(app,'DATA',tmp_path)
    with TestClient(app.app) as client:
        result=client.post('/api/projects',data={'audio_engine':'browser'},
                           files={'midi':('short.mid',midi_bytes(),'audio/midi')})
        assert result.status_code==200,result.text
        meta=result.json();folder=tmp_path/meta['id']
        assert meta['generated_audio'] is True
        assert meta['audio_generation_mode']=='browser'
        assert meta['audio_filename']=='audio.wav'
        assert meta['audio_duration_sec']==salamander_duration(meta)
        assert not (folder/'audio.wav').exists(), 'WAV must not be rendered during upload'
        assert client.get(f"/api/projects/{meta['id']}/audio").status_code==404
        response=client.post(f"/api/projects/{meta['id']}/audio/fallback")
        assert response.status_code==200,response.text
        assert response.json()['audio_generation_mode']=='server_fallback'
        wav=(folder/'audio.wav').read_bytes()
        assert wav[:4]==b'RIFF' and wav[8:12]==b'WAVE'
        assert struct.unpack('<I',wav[24:28])[0]==32000
        assert client.get(f"/api/projects/{meta['id']}/audio").status_code==200
        assert client.post(f"/api/projects/{meta['id']}/audio/fallback").status_code==200


def test_original_salamander_path_is_preserved(monkeypatch,tmp_path):
    monkeypatch.setattr(app,'DATA',tmp_path)
    with TestClient(app.app) as client:
        result=client.post('/api/projects',files={'midi':('short.mid',midi_bytes(),'audio/midi')})
        assert result.status_code==200,result.text
        meta=result.json()
        assert meta['audio_generation_mode']=='server'
        assert (tmp_path/meta['id']/'audio.wav').exists()


def test_proxy_secret_protects_api_and_render(monkeypatch):
    monkeypatch.setenv('SCOREMOTION_PROXY_SECRET','abc-test-secret')
    with TestClient(app.app) as client:
        assert client.get('/api/palette/themes?theme=ocean').status_code==403
        assert client.get('/api/palette/themes?theme=ocean',
                          headers={'x-scoremotion-proxy-secret':'abc-test-secret'}).status_code!=403
        assert client.get('/render/'+'0'*32).status_code==403
        assert client.get('/').status_code==200


def test_pages_bundle_excludes_server_and_limits_routes(tmp_path):
    output=tmp_path/'dist'
    build(output)
    assert (output/'index.html').is_file()
    assert (output/'static'/'browser-salamander.js').is_file()
    assert (output/'static'/'audio'/'salamander'/'A4.mp3').is_file()
    assert not (output/'app.py').exists()
    assert json.loads((output/'_routes.json').read_text())['include']==['/api/*']
