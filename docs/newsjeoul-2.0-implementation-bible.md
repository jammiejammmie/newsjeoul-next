# 뉴스저울 2.0 Implementation Bible

> 기준 문서: [`docs/newsjeoul-2.0-product-bible.md`](./newsjeoul-2.0-product-bible.md) v0.1. Product Bible이 "왜/무엇"을, 이 문서가 "어떤 순서로/어떤 파일로"를 정의한다.
> 참고자료: [`docs/newsjeoul-2.0-architecture.md`](./newsjeoul-2.0-architecture.md)(도메인 모델), [`supabase/topics_entities_schema.sql`](../supabase/topics_entities_schema.sql)(DB 확정본, 미실행), [`AGENTS.md`](../AGENTS.md)(작업 절차 원칙)
> 상태: 계획 문서. 이 문서에 적힌 순서와 파일 목록이 승인되기 전까지 구현(Write/Edit/실행)을 시작하지 않는다.

이 문서에서 "대상(Node)"은 Product Bible의 언어를 실제 스키마 용어(`topics`/`entities`)로 옮긴 것이다. Product Bible이 "무엇도 최상위가 아니다"라고 말한 철학은 3장(정보 연결 방식)에서 이미 "물리적 테이블 분리 + 제품 레벨에서 대등하게 취급"으로 구현 방법이 확정되어 있으므로, 이 문서는 그 결정을 그대로 이어받는다 — 다시 논쟁하지 않는다.

---

## 1. Phase 1 범위 정의 (Definition of Done)

**Phase 1에 포함**:
- `topics`/`entities`/`entity_aliases`/`topic_stories`/`entity_stories`/`topic_entities`/`topic_relations`/`entity_relations`/`topic_updates`/`topic_timeline_events` 10개 테이블 실제 생성
- 검색용 tsvector 컬럼/GIN 인덱스 추가
- Story별 실시간 AI 파이프라인 3단계(Entity 추출 → Topic 매칭 → Timeline/Update 생성)
- 1일 1회 배치 파이프라인 1단계(Relationship 생성, explanation 카피 포함)
- `/topic/[slug]`, `/entity/[slug]` 신규 페이지 — Product Bible 3장의 "지금/연결/역사" 3축 템플릿
- `/story/[id]` 수정 — 연결된 대상 배너 + 추천을 대상 기반으로 교체
- `/` 홈 수정 — "지금 움직이는 것" 섹션 추가
- `/search` 신규 — Postgres tsvector 기반, 대상 우선/근거(Story) 보조 노출
- `/admin` 확장 — 대상(Topic) 수동 생성/수정 최소 폼
- `sitemap.ts` 확장, GitHub Actions 파이프라인 워크플로 확장

**Phase 1에서 명시적으로 제외** (Product Bible 로드맵 기준, 다시 판단하지 않음):
- `/timeline/[slug]` 전용 풀 페이지 — Phase 1은 Topic 페이지 내 임베드 요약만. 전용 라우트는 Phase 2.
- Relationship explanation 품질 자동 채점/재생성 루프 — Phase 1은 생성만, 품질 자동 채점은 Phase 2.
- alias 관리 UI, 대상 병합/분리 도구 — Phase 2.
- 광고, 그래프 시각화, 팔로우, 뉴스레터, 댓글 — Phase 2 이후(Product Bible 로드맵 그대로).
- 통합 Update 피드의 "관심사 필터" — 데이터 구조는 지금부터 통합형으로 만들되(Product Bible 결정사항 7), 필터 UI 자체는 Phase 3(팔로우)에서.

**완료 기준**: 위 "포함" 목록의 모든 항목이 `npm run build` 통과 + 실제 Supabase 데이터로 각 페이지가 최소 1개 이상의 실데이터를 렌더링하는 것을 확인한 시점.

---

## 2. 실행 순서

각 단계는 이전 단계가 끝나야 다음으로 넘어간다. 단계마다 "파일", "의존성", "완료 확인 방법"을 명시한다.

