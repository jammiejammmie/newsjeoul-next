# 뉴스저울 Recovery Backlog

## 기능별 상태 분류

| 기능 | 분류 | 근거 |
|---|---|---|
| news-pipeline.yml(경로 수정) | **READY** | 순수 경로 오타 수정, 이미 배포됨. 다음 실행 결과 확인만 남음(코드 재작업 불필요) |
| og:url 메타태그 수정 | **READY** | 독립적, 이미 배포됨, 부작용 없음 확인 |
| Automation Health 대시보드 | **READY** | anon key 읽기 전용, 신규 Secret 노출 없음, 이미 배포·정상 작동 확인 |
| Threads(post-threads.js) | **REDESIGN** | Migration 부재로 실행 자체가 안 되는 상태이며, Migration을 적용하기 전에 Claude 호출 순서·Dedup·Error Handling을 구조적으로 다시 설계해야 함(패치가 아니라 재설계 대상) |
| Scheduler/Worker(19개 + cron-guard.js) | **REDESIGN** | 인증 부재가 구조적 결함 — 지시대로 패치가 아니라 재설계 |
| 기존 Netlify 3시간 주기 파이프라인(collect-news 등 원본 워커) | **BLOCKED** | 코드는 정상, 헤더명 오타(`x-nf-event`→`x-netlify-event`) 하나 때문에 자동 실행만 안 됨. Scheduler 재설계에 흡수시켜 한 번에 해결(아래 Scheduler Final Design 참고) |
| diag-schedule-echo.js + 5분 임시 Cron | **REMOVE(예정)** | 목적(헤더 구조 확인) 달성 직전 — Scheduler 재설계 완료 후 즉시 제거 |
| 100명 Persona/Weight Engine/Content Routing Gate 등(이번 사고 이전 기존 배포분) | 분류 대상 아님 | 이미 정상 배포·검증 완료, 이번 Recovery 범위 밖 |

## Recovery Backlog(우선순위)

- **P0 — Production Reality 정리**: 완료(`docs/newsjeoul-production-reality.md`)
- **P1 — Threads 정상화**: 아래 Threads Final Design대로 재설계 → 로컬 구현·Mock 테스트 → 승인 → Migration(P3) → 배포 → 실제 자동 실행 검증
- **P2 — Scheduler 재설계**: 아래 Scheduler Final Design대로 인증·실행·Worker·Lock·Logging을 하나의 구조로 재구현(19개 프로토타입 전면 교체) → 로컬 구현·Mock 테스트 → 승인
- **P3 — Migration 적용**: P1·P2가 모두 로컬에서 구현·검증 완료된 뒤, 한 번에 적용(Release 단계, 개발 과정 아님) — 아래 Release Plan v1 참고
- **P4 — Admin Health 최종 점검**: 빠른 재확인만(신규 위험 없음 확인됨) — Recovery 완료 판정에 넣되 별도 재설계 불필요
- **P5 — 기능 확장(보류)**: Editorial Budget Engine 등 신규 기능은 Recovery Complete 판정 전까지 전부 보류
