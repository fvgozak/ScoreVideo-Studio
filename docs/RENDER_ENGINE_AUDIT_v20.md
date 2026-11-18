# ScoreMotion v20 — 렌더링 엔진 / 정크 코드 감사

기준: **v19**. 이 문서는 실사용 호출 경로를 확인해 제거하거나 유지한 코드를 기록한다. 기능 정리의 원칙은 **원본 프로젝트·JSON 스키마·미리보기·MP4 출력의 호환성 보존**이다.

## 현재 실제 호출 경로

### 미리보기

`static/index.html` → `static/app.js` → `static/stage-runtime.js` / `static/score-core.js` →
`static/piano-fall.js` → `static/dynamic-fx/adapter.js` → WebGL2 렌더러

- **OSMD:** MusicXML 악보 렌더 (필수)
- **Dynamic FX WebGL2:** 건반, 음표 바(낙하/상승), 발광, 경계선 (필수)
- **PixiJS:** 악보 효과 / 일부 호환·최소 모드 효과 (유지)
- **Three.js / `pixi-notes.js`:** 미니멀·레거시 모드 준비 경로에 사용 (유지)

### 고속 MP4

`static/offline-export.js` → `static/offline/offline.js` → `ScoreWebmRecorder.createDiagnosticComposer()` → `static/gpu-composer.js` (PIXI/WebGL) → Mediabunny / WebCodecs / OPFS

- `ScoreGpuComposer` 생성자는 **항상 `gpu=true`**로 표시한다.
- 따라서 `offline.js`의 `!composer.gpu` 조건으로 실행되던 **Canvas2D score-glow overlay/static heads** 분기는 도달 불가능했다.
- 오래된 Canvas2D `drawImage` / `fillText` 가로채기 코드는 GPU 캔버스에서 2D context를 가져올 수 없어 실행되지 않았다.

### 호환 MP4

`app.py` → `render_worker.py`/`render_video.py` → Playwright/Chromium + FFmpeg.

**중요:** 고속 GPU 렌더와 별개의 사용자 출력 수단이므로 아직 삭제하지 않는다. 고속 WebCodecs를 사용할 수 없을 때 동작하는 호환 경로다.

## v20에서 제거한 것

1. `static/background-pattern.js` — v16에서 배경 패턴 UI와 실제 렌더가 폐기됨. 프로덕션 페이지가 사용하지 않는 모듈과 `render.html`의 낡은 script 로드를 제거.
2. `static/offline/offline.js` — 실행 불가능한 오프라인 Canvas2D 악보 발광·정적 헤드 보조 경로, 캔버스 메서드 가로채기, 실사용되지 않는 shadow sprite 캐시 연결 제거. 반환되는 구 진단 키는 호환성을 위해 `null`/`0`으로 유지.
3. `static/offline-export.js` — 더는 사용하지 않는 두 Canvas2D 모듈을 로딩 오류 진단 대상에서 제외; 실제 GPU 출력에 맞는 `pianoMode='baseline'` 사용.
4. `static/index.html` / `static/app.js` — 런타임에서 실제 선택할 수 없었던 Canvas2D/Auto 렌더러 옵션 숨김/삭제. 기존 `fxRenderer` 필드는 저장 데이터 읽기와 schema 호환을 위해 유지하고 `pixi`로 정규화.

## 아직 보존한 레거시·실험 코드

| 코드 | 현재 판단 | 이유 / 다음 조치 |
| --- | --- | --- |
| `static/webm-recorder.js` | **유지** | WebM Recorder는 숨겨진 실험 기능이지만 `createDiagnosticComposer()`는 고속 MP4에 필수. 추후 GPU 합성기 팩토리를 별도 파일로 옮긴 뒤 분리 가능 |
| `render_video.py`, `render_adaptive.py`, `render_worker.py` | **유지** | FFmpeg 호환 MP4 출력에 실제 호출됨 |
| `static/three-keyboard.js`, `static/pixi-notes.js` | **유지** | minimal/legacy 건반 경로에서 사용됨. 실제 fallback 정책부터 확정해야 삭제 가능 |
| `static/piano-shadow-sprite.js` | 보류 | 현재 출력에서 사용되지 않으나 구 실험·단위 테스트가 의존함. 테스트와 함께 아카이브하거나 제거 가능 |
| `static/offline/score-glow-overlay.js`, `score-static-heads.js` | 보류 | 프로덕션 import는 제거됨. `experiments/mp4-prototype`의 과거 비교 스크립트가 직접 import하므로 분리한 실험 코드 정리 단계에서 삭제 가능 |
| `static/experiments/pixi-fx` | 보류 | 독립적인 성능 비교 페이지. 앱의 기본 UI에서는 접근하지 않음. 별도 experiments/ 아카이브 대상으로 분류 |
| `data/projects`, `examples`, `static/audio/salamander` | **유지** | 프로젝트·데모·MIDI 전용 음원 생성에 사용. 정크로 오인하고 삭제하면 안 됨 |
| `schema_version` 및 과거 프로젝트 설정 필드 | **유지** | 기존 프로젝트의 열기/마이그레이션 보장 |

## 검증 기준

- v19와 v20에서 Node.js 테스트 실패 목록이 동일한지 확인 (v19 기존 실패 3개).
- `tests/test_cleanup_runtime_v20.mjs`: obsolete import·UI 옵션이 사라지고 필수 엔진 경로가 남았는지 검사.
- `tests/validate_fx_quick_ui.py`: 실제 브라우저 설정 패널 검사.
- `pytest` 샘플: 반복·선택 입력·MP4 호환 경로·오디오 업로드와 관련된 테스트.
- Mac Chrome에서 장편 MusicXML + MIDI + 오디오의 미리보기·4K/60fps MP4 결과 확인은 별도로 필요.

## 권장 후속 단계

1. WebM Recorder의 숨겨진 녹화 기능 제거 여부를 결정하고, MP4에서 공유 중인 GPU 컴포저 생성 함수를 독립 모듈로 분리.
2. WebGL2 건반과 미니멀 모드의 Pixi/Three 경로 사용 빈도를 계측한 후, 진짜 미사용 시에만 삭제.
3. 레거시 실험 소스를 `experiments/legacy`로 옮기고 과거 벤치마크·테스트를 정리.
4. 전체 JS 파일과 CSS의 도달성 검사, UI 설정 스키마와 문서 정합성 확인.
