"""Regression tests for performance-order MusicXML and repeat-aware alignment."""
from pathlib import Path
import tempfile
import xml.etree.ElementTree as ET

import mido
from fastapi.testclient import TestClient

from app import app
from midi_timing import read_timing
from score_alignment import extract_score_attacks
from score_repeats import performance_measure_order, unfold_musicxml
from app import choose_performance_score


def piece(pitches: list[str], forward=1, backward=3, endings=False):
    xml=['<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">']
    for i, n in enumerate(pitches):
        xml.append(f'<measure number="{i+1}">')
        if i == 0:
            xml.append('<attributes><divisions>480</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>')
        if i == forward:
            xml.append('<barline location="left"><repeat direction="forward"/></barline>')
        if endings and i == backward:
            xml.append('<barline location="left"><ending type="start" number="1"/></barline>')
        if endings and i == backward+1:
            xml.append('<barline location="left"><ending type="start" number="2"/></barline>')
        xml.append(f'<note><pitch><step>{n}</step><octave>4</octave></pitch><duration>480</duration><type>quarter</type></note>')
        if i == backward:
            xml.append('<barline location="right">')
            if endings:
                xml.append('<ending type="stop" number="1"/>')
            xml.append('<repeat direction="backward"/></barline>')
        if endings and i == backward+1:
            xml.append('<barline location="right"><ending type="discontinue" number="2"/></barline>')
        xml.append('</measure>')
    xml.append('</part></score-partwise>')
    return ''.join(xml)


def midi_file(path, pitches):
    mid=mido.MidiFile(ticks_per_beat=480)
    track=mido.MidiTrack()
    mid.tracks.append(track)
    for n in pitches:
        pitch={'C':60,'D':62,'E':64,'F':65,'G':67,'A':69}[n]
        track.append(mido.Message('note_on', note=pitch, velocity=85, time=0))
        track.append(mido.Message('note_off', note=pitch, velocity=0, time=480))
    mid.save(path)


def test_forward_backward_repeat_unfolded_and_alignment():
    with tempfile.TemporaryDirectory() as d:
        root=Path(d)
        sc=root/'score.musicxml'; sc.write_text(piece(['C','D','E','F','G']))
        midi_file(root/'score.mid',['C','D','E','F','D','E','F','G'])
        order, meta=performance_measure_order(sc)
        assert order==[0,1,2,3,1,2,3,4]
        assert meta['spans']==[{'start':2,'end':4,'times':2}]
        summary=unfold_musicxml(sc,root/'expanded.musicxml')
        assert summary['changed']
        assert len(extract_score_attacks(root/'expanded.musicxml'))==8
        assert ET.parse(sc).getroot().find('.//repeat') is not None
        alignment,choice=choose_performance_score(root, read_timing(root/'score.mid'))
        assert choice['mode']=='unfolded', choice
        assert choice['playback_measures']==8
        assert alignment['matched_notes']==8, alignment
        assert alignment['coverage']>=.9


def test_first_second_endings_and_original_kept():
    with tempfile.TemporaryDirectory() as d:
        root=Path(d)
        sc=root/'score.musicxml'; sc.write_text(piece(['C','D','E','F','G'],endings=True))
        assert performance_measure_order(sc)[0]==[0,1,2,3,1,2,4]
        midi_file(root/'score.mid',['C','D','E','F','D','E','G'])
        alignment,choice=choose_performance_score(root,read_timing(root/'score.mid'))
        assert choice['mode']=='unfolded', choice
        assert alignment['matched_notes']==7, alignment
        assert len(extract_score_attacks(root/'score-playback.musicxml'))==7
        assert len(extract_score_attacks(sc))==5


def test_midi_without_repeats_does_not_unfold():
    with tempfile.TemporaryDirectory() as d:
        root=Path(d)
        sc=root/'score.musicxml'; sc.write_text(piece(['C','D','E','F','G']))
        midi_file(root/'score.mid',['C','D','E','F','G'])
        _,choice=choose_performance_score(root,read_timing(root/'score.mid'))
        assert choice['mode']=='written'
        assert not (root/'score-playback.musicxml').exists()


def test_legacy_endpoint_automatically_unfolds_repeat():
    # Test the normal upgrade path used for pre-v0.13 projects.
    import json
    from app import DATA
    with tempfile.TemporaryDirectory() as d:
        with TestClient(app) as client:
            root=Path(d)
            sc=root/'score.musicxml';sc.write_text(piece(['C','D','E','F','G']))
            midi_file(root/'score.mid',['C','D','E','F','D','E','F','G'])
            audio=(Path(__file__).resolve().parents[1]/'examples/small_morning.wav').read_bytes()
            resp=client.post('/api/projects',files={
               'score': ('repeat.musicxml',sc.read_bytes(),'application/xml'),
               'midi':('repeat.mid',(root/'score.mid').read_bytes(),'audio/midi'),
               'audio':('audio.wav',audio,'audio/wav')})
            assert resp.status_code==200,resp.text
            meta=resp.json();assert meta['repeat_info']['mode']=='unfolded'
            score_xml=client.get(f"/api/projects/{meta['id']}/score").text
            assert score_xml.count('<measure ') ==8
            assert '<repeat' not in score_xml


