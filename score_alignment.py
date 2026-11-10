"""Align *notated* MusicXML attacks to *performed* MIDI note-on times.

Notated quarter-note beats and performed MIDI ticks/seconds are different axes:
a fermata, unquantised performance or a ritardando can shift one without
altering the other.  Never drive OSMD's cursor from MIDI beat numbers alone.

No cloud service; pitch-sequence anchors require that the score and MIDI play
approximately the same notes in the same order (unfolded repeats may differ).
"""
from __future__ import annotations

from collections import defaultdict
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any
import bisect
import xml.etree.ElementTree as ET

from midi_timing import read_timing

STEPS = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def _tag(element: ET.Element) -> str:
    return element.tag.rsplit('}', 1)[-1]


def _child(parent: ET.Element, name: str) -> ET.Element | None:
    return next((x for x in parent if _tag(x) == name), None)


def _text(parent: ET.Element | None, name: str, default: str = '') -> str:
    node = _child(parent, name) if parent is not None else None
    return node.text.strip() if node is not None and node.text else default


def _div_duration(node: ET.Element, divisions: float) -> float:
    try:
        return max(0.0, float(_text(node, 'duration', '0')) / divisions)
    except (ValueError, ZeroDivisionError):
        return 0.0


def _score_parts(root: ET.Element):
    if _tag(root) == 'score-partwise':
        for child in root:
            if _tag(child) == 'part':
                yield child.attrib.get('id', ''), [m for m in child if _tag(m) == 'measure']
    elif _tag(root) == 'score-timewise':
        parts: dict[str, list[ET.Element]] = defaultdict(list)
        for measure in root:
            if _tag(measure) != 'measure':
                continue
            for part in measure:
                if _tag(part) == 'part':
                    clone = ET.Element('measure', measure.attrib)
                    clone.extend(list(part))
                    parts[part.attrib.get('id', '')].append(clone)
        yield from parts.items()
    else:
        raise ValueError('Expected MusicXML score-partwise or score-timewise')


def extract_score_attacks(path: Path) -> list[dict]:
    """Return pitched score onset groups in absolute quarter-note beats.

    Supports multiple voices, staves, chords, rests, backups, forwards, ties,
    pickup measures, and score-timewise. Grace notes have no notated length and
    aren't used as time anchors (their performed timing is less predictable).
    """
    root = ET.parse(path).getroot()
    parts = list(_score_parts(root))
    if not parts:
        raise ValueError('MusicXML has no parts')

    # First pass: measure span across *all* parts. A sparse part may omit
    # leading/trailing voices, but all parts share the same bar boundaries.
    durations: list[float] = []
    per_part_notes: list[list[tuple[int, float, int]]] = []
    for _, measures in parts:
        divisions = 1.0
        chromatic = octave_change = 0
        time_sig = 4.0
        collected: list[tuple[int, float, int]] = []
        for index, measure in enumerate(measures):
            cursor = 0.0
            last_note_start = 0.0
            max_end = 0.0
            attrs = _child(measure, 'attributes')
            if attrs is not None:
                try: divisions = max(1.0, float(_text(attrs, 'divisions', str(divisions))))
                except ValueError: pass
            for elem in measure:
                tag = _tag(elem)
                if tag == 'attributes':
                    try: divisions = max(1.0, float(_text(elem, 'divisions', str(divisions))))
                    except ValueError: pass
                    tr = _child(elem, 'transpose')
                    if tr is not None:
                        try: chromatic = int(_text(tr, 'chromatic', '0'))
                        except ValueError: chromatic = 0
                        try: octave_change = int(_text(tr, 'octave-change', '0'))
                        except ValueError: octave_change = 0
                    tm = _child(elem, 'time')
                    if tm is not None:
                        try:
                            beats = float(_text(tm, 'beats', '4'))
                            beat_type = float(_text(tm, 'beat-type', '4'))
                            time_sig = 4.0 * beats / beat_type
                        except (ValueError, ZeroDivisionError): pass
                elif tag == 'backup':
                    cursor = max(0.0, cursor - _div_duration(elem, divisions))
                elif tag == 'forward':
                    cursor += _div_duration(elem, divisions)
                    max_end = max(max_end, cursor)
                elif tag == 'note':
                    is_grace = _child(elem, 'grace') is not None
                    is_chord = _child(elem, 'chord') is not None
                    start = last_note_start if is_chord else cursor
                    if not is_chord: last_note_start = start
                    dur = 0 if is_grace else _div_duration(elem, divisions)
                    if not is_chord: cursor += dur
                    max_end = max(max_end, start + dur, cursor)
                    if is_grace or _child(elem, 'rest') is not None:
                        continue
                    if any(e.attrib.get('type') == 'stop' for e in elem if _tag(e) == 'tie'):
                        continue  # tie continuation does not trigger a new note-on
                    pitch = _child(elem, 'pitch')
                    if pitch is None:
                        continue
                    step = _text(pitch, 'step').upper()
                    if step not in STEPS: continue
                    try:
                        alter = int(float(_text(pitch, 'alter', '0')))
                        octave = int(_text(pitch, 'octave'))
                    except ValueError:
                        continue
                    midi = 12 * (octave + 1 + octave_change) + STEPS[step] + alter + chromatic
                    if 0 <= midi <= 127:
                        collected.append((index, round(start, 8), midi))
            # Do not artificially extend an explicitly short bar (pickup).
            # A completely empty bar gets its nominal time signature duration.
            span = max_end if max_end > 0 else time_sig
            if index >= len(durations): durations.append(span)
            else: durations[index] = max(durations[index], span)
        per_part_notes.append(collected)
    starts = [0.0]
    for d in durations: starts.append(starts[-1] + d)
    groups: dict[float, list[int]] = defaultdict(list)
    for part_notes in per_part_notes:
        for measure_idx, relative, pitch in part_notes:
            if measure_idx < len(starts) - 1:
                beat = round(starts[measure_idx] + relative, 6)
                groups[beat].append(pitch)
    return [{'beat': b, 'pitches': sorted(pitches)} for b, pitches in sorted(groups.items())]


