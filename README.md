# ScoreVideo Studio — Piano Fall Integration

ScoreVideo-Studio의 기존 악보 렌더러에 MIDI 기반 88건반·낙하 노트 바·타건 발광 레이어를 추가했습니다. 악보 음표와 건반 타건 빛은 같은 bloom·beam·반사광·입자 렌더 함수를 사용하며, 동일한 MIDI→오디오 시간 보정 및 색상 반응(Aurora/고정색)을 따릅니다. 미리보기와 MP4 렌더 페이지는 같은 `ScoreStage`를 사용합니다.

낙하 바는 영상 화면의 맨 위(y=0)에서 진입해 MIDI 타건 순간 건반에 닿습니다. 건반 발광은 이전 ScoreMotion/Lumenote 스타일의 타건 플래시, 좁은 빛줄기, 건반 반사광, 결정적 작은 입자를 사용합니다. 같은 시각으로 이동하면 미리보기와 프레임 렌더가 같은 빛을 그립니다.

미리보기 아래 **레이어 표시**에서 악보와 건반·낙하 노트를 각각 켜고 끌 수 있습니다. 표시 여부와 관계없이 악보는 항상 건반 위 레이어입니다. 디자인 탭의 **피아노 낙하 노트 · 악보/건반 빛**에서 건반 색상(자동·어둡게·클래식·직접 선택)과 악보/건반 타건 빛의 표시·강도를 각각 조절할 수 있습니다. 자동 건반 색상은 악보 바탕색이 어두울 때 건반도 차분하게 바꿉니다. 악보 표시 영역 기본 높이는 피아노 공간을 확보하도록 50%이며, 기존에 저장된 영상 설정은 그대로 유지됩니다.

미리보기의 **미세 조정**에는 악보↔소리와 건반↔소리 조절값이 따로 있으며, 슬라이더 또는 숫자 입력으로 0.01초 단위까지 조절할 수 있습니다. 자동 싱크는 두 레이어의 공통 기준이며, 각각의 수동 값은 그 위에 독립적으로 더해집니다. 건반의 타건 플래시·잔광·작은 입자 모션은 악보 음표에도 적용되며, 공유 기둥을 가진 화음은 각 음표 머리에 별도로 빛이 붙습니다. 각 레이어는 보정된 자신의 타건 시점에 반응합니다.

악보 영역은 미리보기의 **악보 영역 편집**에서 직접 끌어 옮기거나, 악보 탭의 상세 가로 위치 값으로 정밀 조정합니다. 악보 탭의 **악보 내용 위치 X/Y** 슬라이더는 영역 자체를 바꾸지 않고 안쪽의 악보를 두 방향으로 움직이며, 페이지·싱글라인 레이아웃 모두에서 작동합니다. 새 프로젝트의 위쪽 여백 기본값은 4%이며, 기존 프로젝트의 큰 여백도 미리보기 아래 **위 여백 4%** 버튼으로 즉시 줄일 수 있습니다. 같은 줄의 **악보 영역 배경색 ↗** 버튼은 해당 색상 설정으로 바로 이동합니다.

빠른 확인: macOS에서는 `./run.command`, Linux에서는 `./run_linux.sh`, Windows에서는 `run_windows.bat`으로 실행한 뒤 파일 탭의 **Dream Journey 예제 바로 체험하기**를 누르세요. 실행 스크립트가 프로젝트의 `.venv`에 Playwright와 Chromium을 설치하고 그 환경에서 서버를 시작합니다. 직접 실행할 때는 `uvicorn` 단독 명령 대신 `.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8765`를 사용하세요. 이미 다른 방식으로 띄운 서버가 있다면 먼저 종료해야 합니다.

