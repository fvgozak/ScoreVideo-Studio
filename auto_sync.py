"""First-note audio/MIDI alignment, with adaptive onset backtracking.

The MIDI timeline is authoritative. Only a constant first-attack shift is
estimated; the algorithm does not stretch tempo or assume a fixed latency.
"""
from __future__ import annotations

import subprocess
from pathlib import Path

import mido
import numpy as np

SAMPLE_RATE = 11025
MAX_ANALYSIS_SECONDS = 90.0


def midi_attacks(path: Path) -> np.ndarray:
    midi = mido.MidiFile(str(path))
    if midi.type == 2:
        raise ValueError('독립적인 시간축을 가진 MIDI Type 2는 지원하지 않습니다.')
    tempo = 500_000
    current = 0.0
    notes = []
    for msg in mido.merge_tracks(midi.tracks):
        current += mido.tick2second(msg.time, midi.ticks_per_beat, tempo)
        if msg.type == 'set_tempo':
            tempo = msg.tempo
        elif msg.type == 'note_on' and msg.velocity > 0:
            notes.append(current)
    if not notes:
        raise ValueError('MIDI에서 연주 음표를 찾지 못했습니다.')
    return np.asarray(notes, dtype=np.float64)


def decode_audio(path: Path, seconds: float) -> np.ndarray:
    cmd = ['ffmpeg', '-v', 'error', '-nostdin', '-i', str(path),
           '-map', '0:a:0', '-t', str(seconds), '-ac', '1',
           '-ar', str(SAMPLE_RATE), '-f', 'f32le', 'pipe:1']
    try:
        done = subprocess.run(cmd, capture_output=True, timeout=120, check=True)
    except (subprocess.SubprocessError, OSError) as exc:
        raise ValueError(f'오디오 시작점 분석 실패: {exc}') from exc
    result = np.frombuffer(done.stdout, dtype='<f4')
    if result.size < SAMPLE_RATE:
        raise ValueError('오디오가 너무 짧아 첫 타건을 찾지 못했습니다.')
    return result


def detect_first_sound(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> tuple[float, float]:
    """Estimate (audible onset seconds, signal contrast), without a fixed 0.1s.

    A robust high threshold finds a sustained note; a *lower* adaptive gate
    backtracks to the start of its attack. Unlike a fixed %-of-track-peak
    threshold, this is less biased by a soft first note or a slow piano attack.
    Background music, speech and some extremely gradual fades remain ambiguous.
    """
    samples = np.asarray(samples, dtype=np.float32)
    hop = max(1, round(sample_rate * .004))
    if samples.size < hop * 20:
        raise ValueError('첫 소리를 감지하기에 오디오가 너무 짧습니다.')

    frames = samples[:samples.size // hop * hop].reshape(-1, hop)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
    # Causal rather than symmetric smoothing: future audio cannot trigger an
    # onset early through the smoothing filter.
    smooth = np.convolve(rms, [0.55, 0.3, 0.15], mode='full')[:len(rms)]
    search_peak = float(np.percentile(smooth[:min(len(smooth), int(4 * sample_rate / hop))], 98))
    whole_peak = float(np.percentile(smooth, 98))
    peak = search_peak if search_peak >= .00012 else whole_peak
    if peak < .00012:
        raise ValueError('음원에서 충분한 신호를 찾지 못했습니다.')

    # Estimate background from the first 150 ms, when available. A note that
    # starts at 0 simply returns 0; do not mistake its early RMS for hiss.
    floor = float(np.percentile(rms[:min(len(rms), max(3, round(.15 * sample_rate / hop)))], 25))
    high_gate = max(.00012, peak * .035)
    if floor < peak * .22:
        high_gate = max(high_gate, floor * 3.2)
    high = smooth >= high_gate
    sustain = max(3, round(.016 * sample_rate / hop))
    candidates = np.flatnonzero(np.convolve(high.astype(np.int16), np.ones(sustain, dtype=np.int16), 'valid') >= sustain)
    if not len(candidates):
        raise ValueError('음원의 첫 유효한 소리를 감지하지 못했습니다.')
    candidate = int(candidates[0])

    # A soft first note can be 20–40 dB quieter than later accents. Its RMS
    # may never reach the track-global high gate. Look for the FIRST sustained
    # signal above the measured early noise floor, but still reject isolated
    # clicks. This estimate is separate from the stronger onset candidate.
    early_gate = max(.00009, peak * .0008)
    if floor < peak * .22:
        early_gate = max(early_gate, floor * 3.0)
    early_run = max(5, round(.024 * sample_rate / hop))
    early_above = smooth >= early_gate
    early_candidates = np.flatnonzero(
        np.convolve(early_above.astype(np.int16), np.ones(early_run, dtype=np.int16), 'valid') >= early_run
    )
    if len(early_candidates):
        first_early = int(early_candidates[0])
        if first_early < candidate:
            candidate = first_early
    # Recordings with a soft first note beginning at sample zero contain
    # useful signal from the first frame. Do not classify that as silence
    # merely because its level resembles the first-150ms floor.
    if (len(smooth) > early_run and
        float(np.median(smooth[:early_run])) >= max(.0003, peak * .0015)):
        candidate = 0

    # Backtrack up to 220 ms from the sustained attack. Requiring a continuous
    # low-level run prevents returning a stray click before the piano note.
    low_gate = max(.000045, peak * .004)
    if floor < peak * .22:
        low_gate = max(low_gate, floor * 2.5)
    search_start = max(0, candidate - round(.22 * sample_rate / hop))
    low = smooth >= low_gate
    start = candidate
    gaps = 0
    for i in range(candidate - 1, search_start - 1, -1):
        if low[i]:
            start = i
            gaps = 0
        else:
            gaps += 1
            if gaps >= 2:
                break
    # A short click near the attack can cause a false early reading; require
    # consistent energy near the estimated start.
    if start < candidate and not np.any(low[start:min(candidate + 1, start + 3)]):
        start = candidate
    first_audio = max(0., start * hop / sample_rate)
    return round(first_audio, 4), round(peak / max(floor, 1e-6), 2)


def first_attack_sync(midi_path: Path, audio_path: Path, duration_sec: float) -> dict:
    """Return two anchors for a constant shift between MIDI and audio."""
    onsets = midi_attacks(midi_path)
    first_midi = float(onsets[0])
    if duration_sec <= 0:
        raise ValueError('음원 길이가 올바르지 않습니다.')
    window = min(float(duration_sec), max(18., first_midi + 14.), MAX_ANALYSIS_SECONDS)
    decoded = decode_audio(audio_path, window)
    first_audio, contrast = detect_first_sound(decoded)
    delta = round(first_audio - first_midi, 4)
    last_midi = max(first_midi + .001, float(onsets[-1]))
    return {
        'method': 'first-sound-offset',
        'analysis_version': 2,
        'offset_sec': delta,
        'tempo_ratio': 1.0,
        'correlation': 0.0,
        'signal_contrast': contrast,
        'first_midi_sec': round(first_midi, 4),
        'first_audio_sec': first_audio,
        'anchors': [{'midi': 0.0, 'audio': delta},
                    {'midi': round(last_midi, 4), 'audio': round(last_midi + delta, 4)}],
        'note_events': int(len(onsets)),
        'analysis_seconds': round(decoded.size / SAMPLE_RATE, 2),
    }
