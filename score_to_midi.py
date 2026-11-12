"""Convert notated MusicXML notes and expressive tempo cues to piano MIDI.

MusicXML has no exact duration for a fermata or text-only rit./accel. mark.
Those receive documented, conservative performance defaults; explicit
<sound tempo> values remain authoritative.
"""
from __future__ import annotations

from pathlib import Path
import re
import xml.etree.ElementTree as ET

import mido

from score_alignment import STEPS, _child, _score_parts, _tag, _text

TICKS = 480
BEAT_UNITS = {"whole": 4, "half": 2, "quarter": 1, "eighth": .5,
              "16th": .25, "32nd": .125, "64th": .0625}
FERMATA_FACTOR = {"angled": 1.25, "square": 1.75, "double-angled": 1.6,
                  "double-square": 2.0, "henze": 1.5, "curlew": 1.5}
SLOW_WORD = re.compile(r"\b(?:rit\.?|ritardando|ritenuto|rall\.?|rallentando|allargando)\b", re.I)
FAST_WORD = re.compile(r"\b(?:accel\.?|accelerando|stringendo)\b", re.I)
RESET_WORD = re.compile(r"\b(?:a\s+tempo|tempo\s+(?:primo|i|1))\b", re.I)


def _duration(note: ET.Element, divisions: float) -> float:
    raw = _text(note, "duration")
    if raw:
        try:
            return max(0, float(raw) / divisions)
        except ValueError:
            pass
    kind = _text(note, "type")
    value = BEAT_UNITS.get(kind, 0)
    dots = sum(_tag(item) == "dot" for item in note)
    return value * sum(.5 ** i for i in range(dots + 1))


def _tempo(direction: ET.Element) -> float | None:
    sound = _child(direction, "sound")
    if sound is not None and sound.get("tempo"):
        try:
            return float(sound.get("tempo"))
        except ValueError:
            pass
    for item in direction.iter():
        if _tag(item) != "metronome":
            continue
        try:
            minute = float(_text(item, "per-minute"))
        except ValueError:
            continue
        unit = BEAT_UNITS.get(_text(item, "beat-unit"), 1)
        dots = sum(_tag(child) == "beat-unit-dot" for child in item)
        return minute * unit * sum(.5 ** i for i in range(dots + 1))
    return None


def _pitch(note: ET.Element, transpose: int) -> int | None:
    pitch = _child(note, "pitch")
    if pitch is None:
        return None
    step = _text(pitch, "step").upper()
    if step not in STEPS:
        return None
    try:
        value = 12 * (int(_text(pitch, "octave")) + 1) + STEPS[step]
        value += int(float(_text(pitch, "alter", "0"))) + transpose
    except ValueError:
        return None
    return value if 0 <= value <= 127 else None