### Step 0 — DB Migration
- **파일**: `supabase/topics_entities_schema.sql`(기존, 이미 확정 — 실행만 하면 됨) + `supabase/topics_search_index.sql`(신규 작성)
- **신규 migration 내용**: `topics.name`/`description`/`summary`를 결합한 generated tsvector 컬럼 + GIN 인덱스, `entities.name`/`description`을 결합한 generated tsvector 컬럼 + GIN 인덱스. 정확한 컬럼명/한글 설정(`simple` config 사용 — Postgres 기본 한글 사전이 없으므로 `simple`로 토큰화 후 트라이그램 보조 검토)은 구현 시점에 결정하고 이 파일에 주석으로 남긴다.
- **완료 확인**: Supabase Dashboard SQL Editor에서 두 migration 실행 후 `\d topics`, `\d entities`로 컬럼/인덱스 존재 확인.
- **의존성**: 없음 (최초 단계).

- **DB 설계 기본 철학 (Data Never Dies, Growth Bible 8장 참조)**: Append-only / Version-first / History-first를 기본으로 삼는다. Hard delete를 쓰지 않고, 상태 전환(비활성화)과 이력 보존을 우선한다. 기존 스키마 중 이미 이 철학에 부합하는 것과, Step 0 실행 시 확정이 필요한 간극을 구분한다.
  - **이미 부합**: `topic_updates`/`topic_timeline_events`는 설계상 이미 append-only 로그(수정 없이 계속 insert)다. `topics.status`(active/dormant/closed)는 삭제 대신 비활성화 패턴을 이미 따른다. `story_coverage_log`(기존 테이블, T0/T24/T7D 라벨)가 바로 이 원칙의 선례 — 덮어쓰지 않고 시점별 스냅샷을 쌓는다.
  - **Step 0 실행 시 확정 필요(간극)**: (1) `entities`에는 `topics.status`에 대응하는 비활성화 필드가 없다 — `topics_entities_schema.sql` 실행 전에 `entities.status`(active/archived 등) 추가 여부를 결정해야 한다. (2) `topic_relations`/`entity_relations`의 `strength_score`는 배치 갱신마다 덮어쓰는 구조라 변화 이력이 사라진다 — 매번 이력을 남길지, 아니면 "관계의 현재값만 중요하고 이력은 Phase 2 이후 과제"로 미룰지 결정 필요. (3) `topics.summary` 재생성(`refresh-topic-summary`, Phase 2)도 덮어쓰기 방식이라 과거 요약이 사라진다 — 별도 `topic_summary_history` 테이블 여부는 Phase 2 착수 시 결정.
  - 이 세 간극은 지금 당장 막지 않는다(Phase 1 스키마 실행을 지연시키지 않는다) — 다만 "결정을 미뤘다"는 사실 자체를 여기 기록해두어, Phase 2에서 Relationship/Summary 배치를 만들 때 이 문서를 다시 참조하게 한다.

### Step 1 — 읽기 헬퍼 lib
- **파일**: `lib/topics.ts`, `lib/entities.ts`
- **내용**: `getActiveTopics()`, `getTopicBySlug(slug)`, `getTopicStories(topicId)`, `getTopicsForStory(storyId)`, `getTopicRelations(topicId)`, `getTopicEntities(topicId)`, `getTopicTimeline(topicId)`, `getTopicUpdates(topicId)` / entities 쪽도 동일 대칭 구조.
- **완료 확인**: 각 함수가 Step 0 이후 실제 테이블에 대해 타입 에러 없이 컴파일(`npm run build`)됨. 데이터가 아직 없어 빈 배열이 나오는 건 정상.
- **의존성**: Step 0.

