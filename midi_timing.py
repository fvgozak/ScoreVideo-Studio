"""Extract a MIDI tempo timeline, using quarter notes as the common MusicXML axis."""
from __future__ import annotations

from pathlib import Path
import mido


def read_timing(midi_path: Path) -> dict:
    midi = mido.MidiFile(str(midi_path))
    if midi.type == 2:
        raise ValueError("Type-2 MIDI (independent track timelines) is not supported.")
    if midi.ticks_per_beat <= 0:
        raise ValueError("Invalid MIDI ticks-per-beat.")

    tick = 0
    tempo = 500_000  # Default MIDI tempo: 120 quarter notes per minute.
    seconds = 0.0
    tempo_map = [{"beat": 0.0, "second": 0.0, "tempo_us": tempo}]
    first_note_tick = None
    note_count = 0
    note_events = []  # Beat + pitch + velocity + real note-off for tied-note sustain.
    active_notes = {}  # (channel, pitch) -> queue of overlapping note-ons.
    for message in mido.merge_tracks(midi.tracks):
        delta_ticks = message.time
        seconds += mido.tick2second(delta_ticks, midi.ticks_per_beat, tempo)
        tick += delta_ticks
        if message.type == "note_on" and message.velocity > 0:
            note_count += 1
            # At 100k attacks, keep the timing accurate but avoid an enormous web payload.
            if len(note_events) < 100_000:
                note = {"beat": round(tick / midi.ticks_per_beat, 6),
                        "pitch": int(message.note),
                        "second": round(seconds, 6),
                        "velocity": int(message.velocity)}
                note_events.append(note)
                active_notes.setdefault((message.channel, message.note), []).append(note)
            if first_note_tick is None:
                first_note_tick = tick
        if message.type == "note_off" or (message.type == "note_on" and message.velocity == 0):
            key = (message.channel, message.note)
            queue = active_notes.get(key, [])
            if queue:
                note = queue.pop(0)
                note["end_second"] = round(max(float(note["second"]), seconds), 6)
        if message.type == "set_tempo":
            tempo = message.tempo
            point = {"beat": tick / midi.ticks_per_beat,
                     "second": round(seconds, 9), "tempo_us": tempo}
            # Later tempo changes at the same beat supersede earlier ones.
            if abs(point["beat"] - tempo_map[-1]["beat"]) < 1e-10:
                tempo_map[-1] = point
            else:
                tempo_map.append(point)
    if not note_count:
        raise ValueError("The MIDI file has no note-on events.")
    for queue in active_notes.values():
        for note in queue:
            note["end_second"] = round(seconds, 6)
    return {
        "ticks_per_beat": midi.ticks_per_beat,
        "tempo_map": tempo_map,
        "note_count": note_count,
        "note_events": note_events,
        "velocity_events_truncated": note_count > len(note_events),
        "first_note_beat": first_note_tick / midi.ticks_per_beat,
        "midi_duration_sec": round(seconds, 3),
    }
