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

(다음 업데이트는 DB 마이그레이션 적용 + 실운영 검증 완료 시 여기에 추가)
