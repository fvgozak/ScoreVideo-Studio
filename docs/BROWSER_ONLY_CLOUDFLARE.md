# ScoreMotion – Cloudflare Pages browser-only edition

## 목표

Cloudflare Pages는 HTML/CSS/JS와 샘플 파일만 배포합니다. MusicXML/MXL + MIDI + 오디오 파일은 사용자 브라우저에서 분석하고 IndexedDB에 보관합니다. 별도 FastAPI 서버, Cloudflare Tunnel, `SCOREMOTION_BACKEND_ORIGIN`, `SCOREMOTION_PROXY_SECRET`이 필요 없습니다.

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

- HTTPS `.pages.dev` 및 사용자 정의 도메인에서는 브라우저 모드가 자동으로 켜집니다. 필요 시 `?python-backend=1`로 서버형 개발 배포를 명시할 수 있습니다.
- 로컬 FastAPI 개발 서버(`localhost`, `127.0.0.1`)에서는 기존 Python API가 그대로 작동합니다. 정적 서버에서 테스트하려면 `?browser-local=1`을 주소 뒤에 붙여 사용하세요.
- 새 프로젝트 파일은 서버에 업로드하지 않습니다. 브라우저 IndexedDB에 저장됩니다. 브라우저 저장공간을 삭제하면 프로젝트가 사라집니다. 다른 PC/브라우저 간 자동 동기화는 없습니다.
- 파일 크기 제한: MusicXML/MXL 50MB, MIDI 20MB, 음원 250MB. 저장공간 한도 및 미디어 코덱 지원은 브라우저 환경에 따라 다릅니다.

## 현재 지원

- MusicXML `.xml`, `.musicxml` 및 `.mxl` 파일의 클라이언트 압축 해제/검증
- MIDI note-on/off, 음길이, CC64 페달, 템포 변화 처리
- MusicXML↔MIDI 음표/타건 타임스탬프 매칭, 이음줄 후속 음표 처리
- 악보 정렬 자동 선택·V1·V2-A/B/C, 기존 프로젝트 재분석 및 마디별 검토 정보. 재분석은 원본 MIDI·음원을 바꾸지 않습니다.
- 표준 도돌이표/첫째·둘째 끝의 재생 순서 전개(매칭 개선 시에만 선택)
- MP3/WAV/M4A/FLAC/OGG 등 브라우저 지원 음원 사용
- 음원 미첨부 MIDI는 Salamander 샘플을 실시간 미리보기에 사용하고, 출력 시 필요한 오디오를 생성합니다(최대 10분, 최대 12,000음표; 긴 곡 출력에는 충분한 브라우저 메모리 필요).
- 배경 이미지 로컬 저장, 기본 테마 및 이미지 팔레트 추출, 효과 설정 저장
- 악보 음표의 멜로디 강조 베타(V1, 실험적 V2-A/B/C/D). 설정은 프로젝트 파일의 `extensions.melody_highlight`에 저장하고 미리보기·출력에 함께 적용합니다.
- 브라우저 WebCodecs H.264/AAC MP4 출력(기존 엔진 유지)

## 주요 차이/제약

- 음표 매칭 로직은 Python 버전과 동일한 구현이 아니므로 복잡한 다성부·일부 루바토에서 결과가 다를 수 있습니다. 예제 Dream Journey에서 기존 V1은 악보 음표 98.5%, 새 자동 모드는 98.9%를 연결했습니다. 이 비율은 연결된 음표 수이며 각 연결의 음악적 정확도를 뜻하지 않습니다.
- 멜로디 강조 결과는 자동 추정입니다. 음표별 수동 교정 UI는 아직 제공하지 않습니다.
- 복잡한 D.C./D.S./Coda는 안전하게 미지원 경고를 띄웁니다.
- 자동 첫소리 싱크는 브라우저 단순 RMS 검출로 동작하므로 Python 버전과 보정값이 다를 수 있습니다.
- 브라우저의 사진 팔레트 분석 결과는 Python의 원래 알고리즘과 약간 다릅니다.
- 서버의 `salience` 분석, FFmpeg 호환 출력 및 API 기반 백엔드 렌더링은 브라우저 모드에서 사용하지 않습니다. 멜로디 강조 베타는 별도의 브라우저 로컬 추정 알고리즘입니다. 자동 카메라 제안은 기존 프런트엔드 알고리즘을 유지합니다.
- 브라우저 저장공간 부족/시크릿 모드/저장소 정리로 데이터가 사라질 수 있으므로 원본 악보·MIDI·음원은 별도로 보관하세요.

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
