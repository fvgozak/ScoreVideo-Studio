# ScoreMotion Studio

MusicXML 악보와 MIDI 연주를 동기화해 악보, 낙하 노트, 피아노 건반이 함께 움직이는 영상을 만드는 도구입니다. 음원과 배경 이미지는 선택 사항이며, 미리보기와 MP4 출력은 같은 무대 렌더링 코드를 사용합니다.

## 실행 방식

| 방식 | 프로젝트 저장 | 영상 출력 | 적합한 경우 |
| --- | --- | --- | --- |
| 로컬 앱 (FastAPI) | 컴퓨터의 `data/projects/` | 브라우저 WebCodecs 또는 Chromium·FFmpeg | 서버 렌더링과 기존 프로젝트가 필요한 경우 |
| 브라우저 전용 배포 (Cloudflare Pages) | 브라우저 OPFS·IndexedDB | 브라우저 WebCodecs | 별도 API 서버 없이 사용하는 경우 |

브라우저 전용 배포는 서버 FFmpeg 출력을 제공하지 않습니다. 브라우저 저장소를 지우거나 사이트 주소가 바뀌면 저장된 프로젝트에 접근할 수 없으므로 원본 파일을 보관하세요. 두 방식의 세부 차이는 [브라우저 전용 배포 안내](docs/CLOUDFLARE_CLIENT_ONLY.md)에 정리돼 있습니다.

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
python3 scripts/build_cloudflare_local.py
cd release-cloudflare-local
npx wrangler pages deploy dist --project-name scoremotion
```

배포는 반드시 생성된 `release-cloudflare-local/` 디렉터리에서 실행하세요. 저장소 루트에는 과거 FastAPI 프록시용 `functions/`가 있으며, 브라우저 전용 빌드에는 포함하지 않습니다. 배포 전 준비와 알려진 제한은 [Cloudflare Pages 안내](docs/CLOUDFLARE_CLIENT_ONLY.md)를 확인하세요.

## 사용 흐름

1. MIDI를 올립니다. MusicXML을 함께 올리면 악보와 연주를 정렬하고, MIDI만 올리면 건반 중심 영상을 만듭니다.
2. 음원이 없으면 번들된 Salamander 피아노 샘플로 소리를 만듭니다. 음원과 배경 이미지를 직접 지정할 수도 있습니다.
3. 악보 배치, 건반·낙하 노트, 색상·빛 효과, 카메라와 싱크를 조정한 뒤 미리보기를 확인합니다.
4. 지원 브라우저에서는 WebCodecs로 MP4를 출력합니다. 로컬 앱은 Chromium·FFmpeg 호환 출력도 제공합니다.

한국어·영어·일본어 UI를 제공하며, MusicXML의 이조 정보와 오선별 악보 발광색을 지원합니다. 브라우저 전용 버전의 복잡한 반복기호·자동 싱크와 지원 브라우저에는 [알려진 제한](docs/CLOUDFLARE_CLIENT_ONLY.md#알려진-제한안전성)이 있습니다.

## 저장소 구성

| 경로 | 내용 |
| --- | --- |
| `app.py`, `render_video.py` | 로컬 API와 서버 영상 출력 |
| `static/` | 공통 미리보기·영상 무대, 효과, 언어팩, 브라우저 저장소 |
| `scripts/build_cloudflare_local.py` | API 없는 Cloudflare Pages 배포본 생성 |
| `examples/` | 예제 목록과 MusicXML·MIDI 파일 |
| `tests/` | Python·JavaScript 회귀 및 렌더링 검증 |
| `docs/` | 배포 안내, 설계 기록, 이전 버전 기록 |

## 개발 점검

```sh
PYTHONPATH=. pytest -q
for test in tests/*.js tests/*.mjs; do node "$test"; done
```

브라우저 화면과 실제 MP4 픽셀 검증에는 별도 검증 스크립트와 브라우저 환경이 필요합니다. 관련 기록은 [QA 문서](docs/qa/README.md)와 [렌더 엔진 점검](docs/RENDER_ENGINE_AUDIT_v20.md)을 참고하세요.

## 문서

- [브라우저 전용 Cloudflare Pages](docs/CLOUDFLARE_CLIENT_ONLY.md)
- [FastAPI 프록시를 사용하는 이전 Cloudflare 구성](docs/CLOUDFLARE_BETA.md)
- [오선별 색상과 이조 악기](docs/STAFF_COLOR_TRANSPOSITION_V27.md)
- [다국어 관리](docs/I18N.md)
- [이전 버전 기록](docs/FEATURE_HISTORY.md)

Salamander 피아노 샘플과 번들 라이브러리의 저작권 고지는 각각 `static/audio/salamander/NOTICE.txt`와 해당 라이브러리의 LICENSE 파일에 있습니다.
