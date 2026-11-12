"""Expression marks in XML-only imports must change the generated MIDI clock."""
import tempfile
import unittest
from pathlib import Path

from midi_timing import read_timing
from score_to_midi import extract_performance, musicxml_to_midi


def score(measures):
    return ("<score-partwise version='4.0'><part-list><score-part id='P1'>"
            "<part-name>Piano</part-name></score-part></part-list><part id='P1'>"
            + "".join(f"<measure number='{index + 1}'>" +
                      ("<attributes><divisions>480</divisions><time><beats>4</beats>"
                       "<beat-type>4</beat-type></time></attributes>" if index == 0 else "")
                      + content + "</measure>" for index, content in enumerate(measures))
            + "</part></score-partwise>")


def note(step, notation=""):
    return (f"<note><pitch><step>{step}</step><octave>4</octave></pitch>"
            f"<duration>480</duration><type>quarter</type>{notation}</note>")


START = "<direction><direction-type><words>rit.</words></direction-type><direction-type><dashes type='start' number='1'/></direction-type></direction>"
STOP = "<direction><direction-type><dashes type='stop' number='1'/></direction-type></direction>"
TEMPO = "<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>120</per-minute></metronome></direction-type><sound tempo='120'/></direction>"


class ExpressiveMidiTests(unittest.TestCase):
    def convert(self, xml):
        with tempfile.TemporaryDirectory() as folder:
            source, midi = Path(folder) / "score.musicxml", Path(folder) / "score.mid"
            source.write_text(xml, encoding="utf-8")
            count = musicxml_to_midi(source, midi)
            return count, read_timing(midi), extract_performance(source)[1]

    def test_note_fermata_extends_duration_and_delays_next_attack(self):
        xml = score([TEMPO + note("C") + note("D", "<notations><fermata/></notations>")
                     + note("E") + note("F")])
        count, timing, _ = self.convert(xml)
        self.assertEqual(count, 4)
        self.assertGreater(timing["note_events"][1]["end_second"] - timing["note_events"][1]["second"], .7)
        self.assertGreater(timing["note_events"][2]["second"], 1.2)
        self.assertEqual(timing["tempo_map"][-1]["tempo_us"], 500000)

    def test_ritardando_ramps_and_a_tempo_resets(self):
        xml = score([TEMPO + START + "".join(note(step) for step in "CDEF") + STOP,
                     "<direction><direction-type><words>a tempo</words></direction-type></direction>"
                     + note("G") + note("A")])
        count, timing, points = self.convert(xml)
        self.assertEqual(count, 6)
        self.assertTrue(any(90 < qpm < 120 for beat, qpm in points if 0 < beat < 4))
        self.assertGreater(timing["note_events"][4]["second"], 2.1)
        self.assertAlmostEqual(timing["tempo_map"][-1]["tempo_us"], 500000, delta=1)

    def test_accelerando_ramps_faster(self):
        accelerate = START.replace("rit.", "accel.")
        xml = score([TEMPO + accelerate + "".join(note(step) for step in "CDEF") + STOP,
                     note("G") + note("A")])
        _, timing, points = self.convert(xml)
        self.assertTrue(any(qpm > 120 for beat, qpm in points if beat > 0))
        self.assertLess(timing["note_events"][4]["second"], 1.9)

    def test_explicit_sound_tempo_overrides_text_heuristic(self):
        xml = score([TEMPO + START + "".join(note(step) for step in "CDEF") + STOP,
                     "<direction><direction-type><words>a tempo</words></direction-type>"
                     "<sound tempo='96'/></direction>" + note("G")])
        _, timing, points = self.convert(xml)
        self.assertAlmostEqual(points[-1][1], 96, places=5)
        self.assertAlmostEqual(timing["tempo_map"][-1]["tempo_us"], 625000, delta=1)

    def test_fermata_over_rest_delays_later_notes(self):
        rest = "<note><rest/><duration>480</duration><notations><fermata/></notations></note>"
        xml = score([TEMPO + note("C") + rest + note("D")])
        count, timing, _ = self.convert(xml)
        self.assertEqual(count, 2)
        self.assertGreater(timing["note_events"][1]["second"], 1.2)

    def test_ritardando_at_first_beat_uses_written_tempo(self):
        tempo = TEMPO.replace("120", "90")
        xml = score([tempo + START + "".join(note(step) for step in "CDEF") + STOP])
        _, _, points = self.convert(xml)
        self.assertAlmostEqual(points[0][1], 90)
        self.assertAlmostEqual(points[-1][1], 67.5)

    def test_ritardando_fermata_releases_to_original_tempo_without_a_tempo(self):
        held = note("G", "<notations><fermata/></notations>")
        xml = score([TEMPO + START + "".join(note(step) for step in "CDEF") + STOP,
                     held + note("A")])
        _, timing, points = self.convert(xml)
        self.assertTrue(any(qpm < 120 for beat, qpm in points if 0 < beat < 5))
        self.assertAlmostEqual(next(qpm for beat, qpm in points if abs(beat - 5) < 1e-6), 120)
        self.assertAlmostEqual(timing["tempo_map"][-1]["tempo_us"], 500000, delta=1)

    def test_explicit_tempo_after_fermata_wins_over_automatic_reset(self):
        held = note("G", "<notations><fermata/></notations>")
        new_tempo = "<direction><direction-type><words>Andante</words></direction-type><sound tempo='96'/></direction>"
        xml = score([TEMPO + START + "".join(note(step) for step in "CDEF") + STOP,
                     held + new_tempo + note("A")])
        _, timing, points = self.convert(xml)
        self.assertAlmostEqual(points[-1][1], 96)
        self.assertAlmostEqual(timing["tempo_map"][-1]["tempo_us"], 625000, delta=1)


if __name__ == "__main__":
    unittest.main()
