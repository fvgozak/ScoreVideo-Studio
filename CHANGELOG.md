# 변경 기록

ScoreMotion을 만들면서 바꾼 내용을 커밋 날짜순으로 남긴다. 표의 링크를 누르면 그때 실제로 바뀐 코드를 볼 수 있다. 지금 쓰는 방법과 제약은 [README](README.md)와 [브라우저 전용 안내](docs/BROWSER_ONLY_CLOUDFLARE.md)에 적었다.

예전 README에 있던 버전별 설명은 [기능 이력](docs/FEATURE_HISTORY.md)에 남겼다. 초기 v1–v15 작업 메모는 [패치 기록](docs/PATCH_HISTORY_V1_V15.md)으로 따로 묶었다. 그 번호는 이 저장소의 릴리스 번호가 아니다.

## 이 기록을 읽는 방법

| 자료 | 무엇을 확인할 수 있나 | 읽을 때 주의할 점 |
| --- | --- | --- |
| 이 변경 기록 | `main`에 넣은 주요 커밋 | 각 날짜의 코드와 문서 변경을 커밋 링크로 확인할 수 있다. |
| [이전 기능 이력](docs/FEATURE_HISTORY.md) | 옛 README의 v0.16–v0.19 설명 | 당시 기능 설명이다. 지금 사용법은 README를 본다. |
| [초기 패치 v1–v15](docs/PATCH_HISTORY_V1_V15.md) | 초기 작업 메모와 당시 측정 | 패치 순서이며 Git 릴리스 번호가 아니다. |

브라우저 전용 버전의 프로젝트는 그 기기·사이트의 IndexedDB에 저장된다. `.scoremotion` 파일로 내보내거나 다시 열 수 있고, `project.json`의 `schema_version`은 1이다. 로컬 서버 버전과의 차이는 [README](README.md)에 적었다. 아래 측정값은 해당 곡과 환경에서 확인한 결과다.

## 2026-11-28 — 악보 곡선 편집, 낙하 노트, MP4 시작 검사

