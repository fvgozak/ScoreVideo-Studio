# ScoreMotion 프로젝트 저장·불러오기 데이터 구조 명세서

**파일명:** `PROJECT_SAVE_LOAD_DATA_SPEC.md`

**문서 버전:** Draft 1.0 · 2026-11-22

**대상:** ScoreMotion 브라우저 전용(Cloudflare Pages), 기존 로컬 FastAPI 호환
**목적:** Codex 구현 명세 / 코드 리뷰 체크리스트 / 장기 마이그레이션 기준

> [소스 확인] 이 문서는 제공된 `scorevideo-studio-piano final.zip`의 실제 소스를 기준으로, 대화에서 이후 적용·테스트한 **Harmony → Random Light → Random Keyboard Fix → FX Palette i18n → Score Particles** 패치 ZIP의 변경 파일을 순서대로 반영해 작성했다. **사용자 Mac의 현재 작업 디렉터리를 실시간으로 읽은 것은 아니다.** 이 문서에서 `[현재]`는 이 *재구성한 검토 소스*의 동작, `[신규]`는 아직 구현되지 않은 제안 규격을 뜻한다. 제목·크레딧의 자유 위치 및 입·퇴장 타이밍은 향후 계획이므로 `[확장]`으로 구분한다.

## 0. 결론과 변경 금지 원칙

- **저장 포맷:** `.scoremotion` 확장자의 ZIP 컨테이너. 내부 최상위 `project.json`에 `schema_version` **반드시 유지**.
- **휴대성:** XML/MXL, MIDI, 음원, 배경 및 색상 추출에 사용한 이미지의 **사용자 업로드 원본 바이트**를 보관한다. 브라우저의 `blob:` URL, 로컬 디스크 절대경로, 임시 API URL에 의존하지 않는다.
- **완전 복원:** 설정·수동 보정·카메라·팔레트·파티클·출력 설정이 다른 브라우저 프로필에서도 재현되어야 한다.
- **로컬 우선:** 로그인/유료 구독/서버 저장 없이 내보내기와 가져오기 가능. 오프라인 렌더 경로 유지.
- **미리보기=MP4:** 화면과 MP4에 공급되는 설정은 동일한 *ProjectState 스냅샷*에서 생성한다. 단, 미리보기의 해상도 다운스케일은 예외.
- **비파괴:** 파일 교체·프로젝트 가져오기는 검증과 임시 로딩 완료 후 확정한다. 실패하면 작업 중이던 프로젝트로 롤백한다.
- **중복 원본 금지:** 이미지/오디오를 다시 인코딩하거나 변환했으면 원본과 파생본을 **별도 자산**으로 기록한다. 생성 파일도 정확한 출력 재현을 위해 필요하면 패키지에 포함한다.
- **UI 언어는 개인 선호:** `scorevideo_language`는 프로젝트 데이터에 포함하지 않는다. 단, 작곡가가 입력한 제목·크레딧 문자열은 프로젝트 데이터다.

## 1. 실제 코드 현황 및 위험 요소 [현재]

### 1.1 저장 경로

| 현재 저장소 / 소스 | 실제 저장 내용 | 문제점 및 목표 |
|---|---|---|
| `static/local-projects.js` → IndexedDB `scoremotion-local-projects` / store `projects` | `record={id,meta,score,midi,audio,background,diagnostics}` | 서버 없이 브라우저에서만 유효. ZIP export/import 및 자산 레지스트리가 없음 |
| `static/app.js` → `localStorage['scorevideo_studio_v05_settings']` | `persistent` 컨트롤 **170개**의 값 | 프로젝트별 저장이 아닌 브라우저 공통 설정. A/B 프로젝트 간 오염 위험 |
| `static/app.js` → `scorevideo_camera_points_${project.id}` | 수동·자동 카메라 포인트 배열(상한 500) | 프로젝트 ZIP에 자동 포함되지 않음 |
| `static/staff-colors.js` → `scoremotion.staffColors.v1.${projectId}` | `{enabled, keyboard, colors}` | 효과 설정과 별도 저장. 업로드/복제 시 구 프로젝트 ID를 따라갈 위험 |
| `static/app.js` → `scorevideo_title_override_${project.id}` | 프로젝트 제목 수정 텍스트 | 전용 `titleText` 설정과 이중 경로 존재 |
| `static/app.js` → `scorevideo_named_video_presets_v1` | `{id,name,projectId,projectName,settings,savedAt}` 목록 | 전역 저장; 다른 기기에서 불러오면 참조 프로젝트 ID가 부재할 수 있음 |
| `static/app.js` → `scorevideo_last_project` | 최근 프로젝트 ID | 프로젝트 데이터가 아니라 브라우저 탐색 상태 |
| `static/app.js` → `scorevideo_mp4_engine_v1` | 출력 엔진 선택 | 머신/브라우저 성능에 따른 사용자 선호, 기본적으로 프로젝트에서 제외 |
| `static/i18n.js` → `scorevideo_language` | UI 언어(ko/en/ja) | 프로젝트 외부 전역 선호로 유지 |
| 브라우저 `meta.effect_settings` / FastAPI `meta.json` | 효과 일부 및 진단·싱크 결과 | 전체 상태와 다름. 특히 FastAPI PUT은 값이 `str/int/float/bool`인지 검사해서 `staff_colors` 같은 중첩 객체 저장이 거부될 수 있음 |

### 1.2 브라우저 업로드/데이터 특성

`static/local-projects.js::createProject()`에서 현재 **MIDI는 필수**이고 MusicXML·음원은 선택이다. 브라우저 검증 상한은 MIDI 20 MiB, MusicXML 50 MiB, 음원 250 MiB, 배경 20 MiB(PNG/JPEG/WebP)이다. 음원이 없으면 Salamander 기반 WAV를 생성한다. 오디오 길이 검증은 3600초 이하다. (`static/local-projects.js`에서 명시한 제약이며 모든 포맷의 장래 제한을 의미하지 않음.)

**주요 데이터 손실 위험:** 브라우저 구현은 `scoreText=codec.readScore(score)` 후 반복 전개를 선택하면 `scoreText=selected.xml`로 대체하고 `record.score`에 저장한다. 따라서 **원본 `.mxl` ZIP 바이트 및 전개 전의 원본 MusicXML 텍스트가 현재 로컬 레코드에서 항상 보존되는 구조는 아니다.** 반면 FastAPI `app.py`는 원본 `source.mxl`/`source.xml`, 정규화 `score.musicxml`, 전개본 `score-playback.musicxml`을 별도로 취급한다. 신규 패키지는 반드시 원본을 따로 담는다.

**또 다른 위험:** `loadProject(meta)`는 기존 `meta.effect_settings`의 일부 항목만 반영하고 `offset`, `pianoOffset`을 0으로 다시 초기화한다. 완전 복원은 `loadProject` 직후 별도 복원 단계가 필요하다. `paletteSourceFile`은 메모리에만 남는 구조여서 현재 프로젝트 외부 저장 시 유실 가능하다.

### 1.3 저장 범위 결정

