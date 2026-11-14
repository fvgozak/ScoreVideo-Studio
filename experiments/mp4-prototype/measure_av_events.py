"""Measure representative MIDI, waveform and decoded-key-frame times.

This deliberately labels polyphonic/weak attacks as uncertain. Audio attack
times are local 10-ms RMS-rise maxima, not guaranteed physical onset times.
Usage: python measure_av_events.py meta.json source.mp3 output.mp4 fps
"""
import json
import math
import sys

import numpy as np

from check_audio_sync import RATE, decode
from measure_key_frames import inspect_key


TARGETS = [
    ('start strong solo', 3.682, 86),
    ('start chord sustained', 5.455, 86),
    ('start quick accent', 7.739, 91),
    ('start after rest', 11.011, 72),
    ('middle chord', 95.180, 76),
    ('middle solo', 100.089, 65),
    ('middle long note', 101.998, 67),
    ('middle chord', 104.998, 76),
    ('middle repeated key', 107.726, 91),
    ('end repeated key', 178.357, 73),
    ('end lower solo', 183.387, 49),
    ('end quick note', 188.828, 70),
    ('end sustained chord', 192.228, 61),
]


def rms_peak(wave, second):
    hop = RATE // 200  # 5 ms; 10-ms RMS, rise over the preceding 25 ms
    first = max(0, int((second - .07) * RATE) // hop - 5)
    last = min(len(wave) // hop - 3, int((second + .10) * RATE) // hop)
    envelope = np.asarray([
        np.sqrt(np.mean(wave[index * hop:index * hop + 2 * hop] ** 2))
        for index in range(first, last + 1)
    ])
    rise = np.maximum(0, envelope[5:] - envelope[:-5])
    times = (first + 5 + np.arange(len(rise))) * hop / RATE
    scope = np.flatnonzero((times >= second - .025) & (times <= second + .095))
    best = int(scope[np.argmax(rise[scope])])
    return round(float(times[best]), 6), round(float(rise[best]), 5)


def rms_onset(wave, second, fraction):
    """First threshold crossing of a local RMS rise; may be ambiguous in chords."""
    hop = RATE // 200
    first = max(0, int((second - .08) * RATE) // hop)
    last = min(len(wave) // hop - 3, int((second + .11) * RATE) // hop)
    times = np.arange(first, last + 1) * hop / RATE
    envelope = np.asarray([
        np.sqrt(np.mean(wave[index * hop:index * hop + 2 * hop] ** 2))
        for index in range(first, last + 1)
    ])
    baseline = float(np.median(envelope[(times >= second - .065) &
                                         (times <= second - .02)]))
    peak = float(np.max(envelope[(times >= second) & (times <= second + .095)]))
    if peak - baseline < .008:
        return None
    threshold = baseline + fraction * (peak - baseline)
    crossing = np.flatnonzero((times >= second - .01) & (times <= second + .095)
                              & (envelope >= threshold))
    return round(float(times[crossing[0]]), 6) if len(crossing) else None


def main():
    meta_path, source_path, output_path, fps = sys.argv[1:5]
    fps = int(fps)
    meta = json.load(open(meta_path, encoding='utf-8'))
    source, output = decode(source_path), decode(output_path)
    rows = []
    for label, requested, pitch in TARGETS:
        candidates = [event for event in meta['note_events'] if event['pitch'] == pitch]
        event = min(candidates, key=lambda item: abs(item['second'] - requested))
        midi = float(event['second'])
        concurrent = sum(abs(item['second'] - midi) < .001 for item in meta['note_events'])
        source_attack, source_rise = rms_peak(source, midi)
        output_attack, output_rise = rms_peak(output, midi)
        source_onsets = [rms_onset(source, midi, level) for level in (.15, .35)]
        output_onsets = [rms_onset(output, midi, level) for level in (.15, .35)]
        key = inspect_key(output_path, fps, midi, pitch)
        expected = key['expected_first_frame']
        frames = key['frames']
        at = next((item for item in frames if item['frame'] == expected), None)
        before = [item['mean_change'] for item in frames if item['frame'] < expected and item['mean_change'] is not None]
        baseline = float(np.median(before)) if before else 0
        jump = at['mean_change'] if at else 0
        confirmed = bool(jump >= max(8, baseline * 3))
        rows.append({'label': label, 'midi_sec': round(midi, 6), 'pitch': pitch,
                     'concurrent_notes': concurrent,
                     'velocity': event['velocity'],
                     'duration_sec': round(event['end_second'] - midi, 3),
                     'original_attack_sec': source_attack, 'original_rise': source_rise,
                     'mp4_attack_sec': output_attack, 'mp4_rise': output_rise,
                     'original_onset_15_35_sec': source_onsets,
                     'mp4_onset_15_35_sec': output_onsets,
                     'expected_key_frame': expected,
                     'decoded_key_frame': expected if confirmed else None,
                     'key_pts_sec': round(expected / fps, 6) if confirmed else None,
                     'key_change': jump, 'prior_change_median': round(baseline, 3),
                     'key_change_ratio': round(jump / max(.001, baseline), 2),
                     'midi_to_original_ms': round((source_attack - midi) * 1000, 2),
                     'midi_to_video_ms': round((expected / fps - midi) * 1000, 2)
                     if confirmed else None,
                     'original_to_mp4_ms': round((output_attack - source_attack) * 1000, 2),
                     'video_minus_mp4_audio_ms': round((expected / fps - output_attack) * 1000, 2)
                     if confirmed else None,
                     'confidence': ('key flash ambiguous; excluded from visual summary'
                        if not confirmed else 'clear key flash; audio attack polyphonic/ambiguous'
                        if concurrent > 1 else 'clear key flash; source onset low contrast'
                        if source_onsets[0] is None else
                        'clear key flash; audio RMS attack proxy')})
    confirmed_rows = [row for row in rows if row['decoded_key_frame'] is not None]
    def stats(key, items):
        values = [item[key] for item in items if item[key] is not None]
        return {'mean_ms': round(float(np.mean(values)), 2) if values else None,
                'max_abs_ms': round(float(max(map(abs, values))), 2) if values else None,
                'n': len(values)}
    summary = {key: stats(key, confirmed_rows if key in ('midi_to_video_ms',
                     'video_minus_mp4_audio_ms') else rows)
               for key in ('midi_to_original_ms', 'midi_to_video_ms',
                           'original_to_mp4_ms', 'video_minus_mp4_audio_ms')}
    print(json.dumps({'fps': fps, 'samples': rows, 'summary': summary}, indent=2))


if __name__ == '__main__':
    main()
