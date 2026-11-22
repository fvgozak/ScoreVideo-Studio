# ScoreMotion Save/Load v3.2 — Data Spec Addendum

This document **amends** `docs/PROJECT_SAVE_LOAD_DATA_SPEC.md` (schema v1) without bumping `schema_version`.

## Audio presence

- Uploaded audio: `assets.bindings.audio: "audio-main"` and byte-preserved `assets/audio/...`.
- No uploaded audio (Salamander synthesis): `assets.bindings.audio: null`, no `assets/audio/...`; `extensions.audio_mode: "generate-from-midi"` and `extensions.audio_generator: "salamander-v1"`; `derived/analysis.json` `meta.generated_audio: true`.
- On import: verify ZIP, hashes, MIDI and MusicXML first; synthesize WAV using uploaded MIDI, then update `meta.audio_duration_sec` based on actual locally rendered audio. Never change saved user manual sync offsets or settings. Fail safely if regeneration fails. Legacy archives with embedded generated audio remain readable.
- Audio missing despite an uploaded-audio declaration is an error. These rules supersede the v1 spec's requirement to always bundle a generated WAV.

## Filename

`<MusicXML source stem> (<aspect ratio as WxH>).scoremotion`; fallback to MIDI basename if no score. Use `customAspectWidth`/`customAspectHeight` for custom aspect. Valid examples: `Nocturne (16x9).scoremotion`, `Étude (9x16).scoremotion`. Copy-as may use the user-given copy name. Filename changes do not modify `project_id` or the `schema_version`.

## MusicXML DOCTYPE

Standard official MusicXML PUBLIC/SYSTEM DTD declarations are accepted and stripped *from the parsed representation only*. The original `scoreOriginal` Blob bytes stay unchanged and must retain their SHA-256. Any `<!ENTITY>` declaration, internal DTD subset, and unexpected external DTD URL is rejected before DOM parsing. Validate the original XML and the derived playback XML separately.

## Tests

- JS: `tests/test_project_audio_optional_musicxml.mjs` (generated/audio-preserved, official DTD, malicious DTD, MIDI-only, round-trip).
- Browser: `tests/validate_project_audio_optional_browser.py` (official DTD + audio-less project, output filename, load regeneration, settings).
- Existing Save/Load, effects and i18n regression tests remain mandatory.
