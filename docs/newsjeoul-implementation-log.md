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


## 2026-10-26 08시 — USB-C 허브 선택 기존 URL 개선
기존 `/hub/galaxy-book5-pro/buying-ak231s` 제목·slug·canonical·허브 연결 유지. 단순 포트 수에서 영상/충전/데이터 역할, 공식 Anker 특정 모델의 100W 입력과 85W 전달 예시, 분리 진단, 총비용, 구매 불필요 조건까지 보강. 별도 광고 모델과 예시 모델 구분. 자체 SVG 설명도 2장(600×880, 모바일 본문 글자 크기 고려), alt/caption/dimensions/lazy 적용. 새 이미지 컴포넌트는 해당 URL의 1·2번 문단 뒤만 적용. 기존 제휴 URL/AF3904190 보존. 실제 광고 목적지는 열지 않음. 신규 마우스 링크 미확보.
원고·검색·사이트맵 회귀 검사와 제휴 검사 PASS. 기존 제휴 테스트 로더 JSON default 처리 누락을 수정해 실제 스냅샷으로 검사. TypeScript 및 production build PASS. 로컬 Chromium 설치 다운로드 손상으로 모바일 브라우저 검수 미완료. 공개 확인은 후속 기록. 조사 및 Search Advisor 집계 범위: research-20261026-0803.json. SNS/소라/유료 API 작업 없음.


### USB-C 허브 — Deployed / 공개 검증 및 후속 보완
PR #8, master f138bb3e40036527499d576cb64220c0ff9d8e60. Netlify 6ade8c0ce3c423f4f5a9a909 Published(36초) 확인. 공개 브라우저에서 7개 섹션·도식 2개·내부링크·광고 고지 확인. 공개 검수에서 /go 문법이 평문으로 남는 문제와 한국 날짜가 서버 UTC로 표시되는 문제를 발견해 등록 슬롯에 한정한 본문 제휴 링크/rel과 Asia/Seoul 날짜 보완. 모바일 실기 렌더는 아직 미확인.
사용자 후속 지시 “네이보쇼핑커넥터에도 써보게”에 따라 테크쉽Get 쇼핑 커넥트 로그인과 상품 찾기 확인. 벨킨 공식몰 AVC009 7in1 USB-C 허브의 정식 링크 https://naver.me/FVF5vHqI 발급 완료(발급 완료 UI/클립보드 확인). 당시 표시 수수료 5%, 가격 49,900원은 관측값이며 변경 가능. 블로그/클립 게시·쿠팡 교체·외부 사이트 사용 가능 정책 확인은 아직 안 함. 정산/지급 정보 미등록 안내 관측, 입력/약관 동의/결제 없음. 이 링크는 현재 뉴스저울 웹에 삽입하지 않음.


### 2026-10-26 최종 공개 확인
PR #9 merged 36a7e20a743f4cbfe647ca55d8bfcc3c18c7e1b1. Netlify 목록에서 해당 master Published 확인. 운영 브라우저에서 canonical 보존, 2026.10.26 갱신 표시, 등록 /go/book5-hub 본문 링크 및 rel=sponsored nofollow 확인. 도식 두 장과 실제 제휴 사진 모두 loaded/naturalWidth>0 확인. 데스크톱 가로 넘침 없음 및 도식 한글 육안 확인. 모바일 실기 렌더는 Chromium 다운로드 실패로 미확인 상태 유지. 공개 기존 글 개선 1편, 신규 원고 공개 0편. 추가 유료 API·제휴 자기클릭 없음. ‘신박한 발견’은 docs/novel-product-discovery-plan.md에 기획 기록했으며 실제 사이트/블로그 메뉴나 클립을 생성한 것은 아님.

## DEC-021 — Implemented / Local validation (2026-10-26)
`/discoveries` 신박한 발견 모음과 홈 진입 링크·신박한 발견 필터, 첫 A210C 모델 구매 판단 글 추가. 기존 허브 조회·검색·관련 글·사이트맵 경로 재사용. 본문 도식2종은 제품 외관/실측 UI가 아닌 공식 조건의 자체 설명. 한국어 글리프가 없는 QA 브라우저에서 도식 글자가 깨지는 문제를 발견해 기존 Pretendard 폰트의 필요한 글자만 SVG에 내장하는 방식으로 보완. 원고·제휴 회귀 검사 및 production build PASS. 새 A210C 쿠팡 링크 미확보로 기존 시그델 UH-04 링크를 모델이 다른 대안 광고로 본문 끝에만 구분. 기존 제휴 식별자/목적지 유지. 조사·보류·시점 근거는 discoveries-research-20261026-0856.json. 블로그/클립 실제 게시나 카테고리 생성은 하지 않음.

