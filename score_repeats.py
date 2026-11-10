"""Expand standard MusicXML barline repeats into a *performance-order* score.

The unmodified source stays on disk. Expansion is only selected if MIDI
matching shows more of the performance is explained by the expanded score.
Supports forward/backward repeats, implicit start repeats and numbered endings.
D.C./D.S., codas and arbitrarily complex nested ending semantics are flagged
as unsupported, rather than guessed. No third-party music parser required.
"""
from __future__ import annotations

import copy
from dataclasses import dataclass
from pathlib import Path
import re
import xml.etree.ElementTree as ET


def tag(node: ET.Element) -> str:
    return node.tag.rsplit('}', 1)[-1]


def children(parent: ET.Element, name: str) -> list[ET.Element]:
    return [node for node in parent if tag(node) == name]


def ending_numbers(text: str) -> frozenset[int]:
    """MusicXML allows '1', '1,2', and ranges such as '1-3'."""
    numbers: set[int] = set()
    for piece in re.split(r'[,\s]+', text.strip()):
        if not piece:
            continue
        match = re.fullmatch(r'(\d+)[-–](\d+)', piece)
        if match:
            a, b = int(match[1]), int(match[2])
            if 0 < a <= b <= 8:
                numbers.update(range(a, b + 1))
        elif piece.isdecimal() and 0 < int(piece) <= 8:
            numbers.add(int(piece))
    return frozenset(numbers)


@dataclass(frozen=True)
class RepeatSpan:
    start: int
    end: int
    times: int


def _parts(root: ET.Element) -> list[ET.Element]:
    if tag(root) != 'score-partwise':
        raise ValueError('반복 펼치기는 score-partwise 악보에서만 지원합니다.')
    return children(root, 'part')


def _barline_events(measure: ET.Element) -> tuple[bool, int | None, int | None]:
    forward = False
    backward: int | None = None
    for barline in children(measure, 'barline'):
        for rep in children(barline, 'repeat'):
            if rep.get('direction') == 'forward':
                forward = True
            elif rep.get('direction') == 'backward':
                try:
                    times = int(rep.get('times') or '2')
                except ValueError:
                    times = 2
                backward = min(8, max(2, times))
    return forward, backward, None


def _labels(measures: list[ET.Element]) -> list[frozenset[int]]:
    # MusicXML barline location matters. A first ending start in a right
    # barline is attached to the following measure, whereas a left-barline
    # start applies to the current measure.
    active: frozenset[int] = frozenset()
    carry: frozenset[int] | None = None
    labels: list[frozenset[int]] = []
    for measure in measures:
        if carry is not None:
            active, carry = carry, None
        left, right = [], []
        for barline in children(measure, 'barline'):
            bucket = left if barline.get('location', 'right') == 'left' else right
            for mark in children(barline, 'ending'):
                bucket.append((mark.get('type'), ending_numbers(mark.get('number') or '')))
        for typ, nums in left:
            if typ == 'start':
                active = nums
            elif typ in {'stop', 'discontinue'}:
                active = frozenset()
        labels.append(active)
        for typ, nums in right:
            if typ == 'start':
                carry = nums
            elif typ in {'stop', 'discontinue'}:
                active = frozenset()
    return labels


def _spans(measures: list[ET.Element]) -> list[RepeatSpan]:
    forwards: list[int] = []
    spans: list[RepeatSpan] = []
    last_implicit_end = -1
    for i, measure in enumerate(measures):
        fwd, back, _ = _barline_events(measure)
        if fwd:
            forwards.append(i)
        if back:
            # Implicit repeat starts at measure 1, or after a previously
            # completed implicit repeat with no explicit new forward sign.
            start = forwards.pop() if forwards else last_implicit_end + 1
            if start > i:
                start = 0
            spans.append(RepeatSpan(start, i, back))
            if not forwards:
                last_implicit_end = i
    if forwards:
        raise ValueError('시작 되돌이표에 대응하는 끝 되돌이표가 없습니다.')
    # A well-formed collection of nested/disjoint repeat intervals.
    for a in spans:
        for b in spans:
            if a is b:
                continue
            if a.start < b.start <= a.end < b.end:
                raise ValueError('겹쳐진 되돌이표 구조는 자동 해석할 수 없습니다.')
    return spans


def performance_measure_order(path: Path) -> tuple[list[int], dict]:
    root = ET.parse(path).getroot()
    parts = _parts(root)
    if not parts:
        raise ValueError('악보에 파트가 없습니다.')
    measures = children(parts[0], 'measure')
    if not measures:
        raise ValueError('악보에 마디가 없습니다.')
    count = len(measures)
    if any(len(children(part, 'measure')) != count for part in parts):
        raise ValueError('파트마다 마디 개수가 달라 반복을 펼칠 수 없습니다.')
    # Jumps may be represented as <sound dacapo="yes" .../>.
    unsupported = {'dacapo', 'dalsegno', 'tocoda', 'fine'}
    for part in parts:
        for node in part.iter():
            if tag(node) == 'sound' and any(a in node.attrib for a in unsupported):
                raise ValueError('D.C., D.S., Coda 이동은 아직 자동 반복 전개를 지원하지 않습니다.')
    labels = _labels(measures)
    spans = _spans(measures)
    if not spans:
        return list(range(count)), {'has_repeats': False, 'spans': [], 'has_endings': any(labels)}

    by_start: dict[int, RepeatSpan] = {}
    for span in spans:
        if span.start in by_start:
            raise ValueError('같은 마디에서 시작하는 복수의 되돌이표를 자동 해석할 수 없습니다.')
        by_start[span.start] = span
    order: list[int] = []
    max_measures = 10000

    def expand(begin: int, stop: int, iteration: int | None = None, opened: int | None = None):
        i = begin
        while i <= stop:
            inner = by_start.get(i)
            if inner and i != opened and inner.end <= stop:
                for turn in range(1, inner.times + 1):
                    expand(inner.start, inner.end, turn, inner.start)
                i = inner.end + 1
                continue
            label = labels[i]
            if not label or iteration is None or iteration in label:
                order.append(i)
                if len(order) > max_measures:
                    raise ValueError('반복 전개가 10,000마디를 초과합니다.')
            i += 1

    expand(0, count - 1)
    return order, {'has_repeats': True,
                   'spans': [{'start': x.start + 1, 'end': x.end + 1, 'times': x.times} for x in spans],
                   'has_endings': any(labels)}


def unfold_musicxml(source: Path, dest: Path) -> dict:
    """Create a separate score in MIDI playback order; never overwrite source."""
    order, details = performance_measure_order(source)
    if not details['has_repeats']:
        return {'changed': False, 'order': order, **details}
    doc = ET.parse(source)
    root = doc.getroot()
    for part in _parts(root):
        originals = children(part, 'measure')
        for old in originals:
            part.remove(old)
        for play_index, original_index in enumerate(order, 1):
            measure = copy.deepcopy(originals[original_index])
            measure.set('number', str(play_index))
            # Replicated XML IDs must be unique across duplicated notes.
            for elem in measure.iter():
                if elem.get('id'):
                    elem.set('id', f"play{play_index}-{elem.get('id')}")
                if tag(elem) == 'print':
                    elem.attrib.pop('new-system', None)
                    elem.attrib.pop('new-page', None)
            for barline in children(measure, 'barline'):
                for child in list(barline):
                    if tag(child) in {'repeat', 'ending'}:
                        barline.remove(child)
                if not list(barline):
                    measure.remove(barline)
            part.append(measure)
    doc.write(dest, encoding='utf-8', xml_declaration=True)
    return {'changed': True, 'order': order, **details}