MIDI 업로드는 필수입니다. MusicXML을 함께 올리면 실제 MIDI 연주에 맞춰 악보와 건반을 보여주고, MIDI만 올리면 악보 레이어·편집 오버레이를 완전히 숨긴 건반 전용 영상을 만듭니다. MusicXML 단독 업로드는 지원하지 않습니다. 음원을 올리지 않으면 번들된 Salamander Grand Piano 경량 샘플로 MIDI 오디오를 합성하고, 오디오를 올리면 그 음원을 사용합니다. 세로 영상에서는 앞 5초에 재생될 음의 최저·최고 피치를 계산해 양쪽 3건반의 여유를 둔 구도를 부드럽게 따라갑니다. 카메라가 가까워지면 건반 폭·높이와 낙하 노트 폭·길이가 함께 커지고 보이는 노트 수가 줄어듭니다. 멀어지면 반대로 작아지고 더 많은 음이 보입니다. 가로 영상은 기존 88건반을 유지합니다. 피아노 샘플은 전체 SFZ가 아닌 28개 압축 샘플의 피치 변환 버전이며, 저작자·라이선스는 `static/audio/salamander/NOTICE.txt`에 표기했습니다.

Playwright가 웹 서버의 Python에 없더라도 프로젝트 `.venv`에 있으면 MP4 작업을 해당 환경으로 위임합니다. `.venv` 자체가 없다면 실행 스크립트로 설치하세요. 실제 MIDI 단독 10초 MP4(H.264/AAC) 출력과 XML·MIDI 단독 브라우저 미리보기를 검증했습니다.

## 음악적 중요도 분석 API

기존 화면과 렌더러는 변경하지 않고, 음표별 특징·중요도·강조 강도를 계산하는 분석 엔진을 추가했습니다. `GET /api/projects/{id}/salience?density=0.15`는 기본 가중치 결과를 반환합니다. `POST /api/projects/{id}/salience/reweight`에 `{"weights":{"pattern_surprise":0.3},"enabled":{"absolute_velocity":false},"density":0.05}`를 보내면 저장된 특징을 재사용해 점수만 다시 계산합니다. 0.15는 상위 약 15%에 강조를 집중한다는 뜻이며, 점수가 모두 비슷하면 기본 강도만 유지합니다. 반환값에는 음표 ID, 각 특징 점수, `salience_score`, `highlight_intensity`, 곡 전체 음역 통계가 포함됩니다. MIDI 단독 프로젝트에서는 악보 음가 특징을 자동 제외합니다. 첫 분석은 프로젝트 안 `salience-features.json`에 캐시되고 입력 파일 변경 시 다시 계산됩니다.

## 기존 버전 기록

# ScoreVideo Studio v0.19.12 — Expanded Light Strength

## v0.19.12 빛 효과 강도 400%까지 확장

디자인 탭의 빛 강도 슬라이더를 200%에서 400%까지 확장하고, 렌더러가 확장된 값을 그대로 적용하도록 상한을 함께 조정했습니다.

## v0.19.11 음표 머리 빛 강조

커다란 원형 오라와 확산 링을 제거하고, 실제 음표 머리에만 작은 발광을 붙입니다. 얇은 잔상과 소량의 입자는 유지합니다.

## v0.19.8 카메라 포인트 클릭 영역 표시 수정

음표 포인트 선택용 클릭 영역이 선택 모드가 아닐 때 검은 원으로 나타나던 문제를 수정했습니다. 클릭 영역은 기본적으로 투명하고 비활성화하며, 포인트 선택을 켰을 때만 클릭을 받습니다.

## v0.19.7 포인트 구간 카메라 경로

- 가까운 음표 포인트를 하나의 카메라 샷으로 묶고, 음표 포커스와 줌을 단조 Hermite 경로로 연결합니다. 샷마다 시작 시점·도착·유지·Follow 복귀 구간을 두어 포인트별 급격한 재줌을 줄입니다. 포인트별 시작 시점 조절과 기존 Follow, Cinematic, Follow + Impact 모드는 유지합니다.

## v0.18.5 마지막 음표 그리기 표시 보정

- 마지막 MIDI 타격 뒤에는 다음 커서 위치가 없어 마지막 오선 시스템의 음표 머리·기둥·끝 기호 일부가 가려질 수 있던 문제를 수정했습니다. 마지막 타격 시 마지막 시스템의 그리기를 완료합니다.

## v0.18.4 영상 설정 저장 · Named Video Presets

