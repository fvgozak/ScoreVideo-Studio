# ScoreMotion — Cloudflare Pages / 완전 브라우저 처리 v26

> **공개용 배포 패키지에는 Python 서버, Pages Functions, Workers API가 필요하지 않습니다.**
> 이 배포는 기존 Mac FastAPI 실행을 변경하지 않습니다.

## 구성과 데이터 흐름

- 웹앱 소스, WebGL 모듈, OSMD, Salamander 28종 샘플: **Cloudflare Pages 정적 파일**로 배포
- MIDI(타건, 리트랙션, 템포맵, 서스테인 페달): `static/local-midi.js`에서 처리
- MusicXML/MXL 분석 및 악보-연주 정렬: `static/local-musicxml.js`에서 처리
- 사용자 이미지 색상 추출: `static/local-palette.js`에서 처리
- 프로젝트 파일: **브라우저 OPFS**의 `scoremotion-projects/{uuid}/`
- 설정·프로젝트 목록 메타데이터: **브라우저 IndexedDB**의 `scoremotion-client-projects-v1`
- 악보/건반/빛: 기존 OSMD + WebGL 엔진 공유
- 기본 오디오: 기존 Salamander `OfflineAudioContext` 오프라인 합성
- 영상: 기존 WebCodecs H.264 + AAC 고속 MP4 (브라우저 로컬 생성)

**업로드한 MusicXML, MIDI, 음원, 이미지 및 출력 영상은 서버로 전송되지 않습니다.** 기존 API처럼 보이는 `/api/projects/...` 요청은 공개 모드에서 `ScoreLocalProjects.request()`로 라우팅되어 브라우저 저장소에서 응답합니다. 지원하지 않는 API는 서버로 보내지 않고 오류 처리합니다.

## 배포 방법

```bash
# 소스 루트에서
python3 scripts/build_cloudflare_local.py

# !!! 이 디렉터리에서 실행해야 과거 functions/ 프록시가 함께 배포되지 않습니다.
cd release-cloudflare-local
npx wrangler pages deploy dist --project-name scoremotion
```

아니면 배포용 ZIP의 `dist/` 폴더만 별도 프로젝트로 사용하세요. **절대 기존 Python `app.py`를 Cloudflare Workers에 복사하지 마세요.** 프록시용 `SCOREMOTION_BACKEND_ORIGIN`, `SCOREMOTION_PROXY_SECRET` 등 환경 변수가 필요하지 않습니다.

## 공개용에서 구현된 기능

- MIDI 필수, MusicXML/압축 MXL 선택, 오디오 선택, 배경 이미지 선택
- MusicXML↔MIDI 시퀀스 정렬과 1단계 기본 되돌이표 지원
- 브라우저 음원 생성 및 기존 영상 미리보기/고속 MP4
- 앨범 이미지 색 추출 및 기본 테마
- IndexedDB/OPFS 자동 로컬 저장 및 마지막 프로젝트 복원
- 기본 설정 및 Interactive View 카메라 포인트는 기존 `localStorage` 키 사용
- 현재 프로젝트 영구 삭제 버튼, 영구 저장 요청 버튼
- 기존 언어팩(ko/en/ja) 연동

## 알려진 제한/안전성

1. 브라우저가 WebCodecs(H.264/AAC), OPFS, IndexedDB, WebGL, AudioContext를 지원해야 합니다. 특히 4K·60fps는 각 기기 성능과 인코더 지원에 종속됩니다.
2. **서버 FFmpeg 호환 MP4 옵션은 공개용에서 제공하지 않습니다.** 브라우저 고속 MP4를 지원하지 않는 장치에서는 출력이 제한됩니다. Mac 로컬 Python 실행은 기존 FFmpeg 경로를 유지합니다.
3. 복잡한 MusicXML 반복(1·2번 엔딩, D.C., D.S., Coda, Fine) 및 불규칙한 악보는 기존 Python 구현과 완전 동등하지 않습니다. 자동 전개 불가 경고 및 낮은 매칭률을 표시합니다. 해당 곡은 영상/싱크를 확인해 주세요.
4. 자동 싱크는 브라우저 오디오의 첫 에너지 검출을 사용한 **근사치**입니다. 기존 Python의 상세 정렬 기능과 동일하지 않으므로 미세 조정이 필요할 수 있습니다.
5. OPFS/IndexedDB는 **브라우저 프로필과 사이트 출처별 저장소**입니다. 동일한 컴퓨터라도 다른 브라우저, 다른 도메인에서 자동 공유되지 않습니다. 브라우저 데이터 삭제나 저장 공간 정리로 소실될 수 있습니다. ZIP 프로젝트 백업/일괄 렌더는 아직 구현 전입니다.
6. 언어팩 3종은 유지하지만, 복잡한 백엔드 오류 메시지를 대체한 새 안내문은 일부 한국어로 출력될 수 있습니다.
7. 이 패치는 Python·JS 파서와 가상 스토리지 테스트를 통과했지만, 테스트 실행 환경에서 실제 호스트 주소 접근이 차단돼 **실제 OPFS 디스크 영속성, 전체 UI 및 MP4 종단간**은 Mac 브라우저에서 최종 검증해야 합니다.
8. 기존 Python/하이브리드 동작은 유지합니다. **공개용 빌드에서만** `window.SCOREMOTION_LOCAL_ONLY=true`가 사용됩니다.

## 빠른 사용 점검 (Chrome/Edge on Mac)

1. 공개용 빌드를 열고 브라우저 개발자도구 → Network를 엽니다.
2. MIDI + MusicXML을 선택해 프로젝트를 생성합니다. **`POST /api/projects` 요청이 없어야 합니다.**
3. 오디오가 자동 생성되는지 듣고, 배경 이미지를 넣은 뒤 새로고침해 복구되는지 확인합니다.
4. Chrome → Application → IndexedDB/Storage에서 `scoremotion-client-projects-v1` 및 OPFS 저장을 확인합니다.
5. 720p/30fps 고속 MP4를 출력하고 음원과 영상 타이밍을 확인합니다.
6. 임의의 큰 악보, MXL, 되돌이표 곡, 9:16 출력으로 추가 회귀 테스트합니다.

## 롤백

기존 Python FastAPI 실행에는 변경 사항이 적용되지 않으므로 이전 버전으로 돌아갈 수 있습니다. Cloudflare Pages의 배포 이력에서 이전 빌드로 되돌려도 **OPFS/IndexedDB는 그대로 남지만, 스키마가 바뀌면 호환성 점검이 필요합니다.**

## 라이선스 및 저작권

Salamander Grand Piano 샘플 출처/CC BY 3.0 안내를 `static/audio/salamander/NOTICE.txt`에 유지했습니다. 공개 페이지에서 저작권 표시를 삭제하지 마세요.
