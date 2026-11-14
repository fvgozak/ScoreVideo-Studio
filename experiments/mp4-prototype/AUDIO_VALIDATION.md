# Offline MP4 original-audio validation

Experiment only; no export UI, WebM recorder, or legacy FFmpeg renderer integration.
Tested on Apple M1 Max / 32 GB, Playwright headless Chromium, with the existing
`dream-journey` project (`06e86ec0153a4b8c9eac09f53ba403c9`), its uploaded
7,896,211-byte MP3, and the `shadow-sprite` piano path. This is a different and
more complex score from the earlier `blue sky` piano benchmark; its 21.17-second
720p result is **not** a same-project comparison. M1 MacBook Air was not tested.

## Pipeline

The original `/audio` file is fetched locally into the browser and decoded once
with `AudioContext.decodeAudioData()` at 48 kHz. `AudioSampleSource` sends planar
two-second chunks to Mediabunny's AAC encoder, while the unchanged offline
`CanvasSource` generates video at `frameIndex / fps`. Both tracks enter the same
`Mp4OutputFormat`; no real-time audio playback, screenshot, Python frame transfer,
or server conversion is involved. AAC encoding overlaps video processing, so
the phase timings below are **not additive**. Long output uses a temporary OPFS
file and `StreamTarget`; the runner downloads it, then removes the OPFS entry.
`audioMode=none` continues to emit a silent MP4. Requesting source audio on a
project without `audio_filename` raises an explicit error; a simulated missing-
audio project test returned that error with no result or progress marker.

## Actual runs

| Output | Audio | Frames | Wall | Stage + composition | Video add/wait | Audio fetch / decode / AAC encode | Finalize | File |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 720p / 30 fps / 30 s | none | 900 | **39.55 s** | 14.88 s | 24.43 s | — | 0.041 s | 10.53 MB |
| 720p / 30 fps / 30 s | source | 900 | **39.52 s** | 14.52 s | 24.11 s | 0.042 / 0.401 / 2.661 s | 0.042 s | 11.11 MB |
| 720p / 60 fps / 30 s | source | 1,800 | **76.47 s** | 27.93 s | 47.51 s | 0.039 / 0.383 / 2.537 s | 0.042 s | 11.13 MB |
| 1080p / 30 fps / 30 s | source | 900 | **66.39 s** | 27.14 s | 38.30 s | 0.049 / 0.413 / 3.908 s | 0.049 s | 22.44 MB |
| 720p / 30 fps / full 197.3 s | source + OPFS | 5,920 | **256.28 s** | 97.45 s | 156.76 s | 0.044 / 0.398 / 8.509 s | 0.051 s | 71.60 MB |

The same-project 720p/30-fps audio addition changed wall time by −0.03 s,
within single-run noise; this does not prove a speedup. The 60-fps file had
already been produced before this continuation, but its timing log was lost;
one same-settings rerun supplied the 76.47-second measurement. Same-project
silent 60-fps and 1080p runs were **not** performed.

`ffprobe` reports H.264 High (`yuvj420p`) and AAC-LC 48-kHz stereo. Every video
stream begins at 0, has the expected frame count, and has strictly increasing
PTS at 1/30 or 1/60 second; no timestamp duplicates/gaps were found. The
3:17 file has 5,920 frames (197.333333 s) and AAC ending at 197.289333 s.
FFmpeg decoded that entire file without errors. Chromium could seek and finish
both the 30-second and full-length MP4s. At 15 seconds, silent/source-audio
frames looked equivalent on inspection; whole-video SSIM was 0.992058, not
pixel identity. Separate runs may include effect/encoder variability.

## Alignment and ending

Cross-correlation of decoded output AAC against the uploaded MP3 at 3, 15, and
27 seconds (30- and 60-fps files), and 3, 100, and 190 seconds (full song),
found the output audio **11.979 ms earlier** in every window, with correlation
at least 0.9992. No increasing drift was detected. A follow-up PCM probe showed
that Chromium's decode of the source MP3 is itself 11.979 ms earlier than
FFmpeg's decode, while the encoded MP4 AAC is sample-aligned with Chromium's
PCM (0-ms measured lag). Thus the 11.979-ms difference is **not** introduced by
AAC encoding or MP4 muxing. This does not establish that the *source recording*
was perfectly aligned with its MIDI. No WebM-specific 33-ms visual correction
was imported. See `AV_SYNC_PRECISION.md` for the full breakdown.

An exploratory check compared the largest local keyboard-frame change with the
strongest nearby audio-RMS rise for selected MIDI events. At 30 fps, visual
changes led those peaks by 15 ms (2.18 s), 20 ms (100.09 s), and 41.67 ms
(192.23 s); at 60 fps, selected 2.18/14.97/27.07-s events led by 31.67/33.33/
36.67 ms. This **does not meet a strict ±1-frame criterion at every tested
attack**, especially 60 fps. It is a proxy: in polyphonic passages, RMS maxima
can follow the true attack and other falling-note motion can affect frame
differences. The constant −11.979-ms MP3 decoder difference is separate from
any pre-existing MIDI-to-recording performance lag. Further calibrated onset and
visual-event measurement is needed before claiming frame-perfect sync.

For the 30-second cut, AAC ends at 30.036 s, 36 ms after video. Its decoded
post-video RMS is 0.000592 versus 0.142506 in the source's preceding 100 ms
(about 48 dB lower). Chromium reports 30.036 s and reaches `ended`; the
extra tail is effectively quiet but can hold the last frame briefly. For the
full song, the browser-decoded source has 197.248646 s of samples versus
197.302875 s decoded by FFmpeg; AAC ends at 197.289333 s and video at
197.333333 s. Above the 0.0001 RMS threshold, the source's last sound is
195.97 s and output's is 195.94 s. The final reverb is therefore present,
followed by over a second of quiet; no audible ending was cut in this case.

## Storage, cancellation, limits

During the 256-second OPFS run, sampled Chromium renderer RSS was about
508–740 MiB (not a continuous peak measurement). It did not rise monotonically;
`performance.memory` stayed coarse/constant and cannot prove absence of a
leak. The decoded 197-second 48-kHz stereo AudioBuffer alone is about 75.7 MB.
The 64-entry piano sprite cache stayed enabled; its estimated peak RGBA bytes
were 14.86 MB. No full-song MP4 Blob was assembled in JS memory.

At frame 100, cancellation returned `Cancelled`, no result/download, no progress
marker, and no OPFS temp entry. The same held for an early frame-1 cancellation
while AAC encoding could still be active. A separate successful 1-second OPFS
output left zero temp entries after download/release. The full-song runner used
the same release path, but its post-release OPFS directory was not separately
enumerated in that completed run.

Next candidates (not implemented here): calibrate source-MIDI onset offset with
clear isolated notes and direct pixel event detection; use streaming audio
decode to lower long-song memory; and keep OPFS output in production after
adding persistent-job recovery/cleanup policy. Browser/OS compatibility beyond
this Chromium/M1 Max setup remains unverified.