- 출력 탭에서 곡별 영상 설정을 이름 붙여 저장하고 다시 불러올 수 있습니다. YouTube·Shorts용 화면비와 해상도, 악보 배치, 디자인 색상, 카메라·빛, 제목, 싱크 미세 조정값을 함께 저장합니다.
- 다른 곡에 적용된 설정을 불러오면 연결된 곡과 프로젝트 배경 이미지도 함께 엽니다. 저장 프리셋은 현재 브라우저의 로컬 저장소에 보관됩니다.

## v0.18.3 악보 그리기 애니메이션 · 한국어/English

- 디자인 탭의 `악보 그리기 애니메이션`을 켜면 오선은 처음부터 계속 보이고, 음표·기둥·빔·쉼표·rit./a tempo 같은 악보 객체는 재생 커서가 도달할 때 드러납니다. 줄 경계는 커서가 실제 놓인 오선으로 판별합니다. 미리보기와 MP4는 같은 재생 시각 기반 로직을 사용합니다.
- 오른손·왼손 빛 궤적은 짧은 간격으로 함께 울리는 화음에서 각 손의 가장 높은 음을 따라가며, 안쪽 성부나 낮은 음으로 갑자기 꺾이지 않습니다.
- 상단 언어 메뉴에서 한국어와 영어를 바꿀 수 있고, 선택은 브라우저에 저장됩니다.

## v0.17.4 컴팩트 동기화 바

- 자동 동기화와 악보 확대를 미리보기 상단의 한 줄 바로 통합했습니다. 매칭률과 싱크 보정값은 짧은 상태 표시로 보여주며, 자세한 내용은 상태에 마우스를 올리면 확인할 수 있습니다.
- ±5초 수동 미세 조정과 자동 싱크 초기화는 `미세 조정` 드롭다운을 열어 사용할 수 있습니다.

## v0.17.3 Dream Journey 예제

- 파일 탭의 `Dream Journey 예제 바로 체험하기` 버튼으로 MusicXML·MIDI·MP3를 한 번에 불러오고 커버 이미지를 영상 배경으로 적용합니다.
- 예제 원본은 `examples/dream-journey/`에 포함되어 있습니다. 악보·음원·MIDI는 공개 데모 목적으로 포함했으며, 커버 크레딧은 이미지에 표기된 Lim Hyeon Jun입니다.

## v0.17.2 화면 배경 및 동기화 조작 개선

- 이미지 분석 패널의 체크박스를 켜면 선택한 그림을 즉시 영상 배경으로 저장하고 미리보기에 적용합니다. 같은 파일명으로 바꿔도 캐시된 이전 이미지가 남지 않도록 배경 버전을 URL에 포함합니다.
- 배경 그림 선택, 투명도, 맞춤, 위치 조절을 `디자인` 탭의 `영상 배경` 패널로 이동했습니다.
- 자동 싱크, 악보↔MIDI 매칭 정보, ±5초 수동 조정을 악보 확대 컨트롤 바로 아래 오른쪽 미리보기 영역에 배치했습니다.

## v0.17.1 동기화 수정

- 50ms 이내로 펼쳐 연주된 MIDI 화음을 악보 정렬용 단일 타격으로 묶습니다. 반복되는 음형에서 정렬 기준점이 다음 마디로 건너뛰던 현상을 줄였습니다.
- 개별 MIDI 노트의 실제 타격 시각과 세기는 그대로 유지하므로 발광·음표 효과에는 원래 연주 타이밍을 사용합니다.

## v0.17 새로운 기능

