"""Compare decoded source audio with the AAC track at several timeline positions.

Usage: python check_audio_sync.py source.mp3 output.mp4 [seconds ...]
Positive lag means the MP4 audio is later than the source. This tests mux/codec
alignment, not any pre-existing difference between the uploaded audio and MIDI.
"""
import json
import subprocess
import sys

import numpy as np


RATE = 48000


def decode(path):
    result = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-map', '0:a:0', '-ac', '1',
         '-ar', str(RATE), '-f', 'f32le', '-'],
        check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    return np.frombuffer(result.stdout, dtype='<f4')


def measure(source, output, second):
    # A three-second window is long enough to distinguish repeated piano notes.
    start = max(0, int((second - 1.5) * RATE))
    length = min(3 * RATE, len(source) - start, len(output) - start)
    a = source[start:start + length].astype(np.float64)
    b = output[start:start + length].astype(np.float64)
    a -= a.mean()
    b -= b.mean()
    nfft = 1 << (2 * length - 1).bit_length()
    corr = np.fft.irfft(np.fft.rfft(b, nfft) * np.conj(np.fft.rfft(a, nfft)), nfft)
    limit = min(int(.2 * RATE), length - 1)
    candidates = np.concatenate((corr[-limit:], corr[:limit + 1]))
    index = int(np.argmax(candidates))
    lag = index - limit
    if lag >= 0:
        aligned_a, aligned_b = a[:length - lag], b[lag:]
    else:
        aligned_a, aligned_b = a[-lag:], b[:length + lag]
    similarity = np.dot(aligned_a, aligned_b) / max(
        1e-12, np.linalg.norm(aligned_a) * np.linalg.norm(aligned_b))
    return {'at_sec': second, 'lag_ms': round(lag * 1000 / RATE, 3),
            'correlation': round(float(similarity), 4)}


def main():
    source, output = decode(sys.argv[1]), decode(sys.argv[2])
    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
         '-show_entries', 'stream=duration', '-of', 'default=nw=1:nk=1', sys.argv[2]],
        check=True, stdout=subprocess.PIPE, text=True,
    )
    video_frames = round(float(probe.stdout.strip()) * RATE)
    positions = [float(value) for value in sys.argv[3:]] or [3, 15, 27]
    padding = output[video_frames:]
    source_end = source[max(0, video_frames - RATE // 10):video_frames]
    report = {
        'source_duration_sec': round(len(source) / RATE, 6),
        'output_decoded_duration_sec': round(len(output) / RATE, 6),
        'measurements': [measure(source, output, position) for position in positions],
        'source_rms_before_video_end_100ms': round(float(np.sqrt(np.mean(source_end ** 2))), 6),
        'aac_padding_ms': round(len(padding) * 1000 / RATE, 3),
        'aac_padding_rms': round(float(np.sqrt(np.mean(padding ** 2))), 6) if len(padding) else 0,
    }
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
