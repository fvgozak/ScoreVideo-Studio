# Preview keyboard shadow-sprite validation

Scope: shared keyboard-impact shadow cache for the editor preview, WebCodecs MP4, and the existing FFmpeg render page. Tests used the actual local `:8765` uvicorn app launched by `run.command`, headless Chromium on macOS, and the Dream Journey project. No preview frame limiter or other visual effects were changed.

## Implementation and low-hit diagnosis

The old offline-only `fillRect` monkeypatch keyed sprites by exact blur, rectangle dimensions, fractional position, and alpha. In the dense passage it generated 1,526 tiles and had only 3 hits: almost every changing energy or subpixel position produced a new key. Merely increasing its LRU size did not help (19 hits with a 512-entry limit).

The shared `ShadowSpriteCache` keeps color and composite mode in the key, normalizes blur to 2-pixel and rectangle dimensions to half-pixel steps, and applies the exact position and alpha when compositing. In the same 180-frame passage it recorded 1,412 hits and 117 creations (92.3% hit rate). The cache is instance-local: preview and WebCodecs export never share tiles. It is limited to 64 entries and 48 MiB, cleared on canvas resize, relevant settings/palette changes, project disposal, and export completion. Minimal mode bypasses the glow call entirely. The FFmpeg page loads the same shared module. No Canvas method or piano draw function is monkeypatched for the optimization.

## Performance (same passage, 105–111 s; 75 attacks)

| Measurement | Cache OFF | Cache ON |
| --- | ---: | ---: |
| Preview update calls / second, two 5 s runs | 11.43–11.78 | 21.56–21.96 |
| Preview `stage.seek` CPU p95 / p99 | 1.8 / 1.8–2.2 ms | 2.1–2.3 / 2.5–2.6 ms |
| Keyboard draw CPU p95 / p99 | 0.3 / 0.3 ms | 0.8 / 1.0–1.2 ms |
| Update gaps over 100 ms in each 5 s run | 30–34 | 0 |
| 720p, 30fps, 180-frame Canvas composition | 14.03 s | 9.62 s |
| Keyboard composition portion | 5.16 s | 1.00 s |
| 720p, 30fps, 180-frame silent MP4 | 14.08 s | 10.09 s |

The cache adds a small amount of synchronous JavaScript work. Its benefit is the much shorter Canvas/GPU flush when the keyboard image is composited or presented. The preview FPS figure is **`stage.seek` calls per wall-clock second**, not a measured compositor-presented frame rate. The 67 ms condition in `static/app.js` only throttles updates while the rendering UI is active: normal editing preview satisfies `!renderUiActive` and is not capped by that condition. The 20–22 update/s result must not be described as verified display FPS.

## Memory and fidelity

An actual 180-second audio playback sampled the cache and JS heap every 30 seconds. Cache occupancy at 30/60/90/120/150/180 seconds was 13.93/10.66/11.79/9.67/11.23/10.34 MB; peak was 16.39 MB (15.63 MiB), below the 48 MiB limit. `performance.memory.usedJSHeapSize` reported 47.4 MB at each sample; that API is coarse and does not measure native Canvas surfaces. A separate RSS run followed the same playback and sampled five Chromium descendants through 151 seconds: total RSS was 641 MiB at start, peaked at 957 MiB at 30 seconds, then measured 865/773/801/775 MiB at 60/90/120/151 seconds. Renderer RSS followed the same rise-and-fall pattern. Summed RSS can double-count shared pages. RSS was not sampled at precisely 180 seconds. Neither series showed sustained growth after warm-up; this does not prove absence of all leaks on other projects or browsers.

Preview and offline cache-ON/OFF screenshots looked alike at the inspected dense frame. Pixel comparison is not exact: the final 720p composite differed by mean 0.00535 channel units on a 0–255 scale, with a maximum local difference of 57 at shadow edges. This is attributable to blur/geometry quantization and subpixel compositing; no missing keys or altered MIDI timing were observed. Broader hardware/visible-window perceptual QA remains open.

## Regression

- Actual-app WebCodecs 720p/30fps normal export: 10.00 s, 300 H.264 frames plus AAC, auto-download, 5.50 s elapsed. Minimal export: same stream properties, 1.46 s elapsed.
- Actual-app FFmpeg 720p/30fps normal export: 10.00 s, 300 H.264 frames plus AAC, auto-download, 10.78 s elapsed. Minimal export: same stream properties, 8.51 s elapsed.
- Minimal ON/OFF settings restoration, absent glow/particles, and color-only note/key state passed the browser regression.
- All 17 Node test files passed; Python suite: 85 passed, 1 skipped, 8 subtests passed.

These short MP4 tests used Small Morning, not the dense Dream Journey passage. The dense-passage MP4 comparison above is silent and 6 seconds long; it isolates the shadow cache but is not an audio-sync test. Existing full-song MP4 validations were not repeated.

## Remaining bottlenecks and limits

In the dense 720p 180-frame composition, score drawing remained about 4.9 seconds and other effects about 2.9 seconds with the cache enabled. These are now larger than the approximately 1.0-second keyboard portion. The CPU-side keyboard draw p95/p99 increased even while preview update rate improved; do not infer a CPU improvement from the FPS figures. Visible Chrome/Safari display FPS, 3-minute RSS at the exact endpoint, and other hardware were not measured. The preview FPS limiter, additional glow-cache work, and new rendering engines remain separate tasks.
