# ScoreMotion — 웹 미리보기 / 동영상 출력 렌더링 동등성 감사

대상: 사용자가 제공한 `scorevideo-studio-piano last.zip`과 앞서 제공한 `ScoreMotion-preview-export-glow-fix.zip`.

## 결론

`ScoreStage.seek(t)`는 미리보기, 고속 오프라인 MP4, WebM, 호환 Chromium MP4에서 동일한 장면/노트 타이밍을 계산한다. **하지만 픽셀을 최종 생성하는 경로는 동일하지 않다.** 호환 MP4는 브라우저 DOM 화면을 그대로 캡처하므로 미리보기와 가장 가깝다. 고속 오프라인 MP4 및 WebM은 별도 `GPUComposer`가 장면을 재합성하므로 소스코드상 누락/표현 차이가 존재했다.

이번 수정은 앞선 후광 패치를 유지하고 고속 합성기의 추가 누락을 줄인다. **픽셀 단위의 완전한 동일성은 보장할 수 없다.** 최종 검증에는 동일한 프로젝트·설정·시각의 실제 브라우저 프레임 비교가 필요하며, 이를 위한 테스트를 함께 제공한다.

## 항목별 감사

| 영역 | 미리보기 경로 | 기존 고속 출력의 차이 | 이번 수정 |
|---|---|---|---|
| MIDI 타이밍, 스크롤, 카메라 | `ScoreStage.seek`/`ScoreFollower` | 같은 공통 Stage | 유지 |
| 건반, 낙하 노트, 타건 빛 | `ScorePianoFall` / WebGL / Pixi | 소스 canvas를 텍스처로 재합성 | 원본 픽셀 경로 유지 (추가 픽셀 검증 필요) |
| 악보·오선 | OSMD SVG/CSS | SVG 재직렬화·캐싱 | 기존 경로 유지 (래스터 차이 가능) |
| 활성 음표 | CSS `drop-shadow` | 앞선 패치에서 SVG Gaussian 후광 추가 | SVG `ellipse`·`circle`·`use`까지 색상 대응, 속성 `fill=none` 동작 분기 |
| Pixi 음표·악보 빛 | Pixi canvas, 악보 `z-index:2` | SVG 위에 배치하도록 앞선 패치 수정 | 유지 |
| 분위기광 | `.studio-atmosphere` CSS radial gradients, `mix-blend-mode:screen` | **누락** | 재사용 GPU radial sprites 2개 추가; 화면 비율/색/시간/opacity/스크린 합성 반영 (CSS 근사) |
| 2D 보조 장면 효과 | `.studio-fx-canvas`, `z-index:8` | **누락** | 악보 뒤, 제목 앞에 합성 |
| 재생 커서 | CSS 둥근 사각형 + box-shadow + opacity | 단색 그래픽, 그림자 없음, 순서 불일치 | SVG rounded glow, opacity, Pixi보다 아래 배치 |
| 악보 윈도우 | CSS `overflow:hidden`, `border-radius:8px` | 각진 사각형 마스크 | crop 0일 때 라운드 마스크 사용 |
| 제목·아티스트·크레딧 | CSS font, letter-spacing, text-shadow | 합성 SVG에는 자간·그림자 없음 | 자간, SVG shadow, 바깥 여백 추가 (실제 폰트 메트릭에 따른 미세 차이 가능) |
| 배경 사진, 크기, 위치 | CSS 배경 이미지 | GPU 이미지 스프라이트 | 기존 색상/alpha/fit 경로 유지 (샘플링/압축 차이 가능) |
| 최종 코덱 | Chromium DOM | WebCodecs H.264/AAC / MediaRecorder WebM | 압축 차이는 합성 수정만으로 해결되지 않음 |

## 변경 소스

- `static/gpu-composer.js`: 분위기광, 장면 보조 FX, 커서, 타이포그래피, 마스킹, 활성 음표 형태 처리
- `tests/test_gpu_composer_parity.js`: 누락 레이어/순서/형태/caching 소스 동등성 검증
- `tests/validate_gpu_composer_synthetic.py`: Chromium에 만든 합성 테스트 장면을 실제 Pixi GPU로 합성하고 출력 픽셀 확인
- `tests/validate_preview_export_parity.py`: 운영 중 로컬 서버에서 미리보기 DOM과 GPU 합성기의 동시각 프레임/활성 음표 영역 차이 계산

