# 뉴스저울 2.0 아키텍처 설계

> 상태: 설계 초안 (코드/DB 미반영). 승인 후 Phase 1 구현 계획(별도 문서)으로 이어짐.

## 0. 관점 전환

기존: `RSS → Article → Story(클러스터) → 침묵지수` — Story가 주인공, 침묵지수가 상품.

2.0: **Topic이 주인공**. Story는 Topic의 존재를 증명하는 **Evidence(증거)** 중 하나일 뿐이다.
Entity(기업/인물/기관/국가/제품/기술/시장/정책)는 Topic과 독립적으로 존재하는 **1급 노드**이며, 여러 Topic을 가로질러 나타난다.

핵심 문장: *"뉴스저울은 이슈(Topic)와 그 이슈를 구성하는 실체(Entity)들이 어떻게 얽혀 있는지 보여주는 지식 그래프다. Story는 그 얽힘을 증명하는 근거 자료다."*

---

## 1. 전체 아키텍처

```
                         ┌─────────────────────────────┐
                         │        수집 레이어            │
                         │  RSS → articles              │
                         └───────────────┬───────────────┘
                                          │
                         ┌───────────────▼───────────────┐
                         │      증거 생성 레이어 (기존)    │
                         │  articles → stories(클러스터)  │
                         │  → story_articles              │
                         └───────────────┬───────────────┘
                                          │
                 ┌────────────────────────▼────────────────────────┐
                 │         지식화 레이어 (신규, 이번 설계 핵심)        │
                 │                                                  │
                 │  1) Entity 추출/정규화                            │
                 │  2) Topic 매칭 or 신규 생성                        │
                 │  3) Timeline 단계 분류                            │
                 │  4) Update(오늘 바뀐 것) 생성                      │
                 │  5) Relationship 제안 (Topic↔Topic, Entity↔Entity)│
                 │  6) SEO 요약 생성                                 │
                 └────────────────────────┬────────────────────────┘
                                          │
                         ┌───────────────▼───────────────┐
                         │        서빙 레이어              │
                         │  /  /topic/[slug]  /entity/[slug]│
                         │  /story/[id]  /timeline/[slug]  │
                         │  /search  /sitemap  /feed        │
                         └─────────────────────────────────┘
```

지식화 레이어가 이번 설계의 신규 핵심이다. 수집/증거 레이어(RSS→articles→stories)는 그대로 두고, 그 위에 얹는다 — 기존 파이프라인을 갈아엎지 않는다.

---

## 2. 핵심 도메인 모델

| 개념 | 정의 | 예시 |
|---|---|---|
| **Topic** | 시간이 흐르며 변화하는 하나의 이슈. 최상위 개념. | "아이폰17", "쿠팡 개인정보 유출", "전기차 시장" |
| **Entity** | Topic과 독립적으로 존재하는 실체. 여러 Topic에 걸쳐 재사용됨. | 기업(삼성전자), 인물, 기관, 국가, 제품, 기술, 시장, 정책 |
| **Story** | 특정 시점에 여러 언론이 다룬 사건 하나 (기존 클러스터). Topic의 **Evidence**. | "아이폰17 카메라 루머 보도" |
| **Article** | 개별 기사 원문. Story의 근거. (기존 그대로) | — |
| **Timeline Event** | Topic이 겪은 하나의 단계/사실. Story에서 파생되거나 독립적으로 기록. | "2026-03-01: 최초 루머 등장" |
| **Update** | "오늘 이 Topic에 새로 추가된 것". 사용자가 매일 읽는 콘텐츠 단위. | "카메라 루머 2건 추가됨" |
| **Relationship** | 두 노드(Topic-Topic 또는 Entity-Entity) 사이의 의미적 연결. | 전기차 —(원자재)→ 배터리 |

**중요한 결정**: Entity는 Topic의 하위 개념이 아니라 Topic과 대등한 별도 노드다. "쿠팡"이라는 Entity는 "개인정보 유출 Topic"에도, "로켓배송 Topic"에도, "이커머스 시장 Topic"에도 동시에 연결된다. Topic 안에 Entity를 종속시키면 지식그래프가 아니라 여전히 "카테고리 붙은 뉴스 목록"이 된다.

