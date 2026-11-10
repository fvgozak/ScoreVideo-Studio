from pathlib import Path
from app import musicxml_title, RenderRequest


def test_title_movement_priority(tmp_path: Path):
    source = tmp_path / 'score.musicxml'
    source.write_text('''<?xml version="1.0"?>
<score-partwise version="4.0"><work><work-title>Work Name</work-title></work>
<movement-title>Après la tonalité, une ligne vers Ravel</movement-title>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"/></part></score-partwise>''', encoding='utf-8')
    assert musicxml_title(source) == 'Après la tonalité, une ligne vers Ravel'


def test_title_work_namespaced_and_credit(tmp_path: Path):
    source = tmp_path / 'score.musicxml'
    source.write_text('''<score-partwise xmlns="http://www.musicxml.org/ns/musicxml">
<work><work-title>Night Breeze</work-title></work><movement-title>Untitled</movement-title>
<part-list/><part id="P1"/></score-partwise>''', encoding='utf-8')
    assert musicxml_title(source) == 'Night Breeze'
    source.write_text('''<score-partwise><credit page="1"><credit-type>title</credit-type><credit-words>Moonlight</credit-words></credit><part-list/></score-partwise>''', encoding='utf-8')
    assert musicxml_title(source) == 'Moonlight'


def test_scene_payload_forward_compatible():
    req = RenderRequest(layout_mode='singleline',score_position_y=65,
        scene={'fxMode':'aurora','font':'elegant','titleGap':120,
               'auroraPreset':'polar','auroraLow':'#419dff','auroraHigh':'#ff5268'})
    assert req.scene['titleGap'] == 120
    assert req.layout_mode == 'singleline'
