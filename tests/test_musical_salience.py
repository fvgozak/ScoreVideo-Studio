"""Musical salience edge cases without changing the existing UI/renderer."""
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from midi_timing import read_timing
from score_alignment import align_score_to_midi
from musical_salience import build_feature_cache, load_or_build, parse_score_notes, reweight


NAMES = [("C", 0), ("C", 1), ("D", 0), ("D", 1), ("E", 0),
         ("F", 0), ("F", 1), ("G", 0), ("G", 1), ("A", 0), ("A", 1), ("B", 0)]


def note(pitch, duration=480, *, chord=False, voice=1, tie="", grace=False):
    step, alter = NAMES[pitch % 12]
    kind = {120: "16th", 240: "eighth", 480: "quarter", 960: "half", 1920: "whole"}.get(duration, "quarter")
    return ("<note>" + ("<chord/>" if chord else "") + ("<grace/>" if grace else "")
            + f"<pitch><step>{step}</step><alter>{alter}</alter><octave>{pitch//12-1}</octave></pitch>"
            + ("" if grace else f"<duration>{duration}</duration>")
            + f"<voice>{voice}</voice><type>{kind}</type>"
            + (f'<tie type="{tie}"/>' if tie else "") + "</note>")


def score_xml(measures):
    rendered = []
    for index, elements in enumerate(measures, 1):
        rendered.append(f'<measure number="{index}">' + ('<attributes><divisions>480</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>' if index == 1 else "") + "".join(elements) + "</measure>")
    return '<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">' + "".join(rendered) + '</part></score-partwise>'