| 종류 | 포함 여부 | 판정 |
|---|---|---|
| 업로드 원본 MusicXML/MXL · MIDI · 음원 | **필수** | 원본 바이트 보존 |
| 배경 · 팔레트 추출 원본 · 기타 업로드 이미지 | 사용했다면 **필수** | 선택 해제된 과거 이미지는 v1에서 선택적 보존 가능 |
| 화면 배치·색·빛·건반·파티클·장면·출력 설정 | **필수** | 사용자 편집값 원본 유지 |
| MIDI ↔ XML 매칭·반복 전개 · MIDI tempo/note 분석 | **권장 캐시** | 원본과 알고리즘 버전 기록; 재생성 가능 |
| MIDI ↔ 음원 자동 싱크·수동 오프셋·사용자 확정 앵커 | **필수** | 사용자 작업은 소실 금지 |
| 수동/자동 카메라 포인트·프레이즈 연출 | **필수** | 사용자가 승인한 결과를 보존 |
| 오디오 파형 캐시·렌더 프레임·SVG DOM·Blob URL | **제외** | 로딩 시 재생성 |
| Salamander 샘플 라이브러리·JS 앱 소스 | **제외** | 서비스 공용 정적 리소스, 사용자가 업로드한 파일 아님 |
| 최근 프로젝트 ID·UI 언어·전역 출력 엔진 선호 | **제외** | 기기/브라우저 개인 선호 |
| MP4 완성 영상 | **기본 제외** | 프로젝트 원본이 아닌 결과물; 별도 내보내기 |

## 2. ZIP 컨테이너 규격 [신규]

### 2.1 확장자 및 MIME

- 사용자에게 표시하는 확장자: `.scoremotion`
- 내부: ZIP (deflate/stored); 다운로드 MIME: `application/zip` 또는 제품 전용 MIME(장래 등록 후).
- `project.json`은 ZIP 루트에 단 하나, UTF-8 JSON. 모든 내부 경로는 슬래시(`/`)와 상대 경로.
- 파일명은 보기 편한 이름과 실제 저장 경로를 분리. 경로는 임의의 안전한 UUID/해시 기반으로 작성.
- 중간 파일(`*.partial`, 임시 JSON), `__MACOSX`, `.DS_Store` 등은 제외.

```text
Waltz in WaterLight.scoremotion
├── project.json                          # 항상 필수 / schema_version
├── assets/
│   ├── score/score-source.musicxml        # 실제 업로드 바이트; .mxl이면 원본 .mxl
│   ├── midi/midi-source.mid               # 실제 업로드 바이트
│   ├── audio/audio-source.wav             # 업로드했거나 실제 생성된 원본 소리 파일
│   └── images/
│       ├── background-source.jpg
│       └── palette-source.png            # 사용했다면 포함
├── timeline/
│   ├── synchronization.json              # 자동/수동 동기화 및 잠금 앵커
│   ├── camera.json                       # 카메라 포인트와 프레이즈
│   └── scene-overlays.json               # 확장: 텍스트 위치/타이밍
├── derived/                              # 선택적; 없어도 다시 분석할 수 있어야 함
│   ├── score-playback.musicxml           # 반복 전개 등의 파생 악보
│   └── analysis.json                     # note_events, tempo_map, alignment 등
└── thumbnail.webp                       # 선택적
```

### 2.2 필수 불변식

1. `project.json.schema_version`은 정수이고 루트에 존재해야 한다. `format`은 반드시 `scoremotion-project`.
2. `assets.entries[*].path`는 ZIP 내부에 존재하고, 크기와 SHA-256이 맞아야 한다.
3. ZIP 안의 `../`, 절대경로, 심볼릭링크, 중복 경로, 외부 URL 참조를 거부한다.
4. 참조되는 `assets.bindings.score/midi/audio/background/palette_source`는 자산 ID 또는 `null`이며, 존재하지 않는 ID는 허용하지 않는다.
5. 프로젝트를 열기 위해 **서버에 업로드할 필요가 없어야 한다**.
6. ZIP 파일 하나가 완전한 백업이어야 한다. 외부 경로가 없는 상태에서도 원본을 복원할 수 있어야 한다.
7. 동일 원본 파일을 여러 용도로 쓸 수 있다(예: 이미지 하나를 배경과 팔레트 소스로 연결). 이때 자산 바이트는 1회만 저장한다.
8. 사용자 정의 값은 저장된 타입과 단위를 유지한다. 음량/빛/위치의 단위를 임의로 변환하지 않는다.

## 3. `project.json` 루트 스키마 [신규]

| 필드 | 타입 | 필수 | 의미 |
|---|---|---|---|
| `format` | string | Y | 고정값 `scoremotion-project` |
| `schema_version` | integer | Y | **최상위 버전 번호**, v1은 `1` |
| `project_id` | string | Y | 프로젝트 자체의 영속 ID (현재 32자리 hex ID 호환) |
| `project_name` | string | Y | 사용자 표시명(파일명과 구분) |
| `created_at`, `updated_at` | ISO-8601 UTC | Y | 생성·수정 시각 |
| `producer` | object | Y | `app`, `version`, `exported_at`, `schema` 생성기 정보 |
| `assets` | object | Y | `entries` 자산 레지스트리와 `bindings` 현재 연결 |
| `settings` | object | Y | UI 컨트롤·오선별 색상·출력 정보의 영속값 |
| `timeline` | object | Y | 동기화/카메라/오버레이 파일 참조 |
| `analysis` | object | N | 파생 데이터 버전 및 출처 서명 |
| `preview` | object | N | 썸네일 파일 경로, 재생 헤드 위치 등 편의정보 |
| `extensions` | object | N | 향후 알 수 없는 필드/플러그인용 네임스페이스 |

**설계 결정:** 기존 UI와 호환되도록 `settings.controls`는 현행 `persistent` 170개 컨트롤의 **실제 DOM ID를 키로 사용**한다. 이 값은 현행 `saveSettings()`와 같이 **체크박스만 boolean, 나머지는 string**으로 보관한다. 숫자와 색상은 복원 시 필드별 타입 검증 및 `config()` 구성 과정에서 해석한다. 따라서 `zoom:'1.9'` 같이 문자열이어도 정상이며, **MIDI·오디오 시간은 예외적으로 JSON number(초)**이다. 향후 v2에서 의미 중심 중첩 설정으로 개편할 때 마이그레이션한다.

### 3.1 `project.json` 실사용 예시 (축약본)

```json
{
  "format": "scoremotion-project",
  "schema_version": 1,
  "project_id": "a3d2c58ee6194fbb8c210d2ad80ef414",
  "project_name": "Waltz in WaterLight",
  "created_at": "2026-11-22T00:00:00Z",
  "updated_at": "2026-11-22T00:15:00Z",
  "producer": {
    "app": "ScoreMotion",
    "version": "browser-local",
    "exported_at": "2026-11-22T00:15:00Z"
  },
  "assets": {
    "entries": {
      "score-main": {
        "role": "score",
        "path": "assets/score/score-source.musicxml",
        "original_name": "Waltz.musicxml",
        "mime_type": "application/vnd.recordare.musicxml+xml",
        "byte_size": 123456,
        "sha256": "<64자리 실제 SHA-256 해시>",
        "origin": "uploaded",
        "source_format": "musicxml"
      },
      "midi-main": {
        "role": "midi",
        "path": "assets/midi/midi-source.mid",
        "original_name": "Waltz.mid",
        "mime_type": "audio/midi",
        "byte_size": 23456,
        "sha256": "<64자리 실제 SHA-256 해시>",
        "origin": "uploaded"
      },
      "audio-main": {
        "role": "audio",
        "path": "assets/audio/audio-source.wav",
        "original_name": "Recording.wav",
        "mime_type": "audio/wav",
        "byte_size": 24800000,
        "sha256": "<64자리 실제 SHA-256 해시>",
        "origin": "uploaded"
      },
      "background-main": {
        "role": "background",
        "path": "assets/images/background-source.jpg",
        "original_name": "Sea.jpg",
        "mime_type": "image/jpeg",
        "byte_size": 1700000,
        "sha256": "<64자리 실제 SHA-256 해시>",
        "origin": "uploaded"
      }
    },
    "bindings": {
      "score": "score-main",
      "midi": "midi-main",
      "audio": "audio-main",
      "background": "background-main",
      "palette_source": null
    }
  },
  "settings": {
    "controls": {
      "layoutMode": "singleline",
      "aspectRatio": "9:16",
      "outputQuality": "1080",
      "fps": "60",
      "scoreAreaWidth": "100",
      "scoreAreaHeight": "31",
      "scoreColorPreset": "random",
      "keyboardColorPreset": "linked",
      "scoreParticlesOn": true,
      "scoreParticleStyle": "dust",
      "scoreParticleCount": "14",
      "showText": true,
      "titleText": "Waltz in WaterLight",
      "creditText": "Composed by HEMIO"
    },
    "staff_colors": {
      "enabled": false,
      "keyboard": false,
      "colors": {}
    },
    "export": {
      "download_name": "Waltz in WaterLight.mp4"
    }
  },
  "timeline": {
    "synchronization": "timeline/synchronization.json",
    "camera": "timeline/camera.json",
    "scene_overlays": null
  },
  "analysis": {
    "data_file": "derived/analysis.json",
    "generator_version": "scoremotion-analysis-v1"
  },
  "preview": {
    "playhead_sec": 25.0,
    "thumbnail": "thumbnail.webp"
  },
  "extensions": {}
}
```

