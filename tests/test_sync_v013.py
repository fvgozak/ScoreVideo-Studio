"""Regression tests for weak first attacks and fallback title."""
from pathlib import Path
import numpy as np
from fastapi.testclient import TestClient
from app import app
from auto_sync import SAMPLE_RATE, detect_first_sound


def test_first_sound_finds_soft_piano_before_loud_accent():
    sr=SAMPLE_RATE
    audio=np.zeros(3*sr,dtype=np.float32)
    first=int(.26*sr);stop=int(.7*sr)
    audio[first:stop]=.006*np.sin(2*np.pi*440*np.arange(stop-first)/sr)
    loud=int(1.3*sr);loud_stop=2*sr
    audio[loud:loud_stop]=.4*np.sin(2*np.pi*440*np.arange(loud_stop-loud)/sr)
    onset,_=detect_first_sound(audio)
    assert abs(onset-.26)<.02
    audio[:stop-first]=audio[first:stop]
    audio[first:stop]=0
    onset,_=detect_first_sound(audio)
    assert onset<=.02


def test_filename_title_fallback_on_upload():
    root=Path(__file__).resolve().parents[1]
    score=(root/'examples/small_morning.musicxml').read_text(encoding='utf-8')
    # Remove headings independently of notation, ensuring no title remains.
    import xml.etree.ElementTree as ET
    doc=ET.fromstring(score)
    for child in list(doc):
        if child.tag.rsplit('}',1)[-1] in {'movement-title','work','credit'}:
            doc.remove(child)
    with TestClient(app) as client:
        resp=client.post('/api/projects',files={
            'score': ('No Title Example.musicxml',ET.tostring(doc,encoding='utf8'),'application/xml'),
            'midi': ('small_morning.mid',(root/'examples/small_morning.mid').read_bytes(),'audio/midi'),
            'audio': ('small_morning.wav',(root/'examples/small_morning.wav').read_bytes(),'audio/wav')
        })
        assert resp.status_code==200, resp.text
        assert resp.json()['musicxml_title']=='No Title Example'
        assert client.get('/api/projects/'+resp.json()['id']).json()['musicxml_title']=='No Title Example'