### DEC-021 — Responsive QA passed
실제 Chromium 렌더 375px·1440px에서 홈/신박한 발견/신규 원고 모두 HTTP200, 가로 넘침 없음. 홈의 신박한 발견 필터는 정확히 첫 글1개 반환. 본문 도식2개 모두 decode 성공, 375px 스크린샷에서 한국어 내장 글리프·문단·고지 육안 검수. 본문 등록 제휴 링크 sponsored/nofollow와 다른 모델(시그델 UH-04) 문구 확인. initial QA의 로컬 글리프 부족과 브라우저 마지막 페이지 종료 문제를 해결한 뒤 최종 6경로 검사 PASS. 추가 production 의존성 없음. 테스트용 Chromium은 임시 환경에서만 사용.


### DEC-021 — Deployed / Verified
PR #10 merged e2b120fb8dcec0ee22ddbe6097dbcdb68ee4040d. Netlify 6ade98aeb40722729832c018 Published. 공개 /discoveries와 첫 A210C 원고의 제목·본문·내부링크·설명도·구분된 대안 광고 확인. 원격 11개 파일 내용을 로컬과 100% 대조. 본문 수수료 고지는 링크 앞에 문장 전체가 보이도록 후속 보완. 신규 글1편·모음1개, 기존 글 본문 변경0편. 블로그·클립 미게시, 새 A210C 정식 쿠팡 링크 미확보 유지.


### DEC-021 — 최종 공개 확인 완료
PR #11 merged 5822596df38c9b2a2c603ca5a90660bfba07bb89, Netlify 6ade991d0ade6d436e7fdb04 Published/44초 확인. 운영 기본 URL(검증 query 없는 주소)에서 HTTP200 및 링크 앞 전체 수수료 문구 확인, 공개 브라우저에서 sponsored/nofollow 재확인. 홈·/discoveries·신규 글·sitemap 모두200, 신규 글/모음 canonical·sitemap실제 수정일 연결 확인. 두 본문 이미지 공개 로딩 성공. 기존 URL 삭제/교체 없음. 추가 비용/API 호출·제휴 자기클릭 없음. A210C 직접 제휴 링크/원본 영상 재사용 허가는 미확보이며 블로그·클립은 게시하지 않음.

## DEC-022 — 테크쉽Get 공개 완료 / 웹 구현·로컬 검수 (2026-10-26)
- 테크쉽Get 신박한 발견(category9) 공개 생성. A210C 첫 글 https://blog.naver.com/techshipget/224453826660 실제 공개·카테고리1개·전체63개·한국어 구매 판단 본문 확인. 블로그 전용 문장, 자체 설명 PNG2장, 공식스토어의 같은 A210C 네이티브 쇼핑 커넥트 상품 카드·자동/수동 수수료 고지·공식 출처·뉴스저울 링크 포함. 쿠팡 A210C 링크를 확보한 것은 아니다.
- category_name의 화면 변경만으로 이름 저장을 단정한 초기 문제를 공개 직전 자동 검수가 차단. 실제 키 입력 후 확인 버튼 Enter 제출에서 '성공적으로 반영되었습니다'를 확인하고 공개 목록 재확인. 임시저장한 원고를 불러와 신박한 발견 선택값 확인 후 발행했다. 거절된 공개를 우회하거나 잘못된 카테고리로 발행하지 않았다.
- 블로그 모바일 별도 도메인 검수는 브라우저 정책상 불가. 공개 PC 본문과 링크·상품 카드·설명 이미지의 저장 및 지연 로딩을 확인. 클립 게시 없음. 과거 네이버 로그인 불가 상태는 이번 사용자 로그인 복구로 해소됐으며 소라/SNS 중단 유지.
- 뉴스저울은 당일 공식 출시 발표가 있는 버즈 온의 도서관 누음·AI 지원·케이스 쿠폰 판단을 별도 글로 구현. 10월1일 공개, 10월26일 발표, 10월27일 국내 출시를 구분. 버즈4 일반형 제휴는 다른 모델의 대안임을 명시하고 자동 광고 패널 제외. 원본 사진2장 중 본문 착용1장·목록 케이스1장, 자체 본문 도식2장. 삼성 뉴스룸 콘텐츠 이용 조건·워터마크/작성자 여부를 확인했고 사진 픽셀·압축 데이터·크롭은 변경하지 않았다. 자동 업로드 검수의 보류 후 공개 원본에 GPS 필드가 있음을 확인해 EXIF만 제거했다. 픽셀 동일·EXIF 없음 검증을 통과한 파일만 최종 tree에 포함한다.
- 원고/검색/사이트맵·제휴 회귀 검사 및 production build PASS. 375·1440px × 홈/모음/신규 글 모두 HTTP200·canonical·목록2개·본문 이미지3개 decode·의미 있는 alt·광고 고지 선행·등록 링크 sponsored/nofollow·가로 넘침 없음 검사 PASS. 모바일 상단 사진·글자·조건 설명 육안 확인. 첫 QA의 외부 네트워크 idle 대기 timeout은 DOM 준비·명시 이미지 decode 검사로 해소. 운영 공개는 후속 기록.
- 조사·보류·검색 지표 범위: research-20261026-0955.json. 블로그 게시 ID/정식 상품 목적지: channel-publications-20261026.json. 검색 지표는 10월24일 집계로 동일하며 신규 글 성과/제휴 클릭으로 해석하지 않음.


