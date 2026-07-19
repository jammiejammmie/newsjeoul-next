# 뉴스저울 Release Plan v1

## 0. 전제

이 계획은 `newsjeoul-threads-final-design.md`, `newsjeoul-scheduler-final-design.md`, `newsjeoul-recovery-backlog.md`가 승인된 뒤 실행한다. 승인 전에는 아무 코드도 배포하지 않는다.

## 1. 순서(반드시 이 순서)

### Step 1 — 진단 값 확인(Migration 불필요, 최소 변경)
- `diag-schedule-echo.js`의 값-로깅 대상을 `x-netlify-event`로 수정 → Deploy Impact Summary 제시 → 승인 → 배포 → 실제 값 확인
- 완료 조건: `x-netlify-event`의 실제 값을 로그로 직접 확인

### Step 2 — Scheduler 재설계 구현(Migration 불필요)
- `lib/schedule-guard.js` 신설(Final Design §3)
- 19개 Worker 파일의 기존 `x-nf-event` 체크를 `guardScheduledOrManual()` 호출로 교체(Final Design §4)
- 19개 `*-scheduler.js` + `lib/cron-guard.js` 삭제
- Mock 테스트(Final Design §7) 전체 통과
- Deploy Impact Summary 제시 → 승인 → 배포
- 완료 조건: 실제 Scheduled Invocation **최소 2회 연속 성공**(collect-news 등 원본 워커 로그에서 정상 처리시간 확인, 401/5ms 패턴 재발 없음)

### Step 3 — Threads 재설계 구현(Migration 불필요, ai_context 기반)
- `post-threads.js`를 Threads Final Design대로 재작성(자격증명 우선확인/ai_context 기반 dedup/Claude 호출 순서/Error Handling)
- `netlify.toml`에서 `post-threads`의 자체 schedule 제거(GitHub Actions만 유지)
- Mock 테스트 전체 통과
- Deploy Impact Summary 제시 → 승인 → 배포
- 완료 조건: `?dry=true`로 안전 확인 → 실제 게시 1건 확인 → 24시간 내 재호출 시 정상 skip(dedup 작동) 확인 → 다음 GitHub Actions 자동 실행 1회 성공 확인

### Step 4 — Migration 적용(선택 사항, Release 단계)
- Step 2·3이 Migration 없이도 완전히 동작함을 확인한 뒤 진행
- `cron_scheduler_worker_migration.sql`(cron_locks/cron_invocations) 적용 → 잠금 기능이 실제로 강화되는지 확인(중복 호출 시 skip 응답 확인)
- `threads_posts_extend_migration.sql` 적용 → 상세 로그가 실제로 쌓이는지 확인(선택 사항, 핵심 기능과 무관하므로 급하지 않음)
- 각 Migration 적용도 Deploy Impact Summary와 동일한 사전 요약 후 승인

### Step 5 — 정리
- `diag-schedule-echo.js` + `netlify.toml`의 5분 임시 schedule 제거
- Admin Health 대시보드 최종 재확인(P4, 낮은 우선순위지만 Recovery Complete 판정에 포함)
- `docs/newsjeoul-production-reality.md` 갱신(최종 상태 반영)

## 2. 각 Step의 테스트 게이트(다음 Step으로 못 넘어가는 조건)

- Mock 테스트 실패 시 다음 Step 진행 안 함
- `npm run build` 실패 시 다음 Step 진행 안 함
- 배포 후 실제 로그로 확인되지 않으면(추정만으로는) 완료로 간주 안 함
- Deploy Impact Summary 없이 Push 안 함

## 3. Rollback 계획

- Step 2 배포 후 문제 발생 시: 이전 Deploy ID(`6a598a0c7273ae000836639c`, commit `7bee02e`)로 Netlify 즉시 Rollback 가능(원클릭) — 단, Git master는 그대로이므로 Rollback 후 반드시 원인 조치 후 재배포
- Step 3 배포 후 문제 발생 시: `post-threads.js`만 이전 버전으로 되돌리는 게 Scheduler 변경과 독립적으로 가능(파일 단위 revert)
- Step 4(Migration) 적용 후 문제 발생 시: 신규 테이블/컬럼은 기존 기능에 영향 없는 추가 컬럼/테이블이므로, 문제가 생기면 해당 컬럼/테이블만 애플리케이션 레벨에서 참조를 끊는 것으로 충분(DB 롤백 불필요 — additive 마이그레이션이므로)

## 4. Recovery Complete 판정 기준(사용자가 정의한 5개 조건과 매핑)

| 조건 | 확인 방법 |
|---|---|
| 승인된 코드만 Production에 존재 | Step 2·3·4 전부 Deploy Impact Summary로 사전 승인받은 내용만 배포됐는지 `git log origin/master`로 확인 |
| Threads 자동화 정상 동작 | Step 3 완료 조건(다음 GitHub Actions 자동 실행 1회 성공) 충족 |
| Scheduler 구조 안전 설계 | Step 2 완료 조건(실제 Scheduled Invocation 2회 연속 성공, 무인증 공개 Endpoint 없음) 충족 |
| Migration 적용해도 새 위험 없음 | Step 4에서 Migration 적용 전후 기능 동작이 설계대로인지 확인(잠금 강화만 되고 기존 동작은 그대로) |
| Deployment 절차 재발 방지 | `docs/newsjeoul-deployment-safety-checklist.md`를 Step 2·3·4 전부에서 실제로 적용했는지(Deploy Impact Summary 매번 제시했는지)로 확인 |
