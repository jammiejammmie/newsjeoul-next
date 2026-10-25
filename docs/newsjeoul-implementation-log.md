# 뉴스저울 Implementation Log

> `docs/newsjeoul-decision-log.md`는 "왜 그렇게 정했는가"만 남기고 과거 항목을 수정하지 않는 이력 문서다. 이 문서는 그 결정들이 **실제로 구현·배포된 진행 상태**를 추적하는 별도 로그다 — Decision Log 항목(DEC-00X)을 수정하지 않고, 구현이 진행될 때마다 여기에 새 항목을 추가한다.

## 사용 규칙

1. 각 항목은 관련 `DEC-00X`를 명시하고, 아래 상태 필드를 갖는다:
   - `Status`: `Designed` → `In Progress` → `Implemented` → `Deployed` → `Verified`
   - `Implementation`: `Pending` / `In Progress` / `Done`
   - `DB Migration`: `Not Applied` / `Applied`(적용일자)
   - `Production`: `Not Deployed` / `Deployed`(커밋 해시·일자)
2. 상태가 바뀔 때마다 **새 하위 업데이트를 추가**한다(과거 기록을 지우지 않고 아래에 이어 쓴다) — Decision Log와 같은 append-only 원칙.
3. 실제 커밋 해시·검증 결과(재현/재검증 로그)가 있으면 반드시 링크/인용한다.

---

## DEC-006 — Publish Gate

- **2026-07-16**: `Status: Designed` / `Implementation: Pending` / `DB Migration: Not Applied` / `Production: Not Deployed`
  설계서 `docs/newsjeoul-publish-gate-design.md` 작성 완료. 코드 구현 착수 전.

- **2026-07-17**: `Status: In Progress` / `Implementation: Done(로컬)` / `DB Migration: Not Applied` / `Production: Not Deployed`
  설계서 §1~§5 그대로 구현 완료(임의 재해석 없음):
  - `supabase/publish_gate_migration.sql` — `topics.gate_status` 컬럼 추가(§6)
  - `netlify/functions/generate-publish-gate-background.js` — Rule 예비필터(§2-1) + LLM 8기준·CTR 4문항(§2-2) + 결정론적 4상태 매핑(§3) + `ai_context.gate` 로그(§4)
  - `netlify/functions/override-gate-status.js` — Admin "수정"/"강제 발행" 버튼용 신규 엔드포인트(§5)
  - `netlify/functions/generate-editorial-draft-background.js` — 대상 쿼리에 `gate_status=eq.publish_long` 조건 추가(§1)
  - `app/admin/page.tsx` — Publish Gate 목록/필터/판단이유/CTR스코어/수정 드롭다운/강제발행 버튼 + 개발용 트리거(⑤) 추가(§5)
  검증: `node --check` 3개 파일 전부 통과, `npm run build`(TypeScript 포함) 통과, mock 테스트 2건(gate 4가지 결과 분기 7개 assertion, override 엔드포인트 7개 assertion) 전체 통과. 아직 실제 DB에 마이그레이션 미적용 — 실운영 데이터 검증은 다음 업데이트에서.

- **2026-07-17**: `Status: In Progress` / `Implementation: Done` / `DB Migration: Applied(2026-07-17, Supabase SQL Editor)` / `Production: Not Deployed`
  `topics.gate_status` 컬럼 실제 적용 확인(anon key로 11개 planned Topic 전부 `gate_status='pending_gate'` 기본값 확인). `netlify.toml`에 `generate-publish-gate-background` 스케줄(`52 */3 * * *`, editorial-plan과 editorial-draft 사이) 추가, Python `tomllib`로 재검증. `npm run build` 재통과. Push + Cron 실배포는 PM 승인 대기.

- **2026-07-17**: `Status: Verified` / `Implementation: Done` / `DB Migration: Applied` / `Production: Deployed(커밋 5380b06)`
  Push 완료, `searchSiteFunctions`로 `generate-publish-gate-background`(`im: background`, schedule 정상 등록) 확인. 기존 planned backlog 11건 전체에 Gate 적용 완료 — publish_long 6 / reject 3 / publish_short 1 / hold 1. 판정 이유 샘플 검수(REJECT 사례 근거가 원본 데이터 품질 문제를 정확히 짚어내는 것 확인, 자의적 판단 아님). `generate-editorial-draft-background` 재검증: publish_long 판정된 Topic("실종 해군 병사 시신 발견")이 실제로 `published`까지 자동 진행되고, reject/hold/publish_short 5건은 `planned`에 그대로 남아 장문 생성 대상에서 정상 제외됨을 확인 — 완료 기준 실증됨.
  잔여 관찰: 최초 트리거 시 11건 중 일부가 15분 예산 내 한 번에 처리되지 않고 여러 차례 재트리거가 필요했음(각 트리거가 몇 건씩 처리 후 멈추는 패턴) — 원인 미규명, 기능 자체는 멱등적이라 반복 트리거로 완결되나 향후 배치 크기/타임아웃 튜닝 여지로 남겨둠.