class MusicalSalienceTests(unittest.TestCase):
    def analyze(self, measures, velocity=None):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        path = Path(folder.name) / "score.musicxml"
        path.write_text(score_xml(measures), encoding="utf-8")
        parsed, _ = parse_score_notes(path)
        matches = []
        for index, item in enumerate(n for n in parsed if n["attack"]):
            value = velocity(index, item) if velocity else 64
            matches.append({"beat": item["beat"], "pitch": item["pitch"],
                            "second": item["beat"]*.5, "end_second": (item["beat"]+item["duration_beats"])*.5,
                            "velocity": value})
        timing = {"note_events": [], "score_alignment": {"note_matches": matches}}
        return build_feature_cache(path, timing), path, timing

    def test_rare_long_note_after_sixteenth_repetition(self):
        measures = [[note(60, 120) for _ in range(16)] for _ in range(8)]
        measures.append([note(67, 960), '<note><rest/><duration>960</duration></note>'])
        result, _, _ = self.analyze(measures)
        notes = result["notes"]
        self.assertGreater(notes[-1]["features"]["duration_rarity"], notes[0]["features"]["duration_rarity"] + .3)
        self.assertLessEqual(notes[-1]["features"]["duration_rarity"], .9)

    def test_single_velocity_accent_and_soft_piece(self):
        measures = [[note(60+i%4*2) for i in range(start, start+4)] for start in range(0, 16, 4)]
        result, _, _ = self.analyze(measures, lambda i, _: 45 if i == 7 else 25)
        notes = result["notes"]
        self.assertGreater(notes[7]["features"]["relative_velocity"], notes[6]["features"]["relative_velocity"] + .25)
        self.assertLess(notes[7]["features"]["absolute_velocity"], .4)

    def test_octave_leap_exceeds_stepwise_motion(self):
        pitches = [60, 62, 64, 65, 67, 69, 71, 83, 81, 79, 77, 76]
        measures = [[note(p) for p in pitches[i:i+4]] for i in range(0, len(pitches), 4)]
        result, _, _ = self.analyze(measures)
        notes = result["notes"]
        self.assertGreater(notes[7]["features"]["melodic_leap"], notes[6]["features"]["melodic_leap"] + .3)

    def test_repeated_pattern_single_pitch_change(self):
        pitches = [60, 62, 64, 65] * 7 + [60, 62, 64, 70]
        measures = [[note(p) for p in pitches[i:i+4]] for i in range(0, len(pitches), 4)]
        result, _, _ = self.analyze(measures)
        notes = result["notes"]
        self.assertGreater(notes[-1]["features"]["pattern_surprise"], notes[-5]["features"]["pattern_surprise"] + .2)

    def test_one_duration_is_neutral_and_reweight_uses_cached_features(self):
        measures = [[note(60+i) for i in range(4)] for _ in range(3)]
        cache, path, timing = self.analyze(measures)
        self.assertTrue(all(n["features"]["duration_rarity"] == .5 for n in cache["notes"]))
        default = reweight(cache, density=.05)
        changed = reweight(cache, weights={"relative_velocity": 0}, enabled={"pitch_salience": False}, density=.30)
        self.assertNotEqual(default["threshold"], changed["threshold"])
        self.assertTrue(all(.2 <= n["highlight_intensity"] <= 1 for n in changed["notes"]))
        self.assertTrue(all(math.isfinite(n["salience_score"]) for n in changed["notes"]))
        neutral = reweight(cache, enabled={name: False for name in cache["notes"][0]["features"]})
        self.assertTrue(all(n["salience_score"] == .5 for n in neutral["notes"]))
        self.assertTrue(all(n["highlight_intensity"] == .2 for n in neutral["notes"]))
        (path.parent / "score.mid").write_bytes(b"test fingerprint")
        first = load_or_build(path.parent, path, timing)
        with patch("musical_salience.build_feature_cache", side_effect=AssertionError("reparsed")):
            second = load_or_build(path.parent, path, timing)
        self.assertEqual(first["fingerprint"], second["fingerprint"])

    def test_chord_polyphony_tie_and_grace_are_not_new_attacks(self):
        measures = [
            [note(60), note(64, chord=True), note(67, chord=True), note(69),
             '<backup><duration>960</duration></backup>', note(48, 960, voice=2)],
            [note(72, 1920, tie="start")],
            [note(72, 1920, tie="stop"), note(74, grace=True)],
        ]
        result, _, _ = self.analyze(measures)
        notes = result["notes"]
        self.assertEqual(result["attack_count"], 6)
        chord = [n for n in notes if n["beat"] == 0 and n["voice"] == "1"]
        self.assertEqual(len(chord), 3)
        self.assertEqual(len({n["features"]["melodic_leap"] for n in chord}), 1)
        origin = next(n for n in notes if n["pitch"] == 72 and not n.get("continuation_of"))
        continuation = next(n for n in notes if n.get("continuation_of"))
        self.assertEqual(origin["duration_beats"], 8)
        self.assertEqual(continuation["continuation_of"], origin["note_id"])
        self.assertEqual(continuation["features"], origin["features"])
        self.assertEqual(next(n for n in notes if n.get("grace"))["available"]["duration_rarity"], False)

    def test_midi_only_has_no_notated_duration_feature(self):
        timing = {"note_events": [{"beat": i, "pitch": 60+i, "velocity": 35,
                                   "second": i*.5, "end_second": i*.5+.3} for i in range(5)]}
        cache = build_feature_cache(None, timing)
        self.assertEqual(cache["note_count"], 5)
        self.assertTrue(all(not n["available"]["duration_rarity"] for n in cache["notes"]))
        self.assertTrue(all(n["note_id"].startswith("midi:") for n in cache["notes"]))

    def test_notated_dots_and_tuplets_ignore_performance_seconds(self):
        triplet = (note(60, 160).replace("<type>quarter</type>",
                   "<type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification>"))
        dotted = note(62, 360).replace("<type>quarter</type>", "<type>eighth</type><dot/>")
        cache, _, _ = self.analyze([[triplet, dotted]])
        self.assertAlmostEqual(cache["notes"][0]["duration_beats"], 1/3, places=5)
        self.assertEqual(cache["notes"][1]["duration_beats"], .75)
        self.assertNotEqual(cache["notes"][0]["duration_beats"], cache["notes"][1]["duration_beats"])

    def test_shipped_musicxml_and_midi_pair(self):
        example = Path(__file__).resolve().parents[1] / "examples"
        score, midi = example / "small_morning.musicxml", example / "small_morning.mid"
        timing = read_timing(midi)
        timing["score_alignment"] = align_score_to_midi(score, midi, timing)
        cache = build_feature_cache(score, timing)
        result = reweight(cache)
        self.assertGreater(cache["attack_count"], 0)
        self.assertGreater(sum(n["available"]["relative_velocity"] for n in cache["notes"]), 0)
        self.assertLess(cache["pitch_stats"]["minimum"], cache["pitch_stats"]["maximum"])
        self.assertTrue(all(0 <= n["salience_score"] <= 1 for n in result["notes"]))


if __name__ == "__main__":
    unittest.main()
