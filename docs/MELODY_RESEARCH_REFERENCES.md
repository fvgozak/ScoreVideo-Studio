# 멜로디 강조: 읽은 논문과 실제 코드

멜로디 강조를 만들면서 참고한 연구와 실제 코드를 한곳에 모았다. 「ScoreMotion 개발기: 악보와 MIDI의 동기화, 그리고 멜로디 검출 알고리즘」에서 소개한 논문 여섯 편의 서지 정보도 다시 확인했다. 논문에서 아이디어를 얻었지만 모델과 학습 데이터를 가져다 쓴 것은 아니다.

악보↔MIDI 정렬 V1·V2-A/B/C는 [별도 코드](https://github.com/fvgozak/ScoreVideo-Studio/blob/6ba5a0083235f34f571e7c78e8df3de5d98b8514/static/score-alignment-v2.js#L126)에 있다. 아래 논문들은 멜로디 검출 기능을 고민할 때 읽은 자료다. 표의 코드 링크는 기능 커밋 `6ba5a00`에 고정했다. 정렬 결과는 [변경 기록](../CHANGELOG.md)에 적었다.

## 어떤 생각을 코드에 옮겼나

| 방식 | 읽은 연구 | ScoreMotion에서 한 일 | 코드 |
| --- | --- | --- | --- |
| V1 · 휴리스틱 | [Uitdenbogerd & Zobel (1998)](https://doi.org/10.1145/290747.290776): 다성 음악에서 선율을 어떻게 뽑을 것인가 | 음높이, 음길이, 벨로시티, 박자 위치와 주변 음을 함께 본다. 왈츠처럼 반복되는 반주 패턴도 감점한다. | [analyzeV1](https://github.com/fvgozak/ScoreVideo-Studio/blob/6ba5a0083235f34f571e7c78e8df3de5d98b8514/static/melody-highlight.js#L89) |
| V2-A · 음악인지 | [Friberg & Ahlbäck (2009)](https://doi.org/10.1080/09298210903215900): 선율 판단에서 지각 특징과 맥락의 역할 | 음역, 음길이, 아티큘레이션, 음량, 화음 속 위치와 앞뒤 음의 연결을 점수로 만들었다. 연구의 회귀·SVM 모델은 쓰지 않았다. | [perceptualScores](https://github.com/fvgozak/ScoreVideo-Studio/blob/6ba5a0083235f34f571e7c78e8df3de5d98b8514/static/melody-highlight.js#L173) |
| V2-B · 정보량과 반복 | [Madsen & Widmer (2007)](https://ijcai.org/proceedings/2007/72): 국소적인 음악 정보량과 선율 인식 | 짧은 구간의 음높이·음정·리듬·음길이 다양성을 계산한다. 반복은 반주일 가능성을 보는 단서로 쓰되, 주변에 경쟁 성부가 있을 때만 약하게 감점한다. | [entropyScores](https://github.com/fvgozak/ScoreVideo-Studio/blob/6ba5a0083235f34f571e7c78e8df3de5d98b8514/static/melody-highlight.js#L235) |
| V2-C · 선율 경로 | [Simonetta et al. (2019)](https://arxiv.org/abs/1906.10547): 음표 후보를 경로로 잇는 생각 | 가까운 시간대의 후보를 연결하며 음정 이동과 지속시간을 본다. 브라우저에서 돌리기 위해 후보와 탐색 범위를 제한했다. CNN이나 논문의 Bellman–Ford 코드는 쓰지 않았다. | [pathScores](https://github.com/fvgozak/ScoreVideo-Studio/blob/6ba5a0083235f34f571e7c78e8df3de5d98b8514/static/melody-highlight.js#L281) |
| V2-D · 성부 분리 | [Chew & Wu (CMMR 2004)](https://doi.org/10.1007/978-3-540-31807-1_1), [Cambouropoulos (2008)](https://doi.org/10.1525/mp.2008.26.1.75): 성부 연결과 청각적 흐름 | 악보의 성부 정보를 살리고, 음높이·시간·음길이로 빠진 성부를 추정한다. 그 결과를 V2-A/B/C 점수에 섞었다. VoSA를 그대로 구현한 것은 아니다. | [inferVoices](https://github.com/fvgozak/ScoreVideo-Studio/blob/6ba5a0083235f34f571e7c78e8df3de5d98b8514/static/melody-highlight.js#L326), [separatedScores](https://github.com/fvgozak/ScoreVideo-Studio/blob/6ba5a0083235f34f571e7c78e8df3de5d98b8514/static/melody-highlight.js#L351) |

분석은 [melody-highlight.js](../static/melody-highlight.js)와 [Worker](../static/melody-worker.js)에서 브라우저 안에서 처리한다. 결과는 [악보 빛 효과](../static/score-core.js)와 [무대 효과](../static/studio-scene.js)에 적용한다.

## 지금 확인한 범위

- 논문은 설계할 때 참고했다. V1·V2-A/B/C/D는 각 논문의 알고리즘이나 실험 결과를 재현했다는 뜻이 아니다.
- 복잡한 반주, 내성 선율, 푸가처럼 여러 성부가 비슷하게 중요한 곡은 결과를 미리보기에서 확인해야 한다.
- 개발기에 적은 1,614/1,630개 정렬 수치는 별도 곡에서 측정했다. 그 입력 파일과 측정 절차가 현재 저장소에는 없어 회귀 검사 결과로 적지 않았다.
- 음표를 클릭해 직접 고치는 화면은 아직 없다. 이전 프로젝트에 저장된 수동 교정 데이터는 그대로 읽고 저장한다.
