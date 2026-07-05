# 뉴스저울 2.0 Amendment Plan

> [`docs/newsjeoul-2.0-red-team-review.md`](./newsjeoul-2.0-red-team-review.md) 최종 판정의 6개 수정사항을 세 문서(Product Bible / User Journey / Implementation Bible)에 어떻게 반영할지 정리한 계획서. **이 문서는 계획만 담는다 — 승인 전까지 세 문서를 실제로 수정하지 않는다.**

---

## 1. Product Bible 수정/추가 계획

### 추가 1 — 신규 "로드맵" 섹션 (현재 Product Bible엔 Phase 구분이 명시적으로 없음)
Implementation Bible이 "Product Bible 로드맵 기준"이라고 참조하고 있으나 실제로는 그 섹션이 없었다 — 이번에 처음 명문화한다.
- **Phase 1**: Node(Topic/Entity) 최소 구조, 3축 템플릿, 실시간 AI 파이프라인(추출→매칭→Timeline/Update), **사용자 행동 측정 인프라(신규, 수정4)**, **품질 자동 채점(수정2, Phase2에서 앞당김)**.
- **Phase 2**: **Relationship 배치 생성(수정1, Phase1에서 밀려남)**, `/search`·관리자 수동 폼(수정3, Phase1에서 밀려남), **구독/프리미엄 모델 설계 검토(신규, 수정4)**.
- **Phase 3**: 그래프 시각화, 팔로우, **B2B 데이터 API 파일럿(신규, 수정4)**.
- **Phase 4~5**: 기존 그대로(숏폼/유튜브, 커뮤니티, 국제화 등).

### 수정 1 — Core Principles / 1장(사람)에 침묵지수 역할 명문화 (수정5)
architecture.md(참고자료)의 "침묵지수는 여러 힌트 중 하나"라는 표현이 프로젝트 전반에 은연중 남아 대기업이 못 오는 유일한 틈새를 스스로 약화시킬 위험이 있다는 지적을 반영한다. Product Bible에 다음을 명문화해 참고자료의 옛 표현을 명시적으로 대체한다: "침묵지수는 부차 지표가 아니라 신뢰·바이럴을 만드는 핵심 트리거다 — 여러 관계 중 하나로 취급하지 않는다."

### 추가 2 — Core Principles에 "모바일 기본값" 원칙 추가 (수정6)
Threads 유입이 사실상 100% 모바일이라는 사실에도 세 문서 모두 모바일 전용 설계가 없었다는 지적 반영: "모바일이 기본 경험이다. 3축 템플릿은 모바일 뷰포트에서 먼저 완성되고, 데스크톱은 그 확장이다."

### 수정 2 — 결정사항에 항목 추가
- **결정사항 9(신규)**: "품질 자동 채점은 Phase 2가 아니라 Phase 1부터 적용한다" — 이유: Relationship 없이도 Phase1의 Update/Timeline/Summary 텍스트 품질이 전체 신뢰를 좌우하기 때문(Red Team 1번 리스크 직접 대응).
- **결정사항 10(신규)**: "사용자 행동 측정 인프라는 Phase 1부터 구축한다" — 이유: User Journey의 모든 KPI 가정은 실측 없이는 검증 불가능(Red Team 6번 항목 대응).

---

## 2. User Journey 수정/추가 계획

### 수정 1 — Part A에 "이탈 경로" 트랙 병기 (Red Team 6번 지적의 직접 반영, 문서 현실성 보강)
현재 Part A는 "10분에 5개 대상 순회"처럼 파워유저 성공 경로만 그려져 있다는 지적 반영. 각 시간 구간(30초/3분/10분)에 "탐험 지속" 경로와 나란히 **"이탈" 경로**를 병기한다 — 예: 30초 구간에 "explanation이 뻔하게 느껴지면 이탈, 이 경우가 다수일 수 있음"을 명시. 목적은 희망적 시나리오 하나만 남기지 않는 것.

### 수정 2 — Part B "AI 검색 유입" 우선순위 하향 표기 (Implementation Bible 수정3과 연동)
AI 검색발 트래픽 비중이 현재는 불확실/낮음을 명시하고, 6개 채널을 동등 비중으로 다루지 않도록 "관찰 대상 채널(데이터 확보 전까지 설계 투자 최소화)"로 표기 변경.

### 수정 3 — Part B "SNS 공유 유입"에 침묵지수 역할 강조 (수정5 연동)
"공유 카피가 약속한 것(침묵지수, 놀라움)"이라는 기존 문장을 침묵지수가 이 채널의 신뢰·체류 확인의 **핵심 장치**임을 더 명확히 하는 문장으로 보강.

### 추가 1 — 모바일 뷰포트 기준 서술 추가 (수정6)
Part A "진입 순간(0~3초)"과 Part B "SNS 공유 유입" 항목에 "이 경로는 사실상 전량 모바일 — 배너/첫 화면이 모바일 뷰포트 기준으로 3초 안에 파악돼야 한다"를 명시적으로 추가.

---

## 3. Implementation Bible — Phase 1 범위 변경 계획

### 변경 1 — Step 3(Relationship 배치) 전체를 Phase 2로 이동 (수정1)
- `netlify/functions/refresh-relationships.js`, `.github/workflows/relationships-batch.yml` 작업을 Phase 1 실행 순서에서 제거하고 "Phase 2 착수 항목"으로 이동.
- `topic_relations`/`entity_relations` 테이블 자체는 Step 0(스키마)에 이미 있으므로 DB는 그대로 두되, Phase 1 동안은 빈 테이블 상태로 둔다 — Node 페이지의 "연결" 섹션은 Phase 1에서 `topic_entities`(Story 연결 기반 실시간 집계)만으로 채운다. 관계 카드가 부족해 보이면 그건 Phase 1의 정상 상태로 받아들인다(Red Team 콜드스타트 지적을 정면으로 인정).
- Phase 1 Definition of Done에서 "Relationship 생성" 관련 항목 삭제.

