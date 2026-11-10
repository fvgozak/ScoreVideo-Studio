"""Regression tests for fermata, timing shifts and rolled chords."""
import tempfile
import unittest
from pathlib import Path
import mido
from score_alignment import extract_score_attacks, align_score_to_midi


def xml_for_measures(measures):
    parts = ['''<?xml version="1.0" encoding="utf-8"?>
    <score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">''']
    for index, notes in enumerate(measures):
        parts.append(f'<measure number="{index + 1}">')
        if index == 0:
            parts.append('<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>')
        for n in notes:
            if len(n) == 4:
                step, octave, duration, notation = n
            else:
                step, octave, duration = n
                notation = ''
            if step == 'rest':
                parts.append(f'<note><rest/><duration>{duration}</duration></note>')
            else:
                parts.append(f'<note><pitch><step>{step}</step><octave>{octave}</octave></pitch><duration>{duration}</duration>{notation}</note>')
        parts.append('</measure>')
    parts.append('</part></score-partwise>')
    return ''.join(parts)


def make_midi(path, notes):
    """notes: [(seconds, MIDI pitch, velocity)] with tempo fixed at 120bpm."""
    mid = mido.MidiFile(ticks_per_beat=480)
    track = mido.MidiTrack()
    mid.tracks.append(track)
    timeline = []
    for seconds, pitch, vel in notes:
        tick = int(round(seconds * 960))
        timeline.append((tick, 1, mido.Message('note_on', note=pitch, velocity=vel)))
        timeline.append((tick + 96, 0, mido.Message('note_off', note=pitch, velocity=0)))
    current = 0
    for tick, _, message in sorted(timeline):
        track.append(message.copy(time=tick-current))
        current=tick
    mid.save(path)


class AlignmentTests(unittest.TestCase):
    def test_fermata_retimes_all_following_notes_without_moving_score_beats(self):
        # Same written beats 0,1,2,3. Performance waits 1.5 extra seconds
        # before note 3. Old beatToSeconds(2) predicted 1.0: wrong.
        xml = xml_for_measures([[
            ('C',4,480),('D',4,480,'<notations><fermata type="upright"/></notations>'),
            ('E',4,480),('F',4,480)]])
        with tempfile.TemporaryDirectory() as tmp:
            sc,mi=Path(tmp)/'fermata.musicxml',Path(tmp)/'fermata.mid'
            sc.write_text(xml)
            make_midi(mi,[(0,60,60),(.5,62,70),(2.5,64,80),(3.0,65,90)])
            score=extract_score_attacks(sc)
            self.assertEqual([n['beat'] for n in score],[0,1,2,3])
            result=align_score_to_midi(sc,mi)
            self.assertEqual(result['status'],'ok',result)
            self.assertEqual(result['coverage'],1)
            self.assertEqual([(x['beat'],x['second']) for x in result['anchors']],
                             [(0,0),(1,.5),(2,2.5),(3,3)])
            self.assertEqual([x['velocity'] for x in result['note_matches']],[60,70,80,90])

    def test_arpeggiated_chord_preserves_three_distinct_attacks(self):
        xml='''<score-partwise version="4.0"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>
        <note><pitch><step>C</step><octave>4</octave></pitch><duration>480</duration></note>
        <note><chord/><pitch><step>E</step><octave>4</octave></pitch><duration>480</duration></note>
        <note><chord/><pitch><step>G</step><octave>4</octave></pitch><duration>480</duration></note>
        <note><pitch><step>A</step><octave>4</octave></pitch><duration>480</duration></note></measure></part></score-partwise>'''
        with tempfile.TemporaryDirectory() as tmp:
            sc,mi=Path(tmp)/'rolled.musicxml',Path(tmp)/'rolled.mid'
            sc.write_text(xml)
            make_midi(mi,[(0,60,30),(.08,64,55),(.20,67,90),(.5,69,70)])
            r=align_score_to_midi(sc,mi)
            self.assertEqual(r['coverage'],1,r)
            self.assertEqual(len(r['note_matches']),4)
            for actual,expected in zip([x['second'] for x in r['note_matches']],[0,.08,.2,.5]):
                self.assertAlmostEqual(actual,expected,delta=.001)

    def test_multivoice_backup_does_not_double_score_length(self):
        xml='''<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>480</divisions></attributes>
        <note><pitch><step>C</step><octave>5</octave></pitch><duration>960</duration></note>
        <backup><duration>960</duration></backup>
        <note><pitch><step>C</step><octave>3</octave></pitch><duration>480</duration></note>
        <note><pitch><step>G</step><octave>3</octave></pitch><duration>480</duration></note>
        </measure><measure number="2"><note><pitch><step>D</step><octave>5</octave></pitch><duration>480</duration></note></measure></part></score-partwise>'''
        with tempfile.TemporaryDirectory() as tmp:
            sc=Path(tmp)/'multi.musicxml'
            sc.write_text(xml)
            r=extract_score_attacks(sc)
            self.assertEqual([(x['beat'],x['pitches']) for x in r],[(0,[48,72]),(1,[55]),(2,[74])])

    def test_tied_continuation_is_not_new_attack(self):
        xml = xml_for_measures([[('C',4,480,'<tie type="start"/>'),
                                 ('C',4,480,'<tie type="stop"/>'),('E',4,480)]])
        with tempfile.TemporaryDirectory() as tmp:
            sc=Path(tmp)/'ties.musicxml'
            sc.write_text(xml)
            self.assertEqual([x['beat'] for x in extract_score_attacks(sc)],[0,2])

    def test_mismatched_score_reports_warning(self):
        xml=xml_for_measures([[('C',4,480),('D',4,480),('E',4,480),('F',4,480)]])
        with tempfile.TemporaryDirectory() as tmp:
            sc,mi=Path(tmp)/'wrong.musicxml',Path(tmp)/'wrong.mid'
            sc.write_text(xml)
            make_midi(mi,[(0,72,50),(.5,74,50),(1,76,50),(1.5,77,50)])
            r=align_score_to_midi(sc,mi)
            self.assertEqual(r['status'],'needs-review')
            self.assertLess(r['coverage'],.9)

if __name__=='__main__': unittest.main()


class DiagnosticTests(unittest.TestCase):
    def test_fermata_pause_is_exposed_in_diagnostic_report(self):
        from diagnose_alignment import analyze
        xml = xml_for_measures([[
            ('C',4,480),('D',4,480,'<notations><fermata type="upright"/></notations>'),
            ('E',4,480),('F',4,480)]])
        with tempfile.TemporaryDirectory() as tmp:
            score, midi = Path(tmp)/'fermata.musicxml', Path(tmp)/'fermata.mid'
            score.write_text(xml)
            make_midi(midi, [(0,60,60),(.5,62,70),(2.5,64,80),(3.0,65,90)])
            aligned, rows, pauses = analyze(score, midi)
            self.assertEqual(aligned['coverage'],1)
            self.assertAlmostEqual(rows[2]['drift_sec'],1.5,places=3)
            self.assertAlmostEqual(pauses[0]['extra_time_sec'],1.5,places=3)