DEC-006(Publish Gate) 작업 종료. 다음 우선순위는 100명 Editorial Persona Registry(신규 작업, 별도 Decision 필요 시 새 DEC-ID로 기록).

## DEC-007 — 대량 AI 편집국 전환(Content Routing Gate + Persona Editor 중심)

- **2026-07-17**: `Status: In Progress` / `Implementation: Done(로컬)` / `DB Migration: Not Applied` / `Production: Not Deployed`
  다음 항목을 전부 구현·로컬 테스트·빌드 통과·로컬 커밋까지 완료(커밋 `603a038`, 이후 이 세션의 추가 변경은 아직 별도 커밋 전):
  - **Content Routing Gate**: `generate-publish-gate-background.js`를 4종(reject-heavy) → 8종 라우터로 전면 재작성. REJECT는 광고/중복/무가치로만 한정, LLM이 REJECT를 골라도 `is_ad_or_duplicate_or_empty`가 아니면 코드가 `SHORT_BRIEF`로 강제 강등(안전장치). `generate-editorial-draft-background.js` 쿼리를 `gate_status=eq.DEEP_DIVE`로 갱신. `override-gate-status.js` 8종으로 갱신. Mock 테스트 7/7 통과.
  - **100명 Persona Registry**: `persona_registry_100_migration.sql`(신규 컬럼 7개, additive) + `persona_registry_100_seed.sql`(91명 신규, archetype×domain-변형 매트릭스, 기존 14명과 이름/조합 중복 0건 확인) 작성 완료. DB 미적용.
  - **Assignment Engine 개선**: `pickEditor()`에 단계적 폴백(태그→도메인→사건유형→로테이션 전체) 추가해 미배정 0%를 구조적으로 보장, 같은 Topic 내 대립관점에 동일 에디터 중복배정 방지(순차 배정 + 배정분 제외), `assignment_count` 누적 반영. Mock 테스트 5/5 통과. 실제 event_type_rules 10종의 perspective_candidates 전부가 105명 풀(기존14+신규91)에 정확히 존재함을 스크립트로 검증(0건 누락).
  - **프롬프트 차별화**: `buildPersonaSnippet`에 `specialty`/`banned_expressions` 반영 — 에디터 개성이 실제 생성 결과 차이로 이어지도록. Mock 테스트 4/4 통과.
  - **몇 g 실제 산정 엔진**: `update-topic-weight-background.js` 신설. `topics.importance_score`가 전 구간 50 고정값이었던 문제(코드 주석으로 이미 확인된 사실)를 실제 신호(사건유형 기본무게+연결 스토리/엔티티 수+엔티티 강도+논쟁도+대립관점+최신성)로 대체, `weight_reasons`/`components`/`weight_history`를 `ai_context.weight`에 저장(신규 컬럼·마이그레이션 불필요 — 기존 jsonb 재사용). 발행 여부(Gate)와 독립 축 유지(gate_status 참조 안 함). Mock 테스트 7/7 통과.
  - **display_keywords**: Draft 생성 프롬프트에 키워드 작성 규칙 추가(추상어 금지, 인물/기업/제품/정책명·구체정보·갈등변화결과 우선), 출력 스키마에 `display_keywords` 필드 추가.
  - **Topic/Home UI**: Topic 페이지에 키워드 강조(엔티티 매칭 시 링크), 무게 산정 근거 목록, 담당 에디터 byline 추가. Home 커버 카드(히어로+사이드)에 키워드 오버레이 추가하고 무게(g) 표시는 좌상단 고정 위치로 분리(경쟁 방지). 실제 prod 데이터로 Playwright 스크린샷 확인 — 레이아웃 회귀 없음, 빈 상태(키워드/무게근거 없음) 정상 처리 확인.
  - **Admin UI**: Content Routing Gate 카드의 문구/필터가 8종으로 갱신 안 돼있던 실제 버그 발견·수정(배지색·드롭다운만 갱신되고 설명문구·필터칩은 이전 CRLF 패치 실패로 누락돼 있었음). 신규 Persona/에디터 관리 카드(전체/미배정/과다배정 통계, tag 필터, 활성화 토글) + `update-editor.js` 신규 엔드포인트 추가, Mock 테스트 4/4 통과.
  - **회귀 검증**: `npm run build`(TypeScript 포함) 총 4회 재통과(각 UI/엔진 변경 단계마다), 신규 Mock 테스트 5종 전체 통과(routing gate, assignment engine, persona snippet, weight engine, update-editor).
  - **netlify.toml**: `update-topic-weight-background` 스케줄(`59 */3 * * *`, relation-context 직후) 추가, `tomllib`로 검증. 아직 미배포.
  DB 마이그레이션 적용, Cron 반영, Push+배포는 PM 승인 대기.

