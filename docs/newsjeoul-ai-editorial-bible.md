# 뉴스저울 AI 편집국 바이블

> 이 문서는 뉴스저울 콘텐츠 생산 파이프라인("AI 편집국")의 공식 설계·진단 기록입니다. 최종 수정: 2026-07-10.

## 0. 비전

**"100명의 에디터"** — 사람 편집국 없이 AI가 수집·클러스터링·주제화·평가·연결·재작성까지 담당하는 구조. 지금은 5~6단계 파이프라인의 절반 정도만 실제로 작동하는 상태(§2 진단 참고).

## 1. 현재 파이프라인 구조

```
collect-news(3h) → process-stories(3h+30m) → resolve-topics(수동/불명확) → [NEW] rewrite-question-title
                                                                          → [NEW] generate-expert-content
                                                → refresh-relationships(1일 1회 예정) → generate-insights → generate-node-insights
```

| 함수 | 역할 | netlify.toml 스케줄 | 실제 동작 여부(2026-07-09 진단) |
|---|---|---|---|
| collect-news | 20개 언론사 구글뉴스 RSS 수집 → articles | 3시간마다 | 최근까지 됐다가 07-09 이후 멈춤(§2) |
| process-stories | 클러스터링 → stories | 3시간 30분마다 | 동일 |
| resolve-topics | Story→Topic LLM 매칭/생성 → topics, topic_stories, topic_entities | (명시적 스케줄 없어 보임, admin 수동 버튼 위주로 추정) | 동일 |
| refresh-relationships | topic_entities co-occurrence로 topic_relations/entity_relations 생성 | 1일 1회(02:00) | **한 번도 성공 실행된 적 없음** — 관련 테이블 0행 |
| generate-insights | daily_insights 생성(홈 인사이트용) | 1일 1회(02:15) | 동일하게 미실행(daily_insights 0행) |
| generate-node-insights | 노드별 인사이트 | 1일 1회(02:30) | 미확인, 아마 동일 |
| enrich-article-images (신규, 2026-07-10) | 기사 og:image 백필 | 수동 실행 전용(스케줄 없음) | DB 마이그레이션 대기라 아직 비활성 |

## 2. 2026-07-09~10 파이프라인 진단 — 발견 사항 전체 기록

**조사 방법**: `.env.local`이 로컬에 없어 DB 직접 접근이 막혀 있었으나, `app/admin/page.tsx`에 하드코딩된 Supabase anon(publishable) key(`https://xlxztrnpmzklbnyfkrze.supabase.co`, `sb_publishable_...`)로 읽기 전용 REST 조회가 가능함을 발견해 이를 통해 진단함. 쓰기 권한(SUPABASE_SERVICE_KEY)과 Netlify 대시보드/CLI 접근 권한은 없음 — 이 두 가지가 확보되면 진단이 훨씬 정확해짐.

### 발견 1 — 최근 데이터 없음
articles/stories/topics 전부 마지막 생성 시각이 **2026-07-09 02:08~02:12 UTC**. 조사 시점(07-09 17:20 UTC) 기준 15시간 이상 신규 데이터 없음. 3시간 주기라면 이미 4~5사이클 누락.

### 발견 2 — 생성 패턴이 "자동 cron"보다 "매일 수동 실행"에 가까움
`topics.created_at`을 날짜별로 집계하면:
```
2026-07-05T20시: 10개   2026-07-05T21시: 5개
2026-07-06T02시: 5개    2026-07-07T02시: 5개
2026-07-08T01시: 3개    2026-07-09T02시: 4개
```
하루에 딱 1번, 10~40분의 짧은 구간에 몰려서 생성됨. 3시간마다 자동으로 돈다면 하루 8번 정도 분산되어야 하는데 그렇지 않음. **가설(미확정): 자동 스케줄이 처음부터 정상 작동한 적이 없고, 매일 누군가 admin 페이지에서 버튼을 수동으로 눌러온 것으로 추정되며, 그 수동 실행이 07-09 이후 끊긴 것으로 보인다.** Netlify Scheduled Functions 대시보드 로그로 확정 필요(권한 없어 미확인).