def _expressive_tempo(explicit: list[tuple[float, float]], directions: list[dict],
                      fermatas: list[dict], last_beat: float) -> list[tuple[float, float]]:
    """Sample text tempo ramps and fermata holds into MIDI set_tempo points."""
    marks = sorted([(0.0, 120.0)] + [(beat, qpm) for beat, qpm in explicit if qpm > 0],
                   key=lambda item: item[0])
    cues = sorted(directions, key=lambda item: item["beat"])
    ramps: list[dict] = []

    def tempo_at(beat: float) -> float:
        chosen = (-1.0, "mark", 120.0)
        for position, qpm in marks:
            if position <= beat + 1e-8 and position >= chosen[0]:
                chosen = (position, "mark", qpm)
        for ramp in ramps:
            if ramp["start"] <= beat + 1e-8 and ramp["start"] >= chosen[0]:
                chosen = (ramp["start"], "ramp", ramp)
        if chosen[1] == "mark":
            return chosen[2]
        ramp = chosen[2]
        fraction = min(1.0, max(0.0, (beat - ramp["start"]) / max(.001, ramp["end"] - ramp["start"])))
        return ramp["from"] + (ramp["to"] - ramp["from"]) * fraction

    # "a tempo" without a numerical <sound> restores the pre-ramp tempo.
    for cue_index, cue in enumerate(cues):
        if RESET_WORD.search(cue["word"]) and cue["tempo"] is None:
            previous_ramp = next((item for item in reversed(cues[:cue_index])
                                  if SLOW_WORD.search(item["word"]) or FAST_WORD.search(item["word"])), None)
            anchor = previous_ramp["beat"] if previous_ramp else cue["beat"]
            earlier = [(beat, qpm) for beat, qpm in marks if beat <= anchor + 1e-8]
            marks.append((cue["beat"], max(earlier, key=lambda item: item[0])[1] if earlier else 120.0))
    marks.sort(key=lambda item: item[0])

    seen_ramps = set()
    for index, cue in enumerate(cues):
        word = cue["word"]
        kind = "slow" if SLOW_WORD.search(word) else "fast" if FAST_WORD.search(word) else None
        start = cue["beat"]
        if not kind or cue["tempo"] is not None or (round(start, 5), kind) in seen_ramps:
            continue
        seen_ramps.add((round(start, 5), kind))
        candidates = []
        if cue["dash_type"] == "start":
            candidates += [other["beat"] for other in cues[index + 1:]
                           if other["part"] == cue["part"] and other["dash_type"] == "stop"
                           and other["dash_number"] == cue["dash_number"] and other["beat"] > start]
        candidates += [beat for beat, _ in marks if beat > start + 1e-8]
        candidates += [other["beat"] for other in cues[index + 1:]
                       if other["beat"] > start and
                       (RESET_WORD.search(other["word"]) or SLOW_WORD.search(other["word"])
                        or FAST_WORD.search(other["word"]))]
        end = min(candidates) if candidates else min(last_beat, start + 4.0)
        if end <= start:
            continue
        initial = tempo_at(start)
        explicit_end = next((qpm for beat, qpm in reversed(marks)
                             if abs(beat - end) < 1e-6), None)
        target = explicit_end if explicit_end is not None and not any(
            RESET_WORD.search(other["word"]) and abs(other["beat"] - end) < 1e-6 for other in cues
        ) else max(30.0, min(300.0, initial * (.75 if kind == "slow" else 1.33)))
        ramps.append({"start": start, "end": end, "from": initial, "to": target, "kind": kind})

    holds: dict[float, dict] = {}
    for mark in fermatas:
        key = round(mark["beat"], 6)
        factor = FERMATA_FACTOR.get(mark["shape"], 1.5)
        if key not in holds:
            holds[key] = {"start": mark["beat"], "end": mark["end"], "factor": factor}
        else:
            holds[key]["end"] = max(holds[key]["end"], mark["end"])
            holds[key]["factor"] = max(holds[key]["factor"], factor)

    # A cadence written rit. -> fermata resolves at the release of the hold.
    # Do not override an explicit tempo change (or an explicit a tempo) there.
    for hold in sorted(holds.values(), key=lambda item: item["start"]):
        preceding = [ramp for ramp in ramps if ramp["start"] <= hold["start"] + 1e-8]
        if not preceding:
            continue
        ramp = max(preceding, key=lambda item: item["start"])
        if ramp["kind"] != "slow" or any(ramp["start"] < beat <= hold["end"] + 1e-8
                                              for beat, _ in marks):
            continue
        original = max(((beat, qpm) for beat, qpm in marks if beat <= ramp["start"] + 1e-8),
                       key=lambda item: item[0])[1]
        marks.append((hold["end"], original))
    marks.sort(key=lambda item: item[0])

    positions = {0.0, *(beat for beat, _ in marks)}
    for ramp in ramps:
        length = ramp["end"] - ramp["start"]
        steps = max(1, int(length / .25 + .999))
        positions.update(ramp["start"] + length * i / steps for i in range(steps + 1))
    for hold in holds.values():
        positions.update((hold["start"], hold["end"]))
    result = []
    for beat in sorted(positions):
        factor = max((hold["factor"] for hold in holds.values()
                      if hold["start"] <= beat + 1e-8 < hold["end"] - 1e-8), default=1.0)
        qpm = tempo_at(beat) / factor
        if not result or abs(qpm - result[-1][1]) >= .01:
            result.append((beat, qpm))
    return result