## DEC-008 — Cron 401 근본원인 수정 + Scheduler/Worker 분리(Phase 2) + Threads 자동게시 정정

- **2026-07-17 (Phase 1 — 임시수정, 배포됨)**: `Status: Deployed` / `Implementation: Done` / `DB Migration: N/A` / `Production: Deployed(커밋 7bee02e)`
  실운영 검증 중 Content Routing Gate/Persona 배정 데이터가 실제로 확인됐으나, DB 타임스탬프 조사 결과 전체 파이프라인(articles/stories/topics)이 2.5일 이상 자동 갱신되지 않은 것을 발견. `netlify logs --source functions`로 실제 스케줄 호출 로그를 확인한 결과 `collect-news`가 5ms 만에 종료(정상 실행은 14초+) — Netlify 공식 문서 확인 결과 Scheduled Function은 `httpMethod:'POST'`로 호출되는데, 기존 코드의 `if (event.httpMethod) checkAdminKey` 패턴이 이를 구분하지 못해 스케줄 호출마다 401을 반환하고 있었음(근본원인 확정). 19개 함수 전체에 `event.headers['x-nf-event']==='schedule'` 감지로 인증을 건너뛰는 패치 적용, Mock 테스트(스케줄 통과/무단 수동 여전히 401/정상 관리자 통과) 전체 통과 후 PM에게 잔여 리스크(헤더 스푸핑 가능) 명시적으로 보고, PM 승인 하에 배포.

- **2026-07-17 (Phase 2 착수 — Scheduler/Worker 분리, 로컬 구현 완료·미배포)**: `Status: In Progress` / `Implementation: Done(로컬)` / `DB Migration: Not Applied` / `Production: Not Deployed`
  PM 지시로 "1~2주 뒤 후속 과제"가 아니라 Cron 복구의 Phase 2로 격상. `netlify/functions/lib/cron-guard.js`(공용 dispatch 모듈 — 잠금(cron_locks)·최소 실행간격·서버측 ADMIN_KEY 위임·감사로그(cron_invocations)) + 19개 `*-scheduler.js`(collect-news, process-stories-background, extract-entities, resolve-topics-background, generate-updates, enrich-article-images, generate-zeitgeist-background, generate-editorial-plan-background, generate-publish-gate-background, generate-editorial-draft-background, generate-relation-context-background, update-topic-weight-background, refresh-relationships, generate-insights, generate-node-insights, update-elections, update-elections-evening, update-news, update-news-evening) 신설. `supabase/cron_scheduler_worker_migration.sql`(cron_locks/cron_invocations 테이블) 작성. Mock 테스트: 정상 dispatch/최소간격 미달 skip/동시실행 skip/워커 실패시 잠금 반드시 해제 등 7/7 통과. **의도적으로 netlify.toml은 아직 건드리지 않음** — 기존 워커 파일의 x-nf-event 우회 인증도 그대로 둠(Phase 1 배포 상태를 깨지 않기 위해). Phase 2 실제 전환(netlify.toml의 schedule을 `*-scheduler.js`로 교체 + 워커 인증을 다시 엄격한 adminKey 전용으로 되돌리는 것)은 별도 승인 후 원자적으로 한 번에 배포 예정.