악보 편집에서 빠졌던 일부 글자와 곡선 기호를 더 다룰 수 있게 했다. 낙하 노트는 화면 위쪽 경계에서 내려오기 시작하게 맞췄고, 브라우저 MP4는 시작 버튼을 누를 때 현재 설정으로 인코더 지원 여부를 다시 확인한다.

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 악보 편집 | 원본 악보의 음표·마디 정보로 연결되는 슬러, 타이, 크레셴도·디미누엔도 선의 이동·곡률 조절을 넣었다. 놓쳤던 일반 텍스트도 식별할 수 있는 경우에만 편집 대상으로 잡는다. 여러 기호의 가장자리·중심 정렬과 균등 간격 배치를 추가하고, 잘림 경고는 실제 악보 범위를 기준으로 계산한다. | [e6f5cf0](https://github.com/fvgozak/ScoreVideo-Studio/commit/e6f5cf0) |
| 악보 그리기 효과 | 그리기 효과를 켠 프로젝트에서도 편집하는 동안 전체 악보를 잠시 보여준다. 편집을 끝내거나 재생·출력하면 원래 효과로 돌아간다. 출력 합성기의 악보 캐시도 편집 상태에 맞춰 갱신한다. | [e6f5cf0](https://github.com/fvgozak/ScoreVideo-Studio/commit/e6f5cf0) |
| 낙하 노트 | 화면 비율·카메라 기울기·확대·세로 위치에 따라 보이는 화면 상단을 계산해 낙하 시작점을 맞춘다. 상승 노트의 기존 속도와 이동 범위는 유지했다. | [e6f5cf0](https://github.com/fvgozak/ScoreVideo-Studio/commit/e6f5cf0) |
| 브라우저 MP4 | 백그라운드 지원 확인이 실패했어도 시작 버튼에서 현재 해상도·FPS·비트레이트를 다시 검사한다. 검사 실패 시 이유를 출력 탭에 남기고 다시 시도할 수 있게 했다. 로컬 서버의 호환 출력 경로는 유지했다. | [e6f5cf0](https://github.com/fvgozak/ScoreVideo-Studio/commit/e6f5cf0) |
| 저장소 | 이전 `light_bounce` 패치 묶음과 작업 백업을 로컬에 남기되 Git 추적에서는 제외했다. | [e6f5cf0](https://github.com/fvgozak/ScoreVideo-Studio/commit/e6f5cf0) |

확인한 것: 낙하 경계 2,592개 조합, MP4 지원 확인·재시도·취소, 기존 악보 저장·GPU 합성·프로젝트 ZIP 검사가 통과했다. Chromium에서 작은 예제의 악보 그리기 중 편집 전환을 확인했고, Dream Journey에서는 편집 대상 58개 중 타이 8개가 잡혔다. 타이 곡률 변경은 SVG 경로와 저장 상태에 반영됐다. 한국어·영어·일본어 문구와 Cloudflare Pages 빌드도 확인했다. 전곡 MP4 출력과 모든 곡선 종류의 화면상 조작은 이번에 다시 확인하지 않았다.

## 2026-11-27 — 악보 기호 편집과 해상도별 확대

악보에 표시된 글자와 기호를 영상 화면에서 직접 옮기거나 숨길 수 있게 했다. 출력 해상도를 바꿔도 편집 중 보던 악보 확대가 갑자기 달라지지 않도록 미리보기 기준 크기도 따로 저장한다.

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 악보 편집 | 나타냄말·템포·셈여림표·악기 이름·마디 번호·운지·페달 기호 중 악보 원본과 정확히 연결되는 요소를 선택해 이동, 크기 조절, 숨김·복원한다. 글자 편집, 정렬, 검색, 실행 취소도 넣었다. 연결이 모호한 기호는 편집 대상에서 뺐다. | [3529028](https://github.com/fvgozak/ScoreVideo-Studio/commit/3529028) |
| 저장·출력 | 기호별 수정값을 `extensions.score_editor`에 저장하고 미리보기와 출력 악보에 적용한다. `.scoremotion`을 다시 열 때 MusicXML 머리말이 정리돼도 같은 악보로 확인된 경우에만 편집값을 연결한다. `schema_version`은 1 그대로다. | [3529028](https://github.com/fvgozak/ScoreVideo-Studio/commit/3529028) |
| 확대·화면 | 프로젝트의 미리보기 기준 크기를 출력 화질과 분리했다. 화질을 바꾸거나 내보내기 화면을 준비해도 악보 확대 기준을 유지한다. 쓰지 않는 확대 초기화 버튼은 화면에서 숨기고 기존 확대 조작은 남겼다. | [3529028](https://github.com/fvgozak/ScoreVideo-Studio/commit/3529028) |
| 언어 | 악보 편집 화면의 문구를 한국어·영어·일본어에 추가했다. 로컬 서버에서 URL로 읽은 악보도 편집 대상과 연결되도록 했다. | [3529028](https://github.com/fvgozak/ScoreVideo-Studio/commit/3529028) |

확인한 것: 새 프로젝트 ZIP·MusicXML 식별·해상도 검사와 기존 악보·GPU 합성·프로젝트 저장 회귀 검사가 통과했다. Chromium에서 예제 악보의 편집 대상 네 개를 찾았고, 브라우저 전용 모드와 로컬 서버 모드 모두에서 편집값이 프로젝트 상태와 출력 설정에 들어가는 것을 확인했다. 세 언어의 편집 문구 50개도 맞춰 확인했고 Cloudflare Pages 빌드가 통과했다. 이번에는 전곡 MP4를 다시 출력하거나 악보 편집 전후의 출력 픽셀을 비교하지 않았다.

## 2026-11-27 — BIT 픽셀아트 모드

악보와 건반이 있는 무대 전체를 픽셀아트로 볼 수 있게 상단에 BIT 스위치를 넣었다. 픽셀 크기를 바꿔 미리보고, 출력할 때도 같은 최종 화면 효과를 쓴다.

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 미리보기·출력 | 무대 합성 결과에 픽셀 효과를 적용한다. 전환 중에는 픽셀 크기가 부드럽게 바뀌고, 출력에는 선택한 크기를 고정해서 쓴다. 편집 화면 자체에는 효과를 씌우지 않는다. | [0c5c3e8](https://github.com/fvgozak/ScoreVideo-Studio/commit/0c5c3e8) |
| 프로젝트 저장 | BIT 켜짐 상태와 픽셀 크기를 `extensions.bit_mode`에 저장·복원한다. 기존 프로젝트는 기본값으로 열리며 `schema_version`은 1 그대로다. | [0c5c3e8](https://github.com/fvgozak/ScoreVideo-Studio/commit/0c5c3e8) |
| 출력 중 정리 | 출력이 시작되면 BIT 미리보기를 멈추고, 출력 합성기를 닫을 때 사용한 리소스를 해제한다. 로컬 서버 MP4 경로에서 BIT를 켠 채 출력하려 하면 브라우저 MP4 경로를 안내한다. | [0c5c3e8](https://github.com/fvgozak/ScoreVideo-Studio/commit/0c5c3e8) |

확인한 것: BIT 상태의 프로젝트 ZIP 왕복, JavaScript 구문, Cloudflare Pages 빌드가 통과했다. Chromium 브라우저 전용 모드에서 BIT 켜기·끄기, 픽셀 크기 변경, 출력 합성기 한 프레임(1920×1080, Canvas 경로)을 확인했다. 이번 확인에는 전곡 MP4 출력과 WebGL 경로의 시각 비교를 넣지 않았다.

## 2026-11-27 — 이미지 색상과 프로젝트별 팔레트

이미지를 넣었는데 추천 색이 사진의 실제 색과 멀어지는 경우가 있었다. 사진에서 대표 색을 다시 고르고, 추천 디자인을 적용한 뒤 다른 프로젝트를 열어도 이전 색이 섞이지 않게 했다.

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 색상 추출 | 이미지 픽셀을 OKLab 공간에서 묶어 대표 색 다섯 개를 고른다. 그 색으로 대비를 확인한 악보 디자인 네 가지를 만든다. 선명한 디자인의 건반 빛은 눈부시지 않게 조정했다. | [eb32fe5](https://github.com/fvgozak/ScoreVideo-Studio/commit/eb32fe5) |
| 프로젝트 색상 | 악보와 건반의 그라데이션을 선택한 이미지 색에 맞춘다. 팔레트는 프로젝트마다 따로 두고 `extensions.palette_snapshot`에 저장해 `.scoremotion` 파일을 다시 열어도 복원한다. `schema_version`은 1을 유지했다. | [eb32fe5](https://github.com/fvgozak/ScoreVideo-Studio/commit/eb32fe5) |
| 화면 | 배경 이미지를 먼저 고르고, 별도의 색상 참고 이미지는 펼침 영역에서 넣게 했다. 색상 안내 문구를 한국어·영어·일본어에 맞췄다. | [eb32fe5](https://github.com/fvgozak/ScoreVideo-Studio/commit/eb32fe5) |
| 회귀 검사 | 새 색상 추출·프로젝트 복원 검사를 넣고, 수동 투명도 보존과 현재 모듈 로딩 방식에 맞게 이전 검사를 고쳤다. | [eb32fe5](https://github.com/fvgozak/ScoreVideo-Studio/commit/eb32fe5) |

확인한 것: 새 색상 계산·건반 밝기·프로젝트 ZIP 검사, 기존 팔레트·건반·아카이브 검사, 브라우저 저장 검사가 통과했다. Chromium에서 테마 디자인을 적용한 뒤 저장·새로고침 복원을 확인했고, 예제 표지 이미지에서는 대표 색 다섯 개와 디자인 네 가지가 생성됐다. Cloudflare Pages 정적 빌드도 통과했다. 이번 변경으로 전곡 MP4를 다시 출력하지는 않았다.

## 2026-11-27 — MP4 합성기의 빛 효과와 레이어 정리

미리보기에서 보이는 악보의 빛이 MP4 합성 과정에서 흐려지거나 빠질 수 있어 합성 경로를 다시 손봤다. 음표마다 색이 달라도 같은 모양은 한 번 만든 마스크를 재사용하게 했다.

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 음표 발광 | 악보 음표 머리 모양을 흰색 마스크로 만들고, 실제 색은 스프라이트에 입힌다. 위치가 다른 같은 모양은 마스크를 공유하고 흐림 반경만 단계별로 구분한다. | [8f2f330](https://github.com/fvgozak/ScoreVideo-Studio/commit/8f2f330) |
| 합성 순서 | 배경 분위기 빛, 건반, 악보, 커서, Pixi 악보 발광, 무대 효과, 제목 순서를 미리보기와 맞췄다. Pixi 발광은 2D 미러를 거쳐 합성해 WebGL 캔버스 전달 문제를 피한다. | [8f2f330](https://github.com/fvgozak/ScoreVideo-Studio/commit/8f2f330) |
| 캐시·정리 | 음표 마스크와 커서·제목 효과 캐시에 용량·항목 제한을 두고 출력이 끝나면 전용 스프라이트와 텍스처를 정리한다. 진단값도 출력 기록에 남긴다. | [8f2f330](https://github.com/fvgozak/ScoreVideo-Studio/commit/8f2f330) |

확인한 것: 새 합성기 검사에서는 12,000프레임 동안 음표 마스크 72,002회 요청에 디코딩 6회였다. 기존 GPU 정리·건반 출력·MP4 진단 검사도 통과했다. Chromium에서 예제 악보 15개 음표가 있는 무대를 한 프레임 합성했고, 음표 마스크와 Pixi 발광 미러 경로를 확인했다. Cloudflare Pages 빌드도 통과했다. 이번 확인에는 전곡 MP4 출력과 미리보기·출력 픽셀 비교를 넣지 않았다. 자세한 범위는 [QA 기록](docs/qa/GPU_COMPOSER_PARITY_2026-11-27.md)에 남겼다.

## 2026-11-26 — 브라우저 악보 정렬과 멜로디 강조 베타

악보와 MIDI가 같은 곡이어도 장식음이나 루바토가 들어가면 타건 시점이 어긋났다. 기존 정렬을 남겨 두고 다른 방식들을 나란히 시험할 수 있게 했다. 멜로디 강조는 모든 음표가 같은 강도로 빛날 때 선율이 묻히는 문제에서 시작했다.

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 악보·MIDI 정렬 | V1을 남겨 두고 박자 기반 V2-A, 실연 MIDI를 위한 V2-B, 느린 아르페지오까지 보는 V2-C를 넣었다. 자동 선택도 붙였다. 원본 MIDI 타이밍은 건드리지 않는다. 분석이 한계에 걸리거나 Worker가 실패하면 V1 결과와 검토 경고를 보여준다. | [6ba5a00](https://github.com/fvgozak/ScoreVideo-Studio/commit/6ba5a00) |
| 프로젝트 작업 | 브라우저에서 정렬 방식을 고르고 기존 프로젝트를 다시 분석할 수 있게 했다. 재분석할 때 음원·MIDI·선택된 악보 파일은 그대로 두고 정렬 결과만 갱신한다. 확인이 필요한 마디도 보여준다. | [6ba5a00](https://github.com/fvgozak/ScoreVideo-Studio/commit/6ba5a00) |
| 멜로디 강조 | MusicXML·MIDI 음표를 브라우저에서 분석하는 V1과 실험용 V2-A/B/C/D를 넣었다. 설정은 프로젝트의 `extensions.melody_highlight`에 저장하고 미리보기와 영상 출력에 같이 쓴다. 음표별 수동 교정 화면은 아직 없다. | [6ba5a00](https://github.com/fvgozak/ScoreVideo-Studio/commit/6ba5a00) |
| 화면·언어 | 멜로디 효과 패널을 넣으면서 기존 Score FX와 오선 색상 설정의 위치를 바로잡았다. 정렬 화면 문구는 한국어·영어·일본어로 추가했다. | [6ba5a00](https://github.com/fvgozak/ScoreVideo-Studio/commit/6ba5a00) |
| 이전 기록 | 날짜별 기록의 범위와 초기 항목 형식을 맞추고 빠진 커밋 링크를 채웠다. | [17d90b6](https://github.com/fvgozak/ScoreVideo-Studio/commit/17d90b6) |

확인한 것: 새 정렬·멜로디 JavaScript 검사 11개, 브라우저 저장·정렬 Python 검사 7개, 출력 프레임·GPU 정리 검사, JavaScript 구문 검사와 Cloudflare Pages 빌드가 통과했다. 예제 Dream Journey에서는 자동 정렬이 악보 음표 1,559개 중 1,542개를 연결했다. 연결 개수만으로 각 음표의 시점이 음악적으로 맞는지 알 수는 없다. 멜로디 V2 결과도 곡마다 미리보며 확인해야 한다.

멜로디 알고리즘은 선율 추출, 음악인지, 정보량과 반복, 그래프 경로, 성부 분리 논문을 읽으며 만들었다. [읽은 논문과 코드](docs/MELODY_RESEARCH_REFERENCES.md)를 나란히 정리했다. 악보↔MIDI 정렬 V2는 이 멜로디 분석과 별개의 작업이다.

## 2026-11-24 — 실시간 미리보기와 브라우저 MP4 오디오

MIDI 프로젝트를 열 때 전곡 음원을 먼저 만들면 기다리는 시간이 길었다. 미리보기에서는 필요한 음을 바로 재생하고, 영상 출력에서는 오디오를 나눠 만드는 쪽으로 바꿨다.

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 미리보기 | 음원 없는 MIDI를 Salamander 샘플로 바로 재생하게 했다. 재생 위치·일시정지·이동을 미리보기 시계에 맞췄고, 실시간 재생이 실패하면 WAV 경로를 쓴다. | [29d9dcf](https://github.com/fvgozak/ScoreVideo-Studio/commit/29d9dcf) |
| MP4 | 생성 음원을 짧은 PCM 구간으로 만들고 영상과 동시에 AAC 인코더로 보낸다. 업로드한 음원은 기존 디코딩 경로를 쓴다. | [29d9dcf](https://github.com/fvgozak/ScoreVideo-Studio/commit/29d9dcf) |
| 프로젝트 준비 | MIDI 프로젝트를 열 때 전곡 WAV 합성을 기다리지 않게 했다. 디코딩한 Salamander 샘플은 크기를 제한해 캐시에 둔다. | [38cacda](https://github.com/fvgozak/ScoreVideo-Studio/commit/38cacda) |
| 악보 표시 | 악보를 숨겼을 때 남던 발광 캔버스와 GPU 명령도 같이 정리한다. | [38cacda](https://github.com/fvgozak/ScoreVideo-Studio/commit/38cacda) |
| 오선별 색상 | 건반의 오선별 색상 연동을 켰다면 Random 색상보다 먼저 적용한다. 미리보기와 출력은 같은 모듈 버전을 쓴다. | [544a806](https://github.com/fvgozak/ScoreVideo-Studio/commit/544a806) |
| 브라우저 MP4 음원 | 예전 오디오 URL이 없는 브라우저 프로젝트에서도 `/api/projects/:id/audio` 경로로 음원을 읽게 했다. | [544a806](https://github.com/fvgozak/ScoreVideo-Studio/commit/544a806) |
| 문서 | 날짜별 변경 기록과 초기 v1–v15 작업 메모를 나누고 문서 안내를 정리했다. | [2e4a2e4](https://github.com/fvgozak/ScoreVideo-Studio/commit/2e4a2e4) |

확인한 것: 실시간 재생과 병렬 오디오 검사, Chromium의 IndexedDB·음원 디코딩 검사, 짧은 MIDI로 만든 1920×1080 MP4(42프레임·AAC 패킷 168개). 긴 곡은 모의 인코딩까지만 확인했다.

## 2026-11-23 — 브라우저 전용 프로젝트와 출력 정리

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 브라우저 프로젝트 | MusicXML·MIDI 분석부터 IndexedDB 저장, 파일 교체·복원, `.scoremotion` 저장·열기까지 브라우저 안에서 연결했다. `project.json`의 `schema_version`은 1로 뒀다. | [4713ac2](https://github.com/fvgozak/ScoreVideo-Studio/commit/4713ac2) |
| 배포 | Cloudflare Pages용 정적 빌드와 안내를 넣고 예전 API 프록시를 껐다. | [4713ac2](https://github.com/fvgozak/ScoreVideo-Studio/commit/4713ac2) |
| MP4 | 직접 VideoEncoder 실험 경로, 인코더 큐·패킷 적체 제어, OPFS 진단, 반복 출력 후 GPU 정리를 한 번에 묶었다. | [4713ac2](https://github.com/fvgozak/ScoreVideo-Studio/commit/4713ac2) |
| 화면·효과 | 팔레트, 오선·건반 색상, 싱글라인 악보, 입자 효과를 손보고 한국어·영어·일본어 문구를 갱신했다. | [4713ac2](https://github.com/fvgozak/ScoreVideo-Studio/commit/4713ac2) |

브라우저 프로젝트는 기기와 사이트 주소에 묶인다. 예전 브라우저 저장 형식을 새 저장소로 옮기는 코드는 이때 넣지 않았다. 프로젝트 파일과 브라우저 저장소의 차이는 [데이터 명세](docs/PROJECT_SAVE_LOAD_DATA_SPEC.md)에 적었다.

## 2026-11-19 — Cloudflare 배포와 저장소 문서

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 브라우저 전용 빌드 | API 서버 없이 돌아가는 Cloudflare 빌드와 오선별 효과 연동을 넣었다. | [c45efce](https://github.com/fvgozak/ScoreVideo-Studio/commit/c45efce) |
| 저장소 정리 | 로컬 빌드와 패치 산출물을 Git 추적에서 뺐다. | [2bc6f4d](https://github.com/fvgozak/ScoreVideo-Studio/commit/2bc6f4d) |
| 안내 문서 | 실행 방법과 README를 다시 쓰고 예전 설명을 별도 문서에 옮겼다. | [90bae02](https://github.com/fvgozak/ScoreVideo-Studio/commit/90bae02) |

## 2026-11-18 — 브라우저 오디오와 작업공간 효과

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 브라우저·배포 | 브라우저 오디오 생성, Cloudflare 베타 경로와 언어팩을 넣었다. | [8749c26](https://github.com/fvgozak/ScoreVideo-Studio/commit/8749c26) |
| 작업공간 | 동적 피아노 효과와 설정 화면을 합쳤다. | [75a4ad7](https://github.com/fvgozak/ScoreVideo-Studio/commit/75a4ad7) |

## 2026-11-16 — GPU 효과와 4K 출력

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 빛 효과 | 발광 경계와 4K 악보 확대를 보정했다. | [9339fe6](https://github.com/fvgozak/ScoreVideo-Studio/commit/9339fe6) |
| 영상 출력 | Pixi 효과와 4K WebCodecs 출력을 합쳤다. | [7b7a2c6](https://github.com/fvgozak/ScoreVideo-Studio/commit/7b7a2c6) |

## 2026-11-15 — 출력 무대와 악보 영역

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 악보 영역 | 악보 위쪽을 크롭하는 조절값을 넣었다. | [94ac01d](https://github.com/fvgozak/ScoreVideo-Studio/commit/94ac01d) |
| 건반 | 미리보기와 출력에서 건반 그림자 스프라이트를 함께 쓰게 했다. | [1a5334d](https://github.com/fvgozak/ScoreVideo-Studio/commit/1a5334d) |
| MP4 | 오프라인 MP4 출력과 최소화 시각화를 합쳤다. | [a9d187c](https://github.com/fvgozak/ScoreVideo-Studio/commit/a9d187c) |

## 2026-11-13 — 악보·피아노 작업 흐름

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 편집·출력 | 악보와 피아노를 함께 편집하고 출력하는 흐름을 만들고 MP4 렌더링을 손봤다. | [f7be3a7](https://github.com/fvgozak/ScoreVideo-Studio/commit/f7be3a7) |

## 2026-11-12 — 동기화된 낙하 음표와 건반

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 타이밍 | 악보와 피아노의 시점을 따로 미세 조정하고 타건 발광은 함께 쓰게 했다. | [f54c698](https://github.com/fvgozak/ScoreVideo-Studio/commit/f54c698) |
| 레이어 | 낙하 음표보다 악보가 위에 보이게 순서를 바꿨다. | [3fdb38b](https://github.com/fvgozak/ScoreVideo-Studio/commit/3fdb38b) |
| 낙하 음표 | 음표가 무대 상단에서 내려오게 시작 위치를 바꾸고 타건 빛을 손봤다. | [2a493e4](https://github.com/fvgozak/ScoreVideo-Studio/commit/2a493e4) |
| 초기 무대 | 악보에 맞춰 낙하 음표와 건반이 빛나는 무대를 넣었다. | [22d97c4](https://github.com/fvgozak/ScoreVideo-Studio/commit/22d97c4) |

## 2026-11-10 — 발광 범위

| 영역 | 바꾼 내용 | 커밋 |
| --- | --- | --- |
| 빛 효과 | 강도 범위를 400%까지 늘렸다. | [c5d7b02](https://github.com/fvgozak/ScoreVideo-Studio/commit/c5d7b02) |