def _midi_groups(events: list[dict]) -> list[dict]:
    # Group only truly simultaneous attacks; rolled chords must preserve
    # their individual note-on seconds for the animation stage.
    groups = []
    for e in sorted(events, key=lambda n: (n['second'], n['pitch'])):
        if not groups or e['second'] - groups[-1]['second'] > 0.0015:
            groups.append({'second': float(e['second']), 'pitches': [], 'events': []})
        groups[-1]['pitches'].append(int(e['pitch']))
        groups[-1]['events'].append(e)
    return groups


def _interpolate(beat: float, anchors: list[dict], default_sec_per_beat: float) -> float:
    if not anchors:
        return beat * default_sec_per_beat
    xs = [a['beat'] for a in anchors]
    pos = bisect.bisect_left(xs, beat)
    if pos < len(xs) and abs(xs[pos] - beat) < 1e-5:
        return anchors[pos]['second']
    if pos == 0:
        a = anchors[0]
        slope = (anchors[1]['second'] - a['second']) / (anchors[1]['beat'] - a['beat']) if len(anchors) > 1 else default_sec_per_beat
        return a['second'] + (beat - a['beat']) * max(.05, slope)
    if pos >= len(anchors):
        a = anchors[-1]
        slope = (a['second'] - anchors[-2]['second']) / (a['beat'] - anchors[-2]['beat']) if len(anchors) > 1 else default_sec_per_beat
        return a['second'] + (beat - a['beat']) * max(.05, slope)
    a, b = anchors[pos - 1], anchors[pos]
    return a['second'] + (b['second'] - a['second']) * (beat - a['beat']) / (b['beat'] - a['beat'])


