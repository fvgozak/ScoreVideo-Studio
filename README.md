# ScoreMotion Studio

MusicXML 악보와 MIDI 연주를 동기화해 악보, 낙하 노트, 피아노 건반이 함께 움직이는 영상을 만드는 도구입니다. 음원과 배경 이미지는 선택 사항이며, 미리보기와 MP4 출력은 같은 무대 렌더링 코드를 사용합니다.

## 실행 방식

| 방식 | 프로젝트 저장 | 영상 출력 | 적합한 경우 |
| --- | --- | --- | --- |
| 로컬 앱 (FastAPI) | 컴퓨터의 `data/projects/` | 브라우저 WebCodecs 또는 Chromium·FFmpeg | 서버 렌더링과 기존 프로젝트가 필요한 경우 |
| 브라우저 전용 배포 (Cloudflare Pages) | 브라우저 IndexedDB | 브라우저 WebCodecs | 별도 API 서버 없이 사용하는 경우 |

브라우저 전용 배포는 서버 FFmpeg 출력을 제공하지 않습니다. 브라우저 저장소를 지우거나 사이트 주소가 바뀌면 저장된 프로젝트에 접근할 수 없으므로 원본 파일을 보관하세요. 두 방식의 세부 차이는 [브라우저 전용 배포 안내](docs/BROWSER_ONLY_CLOUDFLARE.md)에 정리돼 있습니다.

## 로컬 앱 시작

Python 3.11 이상과 FFmpeg·ffprobe가 필요합니다. 처음 실행할 때는 의존성과 Chromium을 설치하기 위해 인터넷 연결이 필요합니다.

```sh
# macOS
./run.command

# Linux
./run_linux.sh
```

Windows에서는 `run_windows.bat`을 실행합니다. 실행 후 `http://127.0.0.1:8765`를 엽니다. macOS에서 다른 포트를 사용하려면 `SCOREVIDEO_PORT=8767 ./run.command`를 실행하세요. 실행 스크립트는 프로젝트의 `.venv`를 준비하고 필요한 Python 패키지와 Playwright Chromium을 설치합니다.

## 브라우저 전용 빌드

```sh
python3 scripts/build_pages_static.py
# 생성된 dist/를 배포하려면:
npx wrangler pages deploy dist --project-name scoremotion --branch main
```

브라우저 전용 빌드에는 과거 FastAPI 프록시가 포함되지 않습니다. 기존 `scripts/build_cloudflare_local.py` 방식도 지원합니다. 현재 배포 스크립트와 알려진 제한은 [Cloudflare Pages 안내](docs/BROWSER_ONLY_CLOUDFLARE.md)를 확인하세요.

## 사용 흐름

1. MIDI를 올립니다. MusicXML을 함께 올리면 악보와 연주를 정렬하고, MIDI만 올리면 건반 중심 영상을 만듭니다. 브라우저 전용 모드에서는 자동·V1·V2-A/B/C 정렬을 선택하거나 기존 프로젝트를 재분석할 수 있습니다.
2. 음원이 없으면 미리보기는 Salamander 피아노 샘플을 실시간으로 재생하고, MP4 출력 시 필요한 오디오를 구간별로 생성합니다. 음원과 배경 이미지를 직접 지정할 수도 있습니다.
3. 악보 배치, 건반·낙하 노트, 색상·빛 효과, 카메라와 싱크를 조정한 뒤 미리보기를 확인합니다. 악보가 있으면 멜로디 강조 베타를 켜고 분석 방식과 발광 강도를 조절할 수 있습니다.
4. 지원 브라우저에서는 WebCodecs로 MP4를 출력합니다. 로컬 앱은 Chromium·FFmpeg 호환 출력도 제공합니다.

한국어·영어·일본어 UI를 제공하며, MusicXML의 이조 정보와 오선별 악보 발광색을 지원합니다. 브라우저 전용 버전의 복잡한 반복기호·자동 싱크와 지원 브라우저에는 [알려진 제한](docs/BROWSER_ONLY_CLOUDFLARE.md#주요-차이제약)이 있습니다.

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

브라우저 검증에는 Playwright Chromium이 필요합니다. 전체 회귀 검사와 실제 MP4 픽셀 검증의 범위는 [QA 문서](docs/qa/README.md)와 [렌더 엔진 점검](docs/RENDER_ENGINE_AUDIT_v20.md)을 참고하세요.

새 정렬·멜로디 기능의 검사와 결과 범위는 [변경 기록](CHANGELOG.md)에 정리했습니다.

## 문서

- [날짜별 변경 기록](CHANGELOG.md)
- [문서 전체 안내·과거 패치 기록](docs/INDEX.md)
- [브라우저 전용 Cloudflare Pages](docs/BROWSER_ONLY_CLOUDFLARE.md)

Salamander 피아노 샘플과 번들 라이브러리의 저작권 고지는 각각 `static/audio/salamander/NOTICE.txt`와 해당 라이브러리의 LICENSE 파일에 있습니다.
