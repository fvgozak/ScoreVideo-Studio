# ScoreMotion Studio

내가 작곡한 음악의 영상을 더 편하게 만들려고 ScoreMotion을 시작했다. MusicXML과 MIDI를 맞춰 악보, 낙하 노트, 건반을 한 화면에 담는다. 음원과 배경 이미지는 선택해서 넣을 수 있고, 미리보기와 MP4 출력에는 같은 무대 렌더링 코드를 쓴다.

## 실행 방식

| 방식 | 프로젝트 저장 | 영상 출력 | 적합한 경우 |
| --- | --- | --- | --- |
| 로컬 앱 (FastAPI) | 컴퓨터의 `data/projects/` | 브라우저 WebCodecs 또는 Chromium·FFmpeg | 서버 렌더링과 기존 프로젝트가 필요한 경우 |
| 브라우저 전용 배포 (Cloudflare Pages) | 브라우저 IndexedDB | 브라우저 WebCodecs | 별도 API 서버 없이 사용하는 경우 |

브라우저 전용 버전에서는 서버 FFmpeg 출력을 쓸 수 없다. 프로젝트도 현재 브라우저와 사이트 주소에 묶인다. 저장소를 지우거나 주소가 바뀔 때를 대비해 원본 파일과 `.scoremotion` 파일을 따로 보관하는 편이 좋다. 두 실행 방식의 차이는 [브라우저 전용 배포 안내](docs/BROWSER_ONLY_CLOUDFLARE.md)에 적었다.

## 로컬 앱 시작

Python 3.11 이상과 FFmpeg·ffprobe가 필요하다. 첫 실행 때는 의존성과 Chromium을 내려받으므로 인터넷 연결도 필요하다.

```sh
# macOS
./run.command

# Linux
./run_linux.sh
```

Windows에서는 `run_windows.bat`을 실행한다. 준비가 끝나면 `http://127.0.0.1:8765`를 열면 된다. macOS에서 포트를 바꾸려면 `SCOREVIDEO_PORT=8767 ./run.command`처럼 실행한다. 실행 스크립트가 `.venv`, Python 패키지, Playwright Chromium을 준비한다.

## 브라우저 전용 빌드

```sh
python3 scripts/build_pages_static.py
# 생성된 dist/를 배포하려면:
npx wrangler pages deploy dist --project-name scoremotion --branch main
```

이 빌드에는 예전 FastAPI 프록시가 들어가지 않는다. `scripts/build_cloudflare_local.py` 방식은 별도로 남겨 뒀다. 배포 절차와 제약은 [Cloudflare Pages 안내](docs/BROWSER_ONLY_CLOUDFLARE.md)에 적었다.

## 사용 흐름

1. MIDI를 올린다. MusicXML도 넣으면 악보와 연주를 맞춘다. MIDI만 넣으면 건반 중심 영상이 된다. 브라우저 전용 모드에서는 정렬 방식(자동·V1·V2-A/B/C)을 고르거나 기존 프로젝트를 다시 분석할 수 있다.
2. 음원이 없으면 미리보기에서는 Salamander 피아노 샘플을 실시간으로 재생한다. MP4를 만들 때 필요한 오디오는 구간별로 생성한다. 직접 준비한 음원과 배경 이미지도 넣을 수 있다.
3. 악보 배치, 건반·낙하 노트, 빛 효과, 카메라와 싱크를 조정하며 미리보기를 확인한다. 색상 참고 이미지를 넣으면 대표 색과 악보 디자인 네 가지를 고를 수 있다. 선택한 색은 프로젝트 파일에도 저장된다. 악보가 있다면 멜로디 강조 베타의 분석 방식과 발광 강도도 조절할 수 있다.
4. 지원 브라우저에서는 WebCodecs로 MP4를 만든다. 로컬 앱에서는 Chromium·FFmpeg 출력도 쓸 수 있다.

화면은 한국어·영어·일본어를 지원한다. MusicXML의 이조 정보와 오선별 발광색도 읽는다. 복잡한 반복기호, 자동 싱크, 브라우저 지원 범위는 [알려진 제한](docs/BROWSER_ONLY_CLOUDFLARE.md#작업하면서-확인한-제약)을 확인하면 된다.

## 저장소 구성

| 경로 | 내용 |
| --- | --- |
| `app.py`, `render_video.py` | 로컬 API와 서버 영상 출력 |
| `static/` | 공통 미리보기·영상 무대, 효과, 언어팩, 브라우저 저장소 |
| `scripts/build_pages_static.py` | API 없는 Cloudflare Pages 정적 배포본 생성 |
| `examples/` | 예제 목록과 MusicXML·MIDI 파일 |
| `tests/` | Python·JavaScript 회귀 및 렌더링 검증 |
| `docs/` | 배포 안내, 설계 기록, 이전 버전 기록 |

## 개발 점검

```sh
.venv/bin/python -m pytest -q tests/test_browser_local_store.py
node tests/test_realtime_salamander.mjs
node tests/test_parallel_audio_pipeline.mjs
.venv/bin/python tests/validate_local_mp4_audio_browser.py
```

브라우저 검사는 Playwright Chromium으로 돌린다. 전체 회귀 검사와 MP4 픽셀 확인 범위는 [QA 문서](docs/qa/README.md)와 [렌더 엔진 점검](docs/RENDER_ENGINE_AUDIT_v20.md)에 남겼다.

새 정렬·멜로디 기능에서 확인한 내용은 [변경 기록](CHANGELOG.md)에 적었다.

## 문서

- [날짜별 변경 기록](CHANGELOG.md)
- [멜로디 강조 연구 참고 자료와 구현 범위](docs/MELODY_RESEARCH_REFERENCES.md)
- [문서 전체 안내·과거 패치 기록](docs/INDEX.md)
- [브라우저 전용 Cloudflare Pages](docs/BROWSER_ONLY_CLOUDFLARE.md)

Salamander 피아노 샘플의 저작권 고지는 `static/audio/salamander/NOTICE.txt`에, 번들 라이브러리 고지는 각 LICENSE 파일에 있다.