def align_score_to_midi(score_path: Path, midi_path: Path, timing: dict | None = None) -> dict[str, Any]:
    score = extract_score_attacks(score_path)
    timing = timing or read_timing(midi_path)
    events = timing['note_events']
    midi = _midi_groups(events)
    if not score or not midi:
        return {'method': 'pitch-onset-anchors-v1', 'status': 'needs-review', 'matched_groups': 0,
                'total_groups': len(score), 'coverage': 0.0, 'anchors': [], 'note_matches': []}

    score_tokens = [tuple(sorted(set(s['pitches']))) for s in score]
    midi_tokens = [tuple(sorted(set(m['pitches']))) for m in midi]
    matcher = SequenceMatcher(None, score_tokens, midi_tokens, autojunk=False)
    pairs: dict[int, int] = {}
    used_midi_groups: set[int] = set()
    for block in matcher.get_matching_blocks():
        for offset in range(block.size):
            si = block.a + offset
            mi = block.b + offset
            pairs[si] = mi
            used_midi_groups.add(mi)

    # Recover rolled chords and small discrepancies between reliable exact
    # pitch-sequence anchors, while never crossing/duplicating matched groups.
    exact_pairs = sorted(pairs.items())
    for si, s in enumerate(score):
        if si in pairs: continue
        left = max(((i, j) for i, j in exact_pairs if i < si), default=None)
        right = min(((i, j) for i, j in exact_pairs if i > si), default=None)
        start = (left[1] + 1) if left else 0
        end = right[1] if right else len(midi)
        if start >= end: continue
        expected_position = (si / max(1, len(score)-1)) * max(1, len(midi)-1)
        if left and right:
            frac = (s['beat'] - score[left[0]]['beat']) / max(1e-6, score[right[0]]['beat'] - score[left[0]]['beat'])
            expected_position = left[1] + frac * (right[1] - left[1])
        elif left:
            expected_position = left[1] + (si - left[0])
        elif right:
            expected_position = right[1] - (right[0] - si)
        desired = set(s['pitches'])
        best = None
        best_cost = float('inf')
        # Keep long, repetitive pieces bounded (don't compare every note to
        # every other note). The nearest candidate window still permits
        # substantial skips and missing notes.
        if end - start > 250:
            start = max(start, int(expected_position) - 125)
            end = min(end, int(expected_position) + 126)
        for mi in range(start, end):
            if mi in used_midi_groups: continue
            found = set(midi[mi]['pitches'])
            # Include rolled notes played in the subsequent 400ms. For a
            # fast passage, extra notes are tolerated but not rewarded.
            following = mi + 1
            while following < len(midi) and midi[following]['second']-midi[mi]['second'] <= .4:
                found.update(midi[following]['pitches'])
                following += 1
            recall = len(desired & found) / max(1, len(desired))
            if recall < .8: continue
            cost = 2.0 * (1 - recall) + .075 * abs(mi - expected_position)
            if cost < best_cost:
                best_cost, best = cost, mi
        if best is not None and best_cost < 1.0:
            pairs[si] = best
            used_midi_groups.add(best)

    matches = sorted(pairs.items())
    anchors = [{'beat': score[i]['beat'], 'second': midi[j]['second']} for i, j in matches]
    # Reject non-monotone timings rather than silently reversing playback.
    clean = []
    for anchor in anchors:
        if not clean or (anchor['beat'] > clean[-1]['beat'] and anchor['second'] > clean[-1]['second']):
            clean.append(anchor)
    anchors = clean

    # Map *individual* MIDI attacks to written notes, not just a chord's beat.
    # This preserves staggered notes in an arpeggio and each velocity.
    used_events = set()
    note_matches = []
    by_pitch = defaultdict(list)
    for idx, event in enumerate(events):
        by_pitch[int(event['pitch'])].append((float(event['second']), idx, event))
    times_by_pitch = {}
    for pitch, notes in by_pitch.items():
        notes.sort(key=lambda entry: entry[0])
        times_by_pitch[pitch] = [entry[0] for entry in notes]
    median_sec_per_beat = max(.01, (midi[-1]['second'] - midi[0]['second']) / max(.01, score[-1]['beat'] - score[0]['beat']))
    for s in score:
        center = _interpolate(s['beat'], anchors, median_sec_per_beat)
        for pitch in s['pitches']:
            matches = by_pitch.get(pitch, [])
            stamps = times_by_pitch.get(pitch, [])
            start = bisect.bisect_left(stamps, center - .12)
            eligible = []
            for when, idx, event in matches[start:]:
                if when > center + .42: break
                if idx not in used_events:
                    eligible.append((idx, event))
            if not eligible: continue
            idx, e = min(eligible, key=lambda ie: abs(ie[1]['second'] - center))
            used_events.add(idx)
            note_matches.append({'beat': s['beat'], 'pitch': pitch,
                                 'second': float(e['second']), 'end_second': float(e.get('end_second', e['second'])), 'velocity': int(e['velocity'])})
    group_coverage = len(anchors) / len(score)
    note_count = sum(len(g['pitches']) for g in score)
    note_coverage = len(note_matches) / note_count if note_count else 0
    coverage = round(min(group_coverage, note_coverage), 3)
    status = 'ok' if coverage >= .9 else 'needs-review'
    return {'method': 'pitch-onset-anchors-v1', 'status': status,
            'matched_groups': len(anchors), 'total_groups': len(score),
            'matched_notes': len(note_matches), 'total_notes': note_count,
            'coverage': coverage, 'anchors': anchors, 'note_matches': note_matches,
            'message': ('음표·MIDI 타건 시점을 연결했습니다.' if status == 'ok' else
                        'MusicXML과 MIDI의 음표가 일부 불일치합니다. 반복·전조·아르페지오 구간을 확인해 주세요.')}


