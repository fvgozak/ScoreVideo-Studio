# Offline MP4 piano composition: first optimization

Experiment only. The editor export UI, existing WebM recorder, existing precision
MP4 renderer, score rendering, falling-note logic, and light appearance settings
were not changed. The only output-affecting change is an optional interception of
the **piano** Canvas's white impact-light rectangle while the offline prototype
runs. Tested on the existing “blue sky” project, first 30 seconds, M1 Max MacBook
Pro 32 GB, headless Chromium 158.0.8127.18. M1 Air 16 GB was not measured.

## Cause and chosen change

- `PianoFall.draw(t)` clears and redraws its full-stage Canvas every frame:
  shade, falling bars, all 88 keys, active-key fill, and impact lights. Its JS
  call took only ~0.12 ms/frame in the baseline. The compositor then invokes
  **one** `drawImage()` for the entire piano Canvas each frame. At 720p both
  source and target are exactly 1280×720, destination `(0,0,1280,720)`; at
  1080p both are 1920×1080. No resize or geometric resampling was observed.
- The `drawImage()` wall time was ~15.1 ms/frame at 720p and ~33.1 ms/frame at
  1080p. It includes synchronization with pending Canvas/GPU rendering; it is
  not solely memory-copy time. Freezing the already-drawn source reduced it
  to ~0.2 ms/frame in a 1-second **diagnostic-only** run. Redrawing the base
  keyboard with no notes cost ~1.5 ms/frame. Disabling only the light's shadow
  blur reduced it to ~2.4 ms/frame, identifying that blur as the main cause.
- The adopted path keeps the same light, color, alpha, blur, sparkles, key fill,
  and fall logic. It draws the existing white impact-light shadow into a small,
  local `OffscreenCanvas`, aligned to the exact subpixel position, then composites
  that sprite onto the original piano Canvas. A 64-entry LRU cache uses color,
  blur, size, subpixel offset, and alpha as its key; changes in these values
  naturally produce a new sprite. The cache is cleared after each run or cancel.
  The full piano Canvas is still copied once per frame. No static keyboard
  cache was added because base-key rendering was not the measured bottleneck.

The diagnostic alternatives (3-argument `drawImage`, cropped regions,
`ImageBitmap`, OffscreenCanvas as the entire source, software-oriented 2D
context) showed no reliable gain in 1-second samples and were **not adopted**.
They mostly moved the same synchronization wait to a different call.

## Measured outputs

| Item | Earlier baseline | Optimized | Improvement |
| --- | ---: | ---: | ---: |
| 720p / 30 fps total | 31.44 s | 21.17 s (3-run mean) | 32.7% |
| 1080p / 30 fps total | 64.85 s | 40.95 s | 36.9% |
| 720p piano composition | 13.58 s | 2.86 s (3-run mean) | 78.9% |
| 720p / 60 fps total | not measured | 42.13 s, 1,800 frames | — |

Same-instrument 720p / 30 fps repeats:

| Path | Total seconds, three runs | Piano total seconds, three runs | Piano avg/p95 per frame |
| --- | --- | --- | --- |
| Baseline | 31.60, 30.94, 31.49 (mean **31.34**) | 13.732, 13.426, 13.660 (mean **13.61**) | mean ~15.12 ms; p95 ~21.9 ms |
| Optimized, 64-entry cache | 21.20, 20.95, 21.36 (mean **21.17**) | 2.860, 2.849, 2.873 (mean **2.86**) | mean ~3.18 ms; p95 3.9 ms |

The same-instrument total-time gain is 32.5%; piano-time gain is 79.0%.
Encoder add/wait stayed effectively unchanged (baseline mean 8.52 s; optimized
mean 8.49 s). Rendering the small sprites moved JS scene work from ~0.9 s to
~1.5 s, but removed ~10.7 s of piano-composition wait. At 1080p, the same-run
baseline/optimized comparison was 65.13/40.95 s total and 29.86/5.46 s in
the piano phase. A second/third 1080p repeat was not performed.

At 720p / 60 fps, 30 seconds took 42.13 s. Piano composition was 5.72 s
(3.18 ms/frame, p95 4.0 ms), encoder add/wait 16.87 s, and output was
10,186,585 bytes. This is offline throughput, not real-time capture FPS.

## Output and visual checks

- `ffprobe` found exactly 900 frames in both optimized 30-fps MP4s and 1,800
  frames in the 60-fps MP4. PTS increments were 0.033333–0.033334 s or
  0.016666–0.016667 s, respectively; none were missing. Decoding found no
  adjacent identical frames in any of these three outputs.
- Whole-video baseline/optimized SSIM was **0.998383** at 720p and **0.999487**
  at 1080p. Representative 15-second frames were visually indistinguishable
  on inspection; glow, note bars, key borders, score, and color remained visible.
- Raw, pre-encoding Canvas comparisons in one browser: no active notes was
  pixel-identical; ~1 s, ~17.4 s rapid notes, ~25.1 s chord, ~29.97 s ending,
  and ~5.97 s portrait camera had maximum channel differences of only 1–2/255.
  Thus the optimized glow is **not bit-identical**, despite the tiny measured
  difference. Full-frame all-timestamp pixel parity was not measured.
- The portrait sample exercises the changing piano camera. The 60-fps file has
  the same 30-second duration and frame-index timing; 60→30-fps video SSIM was
  0.994928, partly affected by different per-frame compression. It does not
  establish bitwise animation identity across FPS settings.
- Cancel at frame 100 produced no partial result blob and cleared the progress
  marker. The experiment restores the original drawing methods and clears its
  sprite cache in `finally`.

## Memory and limits

The 64-entry sprite cache's estimated retained RGBA pixels peaked at 11.84 MB
(720p/30), 12.45 MB (1080p/30), and 15.52 MB (720p/60). These are allocations
estimated from Canvas dimensions, not measured GPU resident memory. Chromium's
`performance.memory.usedJSHeapSize` was coarse/unchanged during the run, so it
cannot establish total browser RSS or rule out a GPU-memory leak. The 30-second
prototype still uses a memory-backed MP4 output and has no audio; neither issue
was changed in this optimization. Browser/driver and light settings other than
the tested project need separate verification before considering integration.

The next largest measured phase is `CanvasSource.add()`/encoder wait at ~8.5 s
for 720p and ~17.1 s for 1080p; falling/glow/other effects composition follows
at ~7.4 s / ~15.9 s. Neither was optimized in this task.
