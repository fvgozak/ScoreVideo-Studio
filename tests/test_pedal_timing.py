"""Small CC64 timing and Salamander release checks."""
import wave

import mido
import numpy as np

from midi_timing import read_timing
import sample_audio


def test_cc64_is_channel_specific_and_keeps_repeated_notes(tmp_path):
    midi = mido.MidiFile(ticks_per_beat=480)
    track = mido.MidiTrack()
    midi.tracks.append(track)
    track.extend([
        mido.Message("control_change", channel=0, control=64, value=64, time=0),
        mido.Message("note_on", channel=0, note=60, velocity=80, time=0),
        mido.Message("note_on", channel=1, note=67, velocity=80, time=0),
        mido.Message("note_off", channel=0, note=60, velocity=0, time=480),
        mido.Message("note_off", channel=1, note=67, velocity=0, time=0),
        mido.Message("note_on", channel=0, note=60, velocity=75, time=480),
        mido.Message("note_off", channel=0, note=60, velocity=0, time=480),
        mido.Message("control_change", channel=0, control=64, value=63, time=480),
    ])
    path = tmp_path / "pedal.mid"
    midi.save(path)
    result = read_timing(path)
    first, other, repeated = result["note_events"]
    assert result["pedal_events"][0]["down"] is True
    assert result["pedal_events"][-1]["down"] is False
    assert (first["end_second"], first["sustain_end_second"]) == (0.5, 2.0)
    assert (other["end_second"], other["sustain_end_second"]) == (0.5, 0.5)
    assert (repeated["end_second"], repeated["sustain_end_second"]) == (1.5, 2.0)


def test_salamander_release_uses_pedal_end(tmp_path, monkeypatch):
    sample = np.full((sample_audio.SAMPLE_RATE * 3, 2), 0.15, dtype=np.float32)
    monkeypatch.setattr(sample_audio, "decode_sample", lambda _name: sample)
    note = {"pitch": 60, "second": 0, "end_second": .2,
            "sustain_end_second": .7, "velocity": 100}
    path = tmp_path / "sustain.wav"
    sample_audio.render_salamander({"note_events": [note], "midi_duration_sec": .7}, path)
    with wave.open(str(path)) as audio:
        audio.setpos(int(.55 * sample_audio.SAMPLE_RATE))
        held = np.frombuffer(audio.readframes(1000), dtype="<i2")
        audio.setpos(int(1.25 * sample_audio.SAMPLE_RATE))
        released = np.frombuffer(audio.readframes(1000), dtype="<i2")
    assert np.mean(np.abs(held.astype(np.float32))) > 5 * np.mean(np.abs(released.astype(np.float32)))
