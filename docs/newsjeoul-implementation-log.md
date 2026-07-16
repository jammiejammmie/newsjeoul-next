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
