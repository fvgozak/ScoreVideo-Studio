# MP4 conversion experiment

This is an isolated 30-second browser benchmark, not wired into ScoreVideo export.
Run `npm install` and `npm run serve` in this directory, open `http://127.0.0.1:8767`, and select a 30-second ScoreVideo WebM. The source file stays in the browser. The output is H.264/AAC MP4 when this browser can encode both codecs. Use the cancel button to stop a conversion. Long files use a memory-backed output and are intentionally outside this prototype's scope.

## Separate offline ScoreStage → MP4 experiment

The independent offline experiment is in `offline.js`, with its Playwright
measurement harness in `run_offline.py`. It does not change the application export UI
or either existing export engine. It reuses the existing ScoreStage time calculation
and WebM canvas compositor, then passes exactly 900 sequential frames to Mediabunny
`CanvasSource` for a 30-second, 30-fps MP4. See `OFFLINE_BENCHMARK.md` for the measured
results and limitations.

`offline-audio.js` optionally combines the project's original audio as AAC
without real-time playback. `SCOREVIDEO_AUDIO_MODE=source` (default for `full`)
selects it; `SCOREVIDEO_AUDIO_MODE=none` keeps a silent MP4.
`SCOREVIDEO_FULL_SONG=1` renders the project's entire audio duration and uses
OPFS temporary storage by default. `SCOREVIDEO_STORAGE=opfs` selects that path
for shorter runs. Audio and full-song measurements, sync checks, and limitations
are in `AUDIO_VALIDATION.md`.
The follow-up decoder/PTS/note-attack breakdown is in `AV_SYNC_PRECISION.md`.
The subsequent dynamic score-note glow repair and its measurements are in
`SCORE_GLOW_VALIDATION.md`. The experiment enables it by default;
`SCOREVIDEO_SCORE_GLOW=0` selects the previous static-score baseline.

With the ScoreVideo server running at `http://127.0.0.1:8766`, a project already
loaded on that server, and this directory's npm dependencies installed:

```sh
.venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID simple 1280x720
.venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID compose 1280x720
.venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID full 1280x720
.venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID full 1920x1080
SCOREVIDEO_CANCEL_AT=100 .venv/bin/python experiments/mp4-prototype/run_offline.py PROJECT_ID full 1280x720
```

The `simple` and `full` modes write a temporary MP4 under `/tmp`; `compose` only
measures the existing stage-to-canvas path. `measure_legacy.py` measures the existing
JPEG + FFmpeg frame path separately, without changing its implementation.

## Piano composition optimization experiment

Use `SCOREVIDEO_PIANO_MODE=shadow-sprite` with `run_offline.py` to enable the
experiment-only piano-light shadow optimization. Omit it for the unchanged
baseline. `SCOREVIDEO_FPS=60` tests 60 fps independently of the editor's FPS
choices; `SCOREVIDEO_RUN_TAG` keeps repeated output files separate.
`SCOREVIDEO_COMPARE=1` compares the final baseline and optimized Canvas pixels
in the same browser. Results and limitations are in `PIANO_OPTIMIZATION.md`.