> 위 예시는 **타입·참조 관계를 설명하기 위한 축약 JSON**이다. 실제 `sha256`은 플레이스홀더가 아닌 64자리 소문자 hex, `controls`에는 현재 존재하는 **전체 설정**을 포함해야 한다. 썸네일/파생 파일/오버레이가 없으면 대응 참조를 `null`로 하거나 생략한다. `byte_size`는 예시값이며 실제 파일의 길이로 기록해야 한다.

## 4. Asset Registry 상세 [신규]

### 4.1 `assets.entries` 1개 항목

| 필드 | 타입 | 조건/기본 | 설명 |
|---|---|---|---|
| `role` | enum | 필수 | `score`, `midi`, `audio`, `background`, `palette_source`, `other` |
| `path` | relative path | 필수 | ZIP 내부 실제 저장 파일 경로 |
| `original_name` | string | 필수 | 사용자가 올린 이름. 표시용이며 경로로 직접 사용 금지 |
| `mime_type` | string | 필수 | MIME; 미확정 시 `application/octet-stream` |
| `byte_size` | integer ≥0 | 필수 | 압축 전 바이트 수 |
| `sha256` | lowercase hex(64) | 필수 | 원본 바이트 SHA-256 |
| `origin` | enum | 필수 | `uploaded`, `generated`, `replaced`, `imported` |
| `source_format` | string | score 등 필요 시 | `mxl`, `musicxml`, `xml` 등 업로드 형식 |
| `replaces_asset_id` | string/null | 선택 | 이전 버전 자산 ID 추적(현재 파일이 아닌 이력) |
| `generated_by` | string/null | 생성 자산만 | 예: `Salamander Grand Piano` 및 버전 |
| `created_at` | UTC string | 권장 | 해당 자산을 프로젝트에 추가한 시각 |
| `media` | object | 선택 | 오디오 duration/sample_rate, 이미지 width/height 등 **검증 캐시** |

- `asset_id`는 레지스트리의 키(`score-main`, `midi-main`)이며 객체 내부 `path`와 독립적이다.
- `asset_id`는 **프로젝트 내부 고유**; 파일명으로 식별하지 않는다.
- `bindings`는 실제 사용 중인 자산만 가리킨다. 자산을 교체하면 먼저 새 `entries`를 만들고 `bindings`를 원자적으로 교체한다.
- v1에서는 이전 자산의 바이트를 ZIP에 계속 보관할 의무는 없다(파일 교체 전 **명시적 실행 취소/백업** 지원). 다중 버전 보관은 향후 확장.

### 4.2 필수성 및 원본 보존

| 자산 | 현재 지원 | v1 패키지 정책 |
|---|---|---|
| Score | 현재 선택(없으면 MIDI 전용) | 존재 시 원본 XML/MXL 바이트 포함, 없으면 `null` |
| MIDI | 현재 필수 | 항상 포함. v1도 MIDI 필수 모델 유지 |
| Audio | 사용자가 선택 또는 로컬 생성 | **실제 사용한 바이트를 포함**. 재생성만으로 똑같은 파형을 보장할 수 없음 |
| Background | 선택 | 사용 중이면 포함. 배경 투명도/배치 설정은 `settings.controls` |
| Palette source image | 메모리 임시 | 색상 추출에 썼다면 원본 파일 포함. 추출된 최종 색상은 컨트롤과 별도 유지 |
| Derived/unfolded MusicXML | 현재 경우에 따라 생성 | 원본과 **분리**하고 `analysis`에 생성 출처 기록. 없으면 재생성 가능 |
| Thumbnail | 현재 신규 영역 | 선택. 재생에 영향 없어야 함 |

**자산 교체 시 원본 동일성의 기준은 SHA-256**이다. 경로/이름 같음은 동일성 증거가 아니다. 프로젝트 ZIP 내부에는 macOS 경로나 `file://`, `blob:`, 기존 `/api/projects/{id}/audio` 같은 참조를 저장하지 않는다.

## 5. 설정 스키마 [신규 / 현행 UI 호환]

### 5.1 단일 원천 규칙

1. `settings.controls`는 `static/app.js::persistent`에 있는 **170개 현행 컨트롤 ID 전체**를 저장하는 **정본**이다. 초기 v1에서는 키를 리네이밍하지 않는다.
2. `config()`의 `gpu_effects`, `scene`, `minimal_palette` 등은 **렌더용 파생 객체**다. 동일 정보를 별도 정본으로 중복 저장하지 않는다.
3. `settings.staff_colors`는 객체이므로 별도 명시적 섹션에 저장한다.
4. `settings.export.download_name`은 DOM의 `downloadName` 값을 저장한다(170개 `persistent` 목록 밖).
5. `offset`와 `pianoOffset`는 `timeline/synchronization.json`의 `manual_offsets`로 저장한다(170개 `persistent` 밖).
6. `camera_points`는 `timeline/camera.json`으로 저장한다(170개 `persistent` 밖).
7. 오래된 `scorevideo_title_override_${id}`가 존재하면 `settings.controls.titleText`로 마이그레이션하며 이중 진실 원천을 없앤다.
8. 프로젝트를 바꿀 때 `localStorage`의 전역 설정이 새 프로젝트를 덮지 않아야 한다. **프로젝트 상태 > 기존 프로젝트 effect_settings > 레거시 전역 설정 > 신작 기본값** 순서로 일회성 마이그레이션한다.
9. 저장 시 DOM 값을 즉시 읽고, 자동저장/수동 내보내기 직전에 모든 디바운스 저장을 완료한다.
10. `scoreFxPreset`, `keyboardFxPreset`, `scoreColorPreset`, `keyboardColorPreset`(랜덤 포함)과 `scoreParticles*`를 반드시 포함한다. 프리셋 선택만으로 파생되는 값은 불러오기 시 재계산하되 수동 커스텀은 덮지 않는다.

### 5.2 값/제약의 정의