### DEC-022 — Deployed / 공개 검증
PR #12 merged 3b556b8b1c0b46aadef0a321b4ed667b9d2b69cb. Netlify 운영 deploy 6adea992e3c423f4f5b3e709 Published master 확인. 공개 홈·/discoveries·신규 버즈 온 글·sitemap 모두 HTTP200, 신규 경로 연결, canonical·제목·수수료 고지 선행·sponsored/nofollow·버즈4 대안 모델 구분·본문 이미지3개 확인. 공개 사진2개는 EXIF 0개 및 원본 픽셀 유지 확인. 미확보 버즈 온 직접 쿠팡 링크는 다른 모델로 가장하지 않음. 테크쉽Get 첫 글은 별도 PUBLISHED 기록 유지. 공개 최종 검수에서 다섯 단계가 한 문단으로 합쳐지는 것을 확인해 기존 렌더러가 지원하는 목록 문법으로만 보완한다. 내일 국내 실제 판매/쿠폰 개시 여부는 출시 예정과 구분해 후속 확인 대상이며 새 자동화를 만들지 않았다.


### DEC-022 — 최종 목록 보완 공개 확인
PR #13 merged 2f12c18debbc9b912fade03262ae361469000564. Netlify 운영 deploy 6adeab74c04d090a1d64b6fa의 Published deploy 확인. 동일 운영 URL에서 구매 전 다섯 단계를 실제 li 5개로 확인했고 canonical·기존 등록 링크 rel=sponsored nofollow·다른 모델 구분·링크 앞 수수료 고지를 유지했다. 본문 사진·설명도 3개 모두 스크롤 후 loaded/naturalWidth>0 확인. 이번 실행 결과는 테크쉽Get 새 카테고리/글 1편 실제 공개와 뉴스저울 신규 글 1편 실제 공개이며 예약·초안 완료로 보고하지 않는다. A210C 블로그는 정식 네이티브 쇼핑 커넥트 카드, 버즈 온 직접 쿠팡 링크는 미확보로 유지. 추가 유료 API·제휴 자기클릭·SNS/소라 재개 없음.


## DEC-023 — Audit / Prepared, 공개 수정 미완료
기존 A210C 글의 소제목은 본문과 동일19pt 굵게, 태그3개(A210C/USB허브/신박한발견)로 확인. 공개 이미지 컴포넌트2개와 스크롤 후 첫 이미지773px 로딩은 확인했으나 원본이 실제 연결 관계 없는 텍스트 카드여서 도식 검수 통과가 부적절했다. 네이버 레퍼런스2편을 실제 열람해 이미지/문단 역할 분석. 제목 계층·직접 답변·3개의 장치 관계 설명도·관련 태그10개를 포함한 HTML 검토본 준비. 375/1280px 로컬 렌더에서 가로넘침 없음·H1 1개·역할별 그림3개·태그10개 확인 및 모바일 상단/OS 비교 그림 육안 확인. 검토본 libfile_dc74d5da4ce4819191c940eafef9cfd7. 네이버 편집 로그인 해제 및 보안 인증 요청 declined로 공개 수정/태그 변경하지 않았다. 취소 뒤 인증 재시도 없음. 공개 수정 완료로 보고 금지. 샤오홍슈 초기 피드 접근 후 검색은 로그인 모달. 개별 제품 원본/반응/재사용 허락 미확보. 신규 클립/게시 없음. 조사·다음 기준은 naver-quality-research-20261026.md 및 naver-editorial-quality.md. 추가 유료 API·제휴 자기클릭 없음.