---

## 3. Entity 관계도 (Domain Model, ERD 아님)

```
                    ┌──────────┐
        evidences   │  Article │
        ┌──────────►└────┬─────┘
        │                │ (story_articles)
   ┌────┴─────┐          │
   │  Story   │◄─────────┘
   └────┬─────┘
        │ evidences
        │ (topic_stories, entity_stories)
        │
   ┌────▼─────┐   topic_entities    ┌──────────┐
   │  Topic   │◄───────────────────►│  Entity  │
   └────┬─────┘   (relation_type,   └────┬─────┘
        │          relevance)            │
        │ topic_relations                │ entity_relations
        │ (relation_type,                │ (relation_type,
        │  explanation,                  │  explanation,
        │  strength_score)               │  strength_score)
        │                                │
        ▼                                ▼
   다른 Topic들                      다른 Entity들

   ┌──────────────┐        ┌──────────────┐
   │ TimelineEvent │◄──────┤    Topic     │
   └──────────────┘  1:N   └──────┬───────┘
                                   │ 1:N
                            ┌──────▼───────┐
                            │    Update     │
                            └───────────────┘
```

**노드**: Topic, Entity (그리고 파생적으로 Story/Article — 이들은 "증거 노드"로, 그래프 시각화에서는 옅게 표시되는 리프 노드)

**엣지 5종류**:
1. `topic_stories` — Topic ← evidence — Story (근거)
2. `entity_stories` — Entity ← evidence — Story (근거)
3. `topic_entities` — Topic ↔ Entity (구성)
4. `topic_relations` — Topic ↔ Topic (연결된 세계)
5. `entity_relations` — Entity ↔ Entity (예: 애플 ↔ TSMC 공급망)

이렇게 나누는 이유: Postgres는 폴리모픽 FK(하나의 컬럼이 여러 테이블을 가리킴)를 깨끗하게 표현하지 못한다. 노드 타입별로 테이블을 분리하고, 엣지도 "무엇과 무엇을 잇는가"에 따라 테이블을 분리하되, **모든 엣지 테이블은 동일한 컬럼 패턴(`relation_type`, `explanation`, `strength_score`, `created_at`)을 공유**한다. 이러면 나중에 그래프 UI(Phase 3)가 5개 테이블을 UNION해서 "노드 목록 + 엣지 목록"으로 조회하는 것만으로 그래프를 그릴 수 있다 — 스키마를 갈아엎지 않아도 된다.

---

## 4. Topic 중심 데이터 흐름

```
[사용자가 홈에 접속]
   → "지금 움직이는 이슈" = topics WHERE status='active' ORDER BY 최근 update 시각
   → 각 카드: 오늘 update 수, 최근 story 수, 관련 entity 수, 마지막 갱신 시각

[사용자가 Topic 클릭 → /topic/[slug]]
   → topics 1건
   → topic_updates (최근 N개, "오늘 바뀐 것")
   → topic_timeline_events (event_date 순, "처음부터 지금까지")
   → topic_stories JOIN stories (근거 기사 묶음)
   → topic_entities JOIN entities (관련 기업/인물)
   → topic_relations JOIN topics (관련 주제, "연결된 세계")

[사용자가 Story 클릭 → /story/[id]]
   → story 1건 (기존 그대로)
   → topic_stories WHERE story_id = 이 story → 이 Story가 속한 Topic(들)
   → entity_stories WHERE story_id = 이 story → 관련 Entity
   → 그 Topic의 topic_timeline_events 중 이 story가 어느 지점인지(source_story_id로 역참조)
```

Story는 여러 Topic에 동시에 속할 수 있다 (예: "쿠팡 개인정보 유출 후속 보도"는 "쿠팡 개인정보 유출" Topic과 "플랫폼 규제" Topic 양쪽에 걸릴 수 있음) — 그래서 `topic_stories`는 N:N.

---

## 5. Story가 Topic에 연결되는 방식

두 단계로 나눈다 (하나의 거대한 LLM 콜에 다 넣지 않는다 — 실패 시 원인 파악이 안 됨):