- **2026-07-17 (Threads 자동게시 정정 — 로컬 구현 완료·미배포)**: `Status: In Progress` / `Implementation: Done(로컬)` / `DB Migration: Not Applied` / `Production: Not Deployed`
  근본원인 3가지 확인: (1) `post-threads.js` 자체 주석에 "발행 빈도는 하루 1회로 유지, 매시간 발행은 별도 승인 전까지 보류"라고 이미 명시돼 있었음 — "하루 여러 차례"는 애초에 구현된 적 없음(회귀 아님, 미완료 상태). (2) `.github/workflows/news-pipeline.yml`이 2026-07-14 함수 개명(`process-stories`→`-background`, `resolve-topics`→`-background`) 이후 옛 경로를 그대로 호출해 매일 2단계에서 404로 실패, 3~5단계 전부 skip — GitHub Actions 실행 이력(API로 직접 확인)에서 07-14 이전엔 성공, 07-15/07-16 연속 실패로 정확히 일치. (3) `post-threads.js`의 `fetchTopSilenceStory()`가 "오늘 생성된 story 없음"을 정상 Skip이 아니라 `throw`로 처리해 500 하드 실패 유발 — 파이프라인이 막혀있던 기간엔 이게 거의 매일 발생했을 것으로 추정.
  수정: `news-pipeline.yml`의 개명된 경로 수정(202도 정상 처리하도록 조건 추가) + 완료 대기 sleep 추가. `post-threads.js`를 전면 재설계 — 후보를 raw stories 대신 published Topics 풀(importance_score 순, 최근 24시간 내 게시 제외)에서 선정해 후보 없음을 500이 아닌 200/skipped로 처리, 정적 템플릿 A~O를 Claude 기반 Hook 카피 생성(강한 첫문장/놓친지점/정보격차/유도, 저품질 상투어 금지)으로 교체, UTM에 `utm_content={topic_id}_{hook_type}` 추가, 게시 건마다 topic_id/hook_type/editors/status/failure_reason/source_url을 기록하도록 `threads_posts` 확장(`supabase/threads_posts_extend_migration.sql`, 미적용). Mock 테스트 8/8 통과(후보 있음/없음/스케줄 인증통과/무단 401/로그 필드/UTM 전부 검증). 실제 수동 호출로도 실제 Threads 게시 1건 성공 확인(post-threads.js 구버전 기준, 재설계판은 아직 실서버 미배포).
  미결: netlify.toml 전환 배포, `.github/workflows/post-threads.yml` 스케줄을 하루 4회(KST 08:30/12:30/18:30/22:30)로 변경(별도 승인 필요), Threads Token 재발급 여부 판단.

## 2026-10-26 — DEC-010 구독 기반 편집 경로

- Designed: 기존 허브/URL 유지, 저장소 원고 우선 병합, 글별 기존 제휴 슬롯 선택, sitemap 중복 제거.
- Implemented (local): 첫 버즈4 단품 구매 원고, API 호출 없는 조회 경로, 공식자료 대조 표기, 최저가 단정 제거.
- Verified (local): 순수 로직 회귀 검사 통과; TypeScript 검사 통과. 빌드 결과는 최종 작업 보고 참고.
- Deployed: 아님. git push/운영 배포 승인 전이며 DB·환경변수·cron을 변경하지 않았다.
- 추가 검증 결과: production 컴파일/타입 검사는 통과했으나 전체 빌드는 기존 홈 prerender의 `supabaseUrl is required`로 중단. 로컬 HTTP 확인은 dev 서버 접근 실패로 미완료이며 화면 검수 완료로 보고하지 않는다. 운영 자격정보를 임의로 사용하지 않았다.

## 2026-10-26 — DEC-011 반영과 GitHub 쓰기 결과

- 사용자 운영 위임을 AGENTS.md와 DEC-011에 기록했다. 반복 배포 승인 대기는 해소했다.
- origin/master를 재조회해 3af873dcd85dda924ee1ec525c7abd90a9a8e6b6에서 변경 없음을 확인했다.
- 기존 workflow의 유료 모델 생성 경로는 대부분 workflow_dispatch만 남아 있고, 변경 대상 파일의 push가 생성기를 호출하지 않음을 확인했다. 작업 중 유료 모델 API를 호출하지 않았다.
- 로컬 콘텐츠 검사, TypeScript, git diff --check 통과.
- GitHub 브랜치 생성 요청이 403 `Resource not accessible by integration`을 반환했다. 브랜치 생성/원격 커밋/PR/배포 모두 미완료. 이는 GitHub 통합 접근 권한 응답이며 사용자 승인 부족이나 유료 플랜 문제로 단정하지 않는다. 동일 쓰기 요청은 반복하지 않았다.

## 2026-10-26 — DEC-012 실용 가이드 홈 v2

