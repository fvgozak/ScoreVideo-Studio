"""Cached, score-aware musical salience features. No rendering/UI dependencies."""
from __future__ import annotations

from collections import Counter, defaultdict, deque
from fractions import Fraction
from math import log2
from pathlib import Path
import json
import math
import xml.etree.ElementTree as ET

from score_alignment import STEPS, _child, _score_parts, _tag, _text

VERSION = 1
DEFAULT_WEIGHTS = {
    "duration_rarity": .20, "relative_velocity": .20,
    "pitch_salience": .10, "melodic_leap": .10,
    "pattern_surprise": .20, "structural_salience": .15,
    "absolute_velocity": .05,
}
FEATURES = tuple(DEFAULT_WEIGHTS)


def _clamp(value, low=0.0, high=1.0):
    value = float(value)
    return max(low, min(high, value)) if math.isfinite(value) else low


def _quantile(values, fraction):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = (len(ordered) - 1) * fraction
    lower = math.floor(index)
    upper = math.ceil(index)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (index - lower)


def _duration(note, divisions):
    raw = _text(note, "duration")
    if raw:
        try:
            return max(0.0, float(raw) / divisions)
        except ValueError:
            pass
    types = {"maxima": 32, "long": 16, "breve": 8, "whole": 4,
             "half": 2, "quarter": 1, "eighth": .5, "16th": .25,
             "32nd": .125, "64th": .0625, "128th": .03125}
    length = types.get(_text(note, "type"), 0)
    dots = sum(_tag(c) == "dot" for c in note)
    length *= sum(.5 ** i for i in range(dots + 1))
    modification = _child(note, "time-modification")
    if modification is not None:
        try:
            length *= float(_text(modification, "normal-notes", "1")) / float(_text(modification, "actual-notes", "1"))
        except (ValueError, ZeroDivisionError):
            pass
    return length


def _duration_key(beats):
    return str(Fraction(max(0.0, beats)).limit_denominator(96))


def parse_score_notes(path: Path):
    """Read notated attacks, including part/voice and exact rational beat length.

    Tie continuations and grace notes are returned but never counted as new
    rhythmic/velocity observations. Their IDs remain inspectable.
    """
    parts = list(_score_parts(ET.parse(path).getroot()))
    spans = []
    raw = []
    ties = {}
    for part_index, (part_id, measures) in enumerate(parts):
        divisions, nominal, transpose = 1.0, 4.0, 0
        for measure_index, measure in enumerate(measures):
            cursor = last_start = max_end = 0.0
            number = measure.attrib.get("number", str(measure_index + 1))
            for element in measure:
                tag = _tag(element)
                if tag == "attributes":
                    try:
                        divisions = max(1.0, float(_text(element, "divisions", str(divisions))))
                    except ValueError:
                        pass
                    signature = _child(element, "time")
                    if signature is not None:
                        try:
                            nominal = 4 * float(_text(signature, "beats", "4")) / float(_text(signature, "beat-type", "4"))
                        except (ValueError, ZeroDivisionError):
                            pass
                    tr = _child(element, "transpose")
                    if tr is not None:
                        try:
                            transpose = int(_text(tr, "chromatic", "0")) + 12 * int(_text(tr, "octave-change", "0"))
                        except ValueError:
                            transpose = 0
                elif tag == "backup":
                    cursor = max(0.0, cursor - _duration(element, divisions))
                elif tag == "forward":
                    cursor += _duration(element, divisions)
                    max_end = max(max_end, cursor)
                elif tag == "note":
                    chord = _child(element, "chord") is not None
                    grace = _child(element, "grace") is not None
                    start = last_start if chord else cursor
                    if not chord:
                        last_start = start
                    length = 0.0 if grace else _duration(element, divisions)
                    if not chord:
                        cursor += length
                    max_end = max(max_end, start + length, cursor)
                    pitch_node = _child(element, "pitch")
                    if pitch_node is None:
                        continue
                    step = _text(pitch_node, "step").upper()
                    if step not in STEPS:
                        continue
                    try:
                        pitch = 12 * (int(_text(pitch_node, "octave")) + 1) + STEPS[step] + int(float(_text(pitch_node, "alter", "0"))) + transpose
                    except ValueError:
                        continue
                    if not 0 <= pitch <= 127:
                        continue
                    voice, staff = _text(element, "voice", "1"), _text(element, "staff", "1")
                    tie_types = {c.attrib.get("type") for c in element if _tag(c) == "tie"}
                    tie_key = (part_id, staff, voice, pitch)
                    origin = ties.get(tie_key) if "stop" in tie_types else None
                    if origin is not None:
                        origin["duration_beats"] += length
                    entry = {"part": part_id or str(part_index), "voice": voice, "staff": staff,
                             "measure_index": measure_index, "measure": number,
                             "relative_beat": start, "duration_beats": length, "pitch": pitch,
                             "grace": grace, "tie_continuation": "stop" in tie_types,
                             "origin": origin, "attack": not grace and "stop" not in tie_types}
                    raw.append(entry)
                    if "start" in tie_types:
                        ties[tie_key] = origin or entry
                    elif "stop" in tie_types:
                        ties.pop(tie_key, None)
            if measure_index == len(spans):
                spans.append(max_end or nominal)
            else:
                spans[measure_index] = max(spans[measure_index], max_end or nominal)
    starts = [0.0]
    for span in spans:
        starts.append(starts[-1] + span)
    counts = Counter()
    raw.sort(key=lambda n: (n["measure_index"], n["relative_beat"], n["part"], n["voice"], n["pitch"]))
    for note in raw:
        note["beat"] = round(starts[note["measure_index"]] + note.pop("relative_beat"), 6)
        key = (note["beat"], note["pitch"])
        occurrence = counts[key]
        counts[key] += 1
        note["note_id"] = f'{note["beat"]:.6f}:{note["pitch"]}:{occurrence}'
        note["duration_beats"] = round(note["duration_beats"], 6)
        if note["origin"] is not None:
            note["continuation_of"] = note["origin"].get("note_id")
        note.pop("origin")
    return raw, starts