### Step 2 — 실시간 AI 파이프라인 (Story별)
- **파일**: `netlify/functions/extract-entities.js`, `netlify/functions/resolve-topics.js`, `netlify/functions/generate-updates.js`
- **순서**: 셋은 순차 실행(entity 추출 → topic 매칭 → timeline/update 생성) — `process-stories.js`가 새 story를 만든 뒤 이 셋을 잇는다.
- **각 함수 요구사항**:
  - `extract-entities.js`: 최근 미처리 story의 대표기사 제목으로 Haiku 호출 → entity 후보 추출 → `entity_aliases` lower-match로 기존 entity 조회, 없으면 `entities` insert → `entity_stories` insert.
  - `resolve-topics.js`: 후보 topic 검색(최근 활성 + entity 겹침) → Sonnet으로 매칭/신규 판단 → `topics`(신규 시) + `topic_stories` insert. `source_type='manual'`인 기존 topic도 후보에 포함.
  - `generate-updates.js`: 이번에 새로 생긴 `topic_stories` 행마다 Haiku로 타임라인 단계 분류 + 1~2문장 update 생성 → `topic_timeline_events`, `topic_updates` insert.
- **dry-run 지원**: 기존 `post-threads.js`의 `?dry=true` 패턴을 그대로 따라 실제 insert 없이 결과만 반환하는 모드 필수 — 수동 검증용.
- **완료 확인**: `/admin`에서 x-admin-key로 각 함수를 dry-run 호출해 결과 JSON이 말이 되는지 사람이 확인.
- **의존성**: Step 0, Step 1(타입/쿼리 패턴 참고).

### Step 3 — 저빈도 배치 파이프라인
- **파일**: `netlify/functions/refresh-relationships.js`, `netlify/functions/refresh-topic-summary.js`
- **`refresh-relationships.js`**: 최근 활성 topic 쌍(entity 겹침 우선) 후보 추출 → Sonnet으로 관계 유무/`explanation`(Product Bible 5장 — 열린 문장 원칙)/`strength_score` 판단 → `topic_relations`/`entity_relations` upsert. dry-run 지원 필수.
- **`refresh-topic-summary.js`**: update 누적 3개 이상 또는 3일 경과한 topic만 대상으로 `topics.summary`/SEO 필드 재생성. **인용용 문장(요약)과 탐험용 문장(explanation)을 절대 같은 프롬프트로 생성하지 않는다** — Product Bible 결정사항 3 그대로 적용, 별도 프롬프트/별도 함수로 분리.
- **스케줄**: `.github/workflows/relationships-batch.yml`(신규) — 1일 1회, `news-pipeline.yml`과 별도 시간대(파이프라인 부하 분산을 위해 예: 03:00 KST).
- **완료 확인**: dry-run으로 생성된 explanation 문장이 "닫힌 요약"이 아니라 "다음 궁금증을 남기는 문장"인지 사람이 직접 판독(자동 채점은 Phase 2).
- **의존성**: Step 2 (topic_stories/entity_stories 데이터가 있어야 관계 후보가 나옴).

### Step 4 — 신규 페이지 (3축 템플릿)
- **파일**: `app/topic/[slug]/page.tsx`, `app/entity/[slug]/page.tsx`
- **공통 골격**(Product Bible 3장): 지금(상태 배지) → 역사(타임라인 요약) → 오늘(updates) → 연결(관계 카드, explanation 필수 노출) → 근거(관련 기사, 접힘 기본) → 헷갈리는 것(FAQ)
- **완료 확인**: Step 0~3으로 생성된 실데이터 기준 최소 1개 topic, 1개 entity 페이지가 6개 섹션 모두 렌더링(데이터 없는 섹션은 숨김).
- **의존성**: Step 1(lib), Step 2~3(데이터가 있어야 실제 확인 가능).

### Step 5 — 기존 페이지 수정
- **파일**: `app/story/[id]/page.tsx`, `app/page.tsx`
- **story 페이지**: 상단에 "이 근거가 속한 대상" 배너 추가(Product Bible 3장 예외 규칙 — explanation 없이 즉시 이동 유도), 하단 추천을 `lib/relatedSections.ts`(기존, 침묵지수 기반)에서 대상 기반 추천으로 교체.
- **홈**: "지금 움직이는 것" 섹션 추가(`lib/topics.ts` 활용), 기존 섹션(오늘의 침묵/논쟁 TOP)은 유지하되 우선순위를 아래로.
- **완료 확인**: 두 페이지 모두 `npm run build` 통과 + 실제 브라우저에서 배너/섹션 클릭 시 대상 페이지로 정상 이동.
- **의존성**: Step 4.