## 테스트 결과

- `node --check static/gpu-composer.js` 통과
- `node tests/test_gpu_composer_glow.js` 통과
- `node tests/test_gpu_composer_parity.js` 통과
- `python tests/validate_gpu_composer_synthetic.py` 통과 (실제 Chromium GPU 합성, 누락 FX 레이어 픽셀 확인)
- 프로젝트 전체 Python 테스트: **95 passed, 1 failed, 8 subtests passed**. 실패 `tests/test_core.py::test_reject_wrong_render_settings`는 `width=1000,height=800`을 거부해야 한다는 오래된 테스트 기대와 현재 API 응답 사이 불일치로, 이번 변경 파일과 무관하다.
- 기존 전체 JS/MJS 테스트(패치 전): **34 passed, 3 failed**. 실패 파일 `test_notation_styles.js`, `test_palette_v017.js`, `test_piano_fall.js`이며, 이번 변경 파일 이외 코드에 대한 기존 테스트 기대와 현재 구현 사이 불일치다. 신규 패리티 검증 테스트는 별도 통과.
- 실제 로컬 웹 서버 + Chromium 간 프레임 비교는 현재 작업 환경의 브라우저 보안 정책에 의해 localhost 탐색이 차단되어 실시하지 못했다. 실제 곡 전체 MP4 픽셀 일치를 주장하지 않는다.

## 실제 프로젝트로 동일시점 프레임 비교

ScoreMotion 서버를 실행하고 프로젝트에서 한 번 MP4 출력 설정을 저장해 `render-config.json`이 준비된 상태에서:

```bash
python tests/validate_preview_export_parity.py --project 프로젝트ID \
  --base http://127.0.0.1:8765 --times 0.5,1.0,2.0,5.0
```

결과: `artifacts/preview-export-parity`에 미리보기·GPU 합성·차이 이미지·`report.json` 저장. `whole_frame.mae`, `score_area.mae`, `active_notehead_mae`를 본다. `--strict --max-mae 5`로 허용 오차 초과 시 실패 처리 가능. 비교는 **MP4 인코딩 이전 GPU 프레임**에 대해 수행하며, H.264 압축 픽셀 차이는 별도이다.

## 패치 적용

두 패치는 동일한 **최종 코드**를 제공하므로 하나만 선택한다.

- `ScoreMotion-original-to-parity-audit.patch`: 사용자가 최초 업로드한 `scorevideo-studio-piano last.zip`에 적용. 앞선 Glow 수정까지 포함.
- `ScoreMotion-glowfix-to-parity-audit.patch`: 앞서 전달한 `ScoreMotion-preview-export-glow-fix.zip` 또는 해당 Glow 패치를 적용한 소스에만 추가 적용.

프로젝트 루트에서 `git apply --check 이름.patch`로 확인한 후 `git apply 이름.patch`로 적용. `schema_version`, 기존 설정 필드, 프로젝트 입출력 형식은 변경하지 않았다.

## 남는 기술적 한계 및 추천 방향

1. GPU 합성은 DOM CSS와 정확하게 동일한 렌더러가 아니다. 분위기광 타원 그라데이션은 시각적으로 가까운 GPU 근사로 구현되며, OSMD SVG 래스터/폰트/블렌딩에서도 미세한 차이가 남을 수 있다.
2. **프레임 완전 동일성**이 중요한 최종 영상이라면 현재 제공 중인 **호환 렌더링 MP4(Chromium 화면 캡처)**를 사용해야 한다. 브라우저 화면과 같은 래스터를 인코더에 전달하므로 고속 재합성 경로보다 원리상 더 가깝다. H.264 압축/색 공간 차이는 남는다.
3. 고속 출력을 정식 기본으로 유지하려면 픽셀 비교 게이트를 자동 CI/릴리스 절차에 포함하고, 달라지는 효과를 순차적으로 공통 WebGL 장면 렌더러로 옮겨야 한다. 단순 밝기 값을 임의로 조정하는 방식은 적합하지 않다.
