"""Offline Salamander Grand Piano rendering for projects without an audio file.

Uses the bundled 28 CC BY 3.0 MP3 samples (see static/audio/salamander/NOTICE.txt).
Nearby MIDI pitches are repitched; this is not the complete SFZ instrument.
"""
from __future__ import annotations

import subprocess
import wave
from pathlib import Path

import numpy as np

SAMPLE_RATE = 32_000
SAMPLES = ("A0", "C1", "Ds1", "Fs1", "A1", "C2", "Ds2", "Fs2",
           "A2", "C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "Fs4",
           "A4", "C5", "Ds5", "Fs5", "A5", "C6", "Ds6", "Fs6",
           "A6", "C7", "A7", "C8")
OFFSETS = {"C": 0, "Ds": 3, "Fs": 6, "A": 9}
SAMPLE_PITCHES = tuple((12 * (int(name[-1]) + 1) + OFFSETS[name[:-1]], name)
                       for name in SAMPLES)
SAMPLE_DIR = Path(__file__).resolve().parent / "static" / "audio" / "salamander"


def nearest_sample(pitch: int) -> tuple[int, str]:
    return min(SAMPLE_PITCHES, key=lambda item: abs(item[0] - pitch))


def decode_sample(name: str) -> np.ndarray:
    path = SAMPLE_DIR / f"{name}.mp3"
    if not path.is_file():
        raise ValueError(f"Salamander piano sample is missing: {name}.mp3")
    process = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "2", "-ar", str(SAMPLE_RATE), "-"],
        capture_output=True, check=False, timeout=60)
    if process.returncode:
        raise ValueError(f"Cannot decode Salamander sample {name}: {process.stderr.decode(errors='replace')[-300:]}")
    return np.frombuffer(process.stdout, dtype="<f4").reshape(-1, 2).copy()


def render_salamander(timing: dict, output: Path) -> float:
    """Write a 16-bit stereo WAV and return its duration in seconds."""
    events = timing.get("note_events") or []
    if not events:
        raise ValueError("No MIDI notes to synthesize")
    last_note = max(float(note.get("end_second", note["second"] + .35)) for note in events)
    duration = max(float(timing.get("midi_duration_sec") or 0), last_note) + 1.5
    if duration > 600:
        raise ValueError("Automatic piano audio is limited to 10 minutes; supply an audio file for longer pieces")
    frames = int(np.ceil(duration * SAMPLE_RATE))
    mix = np.zeros((frames, 2), dtype=np.float32)
    cache: dict[str, np.ndarray] = {}
    for note in events:
        pitch = int(note["pitch"])
        sample_pitch, name = nearest_sample(pitch)
        if name not in cache:
            cache[name] = decode_sample(name)
        sample = cache[name]
        start = max(0, int(round(float(note["second"]) * SAMPLE_RATE)))
        if start >= frames:
            continue
        rate = 2 ** ((pitch - sample_pitch) / 12)
        hold = max(.06, float(note.get("end_second", note["second"] + .35)) - float(note["second"]))
        count = min(frames - start, int((hold + 1.4) * SAMPLE_RATE), int((len(sample) - 1) / rate))
        if count <= 0:
            continue
        indices = np.arange(count, dtype=np.float32) * rate
        base = indices.astype(np.int32)
        fraction = (indices - base)[:, None]
        rendered = sample[base] * (1 - fraction) + sample[base + 1] * fraction
        times = np.arange(count, dtype=np.float32) / SAMPLE_RATE
        envelope = np.minimum(1, times / .006)
        envelope *= np.exp(-np.maximum(0, times - hold) / .22)
        velocity = max(1, min(127, int(note.get("velocity", 78)))) / 127
        gain = min(.65, .12 + velocity ** 1.4 * .43)
        mix[start:start + count] += rendered * (envelope * gain)[:, None]
    peak = float(np.max(np.abs(mix))) if mix.size else 0
    if peak > .95:
        mix *= .95 / peak
    pcm = (np.clip(mix, -1, 1) * 32767).astype("<i2")
    with wave.open(str(output), "wb") as audio:
        audio.setnchannels(2)
        audio.setsampwidth(2)
        audio.setframerate(SAMPLE_RATE)
        audio.writeframes(pcm.tobytes())
    return frames / SAMPLE_RATE
