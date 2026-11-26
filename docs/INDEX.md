# 문서 안내

처음 보는 경우 [README](../README.md)에서 실행 방법을 확인하고, `main`에 실제 반영된 변경과 커밋은 [변경 기록](../CHANGELOG.md)을 보세요. 아래 문서는 목적에 따라 묶었습니다. 과거 패치 문서는 당시 구현·실험 기록이며 현재 기본 동작과 다를 수 있습니다.

## 현재 사용 안내

| 문서 | 용도 |
| --- | --- |
| [Cloudflare Pages 브라우저 전용 배포](BROWSER_ONLY_CLOUDFLARE.md) | 정적 빌드, 브라우저 저장소, 지원 범위와 제한 |
| [한·영·일 언어팩 관리](I18N.md) | 번역 키와 언어팩 관리 |
| [QA 기록](qa/README.md) | 미리보기·출력 및 화면 검증 문서 목록 |

## 프로젝트 데이터와 렌더링 설계

| 문서 | 용도 |
| --- | --- |
| [프로젝트 저장·불러오기 데이터 명세](PROJECT_SAVE_LOAD_DATA_SPEC.md) | `.scoremotion` 형식과 상태 구조의 설계 초안 |
| [데이터 명세 v3.2 보충](PROJECT_SAVE_LOAD_V3_2_ADDENDUM.md) | 선택 음원·파일명·MusicXML DTD에 관한 추가 규칙 |
| [렌더 엔진 감사 v20](RENDER_ENGINE_AUDIT_v20.md) | 렌더링 경로·정리 대상 검토 |
| [오선 색상·이조 악기 v27](STAFF_COLOR_TRANSPOSITION_V27.md) | 악보 파트, 오선 색상, MIDI 연결 기록 |
| [멜로디 강조 연구 참고 자료](MELODY_RESEARCH_REFERENCES.md) | V1·V2-A/B/C/D 설계에 참고한 논문과 현재 코드의 차이 |

## MP4 성능·진단 기록

다음 문서는 순차적으로 작성된 패치·실험 설명입니다. 최신 사용법 대신 원인 분석과 당시 선택의 근거로 읽으세요.

| 주제 | 문서 |
| --- | --- |
| 인코더 큐·적체 | [큐 개선](MP4_ENCODER_QUEUE_PATCH.md), [패킷 적체 보호](ENCODER_BACKLOG_FIX.md) |
| 인코더·저장 I/O | [OPFS 진단](MP4_IO_DIAGNOSTICS.md), [마무리 단계·하드웨어 진단](MP4_STAGE_AND_HARDWARE_PATCH.md) |
| 인코더 실험 | [직접 VideoEncoder A/B](MP4_DIRECT_ENCODER_AB_TEST.md) |
| GPU 정리 | [반복 출력 GPU 정리](REPEATED_EXPORT_GPU_CLEANUP.md) |

## 과거 구성과 패치 이력

| 문서 | 범위 |
| --- | --- |
| [이전 기능 이력](FEATURE_HISTORY.md) | 과거 README에서 보존한 v0.16–v0.19 설명 |
| [초기 패치 v1–v15](PATCH_HISTORY_V1_V15.md) | 별도로 전달된 작업 기록의 요약. 현재 `main` 반영 여부와 별개 |
| [Cloudflare 브라우저 처리 v26](CLOUDFLARE_CLIENT_ONLY.md) | 이전 배포 설계 |
| [Cloudflare 공개 베타](CLOUDFLARE_BETA.md) | 이전 FastAPI 프록시 구성 |

## QA 상세

- [미리보기·출력 동등성 감사](qa/PREVIEW_EXPORT_PARITY_AUDIT.md)
- [건반 그림자 스프라이트 검증](qa/PREVIEW_SHADOW_SPRITE_VALIDATION.md)
- [화면 디자인 QA](qa/design-qa.md)

검증 문서에 적힌 측정값은 해당 시점·환경의 결과입니다. 최신 전체 테스트 통과나 모든 브라우저의 성능을 보증하지 않습니다.