def _midi_notes(timing):
    return [{"note_id": f"midi:{i}", "part": "MIDI", "voice": "all", "staff": "1",
             "measure_index": int(float(e.get("beat", 0)) // 4), "measure": str(int(float(e.get("beat", 0)) // 4) + 1),
             "beat": float(e.get("beat", 0)), "pitch": int(e["pitch"]), "duration_beats": None,
             "attack": True, "grace": False, "tie_continuation": False,
             "velocity": int(e.get("velocity", 64)), "second": float(e.get("second", 0)),
             "end_second": float(e.get("end_second", e.get("second", 0)))}
            for i, e in enumerate(timing.get("note_events", []))]


def _attach_performance(notes, timing):
    matched = defaultdict(deque)
    for item in (timing.get("score_alignment") or {}).get("note_matches", []):
        matched[(round(float(item["beat"]), 6), int(item["pitch"]))].append(item)
    for note in notes:
        if not note["attack"]:
            continue
        queue = matched.get((round(note["beat"], 6), note["pitch"]))
        if queue:
            event = queue.popleft()
            note["velocity"] = int(event["velocity"])
            note["second"] = float(event["second"])
            note["end_second"] = float(event.get("end_second", event["second"]))


def _rarity(key, counts, total, alpha=.5):
    if total < 2 or len(counts) < 2:
        return .5
    probability = (counts[key] + alpha) / (total + alpha * len(counts))
    maximum = -log2(alpha / (total + alpha * len(counts)))
    return _clamp((-log2(probability) / maximum) / .8, 0, .9)


def _pitch_feature(note, global_summary, local_pitches):
    if not global_summary:
        return .5, {"global": .5, "local": .5}
    low, high, middle, global_counts, global_count = global_summary
    extent = max(1, high - low)
    extreme = _clamp(abs(note["pitch"] - middle) / (extent * .6))
    def bucket(p):
        return int(p // 6)
    local_counts = Counter(map(bucket, local_pitches))
    global_score = .65 * _rarity(bucket(note["pitch"]), global_counts, global_count) + .35 * extreme
    local_score = _rarity(bucket(note["pitch"]), local_counts, len(local_pitches)) if len(local_pitches) >= 6 else .5
    return _clamp(.55 * global_score + .45 * local_score, 0, .9), {"global": round(global_score, 4), "local": round(local_score, 4)}


def _pattern_features(groups):
    """Conditional n-gram surprise with shorter-context backoff."""
    tokens = []
    for index, group in enumerate(groups):
        previous = groups[index - 1] if index else None
        interval = round(group["representative"]["pitch"] - previous["representative"]["pitch"]) if previous else 0
        duration = group["representative"].get("duration_beats")
        if duration is None and previous:
            duration = max(0, group["beat"] - previous["beat"])
        tokens.append((max(-24, min(24, interval)), _duration_key(duration or 0)))
    vocabulary = len(set(tokens)) + 1
    tables = {size: defaultdict(Counter) for size in (1, 2, 3)}
    for index, token in enumerate(tokens):
        for size in tables:
            if index >= size:
                tables[size][tuple(tokens[index-size:index])][token] += 1
    result = []
    for index, token in enumerate(tokens):
        value = .5
        for size in (3, 2, 1):
            if index < size:
                continue
            counts = tables[size][tuple(tokens[index-size:index])]
            total = sum(counts.values())
            if total < 3:
                continue
            probability = (counts[token] + .5) / (total + .5 * vocabulary)
            value = _clamp(-log2(probability) / max(1, log2(total + .5 * vocabulary)), 0, .95)
            break
        result.append(value)
    return result


def build_feature_cache(score_path: Path | None, timing: dict) -> dict:
    """Analyze once. Results are independent of weights and highlight density."""
    if score_path is not None:
        notes, measure_starts = parse_score_notes(score_path)
        _attach_performance(notes, timing)
    else:
        notes, measure_starts = _midi_notes(timing), []
    attacks = [n for n in notes if n["attack"]]
    voices = defaultdict(list)
    for note in attacks:
        voices[(note["part"], note["staff"], note["voice"])].append(note)
    for voice_notes in voices.values():
        voice_notes.sort(key=lambda n: (n["beat"], n["pitch"]))
    all_pitches = [n["pitch"] for n in attacks]
    global_pitch_summary = (_quantile(all_pitches, .05), _quantile(all_pitches, .95),
                            _quantile(all_pitches, .5), Counter(p // 6 for p in all_pitches), len(all_pitches)) \
        if len(all_pitches) >= 3 and len(set(all_pitches)) >= 2 else None
    all_durations = Counter(_duration_key(n["duration_beats"]) for n in attacks if n["duration_beats"] is not None)
    group_by_id = {}
    measure_notes = defaultdict(list)
    for voice_key, voice_notes in voices.items():
        for note in voice_notes:
            measure_notes[(voice_key, note["measure_index"])].append(note)
    local_windows = {}
    for voice_notes in voices.values():
        groups = []
        for note in voice_notes:
            group = groups[-1] if groups and abs(groups[-1]["beat"] - note["beat"]) < 1e-6 else None
            if group is None:
                group = {"beat": note["beat"], "notes": [], "representative": note}
                groups.append(group)
            group["notes"].append(note)
            if note["pitch"] > group["representative"]["pitch"]:
                group["representative"] = note
        surprise = _pattern_features(groups)
        leaps = [abs(groups[i]["representative"]["pitch"] - groups[i-1]["representative"]["pitch"]) for i in range(1, len(groups))]
        leap90 = max(7, _quantile(leaps, .9)) if leaps else 12
        for i, group in enumerate(groups):
            previous = groups[i-1] if i else None
            following = groups[i+1] if i+1 < len(groups) else None
            gap = group["beat"] - (previous["beat"] + max(previous["representative"].get("duration_beats") or 0, 0)) if previous else 0
            next_gap = following["beat"] - (group["beat"] + max(group["representative"].get("duration_beats") or 0, 0)) if following else 0
            leap = abs(group["representative"]["pitch"] - previous["representative"]["pitch"]) if previous else None
            leap_score = .5 if leap is None else _clamp(.12 + .58 * min(leap / 12, 1) + .3 * min(leap / leap90, 1))
            for note in group["notes"]:
                group_by_id[note["note_id"]] = (group, i, groups, surprise[i], leap_score, max(0, gap), max(0, next_gap))
    results = []
    for note in notes:
        if not note["attack"]:
            results.append({"note_id": note["note_id"], "part": note["part"], "voice": note["voice"],
                            "measure": note["measure"], "beat": note["beat"], "pitch": note["pitch"],
                            "continuation_of": note.get("continuation_of"), "grace": note["grace"],
                            "features": {name: .5 for name in FEATURES}, "available": {name: False for name in FEATURES}, "details": {}})
            continue
        group, index, sequence, surprise, leap_score, gap, next_gap = group_by_id[note["note_id"]]
        voice_key = (note["part"], note["staff"], note["voice"])
        local_key = (voice_key, note["measure_index"])
        if local_key not in local_windows:
            local = [n for measure in range(note["measure_index"]-4, note["measure_index"]+5)
                     for n in measure_notes.get((voice_key, measure), ())]
            local_windows[local_key] = (local, [n["pitch"] for n in local],
                                        Counter(_duration_key(n["duration_beats"]) for n in local if n["duration_beats"] is not None))
        local, local_pitches, local_lengths = local_windows[local_key]
        pitch_score, pitch_detail = _pitch_feature(note, global_pitch_summary, local_pitches)
        duration = note["duration_beats"]
        duration_key = _duration_key(duration) if duration is not None else None
        global_rarity = _rarity(duration_key, all_durations, sum(all_durations.values())) if duration_key else .5
        local_rarity = _rarity(duration_key, local_lengths, sum(local_lengths.values())) if duration_key else .5
        duration_score = min(.9, .4 * global_rarity + .6 * local_rarity)
        velocity = note.get("velocity")
        neighbors = [n["velocity"] for n in local if n.get("velocity") is not None]
        if velocity is not None and len(neighbors) >= 3 and max(neighbors) > min(neighbors):
            median = _quantile(neighbors, .5)
            previous = [n["velocity"] for n in local if n.get("velocity") is not None and n["beat"] < note["beat"]][-3:]
            following = [n["velocity"] for n in local if n.get("velocity") is not None and n["beat"] > note["beat"]][:3]
            trend = (_quantile(following, .5) - _quantile(previous, .5)) if previous and following else 0
            jump = velocity - previous[-1] if previous else 0
            relative_velocity = _clamp(.35 + .45 * (velocity-median)/30 + .25 * max(0, jump-max(0, trend)/2)/35)
        else:
            trend, relative_velocity = 0, .5
        # Beat strength is deliberately modest: uncertain cadence/harmony is
        # not inferred from pitch class alone.
        measure_start = measure_starts[note["measure_index"]] if note["measure_index"] < len(measure_starts) else note["measure_index"] * 4
        position = note["beat"] - measure_start
        downbeat = .75 if abs(position) < .06 else .45 if abs(position-round(position)) < .06 else .2
        phrase_start = gap >= .8 or index == 0
        phrase_end = next_gap >= .8 or index == len(sequence)-1
        neighbor_pitches = [g["representative"]["pitch"] for g in sequence[max(0,index-3):min(len(sequence),index+4)]]
        peak = note["pitch"] in (max(neighbor_pitches), min(neighbor_pitches)) and len(set(neighbor_pitches)) >= 3
        structure = _clamp(.5*downbeat + .2*phrase_start + .12*phrase_end + .18*peak)
        features = {"pitch_salience": pitch_score, "duration_rarity": duration_score,
                    "relative_velocity": relative_velocity, "absolute_velocity": velocity/127 if velocity is not None else .5,
                    "melodic_leap": leap_score, "pattern_surprise": surprise,
                    "structural_salience": structure}
        available = {name: True for name in FEATURES}
        available["duration_rarity"] = duration is not None
        available["relative_velocity"] = available["absolute_velocity"] = velocity is not None
        results.append({"note_id": note["note_id"], "part": note["part"], "voice": note["voice"],
                        "measure": note["measure"], "beat": note["beat"], "pitch": note["pitch"],
                        "second": note.get("second"), "duration_beats": duration,
                        "features": {key: round(_clamp(value), 4) for key, value in features.items()},
                        "available": available,
                        "details": {"pitch": pitch_detail, "duration_global": round(global_rarity, 4),
                                    "duration_local": round(local_rarity, 4), "velocity_trend": round(trend, 4),
                                    "phrase_start": phrase_start, "phrase_end": phrase_end}})
    by_id = {n["note_id"]: n for n in results if not n.get("grace") and not n.get("continuation_of")}
    for note in results:
        origin = by_id.get(note.get("continuation_of"))
        if origin:
            note["features"] = origin["features"].copy()
            note["available"] = origin["available"].copy()
    pitch_stats = ({"minimum": min(all_pitches), "maximum": max(all_pitches),
                    "median": _quantile(all_pitches, .5),
                    "p05": _quantile(all_pitches, .05), "p95": _quantile(all_pitches, .95)}
                   if all_pitches else None)
    return {"version": VERSION, "note_count": len(results), "attack_count": len(attacks),
            "pitch_stats": pitch_stats, "notes": results}


def reweight(cache: dict, weights: dict | None = None, enabled: dict | None = None, density: float = .15):
    """Cheap O(N) pass over cached feature values; no XML/MIDI parsing."""
    weights = {name: _clamp((weights or {}).get(name, default), 0, 1) for name, default in DEFAULT_WEIGHTS.items()}
    enabled = {name: (enabled or {}).get(name, True) is not False for name in FEATURES}
    density = _clamp(density, .01, 1)
    notes = []
    scores = []
    for source in cache["notes"]:
        note = dict(source)
        usable = [name for name in FEATURES if enabled[name] and note["available"].get(name) and weights[name] > 0]
        denominator = sum(weights[name] for name in usable)
        score = sum(weights[name]*note["features"][name] for name in usable)/denominator if denominator else .5
        note["salience_score"] = round(_clamp(score), 4)
        if not source.get("grace") and not source.get("continuation_of"):
            scores.append(score)
        notes.append(note)
    threshold = _quantile(scores, 1-density) if scores else 1
    q75, q95 = _quantile(scores, .75), _quantile(scores, .95)
    spread = max(.025, (q95-q75)*.5)
    indistinguishable = not scores or q95 - _quantile(scores, .05) < .02
    for note in notes:
        if indistinguishable or note.get("grace") or note.get("continuation_of"):
            note["highlight_intensity"] = .2
            continue
        x = _clamp((note["salience_score"]-(threshold-spread))/(2*spread))
        note["highlight_intensity"] = round(.2 + .8*x*x*(3-2*x), 4)
    return {"version": cache["version"], "note_count": cache["note_count"],
            "attack_count": cache["attack_count"], "density": density,
            "threshold": round(threshold, 4), "weights": weights, "enabled": enabled,
            "pitch_stats": cache.get("pitch_stats"), "notes": notes}


def load_or_build(folder: Path, score_path: Path | None, timing: dict):
    """Persist feature extraction once per score/MIDI version, atomically."""
    inputs = [folder / "score.mid"] + ([score_path] if score_path else [])
    fingerprint = [[p.name, p.stat().st_size, p.stat().st_mtime_ns] for p in inputs]
    path = folder / "salience-features.json"
    if path.exists():
        try:
            cached = json.loads(path.read_text(encoding="utf-8"))
            if cached.get("version") == VERSION and cached.get("fingerprint") == fingerprint:
                return cached
        except (OSError, ValueError, KeyError):
            pass
    result = build_feature_cache(score_path, timing)
    result["fingerprint"] = fingerprint
    temporary = folder / "salience-features.pending.json"
    temporary.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(path)
    return result
