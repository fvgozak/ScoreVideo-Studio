from pathlib import Path
import textwrap
import mido

from score_alignment import extract_score_ties, align_score_to_midi
from midi_timing import read_timing


def test_tie_link_across_measure_and_real_midi_note_off(tmp_path: Path):
    score = tmp_path / 'tied.musicxml'
    score.write_text(textwrap.dedent('''\
    <?xml version="1.0" encoding="utf-8"?>
    <!DOCTYPE score-partwise  PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
    <score-partwise version="4.0">
    <work><work-title>Internal XML title</work-title></work>
    <part-list><score-part id="P1"><part-name>Piano</part-name><part-abbreviation>Pno</part-abbreviation><score-instrument id="I1"><instrument-name>Piano</instrument-name></score-instrument><midi-instrument id="I1"><midi-channel>1</midi-channel><midi-program>1</midi-program></midi-instrument></score-part></part-list>
    <part id="P1">
      <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type><tie type="start"/><notations><tied type="start"/></notations></note>
      </measure>
      <measure number="2">
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type><tie type="stop"/><notations><tied type="stop"/></notations></note>
      </measure>
    </part></score-partwise>
    '''), encoding='utf-8')
    links=extract_score_ties(score)
    assert links==[{'beat':4.0,'pitch':60,'origin_beat':0.0}]
    mid=tmp_path/'performance.mid'
    song=mido.MidiFile(ticks_per_beat=480)
    track=mido.MidiTrack();song.tracks.append(track)
    track.append(mido.Message('note_on',channel=0,note=60,velocity=53,time=0))
    track.append(mido.Message('note_off',channel=0,note=60,velocity=0,time=3840))
    song.save(mid)
    timing=read_timing(mid)
    assert len(timing['note_events'])==1
    assert abs(timing['note_events'][0]['end_second']-4.0)<0.01
    matches=align_score_to_midi(score,mid,timing)['note_matches']
    assert len(matches)==1
    assert matches[0]['pitch']==60
    assert matches[0]['end_second']==4.0


def test_chain_of_three_tied_notes(tmp_path: Path):
    score=tmp_path/'chained.musicxml'
    notes = [
      '<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/></note>',
      '<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><tie type="start"/></note>',
      '<note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/></note>',
    ]
    xml='''<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions></attributes>{}</measure></part></score-partwise>'''.format(''.join(notes))
    score.write_text(xml,encoding='utf-8')
    assert extract_score_ties(score)==[
      {'beat':1.0,'pitch':64,'origin_beat':0.0},
      {'beat':2.0,'pitch':64,'origin_beat':0.0},
    ]
