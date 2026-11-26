# 변경 기록

이 문서는 [ScoreVideo-Studio 저장소](https://github.com/fvgozak/ScoreVideo-Studio)의 주요 기능·수정·문서 정리 커밋을 날짜순으로 정리합니다. 날짜는 Git 커밋 날짜입니다. 각 항목은 **그 시점에 반영된 변경**을 뜻하며, 현재 사용법과 제한은 [README](README.md) 및 [브라우저 전용 안내](docs/BROWSER_ONLY_CLOUDFLARE.md)를 기준으로 확인하세요.

이전 버전 설명은 [기능 이력](docs/FEATURE_HISTORY.md)에, 별도로 전달된 초기 v1–v15 패치 작업 기록은 [패치 이력 요약](docs/PATCH_HISTORY_V1_V15.md)에 보관합니다. 패치 작업 기록은 이 저장소의 배포 이력과 동일하지 않습니다.

## 기록 범위

| 자료 | 확인 기준 | 읽는 방법 |
| --- | --- | --- |
| 이 변경 기록 | `main`에 반영된 주요 Git 커밋 | 날짜와 커밋 링크로 실제 저장소 변경을 확인합니다. |
| [이전 기능 이력](docs/FEATURE_HISTORY.md) | 과거 README의 v0.16–v0.19 설명 | 당시 기능과 설정을 확인합니다. 현재 동작은 README를 기준으로 합니다. |
| [초기 패치 v1–v15](docs/PATCH_HISTORY_V1_V15.md) | 별도로 전달된 ScoreMotion 작업 메모 | 패치 순서와 당시 측정·미해결 문제를 확인합니다. Git 릴리스 번호로 해석하지 않습니다. |

브라우저 전용 빌드는 기기·사이트별 IndexedDB에 프로젝트를 저장하고, `.scoremotion` 파일로 내보내거나 엽니다. `project.json`의 `schema_version`은 1입니다. 서버를 사용하는 로컬 실행과 지원 범위가 다르므로 배포 방식은 [README](README.md)를 확인하세요. 아래 검증 기록은 명시된 환경과 범위의 결과입니다.

## 2026-11-26 — 브라우저 악보 정렬과 멜로디 강조 베타

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 악보·MIDI 정렬 | 기존 V1을 유지하면서 악보 박자 기반 V2-A, 연주 순서 기반 V2-B, 느린 아르페지오에 더 유연한 V2-C 및 자동 선택을 추가했습니다. 원본 MIDI 타이밍은 변경하지 않으며 분석 한계·Worker 오류 시 V1 결과와 검토 경고를 표시합니다. | [6ba5a00](https://github.com/fvgozak/ScoreVideo-Studio/commit/6ba5a00) |
| 프로젝트 작업 | 브라우저 전용 모드에서 새 프로젝트의 정렬 모드를 선택하고 기존 프로젝트를 재분석할 수 있습니다. 재분석은 음원·MIDI·선택된 악보 파일을 교체하지 않고 결과를 저장합니다. 마디별 검토 정보를 표시합니다. | [6ba5a00](https://github.com/fvgozak/ScoreVideo-Studio/commit/6ba5a00) |
| 멜로디 강조 | MusicXML·MIDI 음표를 브라우저에서 분석하는 V1 및 실험적 V2-A/B/C/D를 추가했습니다. 프로젝트별 설정을 `extensions.melody_highlight`에 저장하고, 미리보기·영상 출력의 악보 빛 효과에 같은 설정을 전달합니다. 수동 음표 교정 화면은 아직 제공하지 않습니다. | [6ba5a00](https://github.com/fvgozak/ScoreVideo-Studio/commit/6ba5a00) |
| 화면·언어 | 새 효과 패널을 추가하고 기존 Score FX·오선 색상 컨트롤을 올바른 패널에 유지했습니다. 악보 정렬 화면의 한국어·영어·일본어 문구를 추가했습니다. | [6ba5a00](https://github.com/fvgozak/ScoreVideo-Studio/commit/6ba5a00) |
| 이전 기록 정리 | 변경 기록의 범위와 초기 항목 형식을 통일하고 기존 커밋 링크를 보완했습니다. | [17d90b6](https://github.com/fvgozak/ScoreVideo-Studio/commit/17d90b6) |

검증 기록: 새 정렬·멜로디 JavaScript 검사 11개, 기존 브라우저 저장·정렬 Python 검사 7개, 출력 프레임·GPU 정리 검사, JavaScript 구문 검사와 Cloudflare Pages 정적 빌드를 확인했습니다. 예제 Dream Journey의 새 자동 정렬은 1,542/1,559개 악보 음표를 연결했지만, 이 수치는 개별 매칭의 음악적 정확도를 보증하지 않습니다. 멜로디 V2 계열도 추정 알고리즘이므로 곡별 결과를 미리보기에서 확인해야 합니다.

연구 배경: 멜로디 V1·V2-A/B/C/D는 다성 음악의 선율 추출, 음악인지 특징, 정보량·반복, 그래프 경로, 성부 분리 연구를 **참고해 자체 구현한 브라우저 알고리즘**입니다. 논문별 출처와 실제 코드의 차이는 [멜로디 연구 참고 자료](docs/MELODY_RESEARCH_REFERENCES.md)에 정리했습니다. 논문의 모델이나 성능 수치를 그대로 적용한 것은 아닙니다. 악보↔MIDI 정렬 V2는 이 참고 문헌 표의 멜로디 검출 알고리즘과 별개입니다.

## 2026-11-24 — 실시간 미리보기와 브라우저 MP4 오디오

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 미리보기 | 음원 없는 MIDI는 Salamander 샘플을 실시간 재생합니다. 재생 위치·일시정지·이동은 미리보기 시계에 연결하고, 실시간 재생이 실패하면 WAV 경로로 전환합니다. | [29d9dcf](https://github.com/fvgozak/ScoreVideo-Studio/commit/29d9dcf) |
| MP4 | 생성 음원을 짧은 PCM 구간으로 렌더링해 영상과 병렬로 AAC에 전달합니다. 업로드한 음원은 기존 디코딩 경로를 유지합니다. | [29d9dcf](https://github.com/fvgozak/ScoreVideo-Studio/commit/29d9dcf) |
| 프로젝트 준비 | MIDI 프로젝트를 열 때 전체 곡 WAV 합성을 기다리지 않도록 변경했습니다. Salamander 디코딩 샘플은 용량 제한을 둔 캐시로 재사용합니다. | [38cacda](https://github.com/fvgozak/ScoreVideo-Studio/commit/38cacda) |
| 악보 표시 | 악보를 숨기면 남아 있던 악보 발광 캔버스·GPU 명령도 숨기거나 지웁니다. | [38cacda](https://github.com/fvgozak/ScoreVideo-Studio/commit/38cacda) |
| 오선별 색상 | 사용자가 건반에 오선별 색상 연동을 켠 경우 Random 색상보다 이를 우선합니다. 미리보기와 출력에서 같은 모듈 버전을 사용합니다. | [544a806](https://github.com/fvgozak/ScoreVideo-Studio/commit/544a806) |
| 로컬 MP4 음원 | 브라우저 프로젝트에 레거시 오디오 URL이 없어도 브라우저의 `/api/projects/:id/audio` 경로에서 음원을 읽습니다. | [544a806](https://github.com/fvgozak/ScoreVideo-Studio/commit/544a806) |
| 문서 | 날짜별 변경 기록과 과거 v1–v15 패치 기록을 분리하고 문서 안내를 정리했습니다. | [2e4a2e4](https://github.com/fvgozak/ScoreVideo-Studio/commit/2e4a2e4) |

검증 기록: 실시간 재생과 병렬 오디오 단위 검사, Chromium의 IndexedDB·음원 디코딩 검사, 짧은 MIDI의 실제 1920×1080 MP4 출력(42프레임·AAC 패킷 168개)을 확인했습니다. 긴 곡은 모의 인코딩까지 확인했으며 실제 전곡 출력 결과로 일반화하지 않습니다.

## 2026-11-23 — 브라우저 전용 프로젝트와 출력 정리

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 브라우저 프로젝트 | MusicXML·MIDI 분석, IndexedDB 저장, 로컬 API, 파일 교체·복원 및 `.scoremotion` 프로젝트 파일 저장·열기 경로를 연결했습니다. `project.json`의 `schema_version`은 1로 유지했습니다. | [4713ac2](https://github.com/fvgozak/ScoreVideo-Studio/commit/4713ac2) |
| 배포 | Cloudflare Pages용 정적 빌드 스크립트와 브라우저 전용 안내를 추가하고 이전 API 프록시를 비활성화했습니다. | [4713ac2](https://github.com/fvgozak/ScoreVideo-Studio/commit/4713ac2) |
| MP4 | 직접 VideoEncoder 실험 경로, 인코더 큐·패킷 적체 제어, OPFS·인코더 진단 및 반복 출력 GPU 정리 작업을 통합했습니다. | [4713ac2](https://github.com/fvgozak/ScoreVideo-Studio/commit/4713ac2) |
| 화면·효과 | 팔레트 적용 범위, 오선·건반 색상, 싱글라인 악보 및 입자 효과 변경을 반영하고 한·영·일 언어팩을 갱신했습니다. | [4713ac2](https://github.com/fvgozak/ScoreVideo-Studio/commit/4713ac2) |

브라우저 저장소는 기기와 사이트 주소에 종속됩니다. 과거 브라우저 저장 형식을 새 저장소로 옮기는 작업은 이 변경에 포함되지 않았습니다. 프로젝트 파일 형식과 브라우저 저장소의 차이는 [데이터 명세](docs/PROJECT_SAVE_LOAD_DATA_SPEC.md)를 참고하세요.

## 2026-11-19 — Cloudflare 배포와 저장소 문서

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 브라우저 전용 빌드 | API 서버 없는 Cloudflare 빌드와 오선별 효과 연동을 추가했습니다. | [c45efce](https://github.com/fvgozak/ScoreVideo-Studio/commit/c45efce) |
| 저장소 정리 | 로컬 빌드·패치 산출물을 Git 추적에서 제외했습니다. | [2bc6f4d](https://github.com/fvgozak/ScoreVideo-Studio/commit/2bc6f4d) |
| 안내 문서 | 실행 경로와 README를 정리하고 이전 설명을 별도 문서로 옮겼습니다. | [90bae02](https://github.com/fvgozak/ScoreVideo-Studio/commit/90bae02) |

## 2026-11-18 — 브라우저 오디오와 작업공간 효과

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 브라우저·배포 | 브라우저 오디오 생성, Cloudflare 베타 경로와 언어팩을 추가했습니다. | [8749c26](https://github.com/fvgozak/ScoreVideo-Studio/commit/8749c26) |
| 작업공간 | 동적 피아노 효과와 관련 설정·화면을 통합했습니다. | [75a4ad7](https://github.com/fvgozak/ScoreVideo-Studio/commit/75a4ad7) |

## 2026-11-16 — GPU 효과와 4K 출력

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 빛 효과 | 발광 경계와 4K 악보 확대를 보정했습니다. | [9339fe6](https://github.com/fvgozak/ScoreVideo-Studio/commit/9339fe6) |
| 영상 출력 | Pixi 효과와 4K WebCodecs 출력을 통합했습니다. | [7b7a2c6](https://github.com/fvgozak/ScoreVideo-Studio/commit/7b7a2c6) |

## 2026-11-15 — 출력 무대와 악보 영역

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 악보 영역 | 상단 크롭 조절을 추가했습니다. | [94ac01d](https://github.com/fvgozak/ScoreVideo-Studio/commit/94ac01d) |
| 건반 | 미리보기와 건반 그림자 스프라이트를 공유하도록 했습니다. | [1a5334d](https://github.com/fvgozak/ScoreVideo-Studio/commit/1a5334d) |
| MP4 | 오프라인 MP4 출력과 최소화 시각화를 통합했습니다. | [a9d187c](https://github.com/fvgozak/ScoreVideo-Studio/commit/a9d187c) |

## 2026-11-13 — 악보·피아노 작업 흐름

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 편집·출력 | 악보와 피아노를 함께 편집·출력하는 흐름을 완성하고 MP4 렌더링을 개선했습니다. | [f7be3a7](https://github.com/fvgozak/ScoreVideo-Studio/commit/f7be3a7) |

## 2026-11-12 — 동기화된 낙하 음표와 건반

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 타이밍 | 악보와 피아노 시점을 따로 미세 조정하고 타건 발광을 공유했습니다. | [f54c698](https://github.com/fvgozak/ScoreVideo-Studio/commit/f54c698) |
| 레이어 | 낙하 음표보다 악보가 위에 보이도록 정리했습니다. | [3fdb38b](https://github.com/fvgozak/ScoreVideo-Studio/commit/3fdb38b) |
| 낙하 음표 | 무대 상단에서 내려오도록 시작 위치를 바꾸고 타건 빛을 다듬었습니다. | [2a493e4](https://github.com/fvgozak/ScoreVideo-Studio/commit/2a493e4) |
| 초기 무대 | 악보와 동기화된 낙하 음표·건반 발광을 추가했습니다. | [22d97c4](https://github.com/fvgozak/ScoreVideo-Studio/commit/22d97c4) |

## 2026-11-10 — 발광 범위

| 영역 | 반영 내용 | 커밋 |
| --- | --- | --- |
| 빛 효과 | 강도 범위를 400%까지 확장했습니다. | [c5d7b02](https://github.com/fvgozak/ScoreVideo-Studio/commit/c5d7b02) |
