"""Spot-check audio attacks against keyboard-frame changes near MIDI note onsets.

This is a diagnostic, not a full polyphonic onset detector: overlapping notes
and continuous effects can make the strongest local frame change ambiguous.
Usage: python check_note_attacks.py meta.json output.mp4 fps time [time ...]
"""
import json
import math
import subprocess
import sys

import numpy as np

from check_audio_sync import RATE, decode


def audio_attack(wave, second):
    hop = RATE // 200  # 5 ms
    first = max(0, int((second - .12) * RATE) // hop)
    last = min(len(wave) // hop - 2, int((second + .12) * RATE) // hop)
    rms = []
    for index in range(first - 5, last + 2):
        samples = wave[max(0, index * hop):max(0, index * hop) + 2 * hop]
        rms.append(float(np.sqrt(np.mean(samples * samples))))
    rise = np.maximum(0, np.asarray(rms[5:]) - np.asarray(rms[:-5]))
    center = round(second * RATE / hop) - first
    search = range(max(0, center - 10), min(len(rise), center + 11))
    best = max(search, key=lambda offset: rise[offset])
    return (first + best) * hop / RATE, round(float(rise[best]), 5)


def video_attack(path, second, fps):
    center = math.ceil(second * fps)
    first, last = max(0, center - 3), center + 3
    command = ['ffmpeg', '-v', 'error', '-i', path, '-vf',
               f"select='between(n,{first},{last})',crop=iw:120:0:ih-120,format=gray",
               '-vsync', '0', '-f', 'rawvideo', '-']
    raw = subprocess.run(command, check=True, stdout=subprocess.PIPE).stdout
    width = int(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                                '-show_entries', 'stream=width', '-of', 'csv=p=0', path],
                               check=True, stdout=subprocess.PIPE, text=True).stdout.strip())
    frames = np.frombuffer(raw, np.uint8).reshape((-1, 120, width)).astype(np.int16)
    changes = np.mean(np.abs(np.diff(frames, axis=0)), axis=(1, 2))
    candidates = range(max(0, center - 1 - first), min(len(changes), center + 2 - first))
    best = max(candidates, key=lambda offset: changes[offset])
    visual_frame = first + best + 1
    return visual_frame, round(float(changes[best]), 3)


def main():
    meta = json.load(open(sys.argv[1], encoding='utf-8'))
    path, fps = sys.argv[2], int(sys.argv[3])
    wave = decode(path)
    times = sorted({round(float(event['second']), 6) for event in meta['note_events']})
    output = []
    for requested in map(float, sys.argv[4:]):
        onset = min(times, key=lambda value: abs(value - requested))
        audio_time, audio_rise = audio_attack(wave, onset)
        frame, frame_change = video_attack(path, onset, fps)
        output.append({'midi_onset_sec': onset, 'audio_attack_sec': audio_time,
                       'audio_rise': audio_rise, 'visual_frame': frame,
                       'visual_sec': round(frame / fps, 6), 'frame_change': frame_change,
                       'visual_minus_audio_ms': round((frame / fps - audio_time) * 1000, 2)})
    print(json.dumps(output, indent=2))


if __name__ == '__main__':
    main()
