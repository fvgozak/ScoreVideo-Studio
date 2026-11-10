#!/usr/bin/env python3
"""Inspect MusicXML-to-MIDI alignment, including pauses/fermatas.

Usage:
    python diagnose_alignment.py score.musicxml performance.mid --csv sync_report.csv

No audio alignment is performed.  This reports the score -> MIDI timeline.
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

from midi_timing import read_timing
from score_alignment import align_score_to_midi, extract_score_attacks


def analyze(score_path: Path, midi_path: Path) -> tuple[dict, list[dict], list[dict]]:
    timing = read_timing(midi_path)
    alignment = align_score_to_midi(score_path, midi_path, timing)
    score_events = extract_score_attacks(score_path)
    beat_map = {round(a['beat'], 6): a for a in alignment['anchors']}
    records = []
    for group in score_events:
        beat = round(group['beat'], 6)
        anchor = beat_map.get(beat)
        seconds = float(anchor['second']) if anchor else None
        records.append({
            'score_beat': beat,
            'score_pitches': ' '.join(map(str, group['pitches'])),
            'written_note_count': len(group['pitches']),
            'matched_midi_sec': round(seconds, 6) if seconds is not None else '',
            'theoretical_midi_sec': round(beat_to_seconds(beat, timing['tempo_map']), 6),
            'drift_sec': round(seconds - beat_to_seconds(beat, timing['tempo_map']), 6)
            if seconds is not None else '',
            'matching_group': bool(anchor),
        })
    pauses = []
    with_seconds = [r for r in records if r['matching_group']]
    for a, b in zip(with_seconds, with_seconds[1:]):
        actual = b['matched_midi_sec'] - a['matched_midi_sec']
        predicted = b['theoretical_midi_sec'] - a['theoretical_midi_sec']
        difference = actual - predicted
        if abs(difference) >= 0.2:
            pauses.append({
                'start_beat': a['score_beat'], 'end_beat': b['score_beat'],
                'extra_time_sec': round(difference, 4),
                'actual_gap_sec': round(actual, 4),
                'theoretical_gap_sec': round(predicted, 4),
            })
    pauses.sort(key=lambda p: abs(p['extra_time_sec']), reverse=True)
    return alignment, records, pauses


def beat_to_seconds(beat: float, tempo_map: list[dict]) -> float:
    point = tempo_map[0]
    for item in tempo_map[1:]:
        if item['beat'] > beat:
            break
        point = item
    return float(point['second']) + (beat - float(point['beat'])) * float(point['tempo_us']) / 1_000_000


def main() -> None:
    parser = argparse.ArgumentParser(description='MusicXML → MIDI timing audit')
    parser.add_argument('score', type=Path)
    parser.add_argument('midi', type=Path)
    parser.add_argument('--csv', type=Path, help='Write a score-beat/MIDI-second audit CSV')
    args = parser.parse_args()
    alignment, records, pauses = analyze(args.score, args.midi)
    print(f"Match: {alignment['coverage'] * 100:.1f}% ({alignment['matched_notes']}/{alignment['total_notes']} notes)")
    print(f"Status: {alignment['status']} | anchors: {len(alignment['anchors'])}/{len(records)}")
    if pauses:
        print('Large timing deviations (performed MIDI time minus theoretical tempo-clock):')
        for p in pauses[:12]:
            print(f"  beats {p['start_beat']:g}→{p['end_beat']:g}: {p['extra_time_sec']:+.3f}s")
    else:
        print('No >=200ms local deviations detected among the matched events.')
    if args.csv:
        args.csv.parent.mkdir(parents=True, exist_ok=True)
        with args.csv.open('w', newline='', encoding='utf-8-sig') as f:
            writer = csv.DictWriter(f, fieldnames=records[0].keys() if records else [
                'score_beat', 'score_pitches', 'written_note_count',
                'matched_midi_sec', 'theoretical_midi_sec', 'drift_sec', 'matching_group'])
            writer.writeheader()
            writer.writerows(records)
        print(f'CSV: {args.csv}')


if __name__ == '__main__':
    main()
