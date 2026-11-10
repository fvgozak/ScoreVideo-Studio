"""Create a short, original melody in MusicXML, MIDI, and synthesized WAV."""
import math
import struct
import wave
import xml.etree.ElementTree as ET
from pathlib import Path

import mido

DEST = Path(__file__).resolve().parent / 'examples'
DEST.mkdir(parents=True, exist_ok=True)

# Deliberately expressive velocities so the visual dynamics can be tested.
VELOCITIES = [42, 63, 89, 110, 55, 98, 72, 34, 45, 65, 88, 118, 92, 62, 108]
# note, pitch, duration (quarter notes); original short melody
notes = [
    [('C', 4, 60, 1), ('E', 4, 64, 1), ('G', 4, 67, 1), ('C', 5, 72, 1)],
    [('B', 4, 71, 1), ('G', 4, 67, 1), ('E', 4, 64, 1), ('D', 4, 62, 1)],
    [('C', 4, 60, 2), ('E', 4, 64, 1), ('G', 4, 67, 1)],
    [('C', 5, 72, 1), ('B', 4, 71, 1), ('G', 4, 67, 1), ('C', 5, 72, 1)],
]

score = ET.Element('score-partwise', version='4.0')
work = ET.SubElement(score, 'work')
ET.SubElement(work, 'work-title').text = 'Small Morning'
ET.SubElement(score, 'movement-title').text = 'Small Morning'
ident = ET.SubElement(score, 'identification')
ET.SubElement(ident, 'creator', type='composer').text = 'ScoreVideo Local Demo'
part_list = ET.SubElement(score, 'part-list')
score_part = ET.SubElement(part_list, 'score-part', id='P1')
ET.SubElement(score_part, 'part-name').text = 'Piano'
part = ET.SubElement(score, 'part', id='P1')

midi = mido.MidiFile(ticks_per_beat=480)
track = mido.MidiTrack()
midi.tracks.append(track)
track.append(mido.MetaMessage('track_name', name='Small Morning', time=0))
track.append(mido.MetaMessage('set_tempo', tempo=500000, time=0))
track.append(mido.Message('program_change', channel=0, program=0, time=0))

events = []
beat = 0
note_idx = 0
for measure_idx, measure_notes in enumerate(notes):
    m = ET.SubElement(part, 'measure', number=str(measure_idx+1))
    if measure_idx == 0:
        attr = ET.SubElement(m, 'attributes')
        ET.SubElement(attr, 'divisions').text = '480'
        key = ET.SubElement(attr, 'key')
        ET.SubElement(key, 'fifths').text = '0'
        time = ET.SubElement(attr, 'time')
        ET.SubElement(time, 'beats').text = '4'
        ET.SubElement(time, 'beat-type').text = '4'
        clef = ET.SubElement(attr, 'clef')
        ET.SubElement(clef, 'sign').text = 'G'
        ET.SubElement(clef, 'line').text = '2'
    if measure_idx in (0, 2):
        direction = ET.SubElement(m, 'direction', placement='above')
        d_type = ET.SubElement(direction, 'direction-type')
        metro = ET.SubElement(d_type, 'metronome')
        ET.SubElement(metro, 'beat-unit').text = 'quarter'
        ET.SubElement(metro, 'per-minute').text = '120' if measure_idx == 0 else '90'
        ET.SubElement(direction, 'sound', tempo='120' if measure_idx == 0 else '90')
        if measure_idx == 2:
            events.append((beat * 480, 0, mido.MetaMessage('set_tempo', tempo=666667)))
    for name, octave, pitch_value, beats in measure_notes:
        n = ET.SubElement(m, 'note')
        p = ET.SubElement(n, 'pitch')
        ET.SubElement(p, 'step').text = name
        ET.SubElement(p, 'octave').text = str(octave)
        ET.SubElement(n, 'duration').text = str(beats * 480)
        ET.SubElement(n, 'type').text = 'half' if beats == 2 else 'quarter'
        events.append((beat * 480, 2, mido.Message('note_on', note=pitch_value, velocity=VELOCITIES[note_idx])))
        note_idx += 1
        events.append(((beat + beats) * 480 - 15, 1, mido.Message('note_off', note=pitch_value, velocity=0)))
        beat += beats

# Preserve one global ordering for tempo and note events.
events.sort(key=lambda ev: (ev[0], ev[1]))
last = 0
for tick, _, msg in events:
    track.append(msg.copy(time=tick-last))
    last = tick
track.append(mido.MetaMessage('end_of_track', time=0))
midi.save(DEST/'small_morning.mid')
ET.indent(score, space='  ')
ET.ElementTree(score).write(DEST/'small_morning.musicxml', encoding='utf-8', xml_declaration=True)

# Basic piano-like waveform with a short decay, deterministic and original.
sample_rate = 24000
seconds = 8*.5 + 8*(666667/1e6) + 0.65
samples = [0.0] * math.ceil(sample_rate * seconds)
beat = 0.0
note_idx = 0
for measure_idx, measure_notes in enumerate(notes):
    quarter = .5 if measure_idx < 2 else 666667/1e6
    for name, octave, pitch_value, length in measure_notes:
        freq = 440.0 * 2.0 ** ((pitch_value - 69) / 12)
        start = round(beat * sample_rate)
        dur = length * quarter
        end = min(len(samples), start + int((dur + .10) * sample_rate))
        for i in range(start, end):
            t = (i - start) / sample_rate
            attack = min(1., t / .008)
            decay = math.exp(-1.4 * t / max(.4, dur))
            release = min(1., max(0., (dur+.10-t)/.12))
            wave_value = (math.sin(2*math.pi*freq*t) + .24*math.sin(4*math.pi*freq*t)
                          + .09*math.sin(6*math.pi*freq*t))
            samples[i] += .19 * (VELOCITIES[note_idx] / 80) ** 1.15 * wave_value * attack * decay * release
        beat += dur
        note_idx += 1
with wave.open(str(DEST/'small_morning.wav'), 'wb') as f:
    f.setnchannels(1)
    f.setsampwidth(2)
    f.setframerate(sample_rate)
    raw = b''.join(struct.pack('<h', max(-32767, min(32767, int(v*32767)))) for v in samples)
    f.writeframes(raw)
print(f"Created demo files in {DEST}")