### 발견 3 — importance_score/popularity_score가 전부 50
활성 토픽 32개 전원이 `importance_score: 50, popularity_score: 50` — 고유 조합이 정확히 1개뿐임을 확인. 6개 파이프라인 함수 코드를 전부 읽었으나 이 필드를 계산/갱신하는 로직이 **어디에도 없음**. DB 컬럼 기본값이 그대로 남아있는 것 — "고장"이 아니라 "애초에 미구현". Hero/그리드 정렬(`getActiveTopics`의 `order by importance_score desc`)이 현재 사실상 무의미함.

### 발견 4 — topic_relations, entity_relations, daily_insights 전부 0행
`refresh-relationships.js`(topic_relations/entity_relations 생성), `generate-insights.js`(daily_insights 생성) 둘 다 **한 번도 성공 실행된 적이 없는 것으로 보임**. `topic_entities`는 47행 존재(resolve-topics.js가 채움) — 즉 refresh-relationships가 돌 재료(co-occurrence 데이터)는 있는데 실행 자체가 안 된 것으로 추정.

### 발견 5 — 함수 자체는 정상 배포됨
`https://newsjeoul.co.kr/.netlify/functions/{함수명}`에 인증 없이 GET 요청 시 전부 `HTTP 401 {"error":"Unauthorized"}` 정상 응답(collect-news, process-stories, resolve-topics, refresh-relationships, generate-insights 확인). 즉 코드 배포/라우팅 자체는 문제없음 — 문제는 "언제 실행되는가"에 있음.

### 발견 6 — admin "⚡ 전체 파이프라인" 버튼이 2단계뿐이었음
기존엔 collect-news + process-stories만 순차 실행. resolve-topics/refresh-relationships는 개별 버튼으로 따로 눌러야 했음 — 발견 2의 "누군가 매일 수동으로 버튼 몇 개만 눌러온" 가설과 정합적. **2026-07-10 조치**: resolve-topics + refresh-relationships까지 포함한 4단계로 확장(`app/admin/page.tsx`, 승인 대기 중이던 코드 — 이건 "관리자 편의 기능"이라 [1]항목으로 이미 반영 가능, §승인 경계 참고). "점수 계산"(발견 3) 단계는 코드 자체가 없어 체인에 넣지 못함.

## 3. 승인 경계 (2026-07-10 확정, 다음 세션도 계속 적용)

### [1] 승인 없이 계속 진행 가능
- 문서화(이 바이블들 포함), 조사 결과 기록, TODO 정리
- 파이프라인 원인 조사(코드 리딩, 읽기 전용 DB 조회, Netlify 로그 확인 — 접근되면)
- Admin 편의 기능 추가(기존 기능 깨뜨리지 않는 선에서)
- 코드 정리: 리팩토링, 주석, 문서화, 미사용 코드 조사, Deprecated 정리
- UX/CTR/SEO/콘텐츠/Threads/카드디자인/모션 사례 조사(구현 없이 조사만)

### [2] 반드시 승인 필요 — 절대 먼저 구현하지 않음
- Hero 변경, 메인 UI 변경
- 콘텐츠 생성 방식 변경, 질문 생성 로직 변경
- importance_score 알고리즘(신규 구현 포함)
- topic_relations 생성 방식 변경
- Hero 화이트리스트(변경 시)
- 이미지 컬럼 추가, DB 스키마 변경, 마이그레이션
- 자동 스케줄 변경, 파이프라인 구조 변경
- AI 프롬프트 변경

## TODO (다음 세션)

- [ ] **[최우선]** Netlify 대시보드 Functions 탭 확인 — Scheduled Functions 등록/실행 이력/에러 로그. 접근 권한(NETLIFY_AUTH_TOKEN 또는 CLI 로그인) 필요
- [ ] refresh-relationships가 왜 한 번도 안 돌았는지 — 수동으로 한 번 트리거해보고 에러 확인(승인 후)
- [ ] importance_score 스코어링 로직 설계안 작성(구현 전 승인 필요)
- [ ] "누가 매일 수동으로 파이프라인을 눌러왔는지" 확인 — 실제로 그랬다면 왜 07-09에 멈췄는지 사람 쪽 원인 확인
