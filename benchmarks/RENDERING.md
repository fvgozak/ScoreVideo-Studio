# MP4 렌더링 성능 조사 · 2026-11-13

현재 보관된 `render-diagnostics.json` 5개는 모두 12fps, 120~131프레임이며, 1080×1920 두 건은 각각 14.99fps·14.18fps였다. 1280×720 세 건은 25.46~28.82fps였다. 각 진단에서 `page.screenshot()` 시간이 렌더 처리 시간의 대부분이었다. 사용자가 관찰한 M1 MacBook Air의 1080p 30fps 5.3fps는 이 저장된 진단 파일에서 재현할 수 없으며, 아래 측정 호스트도 M1이 아니다.

`baseline-300-frames.json`과 `comparison-300-frames.json`은 동일 프로젝트·동일 해상도·동일 300개 시간점(0부터 299/30초)에서 각 경로를 두 번 반복한 측정이다. 이 호스트에서 1080×1920 MIDI 전용 장면은 기존 17.09fps → CDP screencast 21.73fps, 1280×720 악보+건반 장면은 29.30fps → 41.62fps였다. 프로파일링/초기 페이지 로딩 시간은 양쪽 측정에서 제외했다. FFmpeg는 동일한 libx264 `veryfast`·CRF 19·AAC 설정이다. 점검용 MP4는 임시 폴더에 생성해 프로젝트의 기존 출력물을 바꾸지 않았다.

새 계측의 의미:

- `js_time_sec`: 브라우저 안 `renderAt(t)` 자체의 실행 시간.
- `evaluate_wall_sec`: JS 실행과 Playwright 요청/응답 왕복을 함께 포함한 시간.
- `screenshot_time_sec` 또는 `screencast_event_wait_sec`: 브라우저 paint, JPEG 압축, 전달을 포함한 캡처 단계. 현재 API로 이 세 항목을 개별적으로 정확히 분리할 수는 없다.
- `stdin_write_time_sec`: Python→FFmpeg 파이프 쓰기와 FFmpeg 디코드/인코드의 백프레셔. 순수 인코더 CPU 시간이 아니다.
- `ffmpeg_child_cpu_sec`: 종료된 FFmpeg 자식 프로세스의 user+system CPU 시간. JPEG 디코드, H.264 인코드, 오디오 및 mux가 합쳐진 값이며, 화면 캡처와 병렬로 수행된다.
- `ffmpeg_close_sec`·`ffmpeg_wait_sec`: 마지막 프레임 이후 입력 종료·인코더 드레인·MP4 마감 시간. 인코딩은 캡처 중에도 겹쳐 진행된다.

CDP 경로는 각 시점에 기존 `window.renderAt(t)`를 그대로 호출한다. 이전 screencast frame을 승인하지 않은 채 다음 시점의 장면을 그린 뒤 승인하므로, Chromium의 paint 이벤트 한 개를 해당 시점에 대응시킨다. 중복·누락 이벤트, 해상도 오류, 미리보기와의 색상 차이 기준 초과 시 완성되지 않은 MP4를 폐기하고 기존 Playwright screenshot 경로로 처음부터 다시 렌더한다. 별도 강제 설정이 없다면 `render_mode=quality`는 기존 PNG 경로를 유지한다. 환경변수 `SCOREVIDEO_CAPTURE=legacy`로 기존 경로를 강제할 수 있고 `=screencast`로 새 경로를 강제할 수 있다.

### Canvas → VideoFrame → WebCodecs 범위 조사

ScoreStage는 단일 Canvas가 아니다. 배경 사진·색상과 분위기 radial-gradient는 DOM/CSS, 악보는 OSMD SVG 안의 스크롤·클리핑·카메라 변환, 음표 잔상과 제목은 DOM/CSS, 발광 FX와 낙하 노트·건반은 각각 Canvas다. 따라서 `new VideoFrame(scoreViewport)`로 전체 장면을 곧바로 인코딩할 수 없다. Canvas 합성 경로에는 CSS 배경과 사진, SVG 악보의 폰트·스타일·카메라·잘림, 두 Canvas 레이어, 제목/아티스트/크레딧, blend mode와 발광을 같은 순서로 재현하는 별도 compositor가 필요하다. 이렇게 하면 현재 미리보기와 분기된 렌더 구현이 되므로 픽셀 비교 검증 없이 기본 경로에 넣지 않는다.

실제 localhost Chromium에서 `VideoEncoder`는 노출된다. 1080×1920·30fps의 `avc1.64002A`와 `avc1.4D402A`는 지원되었지만 `avc1.42E01F`는 지원되지 않았다. 즉 WebCodecs는 가능한 하위 시스템이지만 이 앱에서는 전체 DOM/SVG 합성과 MP4 mux/오디오 타임스탬프 결합이 선행되어야 한다. 현재 CDP 경로는 기존 scene graph를 그대로 캡처하므로 악보, 줌, 색상, 빛 및 건반 효과의 누락 위험이 작다.

정적 악보는 이미 `Stage.load()`에서 한 번 SVG로 렌더되며, 배경 이미지는 브라우저가 캐시한다. 건반/낙하 노트는 시간순 음표 배열을 이진 탐색하여 활성 구간만 그린다. 카메라 이동은 CSS transform을 사용한다. 추가 정적 레이어 캐시, 전용 worker/OffscreenCanvas, WebCodecs encode queue는 compositor 설계와 동기화 검증 이후에 적용하는 것이 안전하다. 현재 FFmpeg 파이프의 `stdin.write` 대기는 300프레임당 0.1~0.2초로 작아, 인코딩 큐 변경만으로 큰 속도 향상을 기대하기 어렵다.

화질 검증: CDP JPEG와 같은 시점의 미리보기 PNG를 0·중간·마지막 프레임에서 비교했고, 30프레임 탐색에서는 악보+건반의 0/10/20/29프레임 모두 평균 채널 오차 0.57 이하, `>22` 오차 픽셀 비율 0.0042 이하로 측정됐다. 추가로 두 경로의 300프레임 MP4를 디코딩해 **두 해상도 모두** 0/100/200/299 프레임을 비교했으며 모든 샘플에서 RGB 픽셀 평균 오차 0, 큰 오차 비율 0으로 나왔다. 30프레임 출력의 영상·오디오 길이와 프레임 수는 `ffprobe`로 각각 1.0초·30프레임을 확인했다.

`benchmarks/smoke_export.py`는 기존 프로젝트 출력물을 덮어쓰지 않는 임시 폴더에서 `export_mp4()` 전체 진입점을 검증한다. 자동 CDP 경로와 `SCOREVIDEO_CAPTURE=legacy` 경로 모두 30프레임·1초 MP4를 생성했다. 짧은 1초 렌더에서는 초기화 비용의 비중이 커서 위 300프레임 지속 처리 FPS와 단순 비교하면 안 된다.