### 변경 2 — 품질 자동 채점을 Phase 1에 신규 Step으로 추가 (수정2)
- **신규 Step 2.5 — 품질 채점**: Step 2(실시간 파이프라인)가 생성한 `topic_updates`/`topic_timeline_events` 텍스트를 별도 LLM 패스로 채점(간단한 점수 필드, 예: `topic_updates.quality_score` — 정확한 컬럼은 구현 시 Step 0 migration에 추가). 기준 미달이면 노출 보류(`topic_updates`에 `is_published` 플래그 또는 동급 처리).
- Step 0(DB Migration)에 이 채점 결과를 저장할 컬럼을 추가해야 하므로, Step 0 범위가 소폭 확장됨 — 정확한 컬럼 설계는 승인 후 구현 단계에서 확정.

### 변경 3 — Step 6(검색), Step 7(관리자 폼)을 Phase 2로 이동 (수정3)
- `lib/search.ts`, `app/search/page.tsx`, `netlify/functions/admin-topics.js`, `app/admin/page.tsx` 확장 — 전부 Phase 1 실행 순서에서 제거, Phase 2 항목으로 이동.
- 이유(Red Team 그대로 인용): 검색은 Topic 수가 적을 때 무의미, 관리자 수동 생성은 자동 생성이 안정화되기 전엔 필요성이 낮음.
- Phase 1 Definition of Done에서 두 항목 삭제.

### 추가 1 — 신규 Step: 사용자 행동 측정 인프라 (수정4, Phase 1 필수로 승격)
- **신규 Step 4.5 — 이벤트 트래킹**: 페이지뷰/세션, 스크롤 depth, 관계 카드 클릭률, Story→Node 배너 클릭률 등 User Journey KPI에 대응하는 최소 이벤트를 계측(GA4 또는 동급 — 구체 도구는 구현 시 결정). Step 4(신규 페이지)·Step 5(기존 페이지 수정) 직후 실행.
- Phase 1 Definition of Done에 "핵심 이벤트가 실제로 수집되는지 확인" 항목 추가.

### 추가 2 — Step 4(신규 페이지)에 모바일 전용 요구사항 명시 (수정6)
- "지금" 섹션은 모바일에서 접힘 없이 최상단 노출.
- "연결"/"근거" 섹션은 기본 접힘(아코디언)으로 시작해 초기 스크롤 길이를 최소화.
- 관계 카드는 모바일에서 가로 스크롤 캐러셀로 노출(세로로 쌓지 않음).
- 완료 확인 항목에 "실제 모바일 뷰포트(360~430px)에서 확인" 추가.

### 재정렬된 Phase 1 실행 순서 (최종)
```
Step 0  DB Migration (기존 10테이블 + 검색 인덱스 + 품질채점 컬럼)
Step 1  lib/topics.ts, lib/entities.ts
Step 2  실시간 AI 파이프라인 (extract-entities → resolve-topics → generate-updates)
Step 2.5 품질 채점 (신규)
Step 4  신규 페이지 app/topic, app/entity (3축 템플릿 + 모바일 요구사항)
Step 5  story/홈 페이지 수정 (침묵지수 배지 유지 확인)
Step 4.5 이벤트 트래킹 (신규)
Step 8  sitemap / 파이프라인 워크플로 반영
Step 9  통합 확인

※ Step 3(Relationship 배치), Step 6(검색), Step 7(관리자 폼)은 Phase 2로 이동 — Phase 1 순서에서 제외.
```

---

## 4. 추적 매트릭스 — Red Team 6개 지적 → 반영 문서/섹션

| # | Red Team 지적 | Product Bible | User Journey | Implementation Bible |
|---|---|---|---|---|
| 1 | Relationship 배치를 Phase 1에서 제외 | 로드맵 섹션(Phase1→Phase2 이동 명시) | — | Step 3 전체 Phase 2로 이동, Phase1 DoD에서 삭제 |
| 2 | 품질 자동 채점 Phase2→Phase1 | 로드맵 섹션 + 결정사항 9(신규) | — | 신규 Step 2.5 추가, Step 0 migration 범위 확장 |
| 3 | `/search`·관리자 폼 우선순위 하향 | 로드맵 섹션(Phase2로 명시) | Part B "AI검색 유입" 비중 하향(간접 연동) | Step 6·7 전체 Phase 2로 이동, Phase1 DoD에서 삭제 |
| 4 | 수익모델 + 측정인프라 로드맵 추가 | 로드맵 섹션(신규) + 결정사항 10(신규) | — | 신규 Step 4.5(이벤트 트래킹) 추가, Phase1 DoD에 측정 확인 항목 추가 |
| 5 | 침묵지수 재평가(핵심 트리거로 유지) | Core Principles/1장 명문화(수정1) | Part B "SNS 공유 유입" 강조 문장 보강 | Step 5(story 페이지 수정) 시 침묵지수 배지 유지 확인 항목 |
| 6 | 모바일 전용 UX 설계 공백 | Core Principles에 "모바일 기본값" 원칙 추가(신규) | Part A/B에 모바일 뷰포트 기준 명시 추가 | Step 4에 모바일 요구사항 3가지 명시, 완료 확인에 모바일 뷰포트 테스트 추가 |

---

승인해주시면 이 표 순서대로 Product Bible → User Journey → Implementation Bible을 각각 v0.2로 갱신하고, 그 다음 Step 0으로 진입한다.