**5-1. 후보 검색 (결정적 로직, LLM 아님)**
- 새 Story의 제목/대표기사에서 임시 키워드 추출 (형태소 분석 or 이미 추출된 Entity 기반)
- 후보 Topic = `status='active'` AND (최근 14일 내 update 있음) AND (Entity가 하나라도 겹치거나, `topics.category`가 일치)
- 최대 15~20개로 제한 (LLM 컨텍스트 절약)

**5-2. 매칭 판단 (LLM)**
- 프롬프트: Story 제목/요약 + 후보 Topic 목록(이름/설명/최근 update 1~2줄) → `MATCH <topic_id>` 또는 `NEW <name, slug, description, category>` 반환
- MATCH면 `topic_stories` insert (relevance_score 포함)
- NEW면 `topics` insert 후 `topic_stories` insert
- 이 단계에서 여러 Topic에 MATCH 가능하도록 허용 (배열 반환)

**실패 안전장치**: 매칭 실패(LLM 에러, 파싱 실패) 시 Story는 미분류 상태로 남는다. Topic 연결 실패가 Story 생성 자체를 막지 않는다 (기존 파이프라인처럼 "실패해도 다음 단계는 계속").

---

## 6. Topic-Entity 관계 설계

- Entity 추출은 Topic 매칭과 **독립적으로** 진행 (Story 텍스트에서 직접 추출 — Topic이 아직 안 정해졌어도 가능)
- Entity는 이름 그대로 저장하지 않고 정규화가 필요함: "삼성", "삼성전자", "Samsung Electronics"가 같은 Entity를 가리켜야 함 → `entity_aliases` 테이블 필요 (도메인 모델에 추가, 아래 참고)
- `topic_entities`는 **매번 새로 계산하지 않고 누적/집계**한다: Story가 Topic X에 연결되고 Entity Y가 그 Story에서 추출되면, `topic_entities(X, Y)`가 없으면 생성하고 있으면 `relevance_score`를 갱신(예: 등장 횟수 가중 평균)
- 즉 `topic_entities`는 `topic_stories` + `entity_stories`의 **파생 집계 테이블**이지만, 조회 성능과 향후 그래프 UI를 위해 물리적으로 별도 저장한다 (매번 JOIN 집계하지 않음)

---

## 7. Timeline / Update / Relationship의 역할 정의

명확히 구분해야 서로 책임이 섞이지 않는다.

| | 정의 | 생성 시점 | 사용자에게 보이는 곳 |
|---|---|---|---|
| **Timeline Event** | Topic이 겪은 하나의 "사실/단계". 객관적 순서 데이터. | Story가 Topic에 연결될 때, LLM이 이 Story의 단계(발단/후속/논란/해명/판결/출시/확정/루머)를 분류해 생성 | `/topic/[slug]`의 "처음부터 지금까지", `/timeline/[slug]` |
| **Update** | "오늘 무엇이 바뀌었는가"를 사람이 읽는 문장으로 표현한 것. 주관적 요약. | Story가 Topic에 연결될 때마다 1개씩 생성 (Timeline Event와 1:1로 같이 생성되지만 목적이 다름 — Timeline은 "기록", Update는 "오늘의 읽을거리") | 홈 "오늘 새로 바뀐 것", Topic 페이지 "오늘 바뀐 것", Threads 포스팅 |
| **Relationship** | 두 노드 사이의 지속적인 의미적 연결. Story 단위가 아니라 Topic/Entity 단위로 존재. | 매일 배치가 아니라 **주기적 배치**(예: 1일 1회, 활성 Topic들 대상)로 별도 생성 — Story 처리 파이프라인과 분리 | Topic 페이지 "관련 주제", 홈 "연결된 세계", Phase 3 그래프 |

Timeline/Update는 "Story→Topic 연결" 이벤트에서 실시간 파생되고, Relationship은 별도 배치(빈도 낮음, 비용 큰 LLM 콜)로 파생된다는 게 핵심 차이.

---

## 8. AI 파이프라인 전체 설계

기존 파이프라인 뒤에 이어붙이는 신규 단계 (모두 "실패해도 다음 story 처리는 계속"):