def test_ending_start_on_previous_right_barline_applies_to_next_measure():
    from score_repeats import _labels
    import xml.etree.ElementTree as ET
    measures = [ET.fromstring(f'<measure number="{i+1}"/>') for i in range(3)]
    ET.SubElement(ET.SubElement(measures[0], 'barline', location='right'), 'ending', type='start', number='1')
    ET.SubElement(ET.SubElement(measures[1], 'barline', location='right'), 'ending', type='stop', number='1')
    assert _labels(measures)==[frozenset(),frozenset({1}),frozenset()]


def test_three_pass_repeat_and_xml_title_unchanged():
    with tempfile.TemporaryDirectory() as d:
        root=Path(d)
        source=root/'score.musicxml'
        xml=piece(['C','D','E','F','G'],forward=1,backward=3).replace('direction="backward"','direction="backward" times="3"')
        source.write_text(xml)
        order,_=performance_measure_order(source)
        assert order == [0,1,2,3,1,2,3,1,2,3,4]
        unfold_musicxml(source,root/'score-playback.musicxml')
        assert ET.parse(source).getroot().find('.//repeat') is not None
        assert len(extract_score_attacks(root/'score-playback.musicxml'))==11


def test_short_repeat_inside_long_piece_is_not_rejected_by_global_ratio():
    """A four-bar repeat in a 100-bar score adds only 3.8% MIDI coverage.

    Old logic required an >=8 percentage point global gain and therefore
    silently preferred the wrong, unexpanded MusicXML despite a perfect match.
    """
    import mido
    with tempfile.TemporaryDirectory() as d:
        root=Path(d)
        pitches=[48+(i*7+i*i*3)%30 for i in range(100)]
        start,end=48,51
        names=['C','C','D','D','E','F','F','G','G','A','A','B']
        alterations=[0,1,0,1,0,0,1,0,1,0,1,0]
        xml=['<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">']
        for i,pitch in enumerate(pitches):
            xml.append(f'<measure number="{i+1}">')
            if i==0:
                xml.append('<attributes><divisions>480</divisions><time><beats>1</beats><beat-type>4</beat-type></time></attributes>')
            if i==start:xml.append('<barline location="left"><repeat direction="forward"/></barline>')
            pc=pitch%12
            xml.append(f'<note><pitch><step>{names[pc]}</step><alter>{alterations[pc]}</alter><octave>{pitch//12-1}</octave></pitch><duration>480</duration><type>quarter</type></note>')
            if i==end:xml.append('<barline location="right"><repeat direction="backward"/></barline>')
            xml.append('</measure>')
        xml.append('</part></score-partwise>')
        (root/'score.musicxml').write_text(''.join(xml))

        def write_midi(sequence):
            mid=mido.MidiFile(ticks_per_beat=480)
            track=mido.MidiTrack()
            mid.tracks.append(track)
            for pitch in sequence:
                track.append(mido.Message('note_on',note=pitch,velocity=85,time=0))
                track.append(mido.Message('note_off',note=pitch,velocity=0,time=480))
            mid.save(root/'score.mid')

        expanded=pitches[:end+1]+pitches[start:end+1]+pitches[end+1:]
        write_midi(expanded)
        alignment,selected=choose_performance_score(root,read_timing(root/'score.mid'))
        assert selected['mode']=='unfolded', selected
        assert selected['source_measures']==100
        assert selected['playback_measures']==104
        assert alignment['matched_notes']==len(expanded)
        assert selected['matching']['newly_explained_midi_notes']==4

        # An otherwise identical MIDI with no second pass must not be unfolded.
        write_midi(pitches)
        alignment,selected=choose_performance_score(root,read_timing(root/'score.mid'))
        assert selected['mode']=='written', selected
        assert selected['expanded'] is False
        assert not (root/'score-playback.musicxml').exists()


def test_existing_project_reanalyzes_v1_repeat_decision_on_next_load(monkeypatch):
    """A saved v14 project is upgraded in place, without touching user effects."""
    import app as service
    import json
    with tempfile.TemporaryDirectory() as tmp:
        data=Path(tmp)
        monkeypatch.setattr(service,'DATA',data)
        project='aabbccddeeff00112233445566778899'
        folder=data/project
        folder.mkdir()
        (folder/'score.musicxml').write_text(piece(['C','D','E','F','G']))
        midi_file(folder/'score.mid',['C','D','E','F','D','E','F','G'])
        data_meta={
            'has_score': True,
            'score_name': 'score.musicxml',
            'musicxml_title': 'Keep this title',
            'repeat_info': {'mode': 'written','warning': 'old result'},
            'score_alignment': {'method': 'pitch-onset-anchors-v1'},
            'effect_settings': {'my_custom_effect': 'preserve'},
            'schema_version': 42,
        }
        (folder/'meta.json').write_text(json.dumps(data_meta))
        refreshed=service.get_project(project)
        assert refreshed['repeat_info']['analysis_version']==2
        assert refreshed['repeat_info']['mode']=='unfolded'
        assert refreshed['effect_settings']==data_meta['effect_settings']
        assert refreshed['schema_version']==42
        assert (folder/'score-playback.musicxml').is_file()