- Implemented (local): 신규 편집형 홈, 검색/분야 필터, 견적 비교 계산기, 모바일 내비게이션, 클릭 가능한 원자료 링크. 원고 총4편(기존2개정+신규2), 옛 홈 legacy 보관.
- Verified: production 전체 빌드 통과, TypeScript 통과, 로컬 production HTTP200(홈/4가이드/sitemap), 제휴링크 범위와 sitemap 중복 검사 통과.
- 시각 검수: Playwright 브라우저 다운로드가 ZIP 손상 오류로 실패. 실제 데스크톱/모바일 스크린샷 및 브라우저 상호작용 검수는 미완료다. 코드의 반응형 분기와 실제 서버 HTML 검증을 시각 검수로 보고하지 않는다.
- Deployed: 아님. GitHub 브랜치 생성403 때문에 로컬 커밋까지 보존. 유료 호출/추가 결제/cron 변경 없음.

## 2026-10-26 — v2.1 검색 통합과 실제 브라우저 검수

- 발견: 기존 /search는 topic/entity만 검색했고 DB 클라이언트 생성이 try 밖이라 환경변수 부재 시 실패했다.
- 수정: 원고 검색을 통합하고 DB 연결 오류 때도 원고 검색 결과를 유지한다. 빈 검색·복수 한국어 검색·Unicode 정규화·limit을 회귀 검사한다.
- 권한 재확인: 저장소 metadata에서 사용자 push 권한은 true지만 통합 브랜치 생성403은 별개다. 관리 가능한 설치 목록은 빈 배열이었다. 도구로 앱의 Contents 쓰기 권한을 변경하는 경로는 확인되지 않았다. 연결이 읽기 전용이라고 확정하거나 사용자 승인 부족으로 설명하지 않는다.
- 브라우저: 다운로드 ZIP 실패와 별개로 QA 전용 Chromium 패키지를 확보했다. 실제 브라우저에서 필터/검색/계산기(양쪽 비용 우위)/320·375px overflow/원자료 링크/JS 오류 없음 검증을 진행했다.
- 실제 스크린샷에서 외부 한글 폰트 로딩 실패를 발견. 기존 저장소의 Pretendard OTF를 WOFF2로 압축하고 로컬 폰트 제공으로 전환 중. 기존 폰트는 삭제하지 않는다.

### v2.1 검수 완료 업데이트

- 기존 Pretendard 4개 OTF를 WOFF2로 압축해 제공한다. 해당 라이선스를 포함했고 기존 OTF/카드 렌더 경로는 보존했다. 새 유료 자산 없음.
- 최종 전체 빌드 성공. 실제 Chromium에서 홈 검색/분야 선택/결과 없음, 계산기 양방향 비용 비교, 사이트 검색→가이드 연결, 제휴 링크 범위와 원자료 링크, JS 오류 없음 검사를 통과했다.
- 320px·375px 모바일 가로 넘침 없음 확인. 실제 desktop/mobile 스크린샷을 직접 열어 한글 표시·여백·계산기와 카드 가독성을 검수했다. 이전 시각 검수 미완료 기록을 해소한다.
- docs/previews/home-v2-desktop.png, home-v2-mobile-375.png, home-v2-mobile-320.png, guide-v2-mobile.png는 실제 검수 결과다.
- 원격 GitHub/운영 배포는 여전히 미완료. 연결 권한의 해결 없이 공개 반영했다고 주장하지 않는다.

### DEC-013 — Implemented / 로컬 검증 (2026-10-26)

- 기존 유입 URL 및 canonical/본문을 보존하고 허브 문서·허브·토픽의 서버 렌더에 광고 패널 연결.
- 멜론 허브와 모든 하위 글, 청년도약계좌 job-change, 유재석 토픽, 플립 위젯, 버즈 단품, S25 기존 유입 글에 등록 슬롯 연결. 멜론 무제한/음질 글은 slug 변경 없이 전체 하위 경로 규칙으로 포함.
- 실제 레지스트리 목적지 호스트와 AF3904190 태그, 링크 앞 수수료 고지, sponsored/nofollow, 광고 중복 없음 검증. 제휴 목적지를 직접 열거나 자기 클릭을 만들지 않음.
- 기존 원고/검색 테스트 및 Next 프로덕션 빌드 통과. Supabase 운영 데이터 접근 없이 문서 보존: 운영 DB 기반 모든 페이지의 현재 응답까지 재확인한 것은 아님.
- 운영 배포 미완료: 앞서 GitHub 앱 쓰기 요청에서 403 Resource not accessible by integration 반환. 로컬 구현 완료와 공개 적용을 구분한다.

### DEC-010~013 — Deployed / Verified (2026-10-26 04:32 KST)