## DEC-024 — Implemented / 로컬 검수 (2026-10-26)
에너지바우처 일반2026 신규 허브와 신청·사용·잔액조회 종합 원고. 본문10섹션(FAQ 포함), 관련 태그16개, 공식 지원·신청·사용·잔액조회4페이지와 공단 보도자료2개 확인. 소득+세대원 두 조건, 연간금액vs잔액, 신청마감vs사용종료, 방식·서류·이사·미사용·중복을 연결. 별도2025등유/LPG 종료10/25와2026일반사업5/31 구분. 고시원 사전예외의 개별금액/일정은 미확인으로 명시. 신청판단 흐름/마감달력/결제방식 도식3개는 공식조건에 근거한 자체SVG, 필요한 한글만 내장해 합계약37KB. 실제정부화면/실사용을 가장하지 않음. 정책허브 제휴false, 구매를 신청조건으로 연결하지 않음.
원고/검색/사이트맵 회귀·TypeScript·production build PASS. 처음 빌드는 worktree 밖 node_modules symlink를 Turbopack이 거부했으며, 동일 의존성의 로컬 hardlink copy로 해결한 뒤 정상 빌드. 유료API·환경변수 변경 없음. 블로그 미리보기375/1280px 가로넘침없음·H1 1개·그림3·표1·태그16·목차대상 모두확인, 금액표·결제도식 모바일 육안검수. 공개 웹·네이버 게시 상태는 별도 후속 기록.

### DEC-024 — Responsive QA passed
로컬 production에서375/1440px × 홈/새허브/원고6경로 모두HTTP200·H1하나·canonical·가로넘침없음. 새허브는 절대URL 링크를 사용하므로 초기 검수기의 상대URL만 찾는 조건을 수정한 뒤 실제 연결 확인. 원고의 SVG3개 decode 성공·금액표1개·태그16개·공식복지로연결·정책페이지광고0 확인. 검색과 sitemap의 새허브/문서 각1건 연결 확인. 기존 제휴레지스트리/추적/고지 회귀 PASS, 목적지 클릭 없음.


### DEC-024 — Deployed / 공개 검증 완료
PR #15 병합 master 1d4002c95db7ed78162b1ae9c715e65986516ccd. Netlify production 6adeb6ca780a52b725ecb914 Published(46초) 확인. 실제 공개 URL https://newsjeoul.co.kr/hub/energy-voucher/winter-application-balance-2026 에서 제목·본문·H1 1개·canonical·키워드/본문태그16개·표1개·공식복지로링크·출처6개·광고0 확인. 도식3개 모두 complete/naturalWidth600. 공개 홈의 새 글 링크와 생활·지원 제도 분야 확인, 클릭 후 실제 원고로 이동 확인. 공개 sitemap XML의 loc 원소에서 허브와 문서 각각1개 확인(브라우저 XML뷰어의 숨긴 원문+표시문 전체 textContent 중복은 URL중복이 아님). 증빙 energy-voucher-published-1792980797194.jpg.
네이버 원고는 libfile_050cceb47f3c8191997a108f46b29318 / file_00000000f574820980a36628492d0467, v1.0 준비·미게시. 네이버 인증 재요청·작성 화면 등록·초안 저장·공개 게시를 하지 않았다. 실제 공개는 뉴스저울 신규 글1편·새 허브1개, 새 공개 예약0건. 검색 집계는10/24의 기존 값이며 신규 성과·제휴전환·수익으로 해석하지 않는다. 소라/SNS 중단 유지, 유료 API·추가 결제·제휴 자기클릭 없음.


### DEC-023 후속 — A210C 웹 도식 보완 / Local verified (2026-10-26)
기존웹 A210C URL에서문자요약카드2개를준비된실제연결도3개로교체. 상태화면vs외부영상출력/OS별외부A·A와A·B/100W입력→허브20W확보→호스트최대80W를해당문단에배치. Anker한국·미국공식모델원문재확인,사진·UI·실측아님을캡션에구분. 원본SVG준비파일재사용·한글subset내장으로합계약34KB. 기존slug/title/canonical/쿠팡대안UH-04목적지/고지/rel보존. 직접A210C제휴링크나네이버글수정아님. 빌드·TypeScript·원고/제휴회귀·375/1440px production렌더검사PASS, 일반USB-C글기존2그림유지. 조사research-20261026-1159.md.


