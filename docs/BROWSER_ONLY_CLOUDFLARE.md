# 브라우저에서만 실행하는 ScoreMotion

## 왜 브라우저 전용 버전을 만들었나

서버를 따로 켜지 않고도 작업할 수 있게 Cloudflare Pages용 빌드를 만들었다. Pages에는 HTML/CSS/JS와 샘플 파일만 올린다. MusicXML/MXL, MIDI, 음원은 브라우저에서 분석하고 IndexedDB에 저장한다. 이 빌드에서는 FastAPI 서버나 Cloudflare Tunnel, `SCOREMOTION_BACKEND_ORIGIN`, `SCOREMOTION_PROXY_SECRET`을 쓰지 않는다.

## 배포

```bash
# 프로젝트 최상단에서 한 번에 배포
sh scripts/deploy_pages_browser_only.sh
```

또는 단계별로 실행:

```bash
python3 scripts/build_pages_static.py
# 기존 프록시가 있으면 비활성화(안전하게 백업)
if [ -f 'functions/api/[[path]].js' ]; then
  mv 'functions/api/[[path]].js' 'functions/api/[[path]].js.disabled'
fi
npx wrangler pages deploy dist --project-name=scoremotion --branch=main
```

- HTTPS `.pages.dev`와 사용자 정의 도메인에서는 브라우저 모드가 자동으로 켜진다. 서버형 개발 배포를 열어야 할 때는 `?python-backend=1`을 붙인다.
- 로컬 FastAPI 서버(`localhost`, `127.0.0.1`)에서는 기존 Python API가 돌아간다. 정적 서버에서 브라우저 모드를 시험할 때는 `?browser-local=1`을 붙인다.
- 프로젝트는 서버로 보내지 않고 브라우저 IndexedDB에 저장한다. 저장공간을 지우면 프로젝트도 사라진다. 다른 PC나 브라우저로 자동 동기화되지 않는다.
- 파일 크기 제한은 MusicXML/MXL 50MB, MIDI 20MB, 음원 250MB다. 실제 저장 가능 용량과 음원 코덱은 브라우저에 따라 달라진다.

## 현재 지원

- MusicXML `.xml`, `.musicxml` 및 `.mxl` 파일의 클라이언트 압축 해제/검증
- MIDI note-on/off, 음길이, CC64 페달, 템포 변화 처리
- MusicXML↔MIDI 음표/타건 타임스탬프 매칭, 이음줄 후속 음표 처리
- 악보 정렬 자동 선택·V1·V2-A/B/C, 기존 프로젝트 재분석, 마디별 검토 정보. 재분석해도 원본 MIDI와 음원은 그대로 둔다.
- 표준 도돌이표/첫째·둘째 끝의 재생 순서 전개(매칭 개선 시에만 선택)
- MP3/WAV/M4A/FLAC/OGG 등 브라우저 지원 음원 사용
- 음원이 없는 MIDI는 미리보기에서 Salamander 샘플로 재생하고 출력할 때 오디오를 만든다(최대 10분, 최대 12,000음표; 긴 곡에는 충분한 브라우저 메모리가 필요하다).
- 배경 이미지 로컬 저장, 기본 테마 및 이미지 팔레트 추출, 효과 설정 저장
- 악보 음표의 멜로디 강조 베타(V1, 실험용 V2-A/B/C/D). 설정은 프로젝트 파일의 `extensions.melody_highlight`에 넣고 미리보기와 출력에 같이 쓴다.
- 브라우저 WebCodecs H.264/AAC MP4 출력(기존 엔진 유지)

## 작업하면서 확인한 제약

- 브라우저 음표 매칭은 Python 버전과 구현이 달라 복잡한 다성부나 루바토에서 결과가 다를 수 있다. 예제 Dream Journey에서는 V1이 악보 음표의 98.5%, 새 자동 모드가 98.9%를 연결했다. 이 숫자는 연결된 음표 수다. 실제 시점이 맞는지는 들어보고 확인해야 한다.
- 멜로디 강조는 자동 추정이다. 음표를 클릭해 직접 고치는 화면은 아직 없다.
- 복잡한 D.C./D.S./Coda는 지원하지 않아 경고를 띄운다.
- 자동 첫소리 싱크는 브라우저에서 단순 RMS 검출로 처리한다. Python 버전과 보정값이 다를 수 있다.
- 사진에서 색을 뽑는 결과도 Python 알고리즘과 조금 다르다.
- 브라우저에서는 서버의 `salience` 분석, FFmpeg 출력, API 렌더링을 쓰지 않는다. 멜로디 강조는 브라우저에서 따로 분석하고, 자동 카메라 제안은 기존 프런트엔드 알고리즘을 쓴다.
- 저장공간 부족, 시크릿 모드, 브라우저 저장소 정리로 프로젝트가 사라질 수 있다. 원본 악보·MIDI·음원은 따로 보관한다.

## 확인

1. 업로드 폼에서 MusicXML + MIDI + 오디오 불러오기
2. 악보/건반이 표시되고 재생되는지 확인
3. `⌘R`로 새로고침해 프로젝트가 복원되는지 확인
4. 배경 업로드 후 새로고침하여 유지되는지 확인
5. 전체 곡 MP4 출력 후 싱크 및 재생 상태 확인
6. Console `await fetch('/api/projects/00000000000000000000000000000000')`가 로컬 JSON 404를 반환하고 프록시 HTTP 503으로 가지 않는지 확인

## 핵심 구현

`static/local-project-codec.js`, `static/score-alignment-v2.js`: MIDI/MXL/MusicXML 파싱, 반복·음표 타이밍 매칭, 정렬 모드 분석

`static/local-projects.js`: IndexedDB 프로젝트/미디어, 클라이언트 API 라우터, 샘플 피아노 음원, 이미지 팔레트

`static/app.js`/`stage-runtime.js`/`score-core.js`: 기존 UI, WebGL, MP4를 유지하면서 로컬 blob 미디어 경로 사용

`static/melody-highlight.js`: 브라우저 로컬 멜로디 후보 분석과 미리보기·출력 공통 발광 설정