- 사용자가 GitHub 로그인 및 ChatGPT Codex Connector 설치를 완료했다. 설치 ID 175228954를 브라우저와 연결 API에서 확인했다. 이전 403 병목 해소.
- 41개 변경 파일의 Git blob SHA 및 전체 tree SHA f4332e0e93eff7aeefe07a6f54576e9fe3e0f3ed가 로컬 검증본과 원격에서 일치.
- PR https://github.com/jammiejammmie/newsjeoul-next/pull/1 병합 완료. master 223b99f609ac2388bfe5643ef2f4c2522f5dcca0.
- Netlify preview 완료, 운영 deploy 6ade58dec90fd88ecfaa9fa2 로그에서 Site is live 확인. https://app.netlify.com/projects/jazzy-truffle-7b8784/deploys/6ade58dec90fd88ecfaa9fa2
- https://newsjeoul.co.kr/ 에서 새 홈, 가이드 4개, 비용 비교 표시 확인.
- 주요 유입 10개 경로를 실제 브라우저에서 검증: melon-streaming 허브 및 family-account, streaming-light-vs-regular, unlimited-plans, sound-quality; youth-savings-account/job-change; topic/yoo-jaesuk-son-jiho-update; galaxy-z-flip8/cover-widget-missing; galaxy-buds4/single-bud-replacement; galaxy-s25-ultra/s-1xzjlx.
- 기존 URL·페이지 제목 및 상세 페이지 canonical 유지, 각 페이지 광고 패널 1개 확인. 링크 sponsored/nofollow/noopener/noreferrer 확인. 제휴 목적지 클릭은 하지 않았다.
- 유료 AI API·GitHub workflow·운영 데이터 변경 없이 기존 Netlify 자동 배포 경로로 반영.


### DEC-014 — Implemented / 검증 중 (2026-10-26)

기존 가이드 15편 개정, 신규 2편 작성. 기존 slug/title/canonical 보존. 새 문서를 허브에서 발견할 수 있도록 자동 연결하고 홈 분야를 확장했다. 17편 모두 등록된 쿠팡 제휴 슬롯과 고지를 사용하며 자기 제휴 클릭 없이 검증한다. 버즈 일반형/프로 사양 혼동과 아이폰 8배 광학 퀄리티 표현을 수정했다. 오래된 가격·재고 Offer 마크업을 제거하고 과거 참고가로 구분. 원고 병합/검색/사이트맵/제휴 슬롯 검사 및 production build 통과. 운영 배포는 후속 확인 필요.

DEC-014 로컬 최종 검증: 17편 모두 Chromium에서 제목·canonical·광고 1개·수수료 고지·320px 가로 넘침 없음 확인. 홈 분야 필터/검색/계산기 통과. 버즈·아이폰 허브 JSON-LD에 과거 가격 Offer 없음 확인. 전체 빌드 및 원고·제휴 회귀 테스트 통과. 참조용 기존 PNG는 보존하고 이번 검증은 재실행 가능한 scripts/check-editorial-browser.cjs에 포함했다.


### DEC-014 — Deployed / Verified (2026-10-26 KST)

- PR https://github.com/jammiejammmie/newsjeoul-next/pull/2 병합 완료. 운영 코드 commit 035ca24ea5b824be22d7232befe5e3161cdb4e5a.
- Netlify 운영 deploy 6ade644327e92092ed4b561b Published 확인. 빌드/배포 40초 완료. https://app.netlify.com/projects/jazzy-truffle-7b8784/deploys/6ade644327e92092ed4b561b
- 운영 홈페이지 21개 가이드 및 신규 2편 링크 확인. content-batch-20261026.json의 17개 URL 모두 HTTP 200, 기존/신규 제목 일치, 2026-10-26 확인 출처, 등록된 /go/ 제휴 링크와 수수료 고지 확인.
- 신규 USB-C 충전 및 로봇청소기 호환 소모품 글은 실제 브라우저에서도 본문·canonical·광고 링크 확인. affiliate registry의 AF3904190 및 sponsored/nofollow 검증을 통과했으며 자기 제휴 클릭은 만들지 않았다.
- 기존 반복 발행 설정 변경 없음. 유료 AI API·추가 결제 사용 없음. 108개 글을 비교해 선정한 15편 개정+2편 신규이며 전체 3351개 URL의 개별 사실 검증 완료를 의미하지 않는다.


### DEC-015 — Implemented / Verified locally (2026-10-26 KST)

