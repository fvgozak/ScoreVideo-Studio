import io
from PIL import Image
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app import app
from midi_timing import read_timing

BASE = Path(__file__).resolve().parents[1]
client = TestClient(app)


class ScoreVideoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.score = (BASE / 'examples/small_morning.musicxml').read_bytes()
        cls.midi = (BASE / 'examples/small_morning.mid').read_bytes()
        cls.audio = (BASE / 'examples/small_morning.wav').read_bytes()

    def test_midi_tempo_change(self):
        info = read_timing(BASE / 'examples/small_morning.mid')
        self.assertEqual(info['note_count'], 15)
        self.assertEqual(len(info['note_events']), 15)
        self.assertEqual(info['note_events'][0]['velocity'], 42)
        self.assertEqual(info['note_events'][3]['velocity'], 110)
        self.assertEqual(info['tempo_map'][0]['tempo_us'], 500000)
        self.assertAlmostEqual(info['tempo_map'][1]['beat'], 8.0)
        self.assertAlmostEqual(info['tempo_map'][1]['second'], 4.0)
        self.assertEqual(info['tempo_map'][1]['tempo_us'], 666667)

    def upload(self, score=None, score_name='small_morning.musicxml'):
        files = {
            'score': (score_name, score or self.score, 'application/xml'),
            'midi': ('small_morning.mid', self.midi, 'audio/midi'),
            'audio': ('small_morning.wav', self.audio, 'audio/wav')
        }
        return client.post('/api/projects', files=files)

    def test_upload_and_routes(self):
        r = self.upload()
        self.assertEqual(r.status_code, 200, r.text)
        meta = r.json()
        self.assertAlmostEqual(meta['audio_duration_sec'], 9.9833, delta=0.1)
        self.assertEqual(meta['note_count'], 15)
        self.assertEqual(meta['score_alignment']['method'], 'pitch-onset-anchors-v1')
        self.assertEqual(meta['score_alignment']['status'], 'ok')
        self.assertEqual(meta['score_alignment']['matched_notes'], 15)
        self.assertAlmostEqual(meta['score_alignment']['anchors'][9]['second'], 5.333334, places=4)
        self.assertEqual(meta['note_events'][0]['pitch'], 60)
        self.assertEqual(meta['note_events'][0]['velocity'], 42)
        self.assertEqual(client.get('/api/projects/'+meta['id']+'/score').status_code, 200)
        self.assertEqual(client.get('/api/projects/'+meta['id']+'/audio').status_code, 200)
        self.assertEqual(client.get('/render/'+meta['id']).status_code, 200)
        self.assertEqual(client.get('/api/projects/'+meta['id']+'/status').json()['state'], 'idle')
        self.assertEqual(client.get('/api/projects/'+meta['id']+'/download').status_code, 404)


    def test_existing_project_automatically_upgrades_alignment(self):
        from app import project_path
        meta = self.upload().json()
        file = project_path(meta['id']) / 'meta.json'
        old = json.loads(file.read_text(encoding='utf-8'))
        old.pop('score_alignment', None)
        file.write_text(json.dumps(old), encoding='utf-8')
        r = client.get('/api/projects/' + meta['id'])
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['score_alignment']['status'], 'ok')
        self.assertEqual(json.loads(file.read_text())['score_alignment']['method'],
                         'pitch-onset-anchors-v1')

    def test_auto_sync_demo(self):
        r = self.upload()
        self.assertEqual(r.status_code, 200, r.text)
        pid = r.json()['id']
        response = client.post(f'/api/projects/{pid}/auto-sync')
        self.assertEqual(response.status_code, 200, response.text)
        sync = response.json()
        self.assertAlmostEqual(sync['tempo_ratio'], 1.0, delta=.03)
        self.assertAlmostEqual(sync['offset_sec'], 0.0, delta=.15)
        self.assertGreaterEqual(len(sync['anchors']), 2)
        self.assertEqual(client.get(f'/api/projects/{pid}').json()['sync'], sync)
        self.assertEqual(client.delete(f'/api/projects/{pid}/auto-sync').status_code, 200)
        self.assertIsNone(client.get(f'/api/projects/{pid}').json()['sync'])

    def test_first_attack_sync_with_delayed_recording(self):
        # Synthetic 350ms silence should be recovered without tempo stretching.
        import subprocess
        from auto_sync import first_attack_sync
        with tempfile.TemporaryDirectory() as temp:
            delayed = Path(temp) / 'delayed.wav'
            subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y',
                            '-i',str(BASE/'examples/small_morning.wav'),
                            '-af','adelay=350:all=1',str(delayed)],check=True)
            result=first_attack_sync(BASE/'examples/small_morning.mid',delayed,10.35)
            self.assertEqual(result['method'],'first-sound-offset')
            self.assertAlmostEqual(result['offset_sec'],.35,delta=.055)
            self.assertEqual(result['tempo_ratio'],1.0)
            self.assertAlmostEqual(result['first_audio_sec'],.35,delta=.055)
            self.assertEqual(len(result['anchors']),2)

    def test_compressed_musicxml(self):
        z = io.BytesIO()
        with ZipFile(z, 'w') as archive:
            archive.writestr('META-INF/container.xml',
                '<container><rootfiles><rootfile full-path="sheet.xml"/></rootfiles></container>')
            archive.writestr('sheet.xml', self.score)
        r = self.upload(z.getvalue(), 'example.mxl')
        self.assertEqual(r.status_code, 200, r.text)

    def test_reject_bad_musicxml(self):
        r = self.upload(b'<html></html>')
        self.assertEqual(r.status_code, 400)
        self.assertIn('MusicXML', r.text)

    def test_background_upload_and_delete(self):
        r = self.upload()
        pid = r.json()['id']
        image = Image.new('RGB', (48, 32), '#4e7088')
        b = io.BytesIO()
        image.save(b, 'PNG')
        response = client.post(f'/api/projects/{pid}/background', files={
            'background': ('wallpaper.png', b.getvalue(), 'image/png')})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['background_filename'], 'background.png')
        result = client.get(f'/api/projects/{pid}/background')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.headers['content-type'], 'image/png')
        self.assertEqual(client.get(f'/api/projects/{pid}').json()['background_filename'], 'background.png')
        self.assertEqual(client.delete(f'/api/projects/{pid}/background').status_code, 200)
        self.assertEqual(client.get(f'/api/projects/{pid}/background').status_code, 404)

    def test_reject_invalid_background(self):
        r = self.upload()
        pid = r.json()['id']
        bad = client.post(f'/api/projects/{pid}/background', files={
            'background': ('malformed.png', b'not a PNG', 'image/png')})
        self.assertEqual(bad.status_code, 400)
        self.assertEqual(client.get(f'/api/projects/{pid}').json()['background_filename'], None)

    def test_video_presets_and_clean_render_page(self):
        from app import RenderRequest
        for width, height in [(1280,720),(1920,1080),(1080,1920),(1080,1080),
                              (1080,1350),(1080,1440),(1440,1080),(2560,1080)]:
            item = RenderRequest(width=width, height=height,scroll_mode='horizontal',texture='parchment')
            self.assertEqual((item.width,item.height),(width,height))
        r = self.upload()
        html = client.get(f'/render/{r.json()["id"]}').text
        self.assertIn('id="scoreViewport"', html)
        self.assertIn('stage-runtime.js',html)
        self.assertIn('studio-scene.js',html)
        self.assertNotIn('id="playButton"', html)
        self.assertNotIn('id="progress"', html)
        self.assertNotIn('id="bottom"', html)
        self.assertNotIn('id="heading"', html)

    def test_render_config_snapshot_endpoint(self):
        from app import RenderRequest, DATA
        r = self.upload()
        pid = r.json()['id']
        self.assertEqual(client.get(f'/api/projects/{pid}/render-config').status_code, 404)
        cfg = RenderRequest(width=1080,height=1920, scene={
            'template': 'cinematic', 'fxMode': 'trail', 'animateBackground': True,
            'keyframes': [{'time':0,'color':'#151b32','glow':'#91d3ff'},
                         {'time':13,'color':'#35162c','glow':'#dba0d8'}]
        })
        (DATA/pid/'render-config.json').write_text(cfg.model_dump_json())
        result = client.get(f'/api/projects/{pid}/render-config')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['scene']['fxMode'], 'trail')
        self.assertEqual(result.json()['width'], 1080)

    def test_reject_bad_path(self):
        self.assertEqual(client.get('/api/projects/../../../etc/passwd').status_code, 404)

    def test_reject_wrong_render_settings(self):
        r = self.upload()
        pid = r.json()['id']
        bad = client.post(f'/api/projects/{pid}/render', json={
            'width': 1000, 'height': 800, 'fps': 24, 'offset_sec': 0, 'zoom': 0.9})
        self.assertEqual(bad.status_code, 400)


if __name__ == '__main__':
    unittest.main()