- `checkbox`: `boolean`. 그 외 `input[type=range|number|color|text]`, `select`: `string`으로 저장한다(현행 `saveSettings()` 호환).
- 범위/열거값 검사는 저장 직전과 불러올 때 **컨트롤별 유효값 표**를 기준으로 실시한다. 잘못된 값은 자동 변경하기 전에 사용자에게 알려야 하며, 알 수 없는 미래 필드는 `extensions`에 보존한다.
- `aspectRatio`: `16:9`, `9:16`, `1:1`, `4:5`, `3:4`, `4:3`, `21:9`, `custom` 등 `static/output-size.js`의 지원값 기준.
- `layoutMode`: `page`, `singleline`, `vertical`, `horizontal`; 원본 `config()`의 `scroll_mode` 파생값도 같은 설정으로 계산한다.
- `scoreParticleStyle`: `dust`, `rise`, `spark`; 점 개수 2–24 등 범위는 `static/studio-scene.js::normalize`를 기준으로 검증한다.
- `scoreColorPreset`, `keyboardColorPreset`: 기존 Harmony 테마명과 `random`, `linked`, `custom` 등 실제 `static/fx-groups.js` 옵션을 유효값으로 사용한다.
- 4-stop 색상 배열과 랜덤 팔레트의 **선택된 테마 ID를 저장**한다. 팔레트 정의를 향후 변경하더라도 오래된 프로젝트와 시각적으로 동일해야 한다면 별도 `extensions.palette_snapshot` 또는 `settings.palette_snapshots`를 저장하는 v1 옵션을 권장한다. 그래야 앱 업데이트 후 색 자체가 변경되지 않는다.
- `staff_colors.colors`는 `MusicXML part id + ':' + 1-based staff` 키 → `#RRGGBB` 값. 이조악기 정보·카탈로그는 필요 시 다시 분석하되 사용자가 지정한 색상은 보존한다.
- 프로젝트에 저장해야 하는 런타임 값과 현재 작업 중인 일시적인 UI 값(로딩 스피너, 진행률, Blob URL, 오류 토스트)은 혼합하지 않는다.

### 5.3 효과·장면·출력 변환 경로

```text
project.settings.controls (DOM 원본 ID로 1:1 보관)
   + project.settings.staff_colors
   + timeline.synchronization.manual_offsets
   + timeline.camera.camera_points
   + project.settings.export.download_name
     ↓ restoreProjectState() / 필드 검증 / UI 반영
static/app.js :: config()
     ├── gpu_effects ← gpuEffects()              (GPU/건반/파티클)
     ├── scene ← sceneOptions()                 (텍스트·장면·악보 파티클)
     ├── minimal_palette ← minimalPalette()
     ├── staff_colors ← ScoreStaffColors.getConfig()
     ├── camera_points ← readCameraPoints()
     ├── offset_sec / piano_offset_sec
     └── 해상도·fps·악보 영역·배경
     ↓
ScoreStage.Stage (미리보기) / MP4 export (동일 정본)
```

### 5.4 제목·크레딧 향후 확장 영역 [확장, 미구현]

현재 확인된 구현은 `titleText`, `artistText`, `creditText`, `showText`, `titleFont`, `titleGap`이며, `studio-scene.js`에서 제목/작곡가/크레딧을 렌더한다. 사용자가 최근 논의한 **자유 위치, 글자별 크기, 시작·종료, 페이드, 스타일 프리셋**은 아직 현재 소스의 영속 필드로 확인되지 않았다. 아래는 **향후 도입 예약 스키마**다.

```json
{
  "overlays": [
    {
      "id": "title-1",
      "kind": "title",
      "enabled": true,
      "text": "Waltz in WaterLight",
      "font": "serif",
      "font_size_px": 52,
      "font_weight": 400,
      "color": "#ffffff",
      "anchor": "top-center",
      "x_percent": 50,
      "y_percent": 12,
      "start_sec": 0,
      "end_sec": 8,
      "fade_in_sec": 1.2,
      "fade_out_sec": 1,
      "animation": "fade-up"
    }
  ]
}
```

오버레이가 없거나 `scene_overlays=null`이면 **기존 장면 텍스트 렌더링을 그대로 사용**한다. 도입 시 기존 `titleText`와의 우선순위를 정하고, 저장 버전이 다른 프로젝트를 자동 마이그레이션한다.

## 6. Timeline 데이터 규격 [신규]

### 6.1 `timeline/synchronization.json`

```json
{
  "schema_version": 1,
  "midi_to_audio": {
    "method": "first-sound-offset",
    "analysis_version": 3,
    "offset_sec": 0.18,
    "tempo_ratio": 1,
    "first_midi_sec": 0.12,
    "first_audio_sec": 0.30,
    "anchors": [
      { "midi": 0, "audio": 0.18 },
      { "midi": 151, "audio": 151.18 }
    ]
  },
  "manual_offsets": {
    "score_offset_sec": 0,
    "piano_offset_sec": -0.1
  },
  "user_locks": [],
  "review_state": "valid",
  "dependencies": {
    "score_sha256": "<현재 악보 해시>",
    "midi_sha256": "<현재 MIDI 해시>",
    "audio_sha256": "<현재 음원 해시>"
  }
}
```

- **현재 존재:** `meta.sync`의 `method`, `offset_sec`, `tempo_ratio`, `anchors[{midi,audio}]`, 첫 소리 분석 정보. Python `auto_sync.py`는 `analysis_version=2`, 브라우저 `local-projects.js`는 `3`을 사용한다. 따라서 `analysis_version`은 읽을 수 있는 값을 그대로 보존하고, 지원 여부를 판정한다.
- **현재 존재:** 수동 슬라이더 `$('offset')`, `$('pianoOffset')` 값(저장 누락되기 쉬움). 이 두 개는 프로젝트별 `manual_offsets`로 분리한다.
- **현재와 구별할 것:** `score_alignment.anchors`의 `{beat,second}`는 **악보↔MIDI 정렬**이고, `midi_to_audio.anchors`의 `{midi,audio}`는 **MIDI↔오디오 정렬**이다. 키와 단위가 다르므로 한 배열로 합치지 않는다.
- **향후 예약:** `user_locks`는 이전에 논의한 사용자의 수동 싱크 잠금 지점. 최신 검토 소스에서는 이 정보의 전체 영구화 구현을 확인하지 못했으므로 v1에서 `[]` 허용, 기능 구현 전까지 임의의 잠금 포인트를 만들어 넣지 않는다.

향후 `user_locks[]` 항목 제안:

```json
{
  "lock_id": "lock-001",
  "source_measure_index": 47,
  "playback_occurrence": 2,
  "source_note_key": "P1:1:note-id",
  "midi_sec": 83.26,
  "audio_sec": 84.11,
  "confirmed": true,
  "scope": "after-this-point",
  "status": "valid"
}
```

잠금은 재생 순서상 ID/회차와 매핑해야 한다. 파일 교체 시 무효화하지 않고 **사용자 보정 데이터 원본을 보존하면서 `needs-review` 표시**한다.

### 6.2 `timeline/camera.json`

```json
{
  "schema_version": 1,
  "camera_points": [
    {
      "key": "<ScoreFollower scoreKey>",
      "measure": 14,
      "pitch": 72,
      "beat": 48.25,
      "zoom": 1.30,
      "duration": 1.6,
      "shake": 0,
      "timing": -0.6,
      "auto": false,
      "kind": "phrase"
    }
  ],
  "camera_mode": "points",
  "source_score_sha256": "<현재 악보 해시>",
  "source_midi_sha256": "<현재 MIDI 해시>"
}
```

- `camera_points[*].key`는 현재 `ScoreFollower`가 만드는 `scoreKey`를 참조. 음높이/마디/박자와 `auto` 여부를 함께 보존한다.
- 현행 UI는 최대 500개를 허용(`readCameraPoints`, `RenderRequest.camera_points`). `camera_mode`는 `settings.controls.cameraMode`가 정본이며 여기 기록은 검증용 미러; 충돌 시 **controls 우선**. 중복 보관을 피하려면 실제 구현에서는 `camera_mode` 생략 가능.
- MusicXML 교체 뒤 `key`가 달라져도 사용자 정의 포인트를 즉시 삭제하지 않고 `orphaned / needs-review`로 유지하고 재매핑을 시도한다.

### 6.3 `derived/analysis.json` (캐시)

현재 실제 계산 필드 예시:

