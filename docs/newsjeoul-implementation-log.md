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