- 전자제품 구매 롱테일 원고 8편: 신규 3편, 기존 URL 개정 5편. 제품별 공식 자료와 적용 조건을 명시하고 검색량·순위·직접 사용 후기를 꾸미지 않았다.
- 본문 맥락 내부링크를 안전한 /hub/ 전용 React 렌더러로 제공. 8편 모두 본문 링크 3개 이상, 서로 다른 연결 목적지 18개 HTTP 200 확인. 홈과 허브 연결 및 기존 canonical 유지.
- 8편 모두 기존 AF3904190 등록 제휴 슬롯·수수료 고지 검증. 제휴 링크 자기 클릭 없음.
- 프로덕션 빌드, 원고·검색·제휴 회귀 검사 통과. Chromium 375px에서 8편 제목·canonical·광고 1개·가로 넘침 없음·브라우저 오류 없음 확인. 모바일 그램 글 화면 육안 검수 완료.
- 운영 배포는 후속 확인 예정. 기존 자동화·API·환경 변수·DB 변경 없음.


### DEC-015 — Deployed / Verified (2026-10-26 KST)

- PR https://github.com/jammiejammmie/newsjeoul-next/pull/3 병합. 운영 commit 47802cfb99045776e733855646b60641a899872f.
- Netlify 운영 deploy 6ade6d3385e55c7f2fdfe8e3 Published 및 전체 단계 Complete 확인. https://app.netlify.com/projects/jazzy-truffle-7b8784/deploys/6ade6d3385e55c7f2fdfe8e3
- hot-electronics-20261026.json의 8개 공개 URL 전부 HTTP 200, 작성 제목 일치, canonical, 등록 제휴 링크 및 수수료 고지, 본문 내부링크 각 3개 확인. 신규 그램 프리도스 글은 실제 브라우저 본문/링크도 확인.
- 신규 3편·기존 URL 개정 5편 공개 완료. 본문 링크 24개, 로컬 검증의 고유 연결 목적지 18개. 기존 반복작업 변경 없음. 검색 상위노출 및 수익 발생 여부는 아직 관측하지 않았다.

### DEC-016 — Implemented / Local verification (2026-10-26)

- 메인 상품 영역 2곳, 허브 상세의 4개 이상 본문 블록 중 두 번째 블록 뒤 광고, 기존 하단 광고, 넓은 PC 양옆 sticky 영역 추가.
- 상세는 1280px, 홈은 1600px 이상에서만 양옆 표시. 320/375/1440/1920px 화면에서 본문 겹침·가로 넘침 검사 및 홈/상세 이미지 육안 확인. 외부 Google 폰트 요청만 로컬 QA에서 차단하고 자체 폰트 사용.
- 기존 제휴 레지스트리 AF3904190, sponsored/nofollow, 링크 앞 수수료 고지 유지. 품절·최저가 등 미확인 주장이나 외부 광고 SDK 추가 없음.
- production build, 원고/검색/제휴 회귀 검증 통과. 로컬에 운영 DB가 없어 정책 문서 URL 화면검사는 제외하고 기존 정책 고지는 컴포넌트 테스트로 확인. 운영 배포 후 홈/상세 공개 응답 확인 예정.

## DEC-016 — Deployed / Verified (2026-10-26)
PR #4 병합 6bd09220423f6dadf7f240f7649947c6c3cd2369. Netlify 6ade6f2c8dd6d6ae01967e5c Published 확인. 공개 홈의 left/home-top/home-bottom/right, 그램 RAM 글의 left/middle/bottom/right 배치 확인.

## DEC-017 — Implemented (2026-10-26)
그림 4종을 11개 URL에 명시 매핑. 홈 대표 이미지·썸네일과 본문 대표 이미지, 4개 글의 판단 카드 구현. 출처/제작 경위는 docs/editorial-visual-benchmark-20261026.md. 배포 검증은 후속 기록.

## DEC-017 — Local verification (2026-10-26)
Production build PASS. Playwright: 320/375/1440/1920px × 홈·그램·로보락·버즈·폴드 5경로, 이미지 로딩·본문 판단 카드·오버플로 없음·광고 위치/rel·페이지 JS 오류 없음 PASS. 375px 본문과 1920px 홈 스크린샷 육안 검수. WebP 4개 합계 약 224KB. 승인된 기존 GitHub→Netlify 배포 진행.


## DEC-017 — Deployed / Verified (2026-10-26)
PR #5 merge 3b4f3806324e1caae26c7c1ed8a41fa1eef0328b. Netlify production 6ade726128ddadf77cfe246c reported Site is live. Public HTTP checks: all 11 mapped article URLs returned 200 and article-visual markup. Public browser home confirmed 29 guides, new image thumbnails and affiliate panels. Existing URLs unchanged. Production build and responsive local image-loading QA passed.

