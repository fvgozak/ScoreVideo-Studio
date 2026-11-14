# Offline MP4 visual fidelity pass

Only `experiments/mp4-prototype` changed. The editor, WebM recorder, FFmpeg
renderer and export UI remain untouched.

## Corrections

- The composer's cached SVG contained every resting `.vf-notehead`, while the
  dynamic overlay drew moving heads on top. The experiment now caches the
  engraving without noteheads and a separate notehead-only SVG. Each frame it
  draws the latter into a transparent score-window tile, removes only active
  moving glyph paths at their resting positions, then draws the existing live
  glow/particle layer. Staff lines, stems, ties and other symbols remain in
  the engraving cache. The SVG is decoded once per 30-second run, not per
  frame. The existing 48 MiB glow-sprite LRU is unchanged.
- The shared diagnostic composer treated CSS opacity `0` as `1` when drawing
  titles (`Number(opacity) || 1`). The experiment filters hidden/zero-opacity
  title elements, preserves nonzero preview opacity, and draws visible titles
  after the score/glow layers so their stacking matches the preview.

## Verification

Dream Journey project `06e86ec0153a4b8c9eac09f53ba403c9`, Chromium,
1280×720, source AAC audio, shadow-sprite piano. Single-run timings can vary
with system load. The prior baseline came from the preceding glow-validation
pass on this project.

| 30-second output | Prior baseline | This pass | Video frames | PTS gap | Audio |
| --- | ---: | ---: | ---: | --- | --- |
| 720p / 30fps | 39.84 s | 45.00 s final title-layer build; 41.29 s before its final stacking adjustment | 900 | 0.033333–0.033334 s, no nonpositive gaps | AAC, 30.036 s |
| 720p / 60fps | 78.98 s | 85.19 s final title-layer build; 83.63 s before its final stacking adjustment | 1,800 | 0.016666–0.016667 s, no nonpositive gaps | AAC, 30.036 s |

The final 30fps run spent 1.072 s drawing the notehead-only layer across
900 frames, including resting-head removal; the final 60fps run spent
2.012 s across 1,800 frames. Its extra bitmap was estimated at
26.9 MB of decoded pixels and the reusable score-window scratch at 1.73 MB.
At 150% score zoom, the full-page notehead-only bitmap estimate was 91.1 MB;
this is **in addition** to the existing static engraving bitmap, and is not
part of the 48 MiB glow LRU. The 30fps run retained 27.4 MB in that LRU.
These are pixel-buffer estimates, not total browser RSS measurements.

The automated representative-frame check passed idle, normal and maximum
motion, nine-head shared-stem chord, rapid repetition, tie, 150% zoom,
effect-off, title-on/off, middle and end. At the 3.7 s motion frame, eight
resting heads were removed and eight dynamic heads were drawn; at the shared
chord, nine were removed and redrawn. At effect-off, neither removal nor
dynamic drawing occurred. The live intro title was drawn, while its off
setting and the middle/end hidden states produced zero title draws. Native
MP4 frames at 3.7 s, 98.633 s and 192.267 s were visually compared with
the preview at matching timestamps; no duplicate resting head or extra title
was apparent. The 60fps final build also exported a 12-frame motion excerpt.

At 150% zoom with motion/glow disabled, comparing the original one-image
engraving against the split engraving over the score region found 15,192
changed RGB channels of 1,303,932 (1.17%), mean absolute channel difference
0.2604/255. Only 1,053 channels differed by over 64; the largest individual
channel difference was 231. Separate SVG rasterization, Canvas alpha
compositing/antialiasing and the ordering of the existing scene effects can
cause these localized differences. No visibly material new blur, color or
particle displacement was identified in inspected native frames, so no
broader renderer change was made.

Known limits: Dream Journey and Chromium were exercised, not every score
font, browser or multi-page score. When `drawScore` animation is enabled, the
prototype retains its live-SVG path rather than applying this static split;
that mode's ghosting was not retested. End-to-end times have not been repeated
enough to separate code cost from normal system-load variation reliably.

Reproduce representative checks:

```sh
.venv/bin/python experiments/mp4-prototype/validate_visual_fidelity.py PROJECT_ID
SCOREVIDEO_AUDIO_MODE=source SCOREVIDEO_PIANO_MODE=shadow-sprite .venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID full 1280x720
```
