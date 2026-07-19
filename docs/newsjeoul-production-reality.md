# 뉴스저울 Production Reality — Single Source of Truth

**기준 시각**: 2026-07-18 02:28 UTC. 이후 이 문서 하나만 갱신한다 — 다른 문서로 상태를 분산 기록하지 않는다.

## 1. Git / Deploy

- 현재 origin/master = 현재 Netlify Production Deploy 커밋: `e155f2bd4c209bbceff8d0a7a1ea68e6c3f54958` (Deploy ID `6a59f0baa398290008785109`, state: ready, 배포시각 2026-07-17T09:07:06Z)
- 로컬에 커밋되지 않은 변경 없음. 미커밋 신규 파일: `docs/adr/`, `docs/newsjeoul-deployment-safety-checklist.md`(둘 다 문서, 코드 아님)
- 이 시점 이후 **어떤 push도 발생하지 않았음**(직접 확인)

## 2. 실제 배포된 기능(코드가 Production에 존재)

| 기능 | 배포 여부 |
|---|---|
| Content Routing Gate(8종 라우터) | 배포됨 |
| 100명 Persona Registry(DB, 105명) | 배포됨(코드+데이터 모두) |
| Weight Engine(몇 g 실산정) | 배포됨, 컨트로버시/엔티티 스케일 버그 수정 포함 |
| display_keywords 생성 | 배포됨 |
| Topic/Home 키워드·무게·에디터 UI | 배포됨 |
| Automation Health 대시보드(Admin) | 배포됨 |
| Cron 401 임시수정(x-nf-event 체크, **틀린 헤더명**) | 배포됨, **효과 없음**(아래 참고) |
| post-threads.js 재설계(Topic 기반+Claude Hook) | 배포됨, **DB 스키마 부재로 실행 불가**(아래 참고) |
| lib/cron-guard.js + 19개 `*-scheduler.js` | 배포됨(공개 Endpoint 존재), **DB 스키마 부재로 Worker 도달 불가**(아래 참고) |
| news-pipeline.yml 경로 수정 | 배포됨(GitHub Actions 워크플로 파일) |
| diag-schedule-echo.js + 5분 임시 Cron | 배포됨(진단용, 값 로깅 버그 있음) |
| og:url 메타태그 수정(타 세션 작성) | 배포됨 |

## 3. 실제 활성 기능(자동으로 돌고 있는 것)

- **Threads(GitHub Actions, `post-threads.yml`, `0 1 * * *`)**: 활성. 단 배포된 새 코드는 실행 시 확정적으로 500(아래 4번 참고), 즉 "돌지만 매번 실패"
- **뉴스 파이프라인(GitHub Actions, `news-pipeline.yml`, `0 0 * * *`)**: 활성, 경로 수정 후 아직 실제 실행 결과 미확인(다음 실행 예상 07-18 00:00~04:00 UTC 사이 — 이미 지났을 가능성 있음, 직접 실행 이력 미확인 상태)
- **Netlify 자체 schedule(`collect-news` 등 3시간 주기 전체)**: 활성이지만 `x-nf-event`(틀린 헤더명) 버그로 인해 스케줄 호출마다 401 즉시 반환 — **자동으로는 사실상 돌지 않는 상태가 계속됨**
- **diag-schedule-echo(5분 주기)**: 정상 실행 중(09:12/09:19/09:21 확인, 이후 계속 실행됐을 것으로 추정되나 최신 로그 재확인은 안 함)

## 4. 실제 비활성/차단된 기능

- **19개 Scheduler(`*-scheduler.js`)**: 공개 Endpoint 존재하나, `cron_locks` 테이블 부재(2026-07-17 직접 조회 확인: `PGRST205`)로 `dispatch()`의 최초 DB 조회에서 예외 발생 → Worker 호출 코드 도달 전 실패 확정
- **post-threads.js 신규 로직**: `threads_posts.topic_id` 컬럼 부재(직접 조회 확인: `42703`)로 `fetchCandidateTopic()`의 최초 조회에서 예외 발생 → Claude API 호출 전 실패 확정
- **Netlify 자체 Cron 전체(3시간 주기 파이프라인)**: 헤더명 오타로 사실상 미작동(단, GitHub Actions `news-pipeline.yml`이 같은 워커들을 별도로 호출하므로 완전히 죽어있는 건 아님 — 3번 참고)

## 5. Migration 적용 여부

| Migration 파일 | 적용 여부 |
|---|---|
| `persona_registry_100_migration.sql` / `_seed.sql` | **적용됨**(2026-07-17, 105명 확인) |
| `cron_scheduler_worker_migration.sql`(cron_locks/cron_invocations) | **미적용**(직접 확인) |
| `threads_posts_extend_migration.sql` | **미적용**(직접 확인) |
| 그 외 기존 마이그레이션(editorial_engine 등) | 적용됨(이전부터 운영 중) |

## 6. DB 상태(직접 조회 확인, 2026-07-18 기준)

- `topics.editorial_status` 분포: pending 26 / published 24 / planned 14 / degraded 1
- `cron_locks`, `cron_invocations` 테이블: 없음
- `threads_posts`: 있음(기존 컬럼만), `topic_id/hook_type/editors/status/failure_reason/source_url` 없음

## 7. Workflow 상태

| Workflow | 스케줄 | 최근 5회 결과 |
|---|---|---|
| `news-pipeline.yml` | `0 0 * * *`(00:00 UTC) | 07-16 실패(2단계 404, 원인 수정됨-아직 검증 안 됨) |
| `post-threads.yml` | `0 1 * * *`(01:00 UTC) | 07-17 성공(중복차단·실질 무동작) / 07-16 실패 / 07-15 실패 / 07-14 성공 / 07-13 실패 — **오늘(07-18) 실행분은 아직 발생 안 함(가장 최신 기록이 07-17), 과거 지연 패턴상 향후 몇 시간 내 발생 가능** |

## 8. Scheduler 상태

- 19개 전부 배포됨, 공개 URL 존재, `netlify.toml`에 schedule 미등록(수동/외부 호출만 가능한 상태)
- 인가 검증 코드 없음(정적 분석 확인)
- 현재는 `cron_locks` 부재로 실행 시 Worker 도달 전 실패 확정 — **이건 우연한 차단이며 설계된 안전장치가 아님**
