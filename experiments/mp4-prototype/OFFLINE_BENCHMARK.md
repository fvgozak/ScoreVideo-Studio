# Offline MP4 prototype: 30-second benchmark

This is an isolated, **silent** experiment. The ScoreVideo export UI, WebM recorder,
and precision MP4 renderer were not replaced. Test source: the existing “blue sky”
project, first 30 seconds, 30 fps. Browser: Playwright headless Chromium
158.0.8127.18; machine: M1 Max MacBook Pro, 32 GB (not the target M1 Air 16 GB).
Numbers are wall-clock samples, not performance guarantees.

## End-to-end results

| Path | Output | Wall time | Frames | Effective throughput |
| --- | --- | ---: | ---: | ---: |
| Simple Canvas → H.264 MP4 | 1280×720, silent | 1.40 s | 900 | 643 fps |
| ScoreStage → Canvas only, initial run | 1280×720, no file | 30.89 s | 900 | 29.1 fps |
| ScoreStage → Canvas only, detailed run | 1280×720, no file | 30.42 s | 900 | 29.6 fps |
| ScoreStage → Canvas → H.264 MP4 | 1280×720, silent | 31.44 s | 900 | 28.6 fps |
| ScoreStage → Canvas → H.264 MP4 | 1920×1080, silent | 64.85 s | 900 | 13.9 fps |
| Existing WebM MediaRecorder | 1280×720, with audio | 31.51 s | 408 encoded video frames | 13.0 encoded fps |
| Existing JPEG screenshot + FFmpeg MP4 | 1280×720, with existing audio path | 56.93 s | 900 | 15.8 fps |

The legacy figure measures the JPEG screenshot path in `render_video.stream_frames`,
not any adaptive CDP alternative. Its measured screenshot time alone was 54.09 s;
`stdin.write` was 0.41 s. The 31.51 s WebM result comes from the previous
same-project 30-second test and includes audio, whereas offline MP4 does not.

## Detailed phase timing, 1280×720 × 900 frames

Each phase is measured as a non-overlapping interval in the prototype. `scene`
contains `stage.seek(frame/fps)`, which runs the deterministic scene update.
`background`, `piano`, `score`, and `effects` partition the compositor's wall time.
`svgDecode` is a **subset** of `score`, not an additional phase.

| Phase | Compose-only total / avg / p95 | Final MP4 total / avg / p95 |
| --- | ---: | ---: |
| Scene update (`stage.seek`) | 816 ms / 0.907 ms / 1.2 ms | 914 ms / 1.015 ms / 1.3 ms |
| Background/photo/atmosphere | 16 ms / 0.017 ms / 0.1 ms | 15 ms / 0.016 ms / 0.1 ms |
| Piano canvas | 13,581 ms / 15.090 ms / 22.0 ms | 13,623 ms / 15.137 ms / 22.2 ms |
| Score panel/SVG/cursor | 8,293 ms / 9.214 ms / 18.2 ms | 701 ms / 0.779 ms / 0.7 ms |
| Falling notes/glow/titles | 7,465 ms / 8.294 ms / 13.4 ms | 7,438 ms / 8.264 ms / 13.4 ms |
| Full Canvas composition | 29,361 ms / 32.623 ms / 49.6 ms | 21,784 ms / 24.204 ms / 35.9 ms |
| `CanvasSource.add()` / encoder wait | not used | 8,539 ms / 9.488 ms / 13.1 ms |
| MP4 finalize | not used | 37.4 ms / one call / one call |

The four compositor subphases sum to 29,355 ms (compose-only) and 21,777 ms
(final MP4), leaving 6–7 ms of measurement/dispatch overhead; they do not overlap.
The `svgDecode` subset was 132 ms and 130 ms, respectively, **one decode in 900
frames**; its per-frame p95 is zero. Phase timing is JavaScript wall time. Canvas
GPU work can be deferred and surface as a wait in a later phase, so the large
score-draw difference between the two runs (8.3 s versus 0.7 s) should not be
interpreted as repeat SVG decoding or a reliable per-operation CPU cost.