- 악보 확대(55~200%, +/- 및 100% 복원)를 미리보기 위에 항상 보이는 퀵바로 이동. 값은 기존 zoom 설정을 그대로 사용해 미리보기와 MP4에 동일하게 적용.
- 악보 탭의 **악보 기보 스타일**에서 클래식·모던·재즈 카피스트 느낌·손사보 스케치를 선택할 수 있습니다. 현재 OSMD/VexFlow 버전에서 음악 글꼴 파일 자체를 교체하는 것은 지원되지 않아 SVG 음표 머리·기둥·기호의 획을 조정하는 스타일 프리셋으로 구현했습니다. 이 설정은 저장 프리셋, 미리보기, MP4에 공통 적용됩니다.
- 디자인 탭의 **Interactive View**에서 프레이즈 시작·화성·강세·음역 변화를 기준으로 간격을 둔 자동 음표 포인트를 생성합니다. 기존 수동 포인트는 유지하고 이전 자동 제안만 갱신합니다. 자동 포인트를 직접 조정하면 수동 포인트로 전환되며, 기존 카메라 경로 엔진을 통해 미리보기와 MP4에 똑같이 적용됩니다.
- 디자인 탭 맨 위의 카드에서 앨범 커버·사진의 색상만 추출하고 악보 디자인을 추천받습니다. 영상 배경은 아래의 별도 선택기로 지정하거나, 필요하면 색상 추출용 이미지를 배경으로 지정할 수 있습니다. A 이미지의 색상을 쓰면서 B 이미지를 배경으로 둘 수 있으며, 배경 제거는 추천 색상·디자인을 지우지 않습니다.
- 첨부된 `Hemio Image Studio`의 색 계열 분류·색 가중치·밝은 중성색 검출 알고리즘을 `image_palette.py`에 통합.
- Gallery Paper / Midnight / Soft Canvas / Vivid Contrast 4개 악보 디자인 추천. 음표와 악보 바탕 간 최소 대비 검사.
- 추천 디자인을 누르면 배경/오선/음표/강조/커서/발광/오른손·왼손 궤적/Aurora 색상이 한 번에 적용. 설정값은 기존 HEX 필드에서 개별 변경 가능.
- MIDI 프로젝트를 만들기 전에 배경 이미지를 골라도 보관했다가 프로젝트 생성 시 적용합니다. 색상 추출 이미지는 선택만으로 배경에 자동 적용되지 않습니다.
- 이미지를 색상 분석할 때 외부 서버에 전송하지 않음 (로컬 `127.0.0.1` FastAPI 처리). 이미지 크기/형식 제한: 20 MB, 80 MP.
- 확인 방법: `PYTHONPATH=. pytest -q` 및 `for f in tests/*.js; do node "$f"; done`

# ScoreVideo Studio v0.16 — Studio UI & Expressive Preview

MusicXML + MIDI + original audio → synchronized local score video.

## v0.16 주요 변경

- **전체화면 미리보기:** 플레이어의 `⛶ 전체화면` 또는 `F` 키. `Esc`로 종료. 화면비 유지, 타임라인·재생 조작 유지. 전체화면과 악보 영역 편집 테두리는 MP4 출력에 포함되지 않습니다.
- **작업 공간 정리:** 왼쪽 설정을 `파일 / 악보 / 디자인 / 출력` 네 탭으로 정리하고 상세 항목을 접기 영역으로 배치했습니다.
- **미리보기에서 악보 편집:** `악보 영역 편집`을 켜고 드래그해 영역을 이동하거나 가장자리 핸들로 크기 변경. 선택한 값은 영상 설정과 공유됩니다.
- **Aurora 색상 반응:** `절대값 (MIDI 1~127)` 또는 `상대값 (곡 전체 최저~최고 벨로시티)` 전환. 곡 내 모든 음이 같은 값이면 중간색으로 표현하며 화면에 강약 차이가 없다는 안내를 표시합니다. 발광 세기는 실제 벨로시티를 따릅니다. 음높이는 별도로 빛의 형태를 바꿔 저음은 넓게, 고음은 작고 선명하게 빛납니다.
- **이음줄(Tie) 후속 음표:** MusicXML tie stop을 앞 note-on과 연결해 지속 중인 소리의 발광 색을 이어받도록 처리합니다. 새로운 타건/입자는 만들지 않습니다. MIDI note-off 시간을 읽고 이어진 음의 지속을 결정합니다.
- **제목 기본값:** MusicXML 내부 제목과 관계없이 업로드한 파일명에서 확장자를 뺀 값을 사용합니다. 직접 수정한 프로젝트별 제목은 보존합니다.
- **기존 기능 유지:** MIDI 실제 시간축과 반복기호 전개, 악보 자동 스크롤, 효과·배경·폰트, Adaptive MP4 렌더러.

