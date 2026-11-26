# 문서 안내

실행 방법은 [README](../README.md)에, `main`에 넣은 변경은 [변경 기록](../CHANGELOG.md)에 적었다. 작업하면서 쌓인 문서는 여기서 찾아볼 수 있게 묶었다. 오래된 패치 메모는 당시의 실험 기록이라 지금 코드와 다를 수 있다.

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

MP4를 만들며 겪은 문제와 실험을 순서대로 남긴 문서다. 지금 쓰는 방법보다는 왜 그때 코드를 바꿨는지 볼 때 유용하다.

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
| [초기 패치 v1–v15](PATCH_HISTORY_V1_V15.md) | 초기 작업 메모의 요약. 현재 `main`의 반영 상태와는 별개 |
| [Cloudflare 브라우저 처리 v26](CLOUDFLARE_CLIENT_ONLY.md) | 이전 배포 설계 |
| [Cloudflare 공개 베타](CLOUDFLARE_BETA.md) | 이전 FastAPI 프록시 구성 |

## QA 상세

- [미리보기·출력 동등성 감사](qa/PREVIEW_EXPORT_PARITY_AUDIT.md)
- [건반 그림자 스프라이트 검증](qa/PREVIEW_SHADOW_SPRITE_VALIDATION.md)
- [화면 디자인 QA](qa/design-qa.md)

QA 문서의 측정값은 그때 사용한 곡과 환경에서 나온 결과다. 다른 브라우저나 곡에서는 다시 확인해야 한다.
