# PixiJS FX Lab (opt-in, standalone)

This is a **real runnable A/B renderer experiment**, not yet an integrated production renderer. It uses 1,557 attacks extracted from `examples/dream-journey/dream-journey.mid`, resampled as deterministic visual effects. Do not claim speed or visual equivalence to the ScoreVideo application without further integration and verification.

## Run on macOS

1. From the **ScoreVideo-Studio-main** root, start `SCOREVIDEO_PORT=8766 ./run.command` (or use an already-running server and replace the port). Existing Python dependencies and FFmpeg setup follow the main project's run instructions.
2. In browser open `http://127.0.0.1:8766/static/experiments/pixi-fx/index.html`.
3. Use **Canvas2D** as baseline; switch to **PixiJS GPU**. Compare the same resolution, note density, and effect flags. The button measures 180 deterministic frames (seek from 104 s (a relatively dense passage) in the example). Each run reports CPU-side render-submission duration and wall clock, not GPU completion time.
4. Start with `1280x720, 3× notes, 30fps, glow+particles`, then test `1920x1080` and `6×`.

### Important restrictions

- This first test uses PixiJS textured glow sprites and additive blending; **KawaseBlurFilter and the production note pipeline are not yet integrated**.
- PixiJS `8.23.0` is loaded lazily from the locally vendored `static/vendor/pixi-8.23.0.min.mjs`. The unmodified ScoreVideo editor does not load this experiment.
- This is a **visual approximation**, not OSMD rendering, not the actual ScoreVideo score/piano preview, and not export. No user project files, API routes, UI controls or MP4 paths are changed.
- CPU-side `app.render()` duration does **not** include all asynchronous GPU work or compositing; evaluate actual screen smoothness as well.
- Two approaches have different glow algorithms. They are a *performance-and-quality feasibility study*, not pixel-identical A/B tests.
- The generator `generate_notes.py` can be rerun to update the bundled JSON; Python `mido` is part of the main project dependencies.
- PixiJS is available under the MIT License: https://github.com/pixijs/pixijs/blob/dev/LICENSE

### Next step if promising

If the GPU renderer has better real preview stability and acceptable glow quality, move from the synthetic scene to the actual `LayerRenderer` `noteTriggers` pipeline in a separately reviewed opt-in branch. Maintain the legacy Canvas effects for MP4 until both offline export paths are verified. Avoid GPU-to-CPU readback every frame.
