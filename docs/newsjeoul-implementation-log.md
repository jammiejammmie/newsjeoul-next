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

(다음 업데이트는 Phase 1 착수 시 여기에 추가)
