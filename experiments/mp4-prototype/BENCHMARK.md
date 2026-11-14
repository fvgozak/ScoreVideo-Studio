# 30-second MP4 conversion benchmark (2026-11-13)

Environment: MacBook Pro (M1 Max, 32 GB), Playwright Chromium headless shell 158.0.8127.18, Mediabunny 1.65.2. This is **not** an M1 MacBook Air measurement. All conversion work ran in the browser; no video file was uploaded to the server. The 1920×1080 input was stream-copied from the first 30 seconds of a 60-second WebM; the other two are existing 30-second ScoreVideo recordings.

| Input | Browser conversion wall time | WebM → MP4 size | Video frames WebM → MP4 | SSIM (10 fps sampled) |
| --- | ---: | ---: | ---: | ---: |
| 1280×720 | 1.25 s | 9.12 → 4.76 MB | 408 → 375 | 0.9851 |
| 1920×1080 | 1.39 s | 9.19 → 5.76 MB | 211 → 211 | 0.9886 |
| 1080×1920 | 1.75 s | 11.76 → 4.81 MB | 200 → 169 | 0.9715 |

Output streams: H.264 and AAC. FFprobe identifies the video pixel format as `yuvj420p` (full-range 4:2:0), not `yuv420p`. Audio attack offsets relative to the original project audio matched the WebM source at 1, 5, 15, and 28 seconds after subtracting the detected input audio start offset (32–38 ms) in the conversion. Without that correction, AAC output shifted approximately 32 ms. The 720p representative frame retained staff lines and key edges, with slightly softer glow/background than the source.

The source recordings were already below 30 encoded fps; conversion dropped another 33 frames at 720p and 31 frames at 1080×1920. This is a reason **not to integrate this path yet**. SSIM is a sampled objective comparison, not proof of exact timestamp preservation or SNS acceptance. Browser memory, CPU/GPU utilization, other browsers, and actual platform upload acceptance were not measured.

Chromium reported MP4 MediaRecorder support; a separate 3-second synthetic canvas+audio test produced a playable 1280×720, 90-frame H.264/AAC MP4. It did not use ScoreStage, so direct MP4 recording still needs a real 30-second scene test. The existing WebM and precision MP4 engines were not changed.