```
collect-news (기존, 변경 없음)
   ↓
process-stories (기존, 변경 없음) → stories, story_articles 생성
   ↓
[신규] extract-entities
   - 새로 생성된 story마다: 제목+대표기사 → LLM → entity candidates [{name, type}]
   - entity_aliases로 기존 entity와 매칭, 없으면 신규 entity 생성
   - entity_stories insert
   ↓
[신규] resolve-topics
   - 후보 Topic 검색 (5-1) → LLM 매칭 (5-2)
   - topic_stories insert (신규 Topic이면 topics insert 먼저)
   - topic_entities 집계 갱신 (entity_stories 결과 활용)
   ↓
[신규] generate-updates
   - 이번에 새로 연결된 topic_stories마다:
     - Timeline Event 분류 + insert (topic_timeline_events)
     - Update 문장 생성 + insert (topic_updates)
   ↓
[신규, 별도 스케줄 — 매일 1회, story 파이프라인과 독립] refresh-relationships
   - 최근 활성 Topic들 pairwise 후보 추출 (공유 Entity 많은 쌍 우선)
   - LLM으로 관계 유무/설명/강도 판단 → topic_relations upsert
   - Entity 쌍도 동일하게 → entity_relations upsert
   ↓
[신규, 저빈도 — Topic이 일정 update 누적 시] refresh-topic-summary
   - topics.summary / SEO title / description / OG 문구 재생성
   - 매 update마다 하지 않음 (비용) — 예: update 3개 누적 or 3일 경과 시
```

**비용/빈도 원칙**: Story 단위(고빈도)로는 Entity 추출·Topic 매칭·Update 생성만 한다. Relationship과 SEO 요약처럼 "전체를 조망해야 하는" 작업은 저빈도 배치로 분리한다 — 그래야 LLM 비용이 Story 개수에 선형으로 폭발하지 않는다.

---

## 9. 그래프 구조까지 고려한 확장성

Phase 1~2에서 만드는 스키마가 그대로 Phase 3 그래프 UI의 데이터 소스가 되도록 설계했다:

- **노드 쿼리**: `SELECT id, name, 'topic' as node_type FROM topics UNION ALL SELECT id, name, 'entity' FROM entities`
- **엣지 쿼리**: `topic_relations`, `entity_relations`, `topic_entities` 세 테이블을 동일 컬럼 셰이프(`source_id, target_id, relation_type, explanation, strength_score`)로 UNION
- 그래프 UI는 이 두 쿼리 결과만 있으면 그려진다 — Phase 3에서 스키마를 다시 설계할 필요가 없다

`topic_stories`/`entity_stories`(증거 엣지)는 그래프 시각화에서는 기본적으로 숨기고, 특정 Topic/Entity를 확대했을 때만 "근거 보기"로 펼쳐지는 리프 노드로 취급 — 그래프가 Story 개수만큼 노드 폭증하는 것을 방지.

**확장 여지**:
- Entity 타입은 CHECK 제약 대신 향후 자유 텍스트 + 관리자 승인 화이트리스트로 완화 가능 (시장/정책처럼 경계가 애매한 타입이 계속 늘어날 것이므로)
- `topic_relations`/`entity_relations`에 `strength_score`를 두는 이유: Phase 3 그래프에서 엣지 굵기/필터링에 바로 사용 가능하게 하기 위함

---

## 10. 이번 설계에서 의도적으로 미룬 것

- 실제 테이블 스키마(타입, 인덱스, RLS) — 이 문서 승인 후 별도 SQL 초안에서
- `map-story-topics.js` 등 실제 netlify function 코드 — 승인 후
- 그래프 인터랙티브 UI 구현 — Phase 3
- Entity 타입 화이트리스트를 CHECK 제약으로 할지 관리 테이블로 할지 최종 결정 — 실제 운영 중 늘어나는 타입 패턴을 보고 결정 권장

---

## 검토 필요 사항 (승인 전 확인)

1. Topic-Entity를 대등한 별도 노드로 보는 3장의 결정에 동의하는지
2. 엣지를 5개 테이블로 분리하는 방식(3장) vs 단일 폴리모픽 `relations` 테이블 방식 중 선택
3. Timeline/Update를 Story→Topic 연결 시점에 실시간 생성 vs Relationship처럼 배치로 분리하는 안(7장)에 동의하는지
4. `entity_aliases` 테이블(6장) 도입 여부
