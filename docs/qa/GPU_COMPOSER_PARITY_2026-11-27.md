# 2026-11-27 MP4 합성기 점검

악보의 음표 발광과 Pixi 빛 효과가 미리보기에서 보이는 순서대로 MP4 합성기에 들어가는지 확인했다. 이번 변경의 코드는 [GPU 합성기](../../static/gpu-composer.js)에, 변경 단위는 [8f2f330](https://github.com/fvgozak/ScoreVideo-Studio/commit/8f2f330)에 있다.

| 확인 항목 | 결과 |
| --- | --- |
| 음표 마스크 재사용 | `node tests/test_gpu_composer_glow.js` 통과. 12,000프레임·72,002회 요청에서 디코딩 6회, 마스크 6개·295,200바이트. 서로 다른 음표가 텍스처를 공유하면서 색과 투명도는 따로 적용했다. |
| 레이어·커서·제목 | `node tests/test_gpu_composer_parity.js` 통과. 배경 빛, 악보, 커서, Pixi 발광, 제목의 합성 순서와 캐시 경로를 확인했다. |
| 기존 출력 회귀 | `node tests/test_gpu_export_cleanup.mjs`, `node tests/test_keyboard_export_frame.mjs`, `node tests/test_mp4_diagnostics.mjs`, `node tests/test_mp4_final_phase.mjs` 통과. |
| 실제 브라우저 합성 | Playwright Chromium에서 `small_morning.musicxml`·MIDI·WAV를 불러와 한 프레임 합성했다. 음표 15개, 마스크 1개, WebGL 렌더러와 Pixi 발광의 2D 미러 경로를 확인했다. |
| 빌드·구문 | `node --check static/gpu-composer.js`, `python3 scripts/build_pages_static.py`, `git diff --check` 통과. |

이 수치는 검사 환경과 예제 곡의 결과다. 12,000프레임 검사는 합성기 마스크 캐시의 모의 부하 검사다. 이번 점검에서는 긴 곡의 실제 MP4 출력 시간이나 미리보기·출력 픽셀 차이를 재지 않았다.