```json
{
  "schema_version": 1,
  "midi_timing": {
    "ticks_per_beat": 480,
    "tempo_map": [{ "beat": 0, "second": 0, "tempo_us": 500000 }],
    "note_count": 1,
    "note_events": [
      {
        "beat": 0,
        "pitch": 60,
        "channel": 0,
        "second": 0,
        "velocity": 78,
        "end_second": 0.5,
        "sustain_end_second": 0.5
      }
    ],
    "pedal_events": [],
    "velocity_events_truncated": false,
    "first_note_beat": 0,
    "midi_duration_sec": 0.5
  },
  "score_alignment": {
    "method": "pitch-onset-anchors-v1",
    "status": "ok",
    "matched_groups": 1,
    "total_groups": 1,
    "matched_notes": 1,
    "total_notes": 1,
    "coverage": 1,
    "anchors": [{ "beat": 0, "second": 0 }],
    "note_matches": [
      { "beat": 0, "pitch": 60, "second": 0, "end_second": 0.5, "velocity": 78 }
    ]
  },
  "repeat_info": { "mode": "written", "expanded": false, "warning": "" },
  "tie_continuations": []
}
```

- 이 예시는 실제 `midi_timing.py`, `local-project-codec.js`의 키 모양에 근거한 **유형 예시**이며 곡의 실측 데이터가 아니다.
- 원본 MIDI를 분석해 재생성할 수 있으므로 캐시는 선택적. 단, 분석기 버전이 바뀌어 시각 결과가 달라질 수 있는 경우 **캐시 출처 해시, 분석기 버전, 사용 여부**를 기록한다.
- `repeat_info.mode`는 `written/unfolded/none` 등 현재 생성 결과를 보존하며, 향후 D.C./D.S. 지원 추가 시 별도 `repeat_engine_version`을 둔다.
- `score_alignment.note_matches`는 길 수 있으므로 대용량 패키지에서는 `derived/analysis.json`으로 분리한다.

## 7. 원자적 Save / Load 명세 [신규]

### 7.1 저장 순서

1. 프로젝트에 편집/렌더 진행 중인 작업이 있다면 **일관된 스냅샷 지점**을 잡는다. 렌더 중에도 현재 상태를 불변 복사해 저장할 수는 있지만, 사용자에게 저장 시점을 명시한다.
2. 기존 `saveSettings()` 디바운스, `saveProjectEffects()`의 550ms 타이머, 오선색 저장 타이머(220ms) 등 미완료 작업을 flush한다.
3. `serializeProjectState()`에서 **170개 컨트롤 / staff colors / 제목 / offsets / camera / sync / 자산 연결**을 스냅샷으로 캡처한다.
4. `validateProjectState()`로 타입·범위·참조·타임라인 정합성을 검사한다.
5. 각 원본 Blob/File의 바이트 크기·SHA-256을 구하고, 파일을 ZIP 엔트리에 하나씩 추가한다. 새 JS heap에 모든 WAV를 복사해 메모리 중복을 만들지 않는다.
6. `project.json`, timeline JSON 및 선택적 캐시를 직렬화해 ZIP 작성. 원본/캐시는 서로 다른 경로.
7. ZIP 완료 후 사용자에게 `.scoremotion` 다운로드. **다운로드 시작**과 **운영체제 파일 저장 완료**를 혼동해 저장 완료로 표시하지 않는다.
8. 브라우저에서 파일 저장 API를 지원하면 명시적 파일 핸들로 다시 저장할 수 있으나, 권한 미지원 환경에선 다운로드 경로 유지.

### 7.2 열기 순서

1. 사용자로부터 `.scoremotion` ZIP 파일 선택. 현재 프로젝트를 즉시 초기화하지 않는다.
2. ZIP 중앙 디렉터리, 파일수, 확장 크기, 경로, 중복 엔트리, `project.json` 형식 확인.
3. `format`과 `schema_version` 확인 → 지원 버전이면 `migrateProject()` 실행 → 값 스키마 검증.
4. 모든 참조 에셋 존재·크기·SHA-256 검사. 현재 브라우저 지원 형식과 업로드 제한 확인.
5. **staging 프로젝트**를 별도 IndexedDB 레코드 또는 메모리 임시 객체로 준비하고 XML/MIDI/오디오 분석 및 런타임 생성.
6. 먼저 악보와 오디오를 로딩한 뒤 `restoreProjectState`로 **컨트롤 → 오선 카탈로그 → staff colors → 동기화 → 카메라 → 재생 헤드** 순서로 복원. `loadProject(meta)`가 offsets를 0으로 초기화하는 현재 동작에 주의.
7. 불러온 `config()`와 `ScoreStudio.normalize()`의 결과를 기준 스냅샷과 비교한다. 미리보기/MP4 공통 경로 검증.
8. 성공 시 기존 프로젝트와 교체(commit)하고 기록 갱신. 실패 시 staging만 제거하고 기존 프로젝트/사용자 설정/Blob URL 그대로 유지.
9. 동일한 `project_id`가 이미 있는 경우 기본 동작은 **사본으로 가져오기**(새 `project_id`를 생성하고 `extensions.forked_from_project_id`에 출처 기록). `meta.id` 및 `scoremotion.staffColors.v1.${id}` 등 프로젝트 ID 기반 내부 참조도 새 ID로 일관되게 재매핑한다. 사용자가 명시 선택해야 기존 프로젝트 덮어쓰기가 가능하다. 충돌 없는 새 환경에서는 원래 `project_id`를 유지한다.

### 7.3 구현할 공통 인터페이스

```ts
// 타입은 구현 목표. 현재 소스에 존재하는 함수가 아님.
interface ScoreMotionProjectIO {
  serializeProjectState(): Promise<ProjectState>;
  validateProjectState(state: ProjectState): ValidationReport;
  exportProject(state: ProjectState, assets: AssetRegistry): Promise<Blob | ReadableStream>;
  inspectProjectArchive(file: File): Promise<ProjectInspection>;
  importProject(file: File, opts?: {mode: 'copy' | 'replace'}): Promise<ProjectState>;
  restoreProjectState(state: ProjectState): Promise<void>;
  replaceProjectAsset(role: AssetRole, file: File): Promise<ReplacementReport>;
  migrateProject(manifest: unknown): ProjectState;
}
```

- 함수의 구현 위치는 새 `static/project-io.js`, `static/project-schema.js`, `static/project-assets.js` 등을 권장. 실제 폴더 구조는 Codex 코드베이스 점검 후 확정.
- `project.json` 원본 전체를 항상 유지한 채 새 객체에 마이그레이션(입력 객체 직접 변경 금지).
- ZIP 검증 로직과 ProjectState 검증 로직은 독립시켜 악성 ZIP과 유효하지 않은 설정을 구분한다.

## 8. 파일 교체와 의존성 관리 [신규]

### 8.1 교체 절차(모든 파일 공통)

`파일 선택 → 확장자/형식/길이/해시 검사 → 임시 자산 생성 → 영향받는 분석만 재실행 → 설정 유지·재검토 목록 생성 → 확인 후 binding 원자 교체 → 자동저장`.

사용자가 새 파일을 골랐다는 사실만으로 기존 원본 Blob을 지워서는 안 된다. 새 파일 분석 실패 또는 렌더 준비 실패 시 **이전 자산을 유지**한다.

### 8.2 의존성/무효화 매트릭스

| 교체 | 그대로 보존 | 다시 계산 / 재검토 |
|---|---|---|
| MusicXML / MXL | 배경·팔레트·영상 비율·기본 FX | 렌더된 오선/SVG, 악기 카탈로그, repeat_info, score_alignment, tie_continuations, 카메라 포인트 키, 잠금 앵커의 악보 참조 |
| MIDI | 배경·악보 배치·제목·정적 디자인 | tempo_map, note_events, pedal_events, 속도 범위, score_alignment, 자동 싱크, 노트별 랜덤 색상·이벤트 키·카메라 자동 제안 검증 |
| Audio | XML·MIDI 매칭, 색·FX·카메라 설정 | 오디오 길이/파형, 자동 첫 소리 오프셋, 사용자 확정 싱크 지점 검토 |
| Background | XML·MIDI·동기화·모든 커스텀 효과 | 이미지 크기·핏·렌더 리소스 갱신; **팔레트는 사용자 승인 시에만 재추출** |
| Palette source | 악보·MIDI·오디오·싱크 | 재추출 미리보기 제공; 기존 선택한 색상을 임의 덮어쓰지 않음 |

