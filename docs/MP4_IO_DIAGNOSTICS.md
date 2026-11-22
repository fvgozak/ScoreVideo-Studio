# ScoreMotion — MP4 encoder / OPFS I/O diagnostic patch

Scope: only the browser WebCodecs MP4 output path. MusicXML, MIDI timing, PixiJS, Three.js and audio synchronization formulas are not changed. Works with the BrowserOnly and MP4-phase patches already installed.

## Why

Previously `encode` measured the elapsed time to resolve `CanvasSource.add()`. It is *not* an H.264-only measurement. The Mediabunny `StreamTarget` propagates OPFS backpressure to the encoder; the apparent encode latency can therefore rise even when H.264 itself is fast.

This patch preserves the existing two-frame queue and file-writing behavior. It instruments the output without storing media buffers in the diagnostic tracker.

## Apply

From the `scorevideo-studio-piano` project folder:

```bash
unzip -o ~/Downloads/ScoreMotion_MP4_IO_Diagnostics_Patch.zip
node tests/test_mp4_diagnostics.mjs
node tests/test_video_encode_queue.mjs
node tests/test_mp4_final_phase.mjs
sh scripts/deploy_pages_browser_only.sh
```

The deploy script builds `dist/` from `static/` before uploading and leaves the FastAPI Pages proxy disabled. Open a **new tab** after deployment. Check that `/static/offline/mp4-diagnostics.js` returns JavaScript.

## During ordinary MP4 export

At 10%, 50%, 90% in Chrome Console:

```js
const p=window.__offlineProgress;
console.log({phase:p?.phase,progress:p?.completed,total:p?.frameCount,
  timing:p?.cpuTiming100Ms,mp4:window.__scoreMotionMp4Diagnostics?.()});
```

After **successful** export:

```js
const m=window.__offlineLastMetrics;
console.table({
  wallSec:m?.wallSec,videoDrainMs:m?.videoDrainMs,finalizeMs:m?.finalizeMs,
  readFileMs:m?.readFileMs,opfsWriteMs:m?.mp4Diagnostics?.opfsWriteMs,
  opfsCloseMs:m?.mp4Diagnostics?.opfsCloseMs,
  videoPackets:m?.mp4Diagnostics?.videoPackets,
  encoderPacketDelayMs100:m?.mp4Diagnostics?.encoderPacketDelayMs100
});
```

### Metrics and their meaning

* `encoderPacketDelayMs100`: average delay from `onEncodedSample` to matching `onEncodedPacket`, **last 100 matched packets only**. It is not a pure hardware encoder benchmark; if the callback does not expose correlatable timestamps it may be `null`.
* `videoPackets`, `videoPacketMiB`: emitted H.264 packets and their encoded sizes.
* `opfsWriteMs`: total time spent awaiting actual OPFS `FileSystemWritableFileStream.write()` calls; this is a serial accumulated time, not an independent throughput measurement.
* `opfsAvgWriteMs`, `opfsRecentWriteMs` (last 16 writes), `opfsMaxWriteMs`, `opfsWriteCount`, `opfsWrittenMiB`: OPFS writer behavior.
* `opfsCloseMs`: time to close/commit the OPFS stream (normally during `output.finalize()`).
* `videoDrainMs`: time to wait for remaining queued `CanvasSource.add()` calls.
* `finalizeMs`: total time inside `output.finalize()`; **may overlap the writer's `opfsCloseMs`**.
* `readFileMs`: final OPFS `getFile()` time. Distinguish from browser's later download prompt.
* `canvasSubmitSyncMs`: synchronous portion of calling `CanvasSource.add()`, not the full GPU readback time.

These measurements are not necessarily additive; notably `encode` can include file I/O waiting.

## 30-second isolation test (no audio)

Run this only when no video export is active and no completed export download link needs to remain valid. The output resolution follows the current ScoreMotion stage settings. The first run **does not produce a file**.

```js
await window.ScoreOfflineExport.probe(); // ensures the offline module is loaded
const api=window.ScoreOfflinePrototype;
async function measure(storage){
  const r=await api.run('full',{fps:30,seconds:30,audioMode:'none',
    storage,maxEncodeInFlight:2});
  const row={storage,width:r.width,height:r.height,wallSec:r.wallSec,
    encodeMs:r.encode.avgMs,backpressureMs:r.encodeBackpressure.avgMs,
    packetDelayMs:r.mp4Diagnostics.encoderPacketDelayMs100,
    videoPackets:r.mp4Diagnostics.videoPackets,
    opfsWriteMs:r.mp4Diagnostics.opfsWriteMs,
    finalizeMs:r.finalizeMs,opfsCloseMs:r.mp4Diagnostics.opfsCloseMs};
  await api.release();
  return row;
}
const noStorage=await measure('discard'); // H.264 still encodes, output is thrown away
const opfs=await measure('opfs');
console.table([noStorage,opfs]);
```

If both slow down similarly: focus on H.264, frame capture and browser GPU resource pressure. If `opfs` slows markedly while `discard` does not: focus on storage/muxer. If the standard production export is much slower than the video-only OPFS probe: investigate AAC and audio/video interleaving. Use same resolution, FPS, duration and the same stage settings; do not use this shortened excerpt to claim a 4-minute problem is fixed.

### Optional OPFS chunk-size comparison

No change to the default 4 MiB behavior. **Only before a new export**, set:

```js
window.__scoreMotionOpfsChunkMiBOverride=16; // allowed: 2, 4, 8, 16, 32
```

Repeat the same test and compare `wallSec`, `opfsWriteMs`, `opfsCloseMs`, peak memory and Chrome stability. Larger chunks can use more RAM. Reset with `delete window.__scoreMotionOpfsChunkMiBOverride`.

## What this patch does NOT assert

It does not prove that progressive slowdown is fixed, nor does it automatically select a faster encoder or change the output's compression level. A real Chrome 1080p/4-minute H.264+AAC export is still required to validate speed, lip-sync, the resulting MP4, and tab stability. The in-container Chromium environment blocks navigation, so H.264 integration playback testing was not possible here. Target this first measurement before larger pipeline refactors.