### A210C 웹 시각 보완 — Deployed / 공개 검증 (2026-10-26)
PR #17 병합 ae9ddefd29208ea34238a3936ba86cf96841255c. Netlify production 6adec3a77d3a9c4a2268d88a Published(50초) 확인. 기존 공개 URL https://newsjeoul.co.kr/hub/galaxy-book5-pro/anker-a210c-smart-display-hub 에서 제목/canonical 유지, 새 도식3개 naturalWidth720/complete 확인. 기존 본문 등록 /go/book5-hub rel=sponsored nofollow, 수수료 고지 및 다른모델 UH-04 구분 확인. 공개 증빙 a210c-web-revised-1792984101766.jpg. 신규 글0·기존 글개선1이며 네이버글수정·SNS/소라재개없음.
추가 포털/뉴스 조회: https://www.newspim.com/news/view/20261026000079 및 https://www.yna.co.kr/view/AKR20261026020200003 에서10/26 LG서랍형STEM출시보도 재확인. 공식 소개 페이지는 확보했지만 신모델 정확SKU·치수·정식제휴목적지미확인으로 보류유지. 버즈온은 기존공개원고와중복이라새URL발행안함. Search Advisor 실제화면의최근업데이트10/24·최근30일클릭3.1천/노출37.9만은이전집계와동일하며신규성과로해석하지않음. 유료API·광고구매·제휴자기클릭없음.

## DEC-025 — Implemented / 검증 중 (2026-10-26)
기존 single-bud-replacement URL·제목을 보존해 모델/좌우·단품/새세트 총비용·중고 위험·커플링·복구 후 확인으로 확장. 새 lost-charging-case-replacement는 빈케이스 단독찾기 제한→보호커버와충전본체 구분→국내공급문의→견적 비교→반품조건→수령후확인으로 작성. 각 도식2개·비용표1개, 글별 태그8/9개 및 metadata keywords 구현. 기존 제휴/AF3904190 유지, 실제 상품과 일반형/프로/단품 차이 명시. 네이버 편집은 인증 origin 자동검토 차단으로 미실행. 조사 research-20261026-buds-recovery.md. 타입·원고/제휴 회귀·production build PASS. 운영 공개는 별도 검증한다.

### DEC-025 — Local verified
375/1440px × 두 원고 모두HTTP200·H1하나·canonical·설명도2개decode·비용표1개·태그8/9·keywords·Article/FAQ schema·가로넘침없음 확인. 홈/버즈허브/검색/sitemap 새 URL 각 연결 및 sitemap중복없음 검증. 첫 QA가 전역 첫 JSON-LD를 문서schema로 잘못 선택한 것을 전체 script의 @graph 검사로 고쳐 통과. 실제 오류나 누락 schema를 완료로 가장하지 않음. 모바일 설명도 첫 장 두 장을 육안 확인한 뒤 모델 구별을 ≠로, 분실 조합을 직접 표현해 혼동을 줄임.


### DEC-025 — Deployed / 공개 검증 완료 (2026-10-26)
PR #20 병합 master bc62b5f37f92fbc6269d439848de3b542596380c. Netlify production6adee0d90ade6d436e8aac4d Published(41초) 확인. 직전 실행의 공개 검증 호출이 중단돼 이번에 실제 운영 화면을 이어 확인했으며 같은 글을 재생성하지 않았다. 새 https://newsjeoul.co.kr/hub/galaxy-buds4/lost-charging-case-replacement 제목·본문·canonical·그림2개complete/naturalWidth720·실제 상품 사진1000px·비용표1·태그9·수수료 고지 및 /go/buds4-body의 sponsored/nofollow 확인. 기존 https://newsjeoul.co.kr/hub/galaxy-buds4/single-bud-replacement 원래 제목·canonical 유지, 보강본문·도식2개 로딩720px·비용표1·태그8·고지/rel 확인. 지연 로딩 직후0px를 오류나 완료로 단정하지 않고 해당 그림이 표시된 뒤 complete를 다시 확인했다. 공개 홈 새글링크1개·sitemap 실제loc1개 확인. 공개증빙 buds-case-published-1792994704252.jpg. 신규1편·기존보완1편의 공개 검증이 완료됐으며 예약/초안 완료와 구별한다. 네이버 블로그 수정/신규등록은 기존 인증 origin 자동검토 차단으로 미완료, 재로그인/우회 없음. 유료 API·SNS/소라 작업·제휴 자기클릭 없음.