- MusicXML 교체 후 기존 `staff_colors.colors`는 `part id:staff` 키가 보존된 오선에 적용; 없는 키는 보존하되 `orphaned` 처리.
- 오디오 파일만 교체해도 기존 사용자 수동 잠금점은 삭제하지 않음. `review_state='needs-review'` 및 원본 자산 해시 기록.
- MIDI/악보 교체 후 **랜덤 색상의 음표별 결정성**을 보장하려면 난수 생성에 쓰는 음표 identity / seed / 해시 정책을 기록한다. 라이브러리 버전만 바뀌어도 색이 달라질 수 있으므로 알고리즘 버전을 포함한다.
- 모든 변경은 실행 취소가 가능하도록 적어도 교체 직전 스냅샷을 유지한다.

## 9. 자동저장·브라우저 캐시·동기화 확장

- **프로젝트 파일** `.scoremotion`: 사용자가 파일로 보관/이동하는 *완전한 백업*.
- **자동저장** IndexedDB + 필요한 경우 OPFS: 현재 작업을 빠르게 복구하는 로컬 사본. 자동저장은 ZIP을 매번 재생성하지 않는다.
- 자산 Blob은 해시 기반 중복 제거(동일 브라우저 내부) 가능. 설정 변경 시 자산 원본을 복제할 필요가 없음.
- `updated_at`, `revision`(로컬 편집 시 단조 증가하는 정수), `dirty`, `last_autosaved_at`, `last_exported_at` 상태를 분리한다. **dirty UI 상태는 ZIP 내부 영속 상태와 혼합하지 않는다.**
- `navigator.storage.estimate()`를 사용해 남은 용량을 관찰하고 필요 시 `navigator.storage.persist()` 권한을 요청한다. 단, 브라우저 저장은 언제든 정책에 의해 삭제될 수 있으므로 `.scoremotion` 백업을 권장한다.
- 향후 클라우드 동기화는 `project_id + revision + asset_sha256` 기반으로 확장하되 v1은 계정/서버가 필요하지 않다.

## 10. 보안·손상·버전 호환 정책

### 10.1 ZIP 파일 입력 검증

- ZIP 압축 해제 전에 중앙 디렉터리 목록 검사. 엔트리 개수·개별 확장 크기·전체 확장 크기·압축비 상한 설정(최종 숫자는 브라우저 실제 테스트로 확정).
- `../`, `\`, 절대경로/드라이브 경로, NUL, 중복 엔트리, 파일 아닌 ZIP 엔트리 거부. 심볼릭링크 금지.
- 원본 확장자뿐 아니라 파일 시그니처 / XML 유효성을 검사. 외부 엔티티/외부 리소스 로딩 금지.
- 미디어 디코딩은 기존 코덱 지원 범위 내에서 진행하고, 파싱 전 바이너리를 DOM에 삽입하지 않는다.
- Blob URL은 로드한 브라우저에서 새로 생성하고 교체/닫기 시 revoke. 영구 저장 금지.
- SHA-256 불일치와 부분 ZIP, 중복 경로, 손상된 프로젝트 JSON은 **로드 실패 + 구 프로젝트 보존**.

### 10.2 `schema_version` 정책

| 상황 | 대응 |
|---|---|
| v1 (현재 명세) | 정식 검증 후 로딩 |
| 구 형식의 IndexedDB/`meta.json` | **별도 Legacy Adapter**가 v1 `ProjectState`로 승격. `schema_version`을 삭제하거나 임의 변조하지 않음 |
| 지원하는 이전 프로젝트 vN | 명시적 `migrate_vN_to_vNplus1` 체인 적용 |
| 미래 버전(현재 앱보다 높음) | 자동 덮어쓰기 금지; 읽기 거부 또는 검증 가능한 읽기 전용 모드만 허용 |
| 알 수 없는 옵션 | 정본에서 미지원 필드 삭제하지 않고 `extensions`에 보존; 재저장으로 정보 유실을 방지 |

**주의:** 검토한 실제 `static/local-projects.js`의 현재 브라우저 레코드에는 `schema_version`이 최상위로 존재하지 않는다. `app.py`에 `schema_version`을 보존하라는 주석은 있지만, 이것을 이미 `.scoremotion/project.json`이 구현되어 있다는 뜻으로 해석해서는 안 된다. **이 문서는 새 파일 포맷의 최상위 필드 도입을 확정하는 명세**다.

## 11. UI 동작 명세

| 진입점 | 동작 | 사용자에게 보여줄 정보 |
|---|---|---|
| 파일 → 프로젝트 저장 | 현재 `.scoremotion` 아카이브 생성 | 프로젝트 이름, 용량, 포함 원본 파일, 저장 진행률 |
| 파일 → 프로젝트 열기 | 아카이브 검증 후 새 로컬 프로젝트로 불러오기 | 프로젝트 이름, 파일 목록, 경고, 불러오기 버튼 |
| 파일 → 다른 이름으로 저장 | 동일 데이터에서 별도 프로젝트 사본 | 사본 이름, 새 project_id 부여 여부 |
| 파일 → 파일 관리 | MusicXML, MIDI, 음원, 배경, 팔레트 원본별 상태 | 이름·크기·업로드 여부·교체/제거 |
| 파일 → 최근 프로젝트 | IndexedDB 자동저장 목록 표시 | 최종 수정 시각·미리보기·복원 |
| 저장 상태 표시 | 변경 있음 / 저장 중 / 자동저장 완료 / 파일 백업 필요 | 성공 전 '저장 완료' 표시 금지 |

- 계정, 로그인, 결제 UI는 구현 대상이 아니다.
- 프로젝트 로딩 중에는 기존 미리보기를 완전히 초기화하지 않는다. 확정 전까지 표시 가능 상태로 유지.
- 파일 교체 시 “그대로 유지되는 항목 / 재분석되는 항목 / 수동 확인이 필요한 항목”을 짧게 안내.
- 진행률은 ZIP 생성/검증/원본 복원/렌더러 준비로 단계 분리.
- UI 텍스트는 `static/locales/ko.json`, `en.json`, `ja.json`으로 번역하고 코드에 한글 하드코딩 금지.

## 12. 단계별 구현과 완료 기준

| 단계 | 개발 내용 | 수락 기준 |
|---|---|---|
| 1. 상태 감사·정본화 | 170 컨트롤 전수, specials(싱크/카메라/오선색/제목/파일) 수집 | JSON round-trip 후 DOM 값 및 `config()` 동등 |
| 2. 원본 자산 레지스트리 | IndexedDB 구조 확장, 원본과 파생 분리 | MXL 원본 바이트 보존, 해시 일치 |
| 3. ZIP Export | manifest/파일/타임라인 포함 `.scoremotion` 다운로드 | 다른 PC에서 모든 원본 추출 가능 |
| 4. ZIP Import | 안전 검증·임시 복원·원자 커밋 | 실패 시 기존 프로젝트 무손상 |
| 5. 개별 교체 | XML/MIDI/Audio/Background/Palette 각각 변경 | 설정 유지 + 영향 분석 + undo |
| 6. 자동저장·복구 | 자산 Blob 공유, 상태 revision 관리 | 강제 새로고침 후 마지막 편집 복원 |
| 7. 마이그레이션·출력 검증 | v1/레거시, Preview/MP4 회귀 테스트 | 설정/시간/빛 효과 동일, 오디오 싱크 유지 |

### 12.1 필수 자동 테스트 이름(제안)

```text
tests/test_project_state_inventory.mjs
  - persistent 목록 170개 전수 저장; 신규 ID가 생기면 필수 테스트 실패
  - special keys: offsets, staff colors, camera, title, palette-source 포함

