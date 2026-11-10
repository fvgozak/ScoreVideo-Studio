import io
import re

from PIL import Image
from fastapi.testclient import TestClient
from app import app
from image_palette import propose_score_palettes, contrast_ratio

client=TestClient(app)
HEX=re.compile(r'^#[A-Fa-f\d]{6}$')


def make_art():
    img=Image.new('RGB',(120,120),(33,68,113))
    for x in range(20,100):
        for y in range(20,100):img.putpixel((x,y),(204,105,57))
    for x in range(50,75):
        for y in range(0,120):img.putpixel((x,y),(237,222,180))
    buf=io.BytesIO();img.save(buf,'PNG');return buf.getvalue()


def test_score_palette_preserves_uploaded_color_extract_algorithm():
    from image_palette import extract_cover_palette
    with Image.open(io.BytesIO(make_art())) as art:
        result=propose_score_palettes(art)
    with Image.open(io.BytesIO(make_art())) as art:
        original=extract_cover_palette(art)
    assert result['palette']==original
    assert result['primary'].startswith('#')
    assert len(result['schemes'])==4
    for scheme in result['schemes']:
        assert contrast_ratio(scheme['colors']['paper'],scheme['colors']['ink'])>=7
        assert contrast_ratio(scheme['colors']['paper'],scheme['colors']['staff'])>=3
        assert scheme['contrast']>=7
        assert 0<=scheme['panel_opacity']<=1
        assert all(HEX.fullmatch(value) for value in scheme['colors'].values())


def test_palette_endpoint_without_project():
    r=client.post('/api/palette/extract',files={'image':('cover.png',make_art(),'image/png')})
    assert r.status_code==200,r.text
    p=r.json()
    assert len(p['palette'])>=2
    assert [s['id'] for s in p['schemes']]==['paper','dark','muted','vivid']
    assert len({s['colors']['paper'] for s in p['schemes']})==4


def test_bright_neutral_and_transparent_images():
    img=Image.new('RGBA',(120,120),(255,255,255,0));buf=io.BytesIO();img.save(buf,'PNG')
    r=client.post('/api/palette/extract',files={'image':('transparent.png',buf.getvalue(),'image/png')})
    assert r.status_code==200,r.text
    assert r.json()['palette'][0]['hex'].startswith('#')
    for scheme in r.json()['schemes']:
        assert contrast_ratio(scheme['colors']['paper'],scheme['colors']['ink'])>=7


def test_palette_rejects_invalid_and_oversized():
    for name,content,expected in [
        ('image.svg',b'<svg/>',400),('image.png',b'nope',400),('cover.jpg',b'x'*(20*1024*1024+1),413)
    ]:
        r=client.post('/api/palette/extract',files={'image':(name,content,'application/octet-stream')})
        assert r.status_code==expected,(name,r.status_code,r.text[:200])
