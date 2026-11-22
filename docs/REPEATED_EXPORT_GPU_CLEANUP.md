# ScoreMotion repeated-export GPU cleanup experiment

## What this patch changes

- Tracks export compositor sprites in an iterable `Map`. Before, `removeChildren()` detached sprites each frame, while `GPUComposer.close()` only disposed a subset of raster cache sprites and relied on recursive destruction of *currently attached* children.
- Tracks textures whose sources are **owned by the temporary export compositor** (generated SVG/title/head images, background bitmap, temporary piano canvas mirror). Their texture resources and private mirror canvas pixel stores are released at cleanup.
- Protects the editor preview's canvas textures: sprites referencing **external live canvases** are destroyed without explicitly destroying their shared texture source.
- Calls PixiJS v8 `Application.destroy(true, {children:true, texture:true, textureSource:true, context:true})` for the **temporary export-only WebGL context**.
- Closes the compositor if initialization fails during CSS loading.
- Adds `window.__scoreMotionExportGpuStats` with `created`, `closed`, `active`, and `lastClosed` counters.

This is a targeted cleanup experiment, **not proof** that stale GPU contexts are the sole cause. It is intended to address speed degradation *between sequential exports*. Gradual slowdown **inside a single render** may have an additional Chromium/WebCodecs/thermal cause.

## Install

From the existing ScoreMotion project root after the browser-only and Direct WebCodecs patches:

```bash
unzip -o ~/Downloads/ScoreMotion_Repeat_Export_GPU_Cleanup.zip
node tests/test_gpu_export_cleanup.mjs
python3 scripts/apply_gpu_cleanup_version.py
sh scripts/deploy_pages_browser_only.sh
```

Open a **new Chrome tab** after deployment. Verify the script URL ends in `gpu-composer.js?v=gpucleanup1`:

```javascript
[...document.scripts].find(x=>x.src.includes('/gpu-composer.js'))?.src
```

## Repeated-render A/B

Use the *same* 1080p, 30fps, 16Mbps, discard storage, no audio, same 30 seconds each time. In one tab, run 4 repetitions of a single engine:

```javascript
const results=[];
for(let i=0;i<4;i++){
  const r=await window.ScoreOfflinePrototype.run('full', {
    fps:30,seconds:30,audioMode:'none',storage:'discard',
    videoBitrate:'16',videoEngine:'canvas',maxEncoderBacklog:48
  });
  results.push({run:i+1,wallSec:r.wallSec,
    gpuActive:window.__scoreMotionExportGpuStats?.active,
    gpuClosed:window.__scoreMotionExportGpuStats?.closed,
    gpuDestroyedSprites:window.__scoreMotionExportGpuStats?.lastClosed?.sprites,
    gpuContextCleanup:window.__scoreMotionExportGpuStats?.lastClosed?.success});
}
console.table(results);
```

Repeat from a new tab with `videoEngine: 'direct'` to compare both encoder paths without order bias.

Expected: `gpuActive===0` after each run, and `gpuClosed` increments once per completed run. This proves the teardown path ran, **not** that all browser-native GPU or codec allocations were released. The performance signal is whether run 4 remains near run 1 after warm-up, relative to prepatch 20.25→28.72s (direct) and 22.04→39.78s (canvas).

If times keep growing, prioritize an isolated benchmark with **no GPU compositor** versus the full stage, and an isolated render realm/Worker for the encoding session. Do not guess by increasing the encoder backlog or by resetting the entire user's editing session.

## Compatibility and rollback

- Only touches `static/gpu-composer.js` and its cache-busting query in `static/index.html`.
- Does not change the MP4 muxer, encoder configuration, video bitrate, timestamps, audio synchronization, or stage settings.
- Unit tests run with mock PixiJS objects. Full Chromium H.264 tests must be performed on the user's Mac.
- To revert, restore the previous `static/gpu-composer.js` from Git or a backup, and bump the query version before deploying.