tests/test_project_archive_roundtrip.mjs
  - Export→Import→Export 후 파일 SHA-256·설정·타임라인 동등
  - MXL 원본과 변환본 분리 보존

tests/test_project_load_atomic.mjs
  - ZIP 손상/누락/해시 불일치/ZIP Slip/미래 schema → 구 프로젝트 상태 보존

tests/test_project_replace_assets.mjs
  - MIDI/음원/XML/이미지 교체별 영향 범위와 수동 앵커 보존

tests/test_project_legacy_migration.mjs
  - IndexedDB meta + 효과 설정 + localStorage 특별항목 수집

tests/validate_project_render_parity.py
  - Chromium 실제 프레임 재생, 저장 전후 PNG/영상 비교, 동기화 오프셋 확인
```

### 12.2 최종 PASS 조건

- **재현성:** 전체 원본 파일, 사용자 컨트롤, staff colors, 랜덤 빛, 파티클, 카메라·싱크가 되살아난다.
- **교차 환경:** A 브라우저 프로필에서 `.scoremotion` 저장 → B 새 프로필에서 열기 → 동일 결과.
- **내보내기 검증:** 16:9·9:16·싱글라인·다중 오선·반복기호·느린 rit.·페르마타를 포함한 샘플 프로젝트.
- **영상 일치:** 업로드한 동일 원본+설정이면 재생 시작/중간/끝의 악보·건반·빛 위치가 같고 오디오 싱크가 유지된다.
- **회귀 안전:** Harmony / Random Keyboard / FX i18n / Score Particles / 기존 자동싱크 회귀 테스트가 통과한다.
- **배포 규칙:** `--dry-run` → 설치 → 관련 Node/Python 테스트 PASS → Chromium 검증 → 배포. 테스트 실패 시 배포하지 않는다.

## 13. 구현 전 결정 사항 (추천 기본값 포함)

| 쟁점 | 권장 결정 |
|---|---|
| 프로젝트 파일 단일 포맷 | `.scoremotion` ZIP |
| `schema_version` | 루트 정수 `1`에서 시작. 추후 증분 마이그레이션 |
| 원본 파일 포함 | 전부 포함; 특히 MXL의 변환 전 원본 필수 |
| `settings.controls` 구조 | 초기엔 실제 DOM ID 170개를 flat map, 타입은 checkbox=boolean, 나머지 string |
| 확정된 싱크/카메라 | 정본으로 별도 timeline JSON |
| 자동 분석 정보 | 재계산 가능 캐시; 버전+자산 해시가 맞을 때만 재사용 |
| 동일 프로젝트 ID를 가져올 때 | 기본 `copy`로 보호, 사용자가 명시적으로 선택하면 교체 |
| 대용량 압축 | 오디오 Stored/low compression, 가능하면 stream writer; 무리한 메모리 복제 금지 |
| 상태 복원 순서 | 자산 로딩 → UI 컨트롤 → 오선색 → sync/offsets → 카메라 → preview/export |
| 언어팩 | ko/en/ja, 프로젝트 파일은 로케일 비종속 |
| 구독/클라우드 | v1 범위 밖, 로컬 우선 유지 |

## 부록 A. 현재 코드 근거 파일

| 파일 | 확인한 역할 |
|---|---|
| `static/app.js` | `persistent`, `saveSettings()`, `restoreSettings()`, `config()`, `sceneOptions()`, `gpuEffects()`, `currentVideoPresetSettings()`, `loadProject()` |
| `static/local-projects.js` | IndexedDB 프로젝트 레코드, 원본 파일 가져오기, 로컬 API, 음원 생성, 저장/조회 |
| `static/local-project-codec.js` | MIDI 파싱, MusicXML 읽기, 악보↔MIDI 정렬, 반복 전개, MXL 읽기 |
| `static/staff-colors.js` | `part_id:staff` 키, 오선 색상 영속 저장 |
| `static/stage-runtime.js` | ScoreStage 설정 표준화 및 미리보기/렌더 공유 |
| `static/studio-scene.js` | 장면, 제목/크레딧, 악보 파티클, 시간별 연출 정규화 |
| `static/fx-groups.js` | 15개 Harmony·Random 프리셋, 동적으로 생성되는 FX 컨트롤 |
| `static/visual-editor.js` | 악보 영역 위치/크기 편집 값 |
| `static/offline-export.js` · `static/render.html` | 브라우저 MP4 출력 측 설정 소비 |
| `app.py` | FastAPI 저장·불러오기 엔드포인트, 기존 `meta.json`, 출력 요청 스키마 |
| `midi_timing.py` · `score_alignment.py` · `auto_sync.py` | 현재 MIDI 이벤트, 악보 정렬, 오디오 싱크 필드 및 버전 |

## 부록 B. `persistent` 전체 필드 인벤토리 [현재 코드에서 추출]

다음 표는 `static/app.js`의 `const persistent=[...]` 및 뒤의 `persistent.push(...)` 호출을 합산하고 중복 제거한 **170개 ID 전수 목록**이다. 표의 `boolean`/`string`은 현행 `saveSettings()` 직렬화 타입. 동적 효과 패널의 42개 컨트롤은 `static/fx-groups.js`에서 생성하므로 `static/index.html`에 존재하지 않는 것이 정상이다. **이 목록에 없는 새 컨트롤을 추가하면 `serializeProjectState()` 테스트도 반드시 갱신**한다.

### B.1. 프로젝트·내보내기 설정 — 10개

| ID (코드 그대로) | 저장 타입 |
|---|---|
| `aspectRatio` | `string` |
| `customAspectHeight` | `string` |
| `customAspectWidth` | `string` |
| `fps` | `string` |
| `fxRenderer` | `string` |
| `outputQuality` | `string` |
| `renderMode` | `string` |
| `resolution` | `string` |
| `videoBitrate` | `string` |
| `videoQuality` | `string` |

### B.2. 악보·레이아웃·커서 — 18개

| ID (코드 그대로) | 저장 타입 |
|---|---|
| `cursorColor` | `string` |
| `cursorMotion` | `string` |
| `cursorVisible` | `boolean` |
| `drawScore` | `boolean` |
| `layoutMode` | `string` |
| `notationStyle` | `string` |
| `scoreAreaHeight` | `string` |
| `scoreAreaWidth` | `string` |
| `scoreAreaX` | `string` |
| `scoreCropTop` | `string` |
| `scoreMarginBottom` | `string` |
| `scoreMarginTop` | `string` |
| `scorePanelColor` | `string` |
| `scorePanelOpacity` | `string` |
| `scorePosX` | `string` |
| `scorePosY` | `string` |
| `scoreVisible` | `boolean` |
| `zoom` | `string` |

### B.3. 장면·제목·크레딧 — 14개

| ID (코드 그대로) | 저장 타입 |
|---|---|
| `animateBackground` | `boolean` |
| `artistText` | `string` |
| `cameraMode` | `string` |
| `creditText` | `string` |
| `sceneEndColor` | `string` |
| `sceneEndGlow` | `string` |
| `sceneStartColor` | `string` |
| `sceneStartGlow` | `string` |
| `sceneTemplate` | `string` |
| `showText` | `boolean` |
| `titleFont` | `string` |
| `titleGap` | `string` |
| `titleText` | `string` |
| `transitionTime` | `string` |

### B.4. 배경·색상·팔레트 적용 — 14개

| ID (코드 그대로) | 저장 타입 |
|---|---|
| `backgroundFit` | `string` |
| `backgroundOpacity` | `string` |
| `backgroundPosX` | `string` |
| `backgroundPosY` | `string` |
| `inkColor` | `string` |
| `inverted` | `boolean` |
| `paletteApplyBackground` | `boolean` |
| `paletteApplyGlow` | `boolean` |
| `paletteApplyKeyboard` | `boolean` |
| `paletteApplyScore` | `boolean` |
| `paletteTheme` | `string` |
| `paperColor` | `string` |
| `staffColor` | `string` |
| `themeColor` | `string` |

### B.5. 미니멀 스타일 — 6개

| ID (코드 그대로) | 저장 타입 |
|---|---|
| `minimalBlackColor` | `string` |
| `minimalMode` | `boolean` |
| `minimalNoteColor` | `string` |
| `minimalPaletteMode` | `string` |
| `minimalPedalColor` | `string` |
| `minimalWhiteColor` | `string` |

### B.6. 악보 빛·파티클·효과 — 31개

| ID (코드 그대로) | 저장 타입 |
|---|---|
| `accentColor` | `string` |
| `auroraHigh` | `string` |
| `auroraLow` | `string` |
| `auroraPreset` | `string` |
| `fxMode` | `string` |
| `fxStrength` | `string` |
| `glitter` | `boolean` |
| `glowColor` | `string` |
| `lightColorMode` | `string` |
| `motionStrength` | `string` |
| `noteMotion` | `boolean` |
| `scoreColorPreset` | `string` |
| `scoreFxPreset` | `string` |
| `scoreImpactEnabled` | `boolean` |
| `scoreImpactStrength` | `string` |
| `scoreParticleBrightness` | `string` |
| `scoreParticleCount` | `string` |
| `scoreParticleLife` | `string` |
| `scoreParticleSize` | `string` |
| `scoreParticleSpeed` | `string` |
| `scoreParticleStyle` | `string` |
| `scoreParticlesOn` | `boolean` |
| `sparkle` | `boolean` |
| `trailBrightness` | `string` |
| `trailDuration` | `string` |
| `trailLength` | `string` |
| `trailLowerColor` | `string` |
| `trailThickness` | `string` |
| `trailUpperColor` | `string` |
| `velocityReactive` | `boolean` |
| `velocityScale` | `string` |

### B.7. 건반·노트 바·조명 — 43개

| ID (코드 그대로) | 저장 타입 |
|---|---|
| `keyboardBaseBrightness` | `string` |
| `keyboardBlackBrightness` | `string` |
| `keyboardBloomRadius` | `string` |
| `keyboardBloomStrength` | `string` |
| `keyboardBoundaryColor` | `string` |
| `keyboardBoundaryColorMode` | `string` |
| `keyboardBoundaryReaction` | `string` |
| `keyboardBoundarySpeed` | `string` |
| `keyboardBoundaryStrength` | `string` |
| `keyboardBoundaryStyle` | `string` |
| `keyboardBoundaryThickness` | `string` |
| `keyboardBrightnessOffset` | `string` |
| `keyboardColorHigh` | `string` |
| `keyboardColorLow` | `string` |
| `keyboardColorPreset` | `string` |
| `keyboardCurlStrength` | `string` |
| `keyboardDensityFastWeight` | `string` |
| `keyboardFxPreset` | `string` |
| `keyboardGlowSize` | `string` |
| `keyboardLightingMode` | `string` |
| `keyboardLightingSensitivity` | `string` |
| `keyboardNoteBarMode` | `string` |
| `keyboardNoteRiseSpeed` | `string` |
| `keyboardPaletteLink` | `boolean` |
| `keyboardParticleDensity` | `string` |
| `keyboardParticleLife` | `string` |
| `keyboardParticleSize` | `string` |
| `keyboardReflectionStrength` | `string` |
| `keyboardTemperatureSync` | `boolean` |
| `keyboardVelocityColor` | `boolean` |
| `keyboardVelocityContrast` | `string` |
| `keyboardVelocityScale` | `string` |
| `keyboardWhiteBrightness` | `string` |
| `pedalResonance` | `boolean` |
| `pianoBlackKeyColor` | `string` |
| `pianoCamera` | `boolean` |
| `pianoEnabled` | `boolean` |
| `pianoKeyStyle` | `string` |
| `pianoLight` | `boolean` |
| `pianoLightStrength` | `string` |
| `pianoVerticalOffset` | `string` |
| `pianoWhiteKeyColor` | `string` |
| `sustainAfterglow` | `boolean` |

### B.8. GPU 세부 효과 — 34개

| ID (코드 그대로) | 저장 타입 |
|---|---|
| `gpuBloomOn` | `boolean` |
| `gpuBloomStrength` | `string` |
| `gpuBurstOn` | `boolean` |
| `gpuChromaticOn` | `boolean` |
| `gpuChromaticStrength` | `string` |
| `gpuCinematicOn` | `boolean` |
| `gpuCinematicStrength` | `string` |
| `gpuClassicOn` | `boolean` |
| `gpuClassicStrength` | `string` |
| `gpuCoreRadius` | `string` |
| `gpuCoreStrength` | `string` |
| `gpuHaloRadius` | `string` |
| `gpuHaloStrength` | `string` |
| `gpuMidRadius` | `string` |
| `gpuMidStrength` | `string` |
| `gpuMusicReaction` | `string` |
| `gpuOutlineOn` | `boolean` |
| `gpuOutlineStrength` | `string` |
| `gpuParticleBrightness` | `string` |
| `gpuParticleCount` | `string` |
| `gpuParticleDirection` | `string` |
| `gpuParticleLife` | `string` |
| `gpuParticleSize` | `string` |
| `gpuParticleSpeed` | `string` |
| `gpuParticleSpread` | `string` |
| `gpuPreset` | `string` |
| `gpuStardustOn` | `boolean` |
| `gpuStardustStrength` | `string` |
| `gpuTrailDuration` | `string` |
| `gpuTrailLength` | `string` |
| `gpuTrailOn` | `boolean` |
| `gpuTrailStrength` | `string` |
| `gpuVolumetricOn` | `boolean` |
| `gpuVolumetricStrength` | `string` |

## 부록 C. 실제 필드 총합 및 구현 검증 포인트

- 정본 컨트롤 **170개** = 프로젝트·내보내기 설정 10 + 악보·레이아웃·커서 18 + 장면·제목·크레딧 14 + 배경·색상·팔레트 적용 14 + 미니멀 스타일 6 + 악보 빛·파티클·효과 31 + 건반·노트 바·조명 43 + GPU 세부 효과 34.
- 직렬화 타입: boolean **34개**, string **136개**.
- 그 밖에 반드시 포함할 데이터: `offset`, `pianoOffset`, `downloadName`, `ScoreStaffColors.getConfig()`, `readCameraPoints()`, `project.sync`, `project.score_alignment`, `project.repeat_info`, `project.tie_continuations`, `project.staff_groups`, 파일 바이트 전체, `paletteSourceFile` 및 사용자 선택 팔레트, 기존 제목 오버라이드.
- 현재 170개 필드 중 `offset`/`pianoOffset`/`downloadName`/오선색/카메라 포인트가 빠져 있다는 점을 테스트로 잡아야 한다.
- **참고:** 색상 팔레트 정의(`harmonicStops`, 랜덤 색상 목록)와 기본 설정값은 앱 업데이트로 변경될 수 있으므로 프리셋 이름만 보관하는 방식의 완전한 픽셀 동일성은 보장되지 않는다. 완전 재현을 목표로 하면 선택 당시 팔레트 색상 스냅샷도 저장해야 한다.
- 이 문서는 데이터 모델 **설계 명세**이며, ZIP 저장·불러오기 기능이 이미 구현됐다는 뜻이 아니다.