At 1920×1080, the final MP4 took 64.85 s: scene 936 ms, Canvas composition
46,451 ms (51.612 ms/frame, p95 76.5 ms), encoder add/wait 17,253 ms
(19.170 ms/frame, p95 23.1 ms), finalize 46.3 ms. SVG decode remained one
time (125 ms). Resolution increases both composition and encoding costs.

## Frame and visual validation

- `ffprobe` reports H.264 MP4, 900 packets, 30.000 s duration at both 720p and
  1080p. Presentation timestamps run from 0 to 29.966667 s in 0.033333–0.033334 s
  increments, with no missing timestamp slot. At 720p, decoded-frame count is
  900 and no two adjacent decoded frames are identical.
- The 720p final file is 9,835,223 bytes; 1080p is 18,709,186 bytes. Both are
  silent and `yuvj420p` full-range 4:2:0. Audio and broad platform-upload
  compatibility are outside this experiment.
- Visual inspection at 5 s confirmed visible score, keyboard, falling notes,
  and glow. Ten-fps sampled SSIM was 0.9686 against the earlier WebM and 0.9748
  against the existing MP4; codec differences and possibly scene-timing/capture
  differences prevent claiming pixel-perfect preview parity. A full automated
  frame-by-frame parity check remains open.
- Setting `SCOREVIDEO_CANCEL_AT=100` aborted the run: no result blob or progress
  marker remained; `Output.cancel()` and composer cleanup completed. It did not
  produce a partial MP4.

## Cache analysis, without changing appearance

The score compositor caches the serialized/decoded SVG image in a `WeakMap`
keyed by SVG element when `drawScore` animation is off. The measurement confirms
only one decode for this 900-frame sequence, so **SVG regeneration is not the
main bottleneck here**. The cached image is still positioned and drawn every
frame; score-panel fill, clipping, cursor, and DOM geometry are also recomputed.
If `drawScore` is enabled, the current compositor intentionally re-rasterizes
the live SVG each frame and needs a separate benchmark before any optimization.

| Reuse class | Current elements | Safe optimization candidate |
| --- | --- | --- |
| Static per settings/layout | Background photo bitmap, base keyboard, score engraving, score CSS | Cache once until source image, design, viewport, or layout changes |
| Event/position dependent | Score cursor, active key state, note-impact glow, score scroll/camera transform | Update on note or camera/score movement; reuse base layers |
| Per-frame | Falling-note positions, glow decay, animated atmosphere, camera interpolation | Keep time-driven; reduce full-canvas copying/overdraw only after visual parity tests |

The compositor's `drawLiveCanvases` currently searches/sorts canvases, reads
computed styles and bounding rectangles, and draws entire piano/effects
canvases each frame. That is a more plausible cost source than SVG decoding.

## Prioritized experiments, not implemented

1. **Piano layer split/cache.** The piano copy costs 13.6 s in both detailed
   runs (~15.1 ms/frame). Cache static keys at export resolution and composite
   only active-key/lighting changes; reuse canvas geometry until layout/camera
   changes. A 50% reduction of this measured phase would save **at most ~6.8 s**
   at 720p before new overhead, not a forecast. Risk: keyboard and falling-note
   alignment under moving camera. Difficulty: medium–high.
2. **Encoder handoff and backpressure alternatives.** `CanvasSource.add()` plus
   wait is 8.54 s at 720p and 17.25 s at 1080p. Compare a direct `VideoFrame` /
   `VideoSampleSource` path and supported hardware settings without dropping
   frames; maintain frame-index timestamps. A 25–50% phase reduction would
   correspond to **~2.1–4.3 s** at 720p, highly uncertain because the wait may
   include deferred GPU composition. Risk: codec/color/glow appearance and
   queue memory. Difficulty: medium.
3. **Effects-layer overdraw reduction.** Falling/glow/titles composition costs
   7.44–7.47 s (~8.3 ms/frame). Cache canvas list/geometry and separate static
   from changing effects; test dirty regions or a same-resolution GPU path.
   Halving this phase would save **at most ~3.7 s** before overhead, but glow
   gradients and camera movement may force wider redraws. Difficulty: high;
   visual parity risk is high.

These are bounded illustrations from measured phase totals, not promised
end-to-end gains. A no-encoder repeat and an encoder-inclusive repeat are both
needed after each change because GPU scheduling shifts time between phases.
