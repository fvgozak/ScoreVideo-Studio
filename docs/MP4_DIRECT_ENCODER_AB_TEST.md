# ScoreMotion | Direct VideoEncoder A/B Patch

이 패치는 **실험용**입니다. 기본 `Mediabunny CanvasSource` MP4 출력 경로는 유지합니다.

## 변경사항
- `static/offline/direct-video-encoder.js`: Canvas -> VideoFrame -> WebCodecs VideoEncoder -> Mediabunny EncodedVideoPacketSource.
- 매 프레임 `VideoFrame.close()`를 반드시 실행합니다.
- 기본 인코더 백로그 48프레임과 인코딩 완료/MP4 파일 마무리 측정은 보존합니다.
- `draining-encoder` 단계에서 `VideoEncoder.flush()` 및 패킷 쓰기 큐의 완료를 기다립니다.
- H.264 패킷 출력 순서 유지, 약 2초 간격 키프레임, 원본 프레임 타임스탬프 기반 오디오 싱크.
- 출력 UI에서 **기본(안정)** / **직접 WebCodecs(실험)** 선택 가능.
- 진행률 UI 업데이트 주기를 250ms에서 1,000ms로 줄여 DOM 갱신 부하를 줄입니다.
- H.264 비트레이트를 명시적으로 설정한 경우 두 엔진 모두 같은 *목표 비트레이트*를 받습니다. 실제 코덱 프로파일·화질은 브라우저 구현에 따라 다를 수 있습니다.

## 적용
프로젝트 폴더에서:

```bash
unzip -o ~/Downloads/ScoreMotion_Direct_WebCodecs_AB_Patch.zip
node tests/test_direct_video_encoder.mjs
node tests/test_video_encode_queue.mjs
node tests/test_encoder_packet_backpressure.mjs
node tests/test_mp4_final_phase.mjs
node tests/test_mp4_diagnostics.mjs
sh scripts/deploy_pages_browser_only.sh
```

## A/B 테스트 방법
1. **새 탭**에서 시작합니다(기존 console monkey patch 제거).
2. 동일한 MusicXML/MIDI/Audio를 로드하고, `1080p / 30 fps / 16 Mbps` 설정을 사용합니다.
3. **기본** 엔진으로 30초 구간 테스트 후, 페이지를 다시 로드하고 **직접 WebCodecs** 엔진으로 동일 구간 테스트합니다.
4. 짧은 시험은 Console에서 다음과 같이 실행할 수 있습니다. UI 전체곡 출력보다 먼저 이 시험을 권장합니다.

```js
const r = await window.ScoreOfflinePrototype.run('full', {
  fps:30, seconds:30, fullSong:false, audioMode:'none', storage:'discard',
  videoBitrate:'16', videoEngine:'direct', maxEncoderBacklog:48
});
console.table({engine:r.videoEngine, wallSec:r.wallSec, finalizeMs:r.finalizeMs,
  encoderPacketWaitMs:r.encoderPacketWait.avgMs,
  backlogPeak:r.mp4Diagnostics.peakUnencodedFrames,
  directCaptureAvgMs:r.directEncoder?.frameCaptureAvgMs,
  directSubmitAvgMs:r.directEncoder?.encoderSubmitAvgMs});
```

`storage:'discard'`는 파일을 만들지 않고 인코딩·뮤서 경로의 속도를 테스트합니다. 비교를 위해 `videoEngine:'canvas'`로 한 번 더 수행하세요. 같은 탭에서 반복하면 캐시/브라우저 상태에 의한 차이가 있을 수 있으므로 정식 비교는 각각 새로고침 후 진행하세요.

5. 다음 단계는 출력 UI의 MP4 엔진 선택기로 1080p·30fps **전체 곡** 테스트입니다. 생성된 MP4의 첫/중간/마지막 영상 및 오디오 싱크를 확인하세요.

```js
({phase:window.__offlineProgress?.phase,engine:window.__offlineProgress?.videoEngine,
  direct:window.__offlineProgress?.directEncoder,
  diagnostics:window.__scoreMotionMp4Diagnostics?.(),
  timing:window.__offlineProgress?.cpuTiming100Ms})
```

완료 후:

```js
const m=window.__offlineLastMetrics;
console.table({engine:m?.videoEngine,wallSec:m?.wallSec,finalizeMs:m?.finalizeMs,
  videoDrainMs:m?.videoDrainMs,backlogPeak:m?.mp4Diagnostics?.peakUnencodedFrames,
  directCaptureAvgMs:m?.directEncoder?.frameCaptureAvgMs});
```

## 해석 / 주의점
- **직접 엔진의 `encode` 측정값은 `VideoEncoder.encode()` 제출 시간**이므로 기존 `CanvasSource.add()`의 `encode`와 직접 비교하지 마세요. `wallSec`, `encoderPacketWait`, 최종 파일 정상 여부를 우선 비교하세요.
- 현재 코드의 UI는 실험 엔진을 선택할 수 있지만 자동 속도 선택 기능을 아직 구현하지 않았습니다.
- `VideoEncoder` 지원 확인만으로 실제 하드웨어 가속이 보장되지는 않습니다.
- MP4 미완성/브라우저 탭 충돌이 발생하면 기본 엔진으로 복귀하세요.
- Python 서버 없이 Cloudflare Pages 브라우저 전용 빌드를 그대로 사용합니다.
- `.mxl`, MusicXML/MIDI/악보/건반 GPU 렌더러 및 project.json schema_version은 건드리지 않았습니다.

## 검증 범위
Node 모의 WebCodecs 테스트 및 기존 회귀 테스트는 통과. 실행 환경의 Chromium에서 H.264 VideoEncoder 자체가 활성화되지 않아 실제 Chrome H.264/AAC 통합 출력/싱크/속도는 이 패치 생성 시 검증하지 못했습니다. 결과값에 근거해 최종 성능을 판단해야 합니다.

참고: https://mediabunny.dev/api/EncodedVideoPacketSource
참고: https://mediabunny.dev/codec-registry/avc