def extract_score_ties(path: Path) -> list[dict]:
    """Map written tie continuations to their originating note-on beat/pitch.

    Only the first note of a tied chain has a MIDI note-on. This parser returns
    the later notated positions so the viewer can color them without inventing
    another musical attack. Works on the repeat-unfolded MusicXML too.
    """
    parts = list(_score_parts(ET.parse(path).getroot()))
    durations: list[float] = []
    for _, measures in parts:
        divisions = 1.0
        beats_per_bar = 4.0
        for mi, measure in enumerate(measures):
            cursor = previous = maximum = 0.0
            for e in measure:
                tag = _tag(e)
                if tag == 'attributes':
                    try: divisions = max(1.0, float(_text(e, 'divisions', str(divisions))))
                    except ValueError: pass
                    t = _child(e, 'time')
                    if t is not None:
                        try: beats_per_bar = 4.0 * float(_text(t,'beats','4')) / float(_text(t,'beat-type','4'))
                        except (ValueError, ZeroDivisionError): pass
                elif tag == 'backup':
                    cursor = max(0.0, cursor-_div_duration(e,divisions))
                elif tag == 'forward':
                    cursor += _div_duration(e,divisions)
                    maximum = max(maximum,cursor)
                elif tag == 'note':
                    start = previous if _child(e,'chord') is not None else cursor
                    if _child(e,'chord') is None: previous = cursor
                    dur = 0.0 if _child(e,'grace') is not None else _div_duration(e,divisions)
                    if _child(e,'chord') is None: cursor += dur
                    maximum = max(maximum,start+dur,cursor)
            span = maximum if maximum > 0 else beats_per_bar
            if mi >= len(durations): durations.append(span)
            else: durations[mi] = max(durations[mi], span)
    starts = [0.0]
    for duration in durations: starts.append(starts[-1]+duration)

    continuations = []
    for part_id, measures in parts:
        divisions=1.0
        origin: dict[tuple, float] = {}
        for mi, measure in enumerate(measures):
            cursor=last_start=0.0
            for e in measure:
                tag=_tag(e)
                if tag=='attributes':
                    try: divisions=max(1.0,float(_text(e,'divisions',str(divisions))))
                    except ValueError: pass
                elif tag=='backup': cursor=max(0.0,cursor-_div_duration(e,divisions))
                elif tag=='forward': cursor+=_div_duration(e,divisions)
                elif tag=='note':
                    start=last_start if _child(e,'chord') is not None else cursor
                    if _child(e,'chord') is None: last_start=cursor
                    if _child(e,'chord') is None and _child(e,'grace') is None:
                        cursor+=_div_duration(e,divisions)
                    if _child(e,'rest') is not None: continue
                    pitch=_child(e,'pitch')
                    if pitch is None: continue
                    step=_text(pitch,'step').upper()
                    if step not in STEPS: continue
                    try:
                        midi=12*(int(_text(pitch,'octave'))+1)+STEPS[step]+int(float(_text(pitch,'alter','0')))
                    except ValueError: continue
                    if not (0<=midi<=127): continue
                    types={x.attrib.get('type') for x in e if _tag(x)=='tie'}
                    notations=_child(e,'notations')
                    if notations is not None:
                        types.update(x.attrib.get('type') for x in notations if _tag(x)=='tied')
                    voice=_text(e,'voice','1');staff=_text(e,'staff','1')
                    key=(part_id,voice,staff,midi)
                    current=round(starts[mi]+start,6)
                    if 'stop' in types and key in origin:
                        continuations.append({'beat':current,'pitch':midi,'origin_beat':origin[key]})
                    if 'start' in types and key not in origin:
                        origin[key]=current
                    if 'stop' in types and 'start' not in types:
                        origin.pop(key,None)
    return continuations