## DEC-026 — Implemented / 로컬 검증 (2026-10-26)
기존 S펜 URL/제목과4개핵심블록을 보존하고 BLE미지원각주, 같은위치·앱별비교, 손상/수납부문의, 구매불필요조건과FAQ 보강. 자체SVG2개·증상표1·글별태그7개, 정확모델/구성/보증을확인하는CTA 추가. s25u-spen목적지/식별자/고지 유지. 원고·제휴회귀 및 production build 통과. 공개확인은 후속기록.


### DEC-026 — Deployed / 운영 공개 검증 완료 (2026-10-26)
PR #23 병합 master 8afd3c61e18fc0bdacefd7654d4a7a5e5de5e69c. Netlify production 6adf0e92710f03e50c25dc1d Published(36초), 배포 목록의 master@8afd3c6 확인. 앞선 검증 호출 중단 후 이번에 실제 운영 페이지를 새로 읽었으며 중복 생성/재배포하지 않았다.
공개 URL https://newsjeoul.co.kr/hub/galaxy-s25-ultra/s-1xzjlx 에서 기존 제목/H1 1개/canonical 유지, BLE 미지원과 필기 문제 구분, 자석 제거 전후 비교·구매 불필요 조건·FAQ 실제 본문 확인. 자체 SVG2개 complete/naturalWidth720, 증상별 판단표1개, 본문태그7개와 metadata keywords7개, Article/FAQ schema 및 dateModified2026-10-26T17:17:00+09:00 확인. 기존 /go/s25u-spen 3개 모두 rel=sponsored nofollow noopener noreferrer, 앞선 수수료 고지와 정확모델·보증 확인 CTA 유지. 목적지 클릭은 하지 않았다. 공개화면 증빙 spen-published-1793003936496.jpg.
로컬375/1440px 빌드/타입·본문·제휴·가로넘침·그림 로딩 검수와 운영 공개 검증을 구분한다. 이번 공개 결과는 기존1편 개선·신규0편이며 미완료 앱배포 없음. 검색/수익의 개선 성과는 아직 관측하지 않았다. SNS/소라/네이버 재인증·유료API·추가결제 없음.


## DEC-027 — Implemented / Local verified (2026-10-26)
기존 cover-widget-missing 제목/slug/lead/다섯섹션 유지, 빈도·해결보장·업데이트원인 단정과 성급한 초기화 조언 수정. 국내 삼성서비스8/20안내의 직접편집 단계 추가, 지원없음vs목록누락vs원본앱갱신 구분. 자체SVG1·증상표1·태그6, 구매불필요조건 추가. 기존 flip8-case등록목적지/광고무관성/수수료고지/rel유지.
production build·타입·원고/제휴회귀PASS. 375/1440px 실제 production렌더HTTP200·H1하나·canonical보존·그림1decode720·표1·태그6·가로넘침없음·광고rel확인,375px도식육안검수. QA헬퍼의 과거S펜용 요약문(2그림/FAQ)이 남았으나 실제assert/JSON은 그림1·표1·태그6을 검사했고 FAQ검사는 없었다. 운영공개는 별도후속 확인.


### DEC-027 — Deployed / 운영 공개 검증 완료 (2026-10-26)
PR #26 병합 master34bbbd95f53b0cd63b5970a8cef5b35cec275945. Netlify production6adf276c38a2822de6b9ad8a Published(41초), master@34bbbd9 확인. 이전 실행의 마지막 증빙 호출이 중단되어 이번에 실제 공개 상태·미디어 로딩을 이어 확인했다. 글·PR·배포를 중복 생성하지 않았다.
공개 https://newsjeoul.co.kr/hub/galaxy-z-flip8/cover-widget-missing 에서 원래 제목/H1하나/canonical/국내플립8추가절차 확인. '대부분 해결' 삭제, 자체도식1개 complete/naturalWidth720, 증상표1개·본문태그6·keywords6 확인. /go/flip8-case 3곳 모두 sponsored nofollow noopener noreferrer와 앞선 수수료 고지 및 '케이스 구매가 위젯 오류를 해결한다는 의미는 아닙니다' 구분 유지. 제휴 목적지 클릭 없음. 공개증빙 flip-widget-published-1793012759889.jpg. 기존1편 개선의 공개 검증 완료·신규0·미완료앱배포0이며 새로운 개선 성과는 미집계다.