## DEC-018 — Implemented (2026-10-26)
홈 대표 그림을 포함한 동일 일러스트 중복 제거. 같은 상품을 좌우에 반복하던 배치 제거. 상품명은 링크 식별키와 일치하는 쿠팡 스냅샷 기준. 실제 API 상품 이미지/확인 시각을 보존하도록 기존 갱신 경로 보완; push 실행에서는 기존 상품 URL 교체 금지. 사진·선택 포인트·CTA 카드 구현, 미확인 가격/할인/재고 수치 표시하지 않음. Production build PASS. 실제 API 이미지 수집·공개 렌더 확인은 배포 후 별도 기록.


## DEC-018 — Deployed / Verified (2026-10-26)
PR #6 merged (7cf538f). Official Coupang API image refresh run 40235869443 succeeded: 20 exact-matched slots now preserve product images. API images use ads-partners.coupang.com/image1; allowlist corrected without changing affiliate targets. Snapshot 88d9d7a deployed; Netlify 6ade753b2c5e1eeeae4118bf Published confirmed. Public home browser confirmed top three product photos loaded with exact product names, selection text and CTA. Editorial image sources on home are buds/robot/fold/gram, each once. Production build PASS; earlier 320/375/1440/1920 responsive layout QA PASS. Additional local external-photo decode check did not complete (EncodingError); public browser verified actual top photos loaded, not claimed as full external-image QA. No paid AI API, affiliate destination clicks, purchases or connection changes.


## DEC-019 — Implemented (2026-10-26)
상품별 질문·확인 이유·전용 CTA 적용. 기존 사진·상품 식별키·제휴 링크·수수료 고지 유지. Production build 및 git diff --check PASS. 배포 코드 commit 58dda4d2f316f382f3ce1009bd321c3d43674f7f. 기존 자동화 6ade5e6d09448191bc46f3d08aff4407에 포털/뉴스/제조사/Reddit 탐색, 시점별 근거 기록, 공식 검증, 롱테일 신규 글/기존 글 최신화, 제휴 카드와 배포 절차를 추가. 기존 Asia/Seoul 08/13/19 일정과 활성 상태 유지. SNS/소라 중단 유지.

## DEC-019 — Deployed / Verified (2026-10-26)
Netlify 6ade775afc9fba3129c138db, master 58dda4d Published 확인. 공개 https://newsjeoul.co.kr/ 브라우저 DOM에서 7개 상품별 질문과 각각의 CTA가 새 문구로 표시되는 것을 확인. 링크 목적지는 클릭하지 않음.

## DEC-020 — Implemented (2026-10-26)
QuickChoice 서버 컴포넌트와 8개 URL의 조건별 선택 데이터 추가. 상단은 선택 이유/감수할 점/행동, 하단은 최종 요약으로 구성. 상품 사진 중복 추가 없음. 플립 비교 글에 기존 폴드 슬롯을 함께 연결. 그램 16형↔14형, Slim↔Ultra, Matrix10↔L30s Plus를 상단과 중간·측면 광고에서 구분. Matrix10 원고의 잘못된 링크 설명 수정. 기존 URL·canonical·추적 태그·공식 출처 보존. 로보락/Dreame 공식 페이지 재확인. 직접 시험/최저가/추천 순위/수익 주장은 추가하지 않음.


### DEC-020 Verified / Published

PR #7 merged as 455c0c146df041e9af1a78aea0c556817a9491b6. Production build passed. Local production browser QA: eight routes at 375px and 1440px, HTTP200, choices, affiliate disclosure/rel, model distinction, no horizontal overflow or JS errors. Both layout screenshots inspected. Live newsjeoul.co.kr returned HTTP200 with 30초 빠른 선택, partner disclosure and canonical URL on all eight mapped routes. Existing URL and AF3904190 destinations preserved. No affiliate self-click or paid API use. This is a comparison/navigation enhancement, not a claim that all eight articles have been fully rewritten or that revenue improved.

Latest user instruction adopted in docs/subscription-editorial.md v2.3 and existing web editorial automation 6ade5e6d09448191bc46f3d08aff4407: each article must solve a concrete reader problem in one place by independently verifying and connecting scattered facts, conditions, costs, exceptions and next actions. Avoid moving essential answers behind internal links; do not invent novelty. Existing automation schedule and paused social channels unchanged.
