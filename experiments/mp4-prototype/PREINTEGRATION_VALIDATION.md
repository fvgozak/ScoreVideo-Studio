# Offline MP4 pre-integration validation — Dream Journey

Validation only. No export UI, WebM recorder, FFmpeg renderer, or production
rendering path was changed. Test host: Apple M1 Max / 32 GB, headless Chromium;
this is **not** a measurement on an M1 MacBook Air. Project ID:
`06e86ec0153a4b8c9eac09f53ba403c9`. The source MP3 decodes to 197.302875 s
with FFmpeg. Both full-song runs used the original audio, OPFS output,
shadow-sprite piano, score glow, and the existing project settings.

## Full-song outputs

| Setting | Result | Wall time | Video | Audio | File |
| --- | --- | ---: | --- | --- | ---: |
| 1280×720, 30 fps | Complete; Chromium played to `ended` | **287.19 s** | H.264, 5,920 frames, 197.333333 s | AAC, 9,250 packets, 197.289333 s | 71,598,989 B |
| 1280×720, 60 fps | Complete; Chromium played to `ended` | **Not recovered**: the earlier runner session expired after writing the file; it was not rerun | H.264, 11,839 frames, 197.316667 s | AAC, 9,250 packets, 197.289333 s | 72,279,974 B |
| 1920×1080, 30 fps | **Not run** as a full song | — | — | — | — |

The 60-fps file was checked *before* any retry: it already existed, the prior
Chromium renderer process had exited, and `ffprobe` plus Chromium playback
confirmed a complete file. A **different, earlier build** took 508.69 s for a
full-song 720p/60fps run (see `AV_SYNC_PRECISION.md`); that number is **not**
presented as the wall time of this final build. The latest available 1080p
test is a **30-second** run in `SCORE_GLOW_VALIDATION.md`: 900 frames in
70.85 s, before the subsequent visual-fidelity changes. It does not establish
current full-song 1080p performance or memory safety.

`ffprobe` of every video frame found PTS 0 at the first frame, strictly
increasing PTS, and no duplicate/omitted timestamp interval. The 30-fps gap
was 0.033333–0.033334 s; 60-fps was 0.016666–0.016667 s. The expected frame
counts are `ceil(197.302875 × fps)`: 5,920 and 11,839. The 60-fps last frame
is at 197.300000 s. The 60-fps MP4 opened in Chromium, sought near the end,
and reached `ended:true` at 197.316667 s.

## Audio/video timing

At 3, 100, and 190 s, source MP3 versus output AAC waveform correlation gave
a constant **−11.979 ms** lag for **both** full-song files (60-fps correlations
0.9992, 0.9996, 0.9997). At 196 s, the 60-fps correlation was 0.9998 with
the same lag. Thus the available samples show no progressive mux drift. The
known difference comes from browser versus FFmpeg MP3 decoding; earlier
browser-decoded PCM versus final AAC comparison found zero-sample offset
(`AV_SYNC_PRECISION.md`). The 60-fps audio stream ends 27.334 ms before the
last video presentation endpoint. Its source and output decoded final 100 ms
are silent; the 196-s waveform still matches. No audible tail truncation was
established by these tests, but a subjective listening test was not done.

The *decoded video* key-region test rechecked 13 beginning/middle/end note
events, including chords, repetition and a sustained note. All 13 first key
flash frames matched the first frame at or after MIDI Note On. MIDI-to-video
PTS averaged +6.84 ms, maximum +12.93 ms at 60 fps. The local mixed-audio
RMS-rise peak lagged the key frame by 33.72 ms on average and at most 65 ms;
it is **not** a reliable per-note acoustic onset for chords or sustained
resonance. The existing source MIDI-to-recording attack difference must not
be treated as an encoder error. No timing correction was applied.

## Visual checks

Native MP4 frames at 3.7, 98.633, and 192.267 s were compared with matching
preview times at 1280×720. The score engraving and cursor, title visibility,
background, moving noteheads, score glow, falling bars, and illuminated piano
keys were present without a conspicuous missing layer or double resting head.
ImageMagick mean absolute RGB-channel differences were 3.55%, 2.72%, and
3.57% of full scale for the 60-fps frames; these include MP4 compression and
preview-screenshot scaling and are **not** a perceptual quality score. Visible
differences in the inspected frames were mostly blur/edge/particle antialiasing.
The earlier 30-fps mid/end checks were 2.68%/3.56% by the same method.

One-frame preview/compositor checks also covered the actually supported
`classic`, `modern`, `jazz`, and `manuscript` notation settings at 3.7 s, and
`drawScore` at 0, 3.7, 98.633 s and 150% zoom. The draw animation showed
progressing SVG items, cursor and moving/glowing notes in inspected frames.
Unlike the normal score mode, `drawScore` deliberately uses the live SVG path
(`staticHeads:null`), so its **full-song encoded performance and exact pixel
parity are not established**. Prior representative checks in
`VISUAL_FIDELITY_FINAL.md` cover idle, strong note motion, shared-stem chord,
rapid repetition, tie, 150% zoom, title on/off and visual effect off. They are
representative-frame tests, not a complete matrix of full-song exports.

## Memory and cleanup

| Component | Observation | Limitation |
| --- | --- | --- |
| Chromium renderer RSS, 720p/30 full | Periodic `ps` samples about 490–665 MiB; late samples fluctuated rather than climbing continuously | Sampled RSS, not a peak or GPU allocation |
| Chromium renderer RSS, 720p/60 full | Samples included 724 MiB early and about 548–596 MiB later | Runner session ended before final sample; no true peak |
| Static notehead bitmap, default zoom | Estimated decoded pixels 26.9 MB; score scratch 1.73 MB | Pixel estimate, not measured resident memory |
| Static notehead bitmap, 150% zoom | Earlier one-frame estimate 91.1 MB | No 150%-zoom full-song memory run |
| Score-glow sprite LRU, 720p/30 full | Maximum 50,331,648 B (48 MiB cap), with 2,336 evictions | Separate from static noteheads and GPU memory |
| Piano shadow sprites | Maximum estimated 14,864,872 B | Pixel estimate |
| Browser heap / decoded audio / GPU | `performance.memory` was coarse and unchanged; not independently reliable | No proof against all memory leaks |
| OPFS | Full 720p/30 output had no temp entries after release. Subsequent recovery test started with no old temp entries and found none after each cancel/release | Browser crash recovery not tested |

The absence of continuous sampled RSS growth in the 720p/30 run is useful but
does **not** prove 1080p, 150% zoom, or `drawScore` full-song memory stability.
OPFS held the output rather than assembling one whole-song MP4 Blob in JS.

## Cancellation and rerun

`validate_recovery.py` ran in one browser with OPFS and source audio. Cancellation
at frame 1 and frame 450 of a 30-second job both returned `Cancelled`, left no
published result or progress state, and left no `scorevideo-offline-*` OPFS
entry. The immediate 1-second rerender and a further rerender each produced
30 frames; each temporary file existed before release and was absent after
release. This verifies early/mid cancellation and retry, but not cancellation
at 90%, an actual browser crash, or a concurrent service export.

## Decision

**조건부 통합** — full-song 720p/30 and 720p/60 outputs are playable, frame-accurate,
audio-backed, visually close to preview at representative times, and clean up
their OPFS resources. However, the final 60-fps run's wall-time log was lost,
and full-song 1080p, 150% zoom and `drawScore` memory/performance remain
unverified. Production integration should retain the existing MP4 renderer as
an explicit fallback for these unverified cases and for browser/codec failure.
This report does **not** integrate or change the service exporter.
