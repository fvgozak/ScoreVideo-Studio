# ScoreMotion WebCodecs: stalled finalization & progressive slowdown diagnostic patch

This is an incremental patch on top of the BrowserOnly_ReadyToDeploy package and the previous bounded encoder queue (not a change to MusicXML, effects or MIDI).

## What changes

1. Keeps the two-frame bounded encoder queue (maxEncodeInFlight=2). Depth 1 is expected to be slower because it prevents composition from overlapping with encoding.
2. Attempts hardware-accelerated H.264 in Chrome **only if `VideoEncoder.isConfigSupported` supports the hint**, otherwise uses the existing `no-preference` setting. You can disable this preference temporarily before export with `window.__scoreMotionHardwareAccelerationOverride='no-preference'`.
3. Tracks post-render stages: `preparing`, `rendering`, `draining-video`, `draining-audio`, `finalizing-mp4`, `reading-file`, `completed`/`failed`. UI shows their status and elapsed time rather than freezing at the last 20-frame progress tick.
4. Adds cancel-aware finalize stage monitoring with a three-minute timeout. On failures/cancellation, encoder and OPFS cleanup attempts are time-bounded to avoid an indefinitely stuck UI. **If a timeout fires, the incomplete MP4 is discarded**; do not assume it is a valid file.
5. Exposes `window.__offlineLastProgress` after completion/failure to debug which stage stopped. Return metrics now include `encoderAcceleration` and `finalStagesMs` (stage start offsets).

## Install & verify

From the existing `scorevideo-studio-piano` project directory:

```
unzip -o ~/Downloads/ScoreMotion_MP4_Stall_Diagnostics_Patch.zip
node tests/test_video_encode_queue.mjs
node tests/test_mp4_final_phase.mjs
sh scripts/deploy_pages_browser_only.sh
```

**Do not use `wrangler pages deploy dist` without rebuilding `dist`;** the above script rebuilds and deploys. Refresh the page with a fresh tab (the previous Console override to one-frame depth will otherwise persist).

## Live troubleshooting

While exporting:

```
window.__offlineProgress && ({
  phase: window.__offlineProgress.phase,
  completed: window.__offlineProgress.completed,
  frameCount: window.__offlineProgress.frameCount,
  encoder: window.__offlineEncoderAcceleration,
  timing: window.__offlineProgress.cpuTiming100Ms,
  backpressure: window.__offlineProgress.cpuTiming100Ms?.encodeBackpressure,
  phaseElapsedSec: Math.round((performance.now() - window.__offlineProgress.phaseStartedMs) / 1000)
})
```

After export/failure: `window.__offlineLastProgress` (if the Chrome tab crashes, JavaScript state is lost).

## Limitations

This patch **does not prove or guarantee** that the progressive slowdown is fixed. It adds an explicit hardware acceleration preference and pinpoints the stage that stalls. The included tests verify queue behavior and state transitions with a mock encoder; this environment cannot run the user's macOS Chrome H.264/AAC long-form integration workload. The UI remains at 99% until muxer and file completion succeeds. Any browser tab crash (Chrome Aw Snap Error 5) could still occur from native encoder/GPU resource exhaustion.
