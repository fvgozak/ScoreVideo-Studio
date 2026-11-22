# ScoreMotion: H.264 encoded-packet backlog protection (packetbacklog1)

## Why this is necessary

In the actual 60fps, 14,110-frame export, at frame 11,641 the instrumentation showed
`videoSamples=11645`, `videoPackets=5820` — **5,825 raw video samples were
submitted but had no encoded packet yet**, even though `encodeInFlight` was
capped at two. `output.finalize()` later took 154 seconds, while actual OPFS
write calls took only 4.39 seconds in total.

`VideoEncodeQueue` limits how many `CanvasSource.add()` promises are outstanding.
Its promise can resolve without all internal WebCodecs output packets being
emitted. Therefore it does **not** bound the real H.264 work queue.

## Changes

- Before calling `stage.seek()` and rendering each next frame, pause if the
  number of `onEncodedSample` callbacks minus `onEncodedPacket` callbacks has
  reached 48 (default). Continue when actual encoded video packets arrive.
- Keep the prior `maxEncodeInFlight=2` queue, MP4 streaming, audio handling,
  rendering, and timestamp formulas unchanged.
- Display `mp4.unencodedFrames`, `mp4.peakUnencodedFrames` and
  `cpuTiming100Ms.encoderPacketWait` while rendering.
- Add `encoderPacketWait` and `encoderBacklogLimit` to final metrics.
- Abort a genuinely stalled hardware encoder after 90 seconds with a useful
  error rather than allowing unbounded accumulation/hanging forever. Normal
  user cancellation interrupts the wait immediately.
- Avoid cached earlier versions of the static module and diagnostic import.

**This protects memory and reduces the end-of-export flush backlog. It does
not promise faster hardware encoding.** Total wall time may be similar or
higher; compare actual results on your Mac. The browser-only deployment has
not been tested end-to-end with long hardware H.264 exports in this environment.

## Install (after MP4_IO_Diagnostics patch)

From the existing `scorevideo-studio-piano` folder:

```sh
unzip -o ~/Downloads/ScoreMotion_Encoder_Backlog_Fix.zip
node tests/test_encoder_packet_backpressure.mjs
node tests/test_mp4_diagnostics.mjs
node tests/test_video_encode_queue.mjs
node tests/test_mp4_final_phase.mjs
sh scripts/deploy_pages_browser_only.sh
```

Close the old browser tab. Open the newly deployed version in a fresh Chrome tab.
It must show `packetbacklog1` for `/static/offline-export.js` (see script src
in Chrome DevTools). Keep the same video size/FPS and settings as before.

## Progress check

```js
const p=window.__offlineProgress;
console.log({
  progress:`${p?.completed}/${p?.frameCount}`,
  backlog:p?.mp4?.unencodedFrames,
  peakBacklog:p?.mp4?.peakUnencodedFrames,
  limit:p?.encoderBacklogLimit,
  packetWaitMs:p?.cpuTiming100Ms?.encoderPacketWait,
  encodeMs:p?.cpuTiming100Ms?.encode,
  packets:p?.mp4?.videoPackets,
  samples:p?.mp4?.videoSamples
});
```

During normal rendering, the packet backlog should stay approximately at or
below 48 (may go slightly higher while a small number of asynchronous
`CanvasSource.add` callbacks are still in flight). Previously it grew to more
than 5,000. Increasing `packetWaitMs` is **expected** — it means the new limit
is applying real backpressure instead of allowing unbounded queued frames.

After a successful export:

```js
const m=window.__offlineLastMetrics;
console.table({
  wallSec:m?.wallSec,
  finalizeSec:m?.finalizeMs/1000,
  packets:m?.mp4Diagnostics?.videoPackets,
  samples:m?.mp4Diagnostics?.videoSamples,
  peakBacklog:m?.mp4Diagnostics?.peakUnencodedFrames,
  encoderWaitSec:m?.encoderPacketWait?.totalMs/1000,
  opfsWriteSec:m?.mp4Diagnostics?.opfsWriteMs/1000
});
```

### A/B switch

Prior to a new export only, set:

```js
window.__scoreMotionMaxEncoderBacklogOverride = 96; // try 96 vs 48
```

To disable the new encoded packet gate for a regression comparison:

```js
window.__scoreMotionMaxEncoderBacklogOverride = 0;  // old behavior; not recommended on long exports
```

Restore the safer default with:

```js
delete window.__scoreMotionMaxEncoderBacklogOverride;
```

Do not change this during an export. Do not assume `videoPackets` is the same as
`completed` at each moment; the gate specifically monitors their lag.
