# ScoreMotion MP4 출력 경로 개선 패치 (2026-11-19)

## 변경 내용

- `CanvasSource.add()`가 끝날 때까지 다음 프레임 생성을 무조건 기다리던 구조를 **최대 2프레임의 제한된 인코딩 파이프라인**으로 변경.
- 새 GPU Canvas 프레임을 **다음 프레임으로 덮어쓰기 전에 동기적으로 캡처**하므로 프레임 내용/타임스탬프 순서 유지.
- 첫 영상 프레임은 기존처럼 완료를 기다려 H.264 인코더 초기화 순서를 보호.
- 인코딩 대기열에 상한을 두어 무제한 프레임 생성 및 메모리 누적 방지.
- 완료된 AAC 오디오 소스와 영상 소스를 `close()`하여 멀티트랙 출력의 추가 버퍼링 완화.
- 프레임 대기 시간과 인코더 완료 시간을 별도로 기록. 영상·음성의 fps, 시간 기준, 비트레이트, 효과/색상/프레임 합성 로직은 유지.
- 기본 깊이 2, 진단용 깊이 1(기존 직렬 동작과 비교 가능).

## 변경 파일

- `static/offline/offline.js` (오프라인 MP4 출력 루프)
- `static/offline/video-encode-queue.js` (새 파일: 제한된 인코더 큐)
- `static/offline-export.js` (진단 옵션 전달 및 모듈 캐시 버전 갱신)
- `static/index.html` (Cloudflare/브라우저용 JS 캐시 버전 갱신)
- `tests/test_video_encode_queue.mjs` (동시성·순서·예외·직렬 모드 자동 테스트)

## 설치 및 배포

**압축파일을 기존 프로젝트 최상위 폴더에 덮어씁니다.** 백업 후 아래 위치를 확인하세요:

```bash
cd /path/to/scorevideo-studio-piano
unzip -o /path/to/ScoreMotion_MP4_pipeline_patch.zip
node tests/test_video_encode_queue.mjs
node tests/test_cleanup_runtime_v20.mjs
```

이후 본인 Cloudflare Pages 배포 작업에서 사용하는 `dist/` 폴더를 새 `static/` 소스로 **재생성**한 후 `npx wrangler pages deploy dist --project-name=scoremotion --branch=main`을 실행합니다. 빌드/복사 과정이 저장소별로 달라 `dist`에 파일을 직접 덮어쓰는 명령은 일부러 포함하지 않았습니다.

Cloudflare에 올린 뒤에는 ``/static/offline/video-encode-queue.js``가 200 OK로 응답하는지 확인하세요.

## 실제 성능 비교 (Console)

기존 프로젝트에 MusicXML·MIDI를 로드하고, 다른 MP4 출력이 진행 중이지 않을 때 실행:

```js
(async () => {
  const results = {};
  for (const depth of [1, 2]) {
    const r = await window.ScoreOfflinePrototype.run('full', {
      fps: 30, seconds: 30, audioMode: 'none', storage: 'memory',
      maxEncodeInFlight: depth
    });
    results[depth] = {
      wallSec: r.wallSec,
      encodeLatencyMs: r.encode.avgMs,
      encoderBackpressureMs: r.encodeBackpressure.avgMs,
      composeMs: r.compose.avgMs,
      bytes: r.bytes
    };
    await window.ScoreOfflinePrototype.release();
  }
  console.table(results);
})();
```

**가장 중요한 성능값은 `wallSec`입니다.** 대기 시간을 다른 프레임의 합성과 겹치기 때문에 `encode` 완료 지연 시간이 줄지 않더라도 총 출력 시간이 줄 수 있습니다. 반대로 깊이 2가 느리면 프레임 대기열 대신 GPU 자원 경쟁이 증가한 것일 수 있으므로, 우선 깊이 1로 되돌려 테스트하세요.

렌더링 진행 중 `window.__offlineProgress`에는 다음 항목이 추가됩니다:

- `cpuTiming100Ms.encode`: 최근 100프레임 인코더 제출 ~ 준비 완료 경과 시간(ms). **기존의 직렬 대기 시간과 의미가 달라졌습니다.**
- `cpuTiming100Ms.encodeBackpressure`: 다음 프레임을 인코더에 제출하기 위해 자리가 날 때까지 기다린 시간(ms).
- `encodeInFlight`: 아직 완료되지 않은 프레임 수 (기본 최대 2).
- `encodePeakInFlight`: 해당 렌더링에서 동시에 처리된 최대 프레임 수.
- `encodeMaxInFlight`: 설정된 동시 처리 최대치.

완료 결과에는 `encodeBackpressure` 통계와 `encodeMaxInFlight`, `encodePeakInFlight`가 추가됩니다.

## 검증 및 제한

- Node 문법 검사 및 큐 동작 테스트 통과 (동기 프레임 캡처, 타임스탬프 순서, 백프레셔, 예외, 직렬 모드).
- 실제 Chrome WebCodecs H.264 + AAC + OPFS 전체 곡 출력은 이 실행 환경의 브라우저 접근 제한으로 검증하지 못했습니다.
- 음원 싱크·영상 첫/중간/마지막 프레임·취소→재출력·4K/60fps는 사용자 환경에서 회귀 테스트 권장.
- 본 패치는 **성능 개선 가능성을 지닌 제한적 파이프라이닝**이며, 사용자의 GPU/브라우저에서 속도 향상을 보장하지 않습니다.