### 버즈 온 출시일 시점 정리 — 2026-10-27 / 구현·검증 중
기존 buds-on-library-leakage-buying URL/title/canonical/본문 판단/사진·도식/등록 제휴 목적지를 유지. 국내 출시일 도래에 맞춰 lead와 /discoveries 분야 카드의 '출시 전'을 제거하고 10/1 공개·10/26 발표·10/27 출시를 절대날짜로 구분했다. 쿠폰은 전날 Coming Soon 관측과10/27 오전9시 안내를 역사적 관측으로 명시, 자정 이후 즉시 발급 가능·현재재고·결제금액으로 단정하지 않는다. sourceNote/실제수정일 갱신. 공식 뉴스룸 원문 재확인, 행사 화면 신규조회·실측후기 아님. 로컬 빌드/반응형/SEO와 원격 공개 검증은 후속 기록한다.

로컬 검수: QA 카드label 확인 경로를 홈에서 실제 /discoveries로 바로잡았다. sitemap 날짜는 UTC 문자열 고정 대신 동일시각 비교로 확인. 375/1440px 원고 HTTP200·H1/canonical·사진1000px/도식600px×2 decode·가로넘침없음·광고rel·Article 실제 수정일 통과. 모바일 실제 렌더를 육안 확인. /discoveries의 실제 수정일도 sitemap 반영.


### 버즈 온 출시일 시점 정리 — Deployed / 공개 검증 완료 (2026-10-27)
PR32 병합 앱 master2182456f2c06999be18d9d644f45ad2ad08c163d, Netlify production6adf79d8b1b51ef5a6d8f854 Published39초. Preview32/6adf7983a6ee224d1118355c는52초 완료. 이전 실행의 마지막 검수 호출 중단 후 이번에 같은 배포를 이어 검증했으며 재발행/재배포하지 않았다.
공개 https://newsjeoul.co.kr/hub/galaxy-buds4/buds-on-library-leakage-buying 에서 기존 제목/H1/canonical 유지, lead·meta description의 국내 출시일10/27 안내, 전날 행사 관측과 오전9시 이전 발급 구분, Article dateModified2026-10-27T00:55:30+09:00 확인. 기존 수수료 고지와 /go/buds4-body rel=sponsored nofollow 유지, 실제 상품은 버즈4 대안이며 버즈온 직접링크가 아님. 사진1개1000px·자체도식2개600px 모두 complete 확인. 직전 지연 로딩0px를 실패/완료로 성급히 단정하지 않고 이번 표시 완료 후 확인했다.
공개 /discoveries 카드label·원고 연결, sitemap loc의 원고와분야URL 각각1개와 두 lastmod의 실제 수정일 일치 확인. 모바일375/데스크톱1440 로컬 검수 및 모바일 육안 검수는 선행 완료. 실제 공개 증빙 buds-release-published-1793034259881.jpg. 기존1편 수정의 공개 검증 완료·새글0·미완료앱배포0. 검색 성과는10/24집계이며 변경성과/쿠팡매출 미확인.

## DEC-028 — Implemented / 검증 중 (2026-10-27)
기존 with-iphone URL/H1/title/canonical·네 블록 원문·등록제휴목적지 유지. iOS 앱 지원 제품·버즈4/프로 기능 조건·후면3초 페어링·단계별 실패 점검·총비용/구매불필요조건·체크목록·FAQ를 보강했다. 자체SVG순서도1개/HTML기능표1개/태그6개, actual updatedAt와sourceNote 갱신. 공개사진을 임의 복제하지 않고 실제화면/실측후기로 포장하지 않는다.
페이지별 선택적 productPrompts로 일반형 구성 확인 문구를 제공. 로컬 첫검수에서Frame 좌측카드가 선택문구를 전달받지 못하는 실제 누락을 발견해좌우Placement에도 전달하도록 수정했다. 기본문구는 다른페이지에서 보존한다. 공개 검증은 후속 기록한다.

