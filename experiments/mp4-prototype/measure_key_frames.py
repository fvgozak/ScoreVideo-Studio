"""Inspect decoded MP4 pixels around one physical piano key's Note On.

Usage: python measure_key_frames.py output.mp4 fps midi_second pitch
Landscape 1280x720 only; the default, full-width 88-key projection is used.
The result is a per-frame diagnostic, not an onset decision by itself.
"""
import json
import math
import subprocess
import sys

import numpy as np


def inspect_key(path, fps, second, pitch):
    width = 1280
    black = lambda value: value % 12 in (1, 3, 6, 8, 10)
    white_index = sum(not black(value) for value in range(21, pitch))
    white_width = width * .95 / 52
    left = width * .025
    if black(pitch):
        key_x = left + white_index * white_width - white_width * .32
        key_width = white_width * .64
    else:
        key_x = left + white_index * white_width
        key_width = white_width
    center_x = key_x + key_width / 2
    x = max(0, round(center_x - key_width * .45))
    crop_width = max(8, round(key_width * .9))
    y, crop_height = 594, 58
    note_frame = math.ceil(second * fps - 1e-9)
    first_frame = note_frame - 4
    frames_to_read = 9
    command = ['ffmpeg', '-v', 'error', '-ss', f'{first_frame / fps:.9f}', '-i', path,
               '-frames:v', str(frames_to_read), '-vf',
               f'crop={crop_width}:{crop_height}:{x}:{y},format=rgb24',
               '-f', 'rawvideo', '-']
    raw = subprocess.run(command, check=True, stdout=subprocess.PIPE).stdout
    frames = np.frombuffer(raw, np.uint8).reshape((-1, crop_height, crop_width, 3)).astype(np.int16)
    measurements = []
    for index, frame in enumerate(frames):
        measurements.append({'frame': first_frame + index,
                             'pts': round((first_frame + index) / fps, 6),
                             'mean_rgb': [round(float(value), 2) for value in frame.mean(axis=(0, 1))],
                             'mean_change': round(float(np.mean(np.abs(frame - frames[index - 1]))), 3)
                             if index else None})
    return {'midi_sec': second, 'pitch': pitch, 'expected_first_frame': note_frame,
            'key_center_x': round(center_x, 2), 'roi': [x, y, crop_width, crop_height],
            'frames': measurements}


if __name__ == '__main__':
    print(json.dumps(inspect_key(sys.argv[1], int(sys.argv[2]),
                                 float(sys.argv[3]), int(sys.argv[4])), indent=2))