## 호환 및 검증

Python 및 Node.js 회귀 테스트: `PYTHONPATH=. pytest -q` 및 `for f in tests/*.js; do node "$f"; done`.
악보+MIDI 및 MIDI 단독 업로드와 브라우저 미리보기, MIDI 단독 MP4 출력을 로컬 Chromium으로 검증했습니다. 네이티브 전체화면 UI는 별도로 검증하지 않았습니다.
기존 프로젝트를 가져올 때는 이전 버전의 `data/projects` 내용을 이 버전의 같은 폴더로 복사하면 됩니다.



## What's new

- **Auto renderer (default)** profiles PNG/JPEG-96 capture with actual score frames. JPEG is selected only if it is materially faster and below conservative measured difference thresholds; otherwise it preserves lossless PNG capture.
- Detects FFmpeg encoders and **tests real frame encoding**, not just advertised codec names. macOS: VideoToolbox; Windows: NVENC/QSV/AMF; Linux: NVENC/QSV/VAAPI (with accessible `/dev/dri/renderD128`). CPU `libx264` remains the universal fallback (and `mpeg4` if x264 is absent).
- Measures actual short encoding workload at requested resolution, selecting a working encoder. If a selected hardware encoder later fails during export, the project is rendered again using software.
- Records an export report as `data/projects/<project-id>/render-diagnostics.json` and exposes it at `/api/projects/<id>/render-diagnostics`.
- Displays encoder, capture format, average frames/sec and approximate ETA during export.
- Export screenshots now use the renderer's full browser viewport instead of repeated element locator stabilization. Notehead geometry and horizontal score dimensions are cached after MusicXML layout to reduce repeated browser layout queries.
- All frame times still use `time = frame_number / fps`. This preserves score/MIDI/audio synchronization, repeat handling and the preview/export scene engine.

## Modes

- **Auto** (recommended): speed/quality comparison on the actual host.
- **High quality**: use PNG captures and prefer `libx264` when available.
- **Speed first**: use JPEG-96 captures and choose a measured fast encoder.

## Start

**macOS:** `chmod +x run.command && ./run.command`

**Linux:** `chmod +x run_linux.sh && ./run_linux.sh`

**Windows:** Run `run_windows.bat` (FFmpeg and Python 3.11+ must be on PATH).

Then visit `http://127.0.0.1:8765`, upload MIDI (optionally with MusicXML and audio), and press **MP4로 내보내기**.

The app runs locally and never sends your files to an external API. Its first setup needs internet access to install dependencies / download the pinned OSMD bundle.

Existing v0.14 projects may be copied via `data/projects` into the same folder of this release. Do **not** copy a previous `.venv` across operating systems.

## Testing

```sh
PYTHONPATH=. pytest -q
for test in tests/*.js; do node "$test"; done
```

There is a real FFmpeg encoder + audio MP4 smoke test in `tests/test_render_adaptive.py`. A MIDI-only Playwright + H.264/AAC export was also verified locally; machine-specific acceleration is recorded in each project's diagnostics JSON.

## Limits / notes

- GPU acceleration only helps the encode stage; if browser frame generation dominates, improvement can be modest. Capture selection is quality-aware; JPEG may be rejected for small/contrasty staves.
- Benchmark probes add a short startup cost for each export, especially if multiple GPU encoders are available. Hardware drivers must support the selected codec/resolution.
- Encoding rate is estimated from produced frames / wall-clock; the ETA may drift when scenes have more glowing notes or denser notation.
- Hardware H.264 uses a high bitrate rather than CRF; file sizes can differ across codecs. Preview and MP4 share the same ScoreStage, although lossy H.264 output can introduce small visual artifacts.
- This release does not yet replace all per-frame DOM effect updates with a full GPU compositor. That would be the larger next performance improvement if screenshots remain the bottleneck.
