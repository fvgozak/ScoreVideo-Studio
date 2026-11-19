# ScoreMotion v27 · example assets, staff colors, transposing instruments

- Public example uses `examples/manifest.json`, an allowlisted ID + score filename + MIDI filename. Changing this manifest and adding files replaces the demo without JS edits.
- Cloudflare builds copy the manifest, score, and MIDI only. No bundled example recording/cover is deployed. Salamander samples are separate shared static files.
- Staff colors are keyed by MusicXML `part/@id` and 1-based `<staff>` number; never right/left hand text. `score_alignment.pitch_mode` determines whether the browser has matched concert-pitch or written-pitch MIDI.
- MusicXML `<attributes><transpose><chromatic>-2</chromatic></transpose></attributes>` for B-flat clarinet means written C sounds B-flat. `<octave-change>` is included in semitone shift. A transposition can change by measure or staff.
- MusicXML pitch and MIDI sound pitch are separate in the score follower. The written pitch is preserved for score display and camera note identity; sounding pitch is used for alignment.
- A single MIDI channel may serve multiple staves. Per-staff colors currently affect the score's note glow, GPU score bursts, and score light trails. Dynamic-FX keyboard bars retain their prior global palette until accurate MIDI note-to-staff assignment is supported; no invented assignment by channel.
- Current LLM/settings JSON future fields: `staff_colors: {enabled: boolean, colors:{'P1:1':'#54bced', 'P1:2':'#e4b46e'}}`. Existing project and render schema version unchanged. Old projects without this field default to disabled.
- Current browser repeat unfolding still does not support 1st/2nd endings, D.C., D.S., Coda, and Fine. These need dedicated evaluation rather than silent guessing.