### Step 6 — 검색
- **파일**: `lib/search.ts`, `app/search/page.tsx`
- **내용**: `topics`/`entities`의 tsvector(Step 0) 랭킹 + `importance_score`/`popularity_score` 가중치. 결과에 대상 우선, story는 보조.
- **완료 확인**: 실제 키워드 검색 시 대상 결과가 최소 1개 이상 반환.
- **의존성**: Step 0, Step 4.

### Step 7 — 관리자 폼
- **파일**: `netlify/functions/admin-topics.js`(create/update/archive action 분기), `app/admin/page.tsx`(폼 UI 추가)
- **필드**: name, slug(자동생성+수정), description, category, status, lifecycle_stage. source_type은 서버에서 강제로 `'manual'`.
- **완료 확인**: 폼으로 생성한 topic이 `/topic/[slug]`에서 정상 렌더링, 이후 Step 2 파이프라인이 이 topic도 매칭 후보로 잡는지 확인(다음 파이프라인 실행 사이클에서 검증).
- **의존성**: Step 0, Step 4.

### Step 8 — sitemap / 파이프라인 워크플로 반영
- **파일**: `app/sitemap.ts`(topic/entity 라우트 추가), `.github/workflows/news-pipeline.yml`(Step 2의 세 함수를 process-stories 뒤에 순차 호출하도록 스텝 추가), `.github/workflows/relationships-batch.yml`(Step 3, 신규 파일)
- **완료 확인**: 워크플로 `workflow_dispatch`로 수동 1회 실행해 전체 파이프라인이 에러 없이 끝까지 도는지 확인.
- **의존성**: Step 2, Step 3.

### Step 9 — 통합 확인
- 홈 → 대상 카드 클릭 → 대상 페이지 3축 확인 → 관계 카드 클릭 → 다른 대상 페이지 → 근거 펼쳐서 story 페이지 이동 → story의 "속한 대상" 배너로 복귀. 이 왕복 경로가 끊김 없이 되는지 사람이 직접 클릭해서 확인.
- `/search`에서 키워드 검색 → 대상 결과 클릭 → 3축 페이지 도달 확인.
- `/admin`에서 수동 topic 생성 → 페이지 반영 확인.

---

## 3. Build/Test 전략

- 매 Step 종료 시 `npm run build`(TypeScript + lint + Next 빌드) 통과 필수 — 다음 Step으로 넘어가지 않는다.
- Netlify Functions는 배포 전 `?dry=true` 모드로 먼저 검증 (기존 `post-threads.js` 컨벤션 재사용) — 실제 DB write 전에 사람이 결과를 읽고 판단.
- 각 Step은 AGENTS.md 절차(설계 확정 → 새 파일 작성 → 연결 → Build → Commit)를 그대로 따른다 — Step 하나가 "설계 확정"에 해당하는 이 문서의 항목이고, 구현 후 Commit까지가 한 사이클이다.
- Commit은 Step 단위로 분리한다(한 Step = 한 커밋 또는 관련 커밋 묶음) — 큰 파일을 한 번에 갈아엎지 않는다는 AGENTS.md 원칙과 일치.

---

## 4. Phase 1 완료 기준 체크리스트

- [ ] Step 0~8 전부 완료, `npm run build` 통과
- [ ] Step 9 통합 확인 시나리오 전부 통과
- [ ] Product Bible 0장 "절대로 하지 않을 것"(루머 미라벨링, 낚시성 카피, 광고-콘텐츠 혼합 등) 위반 사례 없음
- [ ] 검색 결과에 대상이 최소 노출됨(빈 검색 결과 없음)
- [ ] 관리자 폼으로 생성한 topic이 파이프라인에 정상 편입됨

이 체크리스트가 전부 통과되면 Phase 1 종료 선언, Phase 2(Product Bible 로드맵)로 이관한다.
