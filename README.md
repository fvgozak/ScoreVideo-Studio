# ScoreVideo Studio v0.19.10 — Natural Note Light

## v0.19.10 음표 발광 원형 번짐 수정

공통 Bloom도 음표에 붙는 얕은 타원으로 바꾸고 흰색 중심과 강한 번짐을 줄였습니다. 궤적은 은은한 넓은 빛과 가는 중심선으로 표현하며 현재 손별 최고음 끝에만 작은 하이라이트를 둡니다.

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

- 악보 확대(55~145%, +/- 및 100% 복원)를 미리보기 위에 항상 보이는 퀵바로 이동. 값은 기존 zoom 설정을 그대로 사용해 미리보기와 MP4에 동일하게 적용.
- 디자인 탭 상단에 이미지 색상 추천 추가. 이미지 업로드/드래그 앤 드롭/현재 배경 사진으로부터 색 추출.
- 첨부된 `Hemio Image Studio`의 색 계열 분류·색 가중치·밝은 중성색 검출 알고리즘을 `image_palette.py`에 통합.
- Gallery Paper / Midnight / Soft Canvas / Vivid Contrast 4개 악보 디자인 추천. 음표와 악보 바탕 간 최소 대비 검사.
- 추천 디자인을 누르면 배경/오선/음표/강조/커서/발광/오른손·왼손 궤적/Aurora 색상이 한 번에 적용. 설정값은 기존 HEX 필드에서 개별 변경 가능.
- 필요할 때 이미지 자체도 프로젝트의 영상 배경으로 업로드 가능. 사진 없이 색만 추출하는 것도 가능.
- 이미지를 색상 분석할 때 외부 서버에 전송하지 않음 (로컬 `127.0.0.1` FastAPI 처리). 이미지 크기/형식 제한: 20 MB, 80 MP.
- 확인 방법: `PYTHONPATH=. pytest -q` 및 `for f in tests/*.js; do node "$f"; done`

# ScoreVideo Studio v0.16 — Studio UI & Expressive Preview

MusicXML + MIDI + original audio → synchronized local score video.

## v0.16 주요 변경

- **전체화면 미리보기:** 플레이어의 `⛶ 전체화면` 또는 `F` 키. `Esc`로 종료. 화면비 유지, 타임라인·재생 조작 유지. 전체화면과 악보 영역 편집 테두리는 MP4 출력에 포함되지 않습니다.
- **작업 공간 정리:** 왼쪽 설정을 `파일 / 악보 / 디자인 / 출력` 네 탭으로 정리하고 상세 항목을 접기 영역으로 배치했습니다.
- **미리보기에서 악보 편집:** `악보 영역 편집`을 켜고 드래그해 영역을 이동하거나 가장자리 핸들로 크기 변경. 선택한 값은 영상 설정과 공유됩니다.
- **Aurora 색상 반응:** `절대값 (MIDI 1~127)` 또는 `상대값 (곡 전체 최저~최고 벨로시티)` 전환. 곡 내 모든 음이 같은 값이면 중간색으로 표현하며 발광 세기 자체는 실제 벨로시티를 따릅니다.
- **이음줄(Tie) 후속 음표:** MusicXML tie stop을 앞 note-on과 연결해 지속 중인 소리의 발광 색을 이어받도록 처리합니다. 새로운 타건/입자는 만들지 않습니다. MIDI note-off 시간을 읽고 이어진 음의 지속을 결정합니다.
- **제목 기본값:** MusicXML 내부 제목과 관계없이 업로드한 파일명에서 확장자를 뺀 값을 사용합니다. 직접 수정한 프로젝트별 제목은 보존합니다.
- **기존 기능 유지:** MIDI 실제 시간축과 반복기호 전개, 악보 자동 스크롤, 효과·배경·폰트, Adaptive MP4 렌더러.

## 호환 및 검증

Python 및 Node.js 회귀 테스트: `PYTHONPATH=. pytest -q` 및 `for f in tests/*.js; do node "$f"; done`.
실제 OSMD 브라우저 렌더부터 완성 MP4까지의 통합 검증과 네이티브 전체화면 UI의 시각적 검증은 이 환경에서 완료하지 못했습니다.
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

Then visit `http://127.0.0.1:8765`, upload MusicXML, MIDI and the audio, and press **MP4로 내보내기**.

The app runs locally and never sends your files to an external API. Its first setup needs internet access to install dependencies / download the pinned OSMD bundle.

Existing v0.14 projects may be copied via `data/projects` into the same folder of this release. Do **not** copy a previous `.venv` across operating systems.

## Testing

```sh
PYTHONPATH=. pytest -q
for test in tests/*.js; do node "$test"; done
```

There is a real FFmpeg encoder + audio MP4 smoke test in `tests/test_render_adaptive.py`. **Full Playwright + real OSMD integration and acceleration on M1 Max could not be measured in the build environment**; the local machine will provide accurate per-project timings in the diagnostics JSON.

## Limits / notes

- GPU acceleration only helps the encode stage; if browser frame generation dominates, improvement can be modest. Capture selection is quality-aware; JPEG may be rejected for small/contrasty staves.
- Benchmark probes add a short startup cost for each export, especially if multiple GPU encoders are available. Hardware drivers must support the selected codec/resolution.
- Encoding rate is estimated from produced frames / wall-clock; the ETA may drift when scenes have more glowing notes or denser notation.
- Hardware H.264 uses a high bitrate rather than CRF; file sizes can differ across codecs. Preview and MP4 share the same ScoreStage, although lossy H.264 output can introduce small visual artifacts.
- This release does not yet replace all per-frame DOM effect updates with a full GPU compositor. That would be the larger next performance improvement if screenshots remain the bottleneck.
