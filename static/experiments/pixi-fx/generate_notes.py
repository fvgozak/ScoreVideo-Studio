#!/usr/bin/env python3
"""Export bundled example MIDI for the standalone effects renderer benchmark.

No absolute user path required: running from this folder locates the example at the
repository root. This exports event times and pitch, not copyrighted score pages.
"""
import json
from pathlib import Path
import mido

ROOT = Path(__file__).resolve().parents[3]
MIDI = ROOT / 'examples' / 'dream-journey' / 'dream-journey.mid'
OUTPUT = Path(__file__).with_name('dream-journey-notes.json')


def extract(path):
    midi = mido.MidiFile(path)
    tempo = 500000
    time_sec = 0.0
    active = {}
    notes = []
    for msg in mido.merge_tracks(midi.tracks):
        time_sec += mido.tick2second(msg.time, midi.ticks_per_beat, tempo)
        if msg.type == 'set_tempo':
            tempo = msg.tempo
        elif msg.type == 'note_on' and msg.velocity:
            active.setdefault((msg.channel, msg.note), []).append((time_sec, msg.velocity))
        elif msg.type in ('note_off', 'note_on'):
            group = active.get((msg.channel, msg.note))
            if group:
                start, vel = group.pop(0)
                notes.append({'t': round(start, 5), 'd': round(max(.03, time_sec-start), 5),
                              'p': msg.note, 'v': vel})
    notes.sort(key=lambda n: n['t'])
    return {'title': 'Dream Journey — original MIDI timings', 'duration': round(midi.length, 4),
            'notes': notes}


if __name__ == '__main__':
    data = extract(MIDI)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f"{len(data['notes'])} MIDI attacks -> {OUTPUT}")