DEC-028 Local verified: production build/TypeScript·원고/검색·제휴회귀PASS. 375/1440px HTTP200·기존H1하나/title/canonical·직접답변meta·표5행·순서도decode720·가로넘침없음·태그6·Article실제수정일·FAQ3문항일치·고지/sponsored nofollow 확인. 홈/허브/검색 연결과sitemap unique/lastmod·robots검수. 허브링크는절대URL이어서QA의상대URL가정만고쳤으며원래연결은정상이었다. 첫최종QA는빌드완료전서버기동으로연결실패해빌드성공뒤재검사했다. 실제모바일그림의한글미표시를확인해기존OFL Pretendard의glyph를SVGpath로변환(41KB)하고표를두열로수정, 최종스크린샷육안검수. 로컬외부상품이미지는차단해검사제외했고공개후별도확인한다.


### DEC-028 — Deployed / 공개 검증 완료 (2026-10-27)
PR36 head00a8ed00b4535c2304c5d07c5cbcc2cfdf41c681, treef7930b505e313770c3768a7f4387932b28de96e1의10개텍스트파일(자체SVG포함)원격UTF-8일치·실제변경목록검증. Preview6adfb40398fb0449d9fe1247 성공52초후병합, 앱master9d4edc660158d887a8eb083eac8c1dae912dc8cc. Netlify production6adfb46e5a2eca340f9e78a0 Published37초확인.
공개 https://newsjeoul.co.kr/hub/galaxy-buds4/with-iphone 에서기존title/H1하나/canonical보존, 새lead/meta·질문H2·버즈4후면3초절차·금액과시간분리·구매불필요조건·FAQ3/Article dateModified2026-10-27T04:55:47+09:00·태그6·기능표5행확인. 본문[광고·쿠팡]/수수료고지, 등록/go/buds4-body 네링크의sponsored nofollow와일반형모델구별·문맥CTA확인. 모든등록상품사진3곳naturalWidth1000/complete, 기존개념그림1200/complete·새순서SVG720/complete확인. 지연로딩직후false를오류/완료로단정하지않고카드제목·도식위치이동뒤완료확인, 제휴링크클릭없음. 공개허브의실제글링크와sitemap loc1개/lastmod일치확인. 로컬375/1440px모바일실제렌더/육안검수와공개검증을구분한다. 실제공개증빙buds-iphone-published-1793045767310.jpg.
기존1편개선·신규0·미완료앱배포0. 새검색지표·제휴전환·수익은미조회이며성과를주장하지않는다. SearchAdvisor 로그인origin 자동검토차단후재시도/우회없음. 유료API/추가결제/DB쓰기/SNS·소라재개없음.


## DEC-029 — 가습기 계절 구매 가이드 / 구현·검증 중 (2026-10-27)
신규 /hub/humidifier/winter-type-cleaning-running-cost 및 가습기 허브를 추가했다. L와mL/h·모드 조건, 가열/기화/초음파/복합 원리, 실제 세척 범위, 2025년 소비자원 시험의 전기·필터 합계, 현재 총비용 계산·설치/구매불필요조건·구매 전 목록을 연결한다. 2025년 가격/시험을 현재 판매가·2026순위로 표시하지 않는다. 제조사 CJSJSQ02XYKR 국내 사양·정격9W·세척/급수 조건을 재확인했다. 소비자원 PDF표를 스크린샷으로 대조했으며 카드뉴스의 묶음면적/요약 오기 대신 원문 종합표를 사용한다.
정확 도식2개는 자체 SVG와 기존OFL Pretendard glyph경로로 제작해 한글폰트 의존을 없앴다. 모바일 읽기·본문표·이미지decode·메타/홈/검색/사이트맵·제휴 목적지/사진일치는 후속 검수한다. 별도브랜치와PR로 검증하며 운영 공개 전에는 발행완료로 보고하지 않는다.

DEC-029 Local verified: production build/TypeScript·기존 원고/검색 회귀 통과. 375/1440px 실제 브라우저 HTTP200/H1하나/canonical/meta·비교표3행·자체SVG2개decode720/lazy·태그8·FAQ4/Article dateModified2026-10-27T08:25:30+09:00·가로넘침없음 확인. 실제375px 도식/표의한글·본문캡션을육안확인했다. 홈/가습기허브/검색의실제원고링크, sitemap원고/허브각1개·실제날짜·robots통과. 허브구조화데이터CollectionPage확인·허위Offer/Review없음. 아직새정식목적지/사진은미등록상태이며운영발행완료와구분한다.
