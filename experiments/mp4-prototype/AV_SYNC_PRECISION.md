# Offline MP4 A/V clock and attack validation

Experiment only; the export UI, WebM recorder, legacy FFmpeg renderer, and
offline MP4 engine were not changed in this pass. Tested with the existing
`dream-journey` project (`06e86ec0153a4b8c9eac09f53ba403c9`) on an M1 Max /
32-GB Mac in headless Chromium. All numbers below use the project's existing
MIDI and uploaded MP3. M1 MacBook Air and other browsers were not measured.

## Clock separation and root cause

For this project, the configured score and piano offsets are both **0**, and
there are no sync anchors. `stage.seek(frameIndex / fps)` drives both piano and
score; the piano notes and matched score triggers have the same mapped MIDI
time. The WebM recorder's 33-ms visual lead is absent from the offline path.
Falling bars appear *before* the strike by design; they are not used as Note On
markers. The score glow's fade-in and the piano light's decay are also artistic
envelopes, so their peak brightness is not the Note On timestamp.

Three 1.5-second waveform windows at 3, 100, and 190 seconds were compared in
both complete MP4s. Cross-correlation resolution is one 48-kHz sample
(0.02083 ms):

| Comparison, second minus first | 30 fps | 60 fps | Interpretation |
| --- | ---: | ---: | --- |
| FFmpeg-decoded source MP3 → browser-decoded source PCM | −11.979 ms at all 3 windows | −11.979 ms at all 3 | Decoder representations differ, without drift. |
| Browser-decoded source PCM → FFmpeg-decoded MP4 AAC | **0 samples** at all 3 | **0 samples** at all 3 | AAC encoding/muxing added no measurable shift. |
| FFmpeg-decoded source MP3 → FFmpeg-decoded MP4 AAC | −11.979 ms at all 3 | −11.979 ms at all 3 | Inherits the browser decoder difference. |

The browser `<audio>` metadata duration (197.248662 s) matches the browser
`decodeAudioData()` duration (197.248646 s) and differs from FFmpeg's MP3
decoded duration (197.302875 s). This is consistent with different MP3 delay/
padding handling, but the exact internal decoder mechanism was not proven.
AAC packets have a −44-ms encoder-priming PTS with 2,112 samples marked `Skip
Samples`; after that edit, decoded AAC aligns with browser PCM at sample zero.
The stream presentation start time is 0. Adding 12 or 33 ms to the offline
renderer would therefore introduce a new error relative to browser preview.

## Final MP4 frames and scene time

The 30-fps full video has 5,920 frames, 197.333333 s. The 60-fps full video has
11,839 frames, 197.316667 s. Both start at PTS 0, and every adjacent video PTS
has the intended 1/30- or 1/60-second interval; no PTS gap or duplicate was
found. AAC is 48-kHz stereo in both files, ending at 197.289333 s. The entire
60-fps output took 508.69 s and left no OPFS temp entry after download.

Thirteen representative attacks were chosen across the beginning, middle, and
ending: isolated notes, simultaneous chords, two same-key reattacks 0.136–0.140
seconds apart, a >1-second note, and high-velocity/high-glow notes. For each,
the *actual decoded MP4 key-specific pixel region* jumped at exactly the first
frame whose `frameIndex / fps` was at or after that MIDI Note On. The frame jump
was at least 3.1 times the preceding local frame-change baseline. `stage.seek`
preview inspection found the piano impact and matching score-glow class first
active on that same frame in all 13 cases at both frame rates. This establishes
clock/frame consistency for the piano light, independent of audio attack shape.

Signed mean and largest absolute difference for those 13 notes:

| Time difference | 30-fps mean / max abs | 60-fps mean / max abs | Measurement limit |
| --- | ---: | ---: | --- |
| MIDI Note On → original MP3 **RMS-rise peak** | +52.49 / 71.66 ms | same source | 5-ms grid, 10-ms window; this is a peak proxy, **not** exact acoustic onset. |
| MIDI Note On → decoded key-light first-frame PTS | +11.97 / 28.18 ms | +6.84 / 12.93 ms | Exact decoded-frame PTS; physical onset is bounded by the preceding frame. |
| Original MP3 → MP4 AAC, waveform correlation | −11.979 / 11.979 ms | −11.979 / 11.979 ms | ±1 sample (0.021 ms); 3 windows per FPS. |
| Decoded key-light PTS − MP4 audio **RMS-rise peak** | −28.59 / 65.00 ms | −33.72 / 65.00 ms | Peak timing is source/instrument dependent; chord/rapid passages are ambiguous. |

For three clearer single-note samples with a 35%-of-rise onset threshold rather
than the peak, MIDI → original attack was +45.62 ms mean / 55.76 ms max. Decoded
key light − MP4 attack was −15.00 ms mean / 20.00 ms max at 30 fps and −20.56
ms mean / 31.67 ms max at 60 fps. The 15–35% threshold choice moved some
onsets by 5–15 ms. For the long note at 101.998 s, the original-audio RMS rise
was too weak for that threshold: its 65-ms peak-based A/V figure is **not a
confirmed 65-ms sync fault**. Chords and same-key reattacks have overlapping
sound/resonance and are not assigned precise note-specific audio onsets.

By region, the 13-note peak proxy (signed means; maximum absolute A/V gap in
parentheses) was:

| Region | Samples | MIDI → source peak | Video − MP4 audio peak, 30 fps | Video − MP4 audio peak, 60 fps |
| --- | ---: | ---: | ---: | ---: |
| Beginning | 4 | +47.23 ms | −17.08 ms (26.67) | −29.58 ms (43.33) |
| Middle | 5 | +54.66 ms | −33.33 ms (65.00) | −36.67 ms (65.00) |
| Ending | 4 | +55.02 ms | −34.17 ms (41.67) | −34.17 ms (41.67) |

The changing peak-based differences must **not** be called encoder drift: the
source-to-AAC waveform offset stays fixed to a sample across the same regions.
The 60-fps key light can occur earlier relative to a later acoustic rise because
its frame quantization is finer; that is not a duplicate/omitted-frame fix.
Absolute physical onset uncertainty is at least the 5-ms analysis hop plus
window/threshold sensitivity (5–15 ms for the clearer solos), and can be much
larger for chords, sustained notes, and residual sound. The HTMLAudioElement's
actual output waveform was not captured; its metadata clock was checked.

## Score-note glow limitation found separately

This project has score sparkle enabled but *score drawing animation* disabled.
In preview, all 13 matching noteheads acquire `score-glowing` on the first MIDI
frame. In the offline MP4 compositor, the score SVG is rasterized only once
(`svgDecodes=1` in both complete runs); when drawing animation is off, that
static clone explicitly removes `.score-glowing`. The live `note-trail` and
`note-star` are DOM nodes rather than included Canvas layers. Consequently the
final MP4 has **no corresponding live score-note glow onset to timestamp** in
this setting. This is a separate visual-parity defect, not an A/V clock offset.
No effect was added or compositor rewritten in this sync-only task: simply
rerasterizing the whole score SVG every frame would be a major performance
regression. It needs a separate minimal dynamic-overlay design and visual QA.

## Decision

No offline audio/video timing correction was applied: the AAC path is aligned
to the browser source PCM, the scene uses the intended MIDI timeline, and the
measured note-to-recording lag is in the source/perceptual attack definition.
User animation lead/lag settings should remain intentional. To make a stronger
claim about perceptual ±1-frame sync, test isolated per-pitch stems or a
calibrated click/flash fixture; the current mixed recording does not identify
every chord note's physical acoustic onset with frame-level certainty.
