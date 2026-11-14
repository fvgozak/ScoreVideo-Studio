# Offline MP4 score-note glow follow-up

This change stays inside `experiments/mp4-prototype`. It does not alter the
export UI, WebM recorder, FFmpeg renderer, source audio, or A/V clock.

## Cause and correction

`createDiagnosticComposer()` caches the engraving SVG with
`.score-glowing` and `.score-note-moving` removed when score-drawing animation
is off. Its Canvas pass includes the playback cursor and live Canvas layers,
but not the DOM `note-star`/`note-trail` elements. Thus the original offline
MP4 omitted score-note glow despite the same `stage.seek(t)` being used.

The experiment now keeps the cached static SVG and draws only the live
`ScoreFollower.activeNodes` over it. It uses the already-computed preview
color, blur, active lifetime, notehead geometry, and DOM particle positions.
Small Path2D/Canvas tiles cache the glyph shadow and star/trail shadows so the
full-resolution output Canvas does not create thousands of shadows per run.
The piano shadow-sprite optimization remains enabled for the comparisons.

## Measured 30-second Dream Journey outputs

Same project `06e86ec0153a4b8c9eac09f53ba403c9`, source MP3 included,
headless Chromium, shadow-sprite piano mode. No M1 MacBook Air measurement.
The 720p before/after pair was measured in this pass; the 1080p and 60fps
baseline values are from the preceding audio-validation pass, so small
between-run differences are not attributable to this change alone.

| Output | Before | After | Frames | Dynamic score layer |
| --- | ---: | ---: | ---: | ---: |
| 720p, 30fps | 40.52 s | 39.84 s | 900 | 0.260 s total, 0.289 ms/frame, p95 0.6 ms |
| 1080p, 30fps | 66.39 s | 70.85 s | 900 | 0.320 s total, 0.355 ms/frame, p95 0.7 ms |
| 720p, 60fps | 76.47 s | 78.98 s | 1800 | 0.514 s total, 0.286 ms/frame, p95 0.5 ms |

The first naive implementation rerasterized 201 tiny SVG sprites in 30 s,
raising 720p output to 95.93 s (encoding/waiting 75.44 s). That version was
discarded. With cached Canvas sprites, encoding/waiting was 24.06 s vs
24.48 s in the no-glow 720p run. The engraved SVG still decoded once in
each 30-second output, not once per frame. Different runs vary by seconds;
these numbers do not establish a speedup. The 720p final run preceded the
cache cap, which is not reached at that resolution in 30 seconds. Estimated
resident sprite pixel memory was 27,419,192 bytes at 720p/30fps and peaked
at 50,331,444 bytes in the capped 1080p/30fps export. `performance.memory`
did not provide a trustworthy varying heap peak.

Sprite cache keys include the score notehead identity, notation style, color,
quantized blur and displayed size; particle keys include kind, color and
quantized dimensions. Changes create new keys, and replacement score DOM
creates new notehead identities. A shared LRU removes old tiles before
retained pixel buffers exceed 48 MiB (50,331,648 bytes). `close()` releases
all retained tile references. On the complete 197.3-second Dream Journey at
1080p/30fps, the isolated score overlay visited 5,920 frames in 11.47 s,
peaked at 50,331,612 retained pixel bytes, evicted 3,015 tiles and reported
zero retained tiles after close. This was a **score-overlay-only** memory
exercise, not an encoded full-song MP4 or a total Chromium RSS measurement.

`ffprobe` confirmed H.264 + AAC, 30.000 s, exactly 900 frames at 30fps and
1800 at 60fps. Adjacent PTS gaps were 0.033333–0.033334 s and
0.016666–0.016667 s respectively, without duplicates. The AAC path was not
changed. Cancellation at frame 100 produced no result, stale progress, or
OPFS temp output.

## Visual checks and limits

At the live `stage.seek(t)` times, the added layer changed score-window
pixels for a single note, a simultaneous chord, a shared-stem chord, rapid
repeats, a sustained note, a tie continuation, and beginning/middle/end
samples. The shared-stem case drew nine active heads; Aurora mode produced
two distinct note colors in its chord sample. A 150% score zoom drew all nine
active heads at the new positions. The live cursor changed 4,513 compositor
pixels at a middle sample when toggled off, confirming it is retained.

Native MP4 frames at 3.7 s, and silent visual excerpts beginning at 98.633 s
and 192.267 s, were compared with same-time browser preview captures. Score
position, note color/glow, particles, cursor and piano light corresponded in
all three. The preview captures were resized from editor display size to
output size; pixel-perfect equivalence was not established. With score
sparkle **and** note motion off, the dynamic overlay changed zero channels.
With sparkle off but note motion on, it drew nine unlit moving noteheads and
zero particles in the shared-chord sample; a short MP4 and preview were also
compared visually.

Residual differences are expected from Canvas Path2D/shadow rasterization
versus browser SVG/CSS `drop-shadow`, especially subpixel edges, particle
gradients, and score styles with transformed notehead glyphs. The static
engraving still contains an unshifted base glyph under a moving notehead;
strong note-motion settings may expose a faint ghost. The compositor also
showed the project title in the middle/end MP4 excerpts where the editor
preview captures did not; this pre-existing title-layer difference was not
changed in this score-glow task. Only the Dream Journey project was exercised,
not every notation preset or browser. A complete post-change 3-minute MP4,
total browser RSS, and actual M1 MacBook Air behavior remain unmeasured.

## Reproduce

```sh
SCOREVIDEO_PIANO_MODE=shadow-sprite .venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID full 1280x720
SCOREVIDEO_SCORE_GLOW=0 SCOREVIDEO_PIANO_MODE=shadow-sprite .venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID full 1280x720
.venv/bin/python experiments/mp4-prototype/validate_score_glow.py PROJECT_ID
```
