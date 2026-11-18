# ScoreMotion Cloudflare 공개 베타 · 1차 구성

> 기준: 사용자가 2026-11-18에 올린 `scorevideo-studio-piano last.zip`.
> 이 배포본은 **Cloudflare만으로 완결되는 서버리스 앱이 아닙니다**. FastAPI는 별도 서버가 필요합니다.

## 변경 내용

- MIDI만 올리면 브라우저 `OfflineAudioContext`가 번들 Salamander MP3를 디코딩·리피치·합성하고 WAV를 로컬 Blob으로 보유합니다. **서버로 WAV를 다시 업로드하지 않습니다.**
- 재생 플레이어, WebM 녹화, 고속 오프라인 MP4 모두 해당 브라우저 WAV를 사용합니다.
- 브라우저 합성이 불가능하면 명시적으로 `/api/projects/{id}/audio/fallback`을 호출해 기존 Python 합성을 이용합니다.
- 호환 FFmpeg 렌더링을 사용하면 서버가 필요한 오디오를 **렌더 시작 시점에만** 생성합니다.
- 음원을 직접 올린 프로젝트와 기존 프로젝트는 원래 서버 오디오 경로를 유지합니다.
- Cloudflare Pages는 정적 파일과 28개 피아노 샘플을 제공하며, Pages Function은 `/api/*`만 FastAPI로 프록시합니다.
- `SCOREMOTION_PROXY_SECRET`을 설정하면 API와 `/render/*`는 비밀 헤더를 요구합니다. 내부 Playwright 렌더러는 서버에서 직접 해당 헤더를 전송합니다.

## 준비물

1. HTTPS로 접근 가능한 **별도 FastAPI 서버**와 영속 디스크. `data/projects/`는 휘발성 스토리지에 두면 안 됩니다.
2. Cloudflare Pages 프로젝트. `functions/`와 `dist/`를 함께 배포할 수 있는 Wrangler 또는 Git 기반 배포.
3. `SCOREMOTION_BACKEND_ORIGIN=https://your-api.example.com` (Pages 설정의 **텍스트 환경 변수**)
4. `SCOREMOTION_PROXY_SECRET` (Cloudflare Pages **Secret**과 FastAPI 환경 변수에 동일한 충분히 긴 랜덤 값)

## 배포

```bash
# Python 서버 (예시; 인터넷에 8765 포트를 평문으로 공개하지 말 것)
export SCOREMOTION_PROXY_SECRET='긴_무작위_비밀값'
uvicorn app:app --host 127.0.0.1 --port 8765
# 별도의 HTTPS 리버스 프록시나 안전한 터널로 your-api.example.com -> 127.0.0.1:8765 연결

# Cloudflare Pages (소스 프로젝트 루트에서)
python scripts/build_cloudflare_pages.py
# Pages 대시보드에 SCOREMOTION_BACKEND_ORIGIN 설정
npx wrangler pages secret put SCOREMOTION_PROXY_SECRET --project-name scoremotion
npx wrangler pages deploy dist --project-name scoremotion
```

Cloudflare 대시보드에서 ZIP을 **드래그 앤 드롭으로 업로드하면 `functions/` 폴더가 컴파일되지 않습니다.** 반드시 **Wrangler CLI 또는 Git 연동**으로 배포해야 합니다.

Cloudflare Pages Functions는 `functions/api/[[path]].js`를 자동 인식해야 합니다. `_routes.json`은 `/api/*`만 Function 호출을 발생시키고 나머지 정적 요청은 직접 처리합니다. 배포 환경에서 기능이 탐지되는지 Network 탭으로 확인하세요.

**프록시 비밀값은 브라우저에 노출하면 안 됩니다.** `.env`, JS 번들, 공개 저장소, HTML에 넣지 마세요. 서버의 직접 API 접속도 비밀 헤더 없이는 403을 반환합니다.

## 공개 범위 및 제약

- **현재 공개용 사용자 인증/프로젝트 소유권 검사가 없습니다.** UUID는 권한 관리가 아닙니다. 사용자 데이터를 신뢰할 수 있는 공개 상용 환경에는 그대로 배포하지 마세요.
- 프런트엔드 정적 요청은 부담이 작지만 `/api/*` 호출은 Workers 무료 할당량에 포함됩니다. **동접 100명 보장은 아닙니다.** Python CPU, 프로젝트 분석, 디스크, 네트워크가 실제 처리량을 결정합니다.
- Cloudflare 무료 플랜 업로드 요청은 통상 최대 100MB이며 이 프록시는 `Content-Length`가 90MiB를 넘는 요청을 거부합니다. MIDI(최대 20MiB) + MusicXML(최대 50MiB) + 음원의 합이 이 제한을 넘을 수 있습니다.
- `OfflineAudioContext` 합성은 **최대 10분** 제한을 유지하고, 긴 곡은 사용자 브라우저 RAM을 많이 사용합니다. 오디오 파일을 첨부하는 편이 안정적일 수 있습니다.
- 기존 서버 호환 FFmpeg 출력은 서버에서 처리되며 프로젝트 전체에서 **동시에 1건**만 진행됩니다.
- 인코더 지원이 없는 모바일·Safari 환경은 고속 MP4 대신 호환 렌더링을 사용해야 할 수 있습니다.
- 현재 `data/projects` 자동 만료/정리, 파일별 사용자 권한, IP 단위 작업 할당, Turnstile/레이트 리밋, 다중 인스턴스 작업 큐가 없습니다. **공개 베타 규모를 통제하고 이 항목들을 먼저 보완해야 합니다.**
- 사용자의 오디오 및 악보에 대한 이용 권한을 확인해야 합니다. 피아노 샘플 출처는 `/static/audio/salamander/NOTICE.txt`에 포함되어 있습니다.

## 수동 검증 체크리스트

1. 기존 오디오 포함 MusicXML+MIDI 프로젝트가 정상 재생·고속 MP4 출력되는가
2. MIDI만 올렸을 때 Python 서버에 `audio.wav` 없이도 프리뷰에서 피아노 소리가 나는가
3. MIDI만 올린 프로젝트로 고속 MP4 생성 후 결과 음성이 재생과 일치하는가
4. 새로고침 후 같은 프로젝트에서 다시 피아노를 만들고 음성이 나는가
5. 브라우저 합성 비지원 환경에서 `/audio/fallback`으로 전환되는가
6. 서버 호환 MP4도 `audio.wav`를 생성해 성공하는가
7. API Origin 비밀값 없이는 외부에서 `/api/projects` 접근 시 403이 나는가
8. Pages의 정적 파일(`/static/audio/salamander/A4.mp3`)은 Function을 호출하지 않는가

## 다음 단계

브라우저 MIDI 파싱 → MusicXML 반복·동기화 분석 → 프로젝트 저장/불러오기를 단계적으로 이전하면 Python 서버 의존성을 더 줄일 수 있습니다. 서비스 공개 이전에는 인증·소유권·정리 정책을 별도 작업으로 우선 구현하세요.