def extract_performance(path: Path) -> tuple[list[dict], list[tuple[float, float]]]:
    parts = list(_score_parts(ET.parse(path).getroot()))
    if not parts:
        raise ValueError("MusicXML contains no parts")
    spans: list[float] = []
    segments: list[dict] = []
    tempos: list[tuple[int, float, float]] = []
    directions: list[dict] = []
    fermatas: list[dict] = []
    for part_id, measures in parts:
        divisions = 1.0
        transpose = 0
        nominal_span = 4.0
        for index, measure in enumerate(measures):
            cursor = last_start = max_end = 0.0
            barline_fermata = False
            for item in measure:
                tag = _tag(item)
                if tag == "attributes":
                    try:
                        divisions = max(1, float(_text(item, "divisions", str(divisions))))
                    except ValueError:
                        pass
                    trans = _child(item, "transpose")
                    if trans is not None:
                        try:
                            transpose = int(_text(trans, "chromatic", "0")) + 12 * int(_text(trans, "octave-change", "0"))
                        except ValueError:
                            transpose = 0
                    time = _child(item, "time")
                    if time is not None:
                        try:
                            nominal_span = 4 * float(_text(time, "beats", "4")) / float(_text(time, "beat-type", "4"))
                        except (ValueError, ZeroDivisionError):
                            pass
                elif tag == "backup":
                    cursor = max(0, cursor - _duration(item, divisions))
                elif tag == "forward":
                    cursor += _duration(item, divisions)
                    max_end = max(max_end, cursor)
                elif tag in {"direction", "sound"}:
                    qpm = _tempo(item) if tag == "direction" else None
                    if tag == "sound" and item.get("tempo"):
                        try:
                            qpm = float(item.get("tempo"))
                        except ValueError:
                            pass
                    sound = _child(item, "sound") if tag == "direction" else item
                    offset_parent = sound if sound is not None and _child(sound, "offset") is not None else item
                    try:
                        offset = float(_text(offset_parent, "offset", "0")) / divisions
                    except ValueError:
                        offset = 0
                    position = max(0, cursor + offset)
                    if qpm and qpm > 0:
                        tempos.append((index, position, qpm))
                    if tag == "direction":
                        words = " ".join("".join(child.itertext()).strip() for child in item.iter()
                                         if _tag(child) == "words")
                        dashes = next((child for child in item.iter() if _tag(child) == "dashes"), None)
                        if words or dashes is not None:
                            directions.append({"part": part_id, "measure": index, "position": position,
                                               "word": words, "dash_type": dashes.get("type") if dashes is not None else "",
                                               "dash_number": dashes.get("number", "1") if dashes is not None else "1",
                                               "tempo": qpm})
                elif tag == "note":
                    chord = _child(item, "chord") is not None
                    start = last_start if chord else cursor
                    if not chord:
                        last_start = start
                    grace = _child(item, "grace") is not None
                    duration = 0 if grace else _duration(item, divisions)
                    if not chord:
                        cursor += duration
                    max_end = max(max_end, start + duration, cursor)
                    sign = next((child for child in item.iter() if _tag(child) == "fermata"), None)
                    if sign is not None and duration > 0:
                        fermatas.append({"measure": index, "start": start,
                                         "end": start + duration, "shape": (sign.text or "").strip().lower()})
                    if grace or _child(item, "rest") is not None or duration <= 0:
                        continue
                    pitch = _pitch(item, transpose)
                    if pitch is None:
                        continue
                    ties = {mark.get("type") for mark in item.iter() if _tag(mark) in {"tie", "tied"}}
                    segments.append({"part": part_id, "measure": index, "start": start,
                                     "duration": duration, "pitch": pitch,
                                     "voice": _text(item, "voice", "1"), "staff": _text(item, "staff", "1"),
                                     "tie_start": "start" in ties, "tie_stop": "stop" in ties})
                elif tag == "barline" and any(_tag(child) == "fermata" for child in item.iter()):
                    barline_fermata = True
            span = max_end if max_end > 0 else nominal_span
            if barline_fermata:
                fermatas.append({"measure": index, "start": max(0, span - 1),
                                 "end": span, "shape": ""})
            if index >= len(spans):
                spans.append(span)
            else:
                spans[index] = max(spans[index], span)
    starts = [0.0]
    for span in spans:
        starts.append(starts[-1] + span)
    notes: list[dict] = []
    active: dict[tuple, dict] = {}
    for segment in sorted(segments, key=lambda item: (item["measure"], item["start"], item["pitch"])):
        beat = starts[segment["measure"]] + segment["start"]
        end = beat + segment["duration"]
        key = (segment["part"], segment["staff"], segment["voice"], segment["pitch"])
        held = active.get(key) if segment["tie_stop"] else None
        if held is not None:
            held["end"] = max(held["end"], end)
            if not segment["tie_start"]:
                active.pop(key, None)
            continue
        note = {"beat": beat, "end": end, "pitch": segment["pitch"], "velocity": 78}
        notes.append(note)
        if segment["tie_start"]:
            active[key] = note
    if not notes:
        raise ValueError("MusicXML contains no playable pitched notes")
    absolute_tempos = [(starts[index] + relative, qpm) for index, relative, qpm in tempos]
    absolute_directions = [{**cue, "beat": starts[cue["measure"]] + cue["position"]}
                           for cue in directions]
    absolute_fermatas = [{"beat": starts[mark["measure"]] + mark["start"],
                          "end": starts[mark["measure"]] + mark["end"],
                          "shape": mark["shape"]} for mark in fermatas]
    tempo_points = _expressive_tempo(absolute_tempos, absolute_directions,
                                     absolute_fermatas, max(starts[-1], max(note["end"] for note in notes)))
    return notes, tempo_points


def musicxml_to_midi(source: Path, output: Path) -> int:
    notes, tempos = extract_performance(source)
    midi = mido.MidiFile(type=1, ticks_per_beat=TICKS)
    track = mido.MidiTrack()
    midi.tracks.append(track)
    events: list[tuple[int, int, mido.Message | mido.MetaMessage]] = []
    events.append((0, 0, mido.MetaMessage("set_tempo", tempo=500_000)))
    for beat, qpm in tempos:
        if qpm > 0:
            events.append((max(0, round(beat * TICKS)), 0,
                           mido.MetaMessage("set_tempo", tempo=max(1, round(60_000_000 / qpm)))))
    events.append((0, 1, mido.Message("program_change", channel=0, program=0)))
    for note in notes:
        begin = max(0, round(note["beat"] * TICKS))
        end = max(begin + 1, round(note["end"] * TICKS))
        events.append((begin, 2, mido.Message("note_on", channel=0, note=note["pitch"], velocity=note["velocity"])))
        events.append((end, 1, mido.Message("note_off", channel=0, note=note["pitch"], velocity=0)))
    previous = 0
    for tick, _, message in sorted(events, key=lambda item: (item[0], item[1])):
        track.append(message.copy(time=tick - previous))
        previous = tick
    midi.save(output)
    return len(notes)
