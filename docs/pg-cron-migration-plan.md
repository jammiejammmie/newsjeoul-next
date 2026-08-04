# 스케줄러 전환 계획: GitHub Actions → Supabase pg_cron

작성 2026-08-04 · 마이그레이션 SQL: `supabase/pg_cron_migration.sql`

## 왜 옮기는가

`distribution_run_log`를 켠 뒤 실측한 결과, GitHub Actions가 cron을 지키지 않고 **주기가 짧을수록 더 심하게 밀어낸다.** 저장소의 모든 스케줄 워크플로우에서 동일하게 나타났다.

| 설정 주기 | 실측 평균 | 배율 |
|---|---|---|
| 20분 (check-pipeline-health) | 109분 | 5.5x |
| 30분 (post-threads) | 94분 | 3.1x |
| 60분 (update-topic-weight, scan-comments) | 143~147분 | 2.4x |
| 180분 (news/publish pipeline) | 222분 | 1.2x |

실효 하한이 약 90~150분이라 **cron 값을 줄여서 밀도를 올릴 수 없다.** 실제로 1시간 → 30분 변경의 효과가 거의 0이었다(85분 → 94분).

이는 2026-07-22에 Netlify 네이티브 cron이 광범위하게 죽어 GitHub Actions로 전부 옮겼던 사고와 같은 유형이다. **3개월 사이 플랫폼 스케줄러 장애가 두 번 반복됐다** — 외부 플랫폼 큐에 의존하는 구조 자체를 바꾸는 것이 이 전환의 목적이다.

## 왜 pg_cron인가

- 이미 쓰는 인프라다(Supabase). 새 계정·결제·자격증명이 필요 없다.
- 우리 DB 안에서 도는 스케줄러라 외부 플랫폼의 큐 혼잡도와 무관하다.
- `cron.job_run_details`로 실행 이력이 DB에 남아 실측 검증이 쉽다(지금처럼 "설정과 실제가 다른" 상황을 즉시 발견할 수 있다).

**한계도 명시한다**: DB가 내려가면 스케줄도 멈춘다. 다만 DB가 내려가면 파이프라인 자체가 어차피 동작하지 못하므로 새로 생기는 단일 장애점은 아니다.

## 설계 요점

- **pg_net은 비동기다.** 요청을 큐에 넣고 즉시 반환하므로 cron 잡이 오래 붙잡히지 않는다. 대신 `sleep`으로 단계 순서를 만들 수 없어, 체인은 **분 오프셋**으로 순서를 만든다(원래 `netlify.toml`이 쓰던 방식).
- **시크릿은 Vault에 둔다.** `ADMIN_KEY`가 SQL 파일·git·쿼리 히스토리에 남지 않게, 값 입력은 STEP 2 한 줄에서만 사용자가 직접 한다.
- **화이트리스트로 호출 대상을 고정한다.** `ops.netlify_job`에 등록된 이름만 호출 가능하므로 임의 URL 호출이 불가능하다.
- **헬퍼는 `ops` 스키마에 둔다.** PostgREST는 기본적으로 `public`만 노출하므로 anon key로 호출할 수 없고, 추가로 `anon`/`authenticated` 권한을 명시적으로 회수한다.
- **잡마다 timeout이 다르다.** 동기 함수(`collect-news` 등)는 응답까지 60~90초가 걸려 pg_net 기본값 5초로는 요청이 끊긴다.

## 전환 단계

핵심 원칙: **pg_cron이 실제로 도는 것을 확인한 뒤에 GitHub Actions를 끈다.** 단계마다 한 주기 이상 관찰한다.

중복 실행이 겹치는 구간이 짧게 생기는데, 함수 대부분은 멱등이라 데이터가 깨지지 않는다(`post-threads`는 `ai_context.threads` dedup, `publish-routed-content`는 draft 존재 시 skip, `update-topic-weight`는 재계산, `update-news`는 당일치 삭제 후 재삽입). 다만 AI 호출 비용은 이중으로 나가므로 겹치는 시간을 짧게 유지한다.

### Phase 0 — 사전 준비 (위험 0)

**`supabase/pg_cron_migration.sql`을 통째로 한 번에 실행하면 된다.** 스케줄 23개가 등록되지만 **전부 비활성(`active=false`)** 상태이므로 아무것도 돌지 않고, GitHub Actions가 그대로 유일한 트리거로 남는다.

그렇게 설계한 이유:
- 23개를 한꺼번에 켜면 GitHub Actions와 이중 실행이 되어 AI 호출 비용이 두 배가 된다(체인 11개가 Claude를 대량 호출).
- 재실행해도 멱등하다. 이미 활성화한 잡(`ops.cron_phase.activated_at` 기록됨)은 건드리지 않으므로, 전환을 진행한 뒤 파일을 다시 실행해도 운영 중인 스케줄이 멈추지 않는다.

그 다음 **수동 단계 하나**만 직접 한다 — 파일 안에 주석으로만 있는 STEP 2다:

```sql
select vault.create_secret('<ADMIN_KEY 값>', 'newsjeoul_admin_key', 'Netlify 함수 호출용 x-admin-key');
```

키를 파일·git·커밋에 남기지 않기 위해 이 한 줄만 자동화하지 않았다. 실행 후 SQL Editor 쿼리 히스토리에서 해당 문장을 지우는 것을 권장한다.

마지막으로 키가 제대로 들어갔는지 1회 호출로 확인한다:

```sql
select ops.invoke('post-threads-background');
select pg_sleep(3);
select job_name, status_code, error_msg from ops.invoke_health limit 3;
```

`status_code = 202`가 정상이다. `401`이면 Vault 키가 틀렸고, `400`이면 함수 이름이 잘못됐다.

### Phase 1 — 가장 심하게 밀리는 것부터 (검증 목적)
대상: `check-pipeline-health` (AI 비용 없음, 5.5배 밀림, 20분 주기라 검증이 빠름)

```sql
select * from ops.activate_phase(1);
```

1시간 관찰 → `select * from ops.cron_health where jobname = 'nj-check-pipeline-health';`
`avg_gap_min`이 20에 가까우면 성공(GitHub Actions에서는 109분이었다).

확인되면 `.github/workflows/check-pipeline-health.yml`에서 `schedule:` 블록만 제거하고 `workflow_dispatch:`는 남긴다(수동 실행 경로 유지).

### Phase 2 — Hero/배급에 직접 영향 있는 시간당 잡
대상: `update-topic-weight-background`, `scan-comments-shadow-background`

`update-topic-weight`는 홈 헤드 무게 갱신이라 밀리면 헤드가 낡는다(2026-08-04 Hero 고정 사고의 배경 요인). 이 단계 효과가 가장 체감된다.

```sql
select * from ops.activate_phase(2);
```

1~2시간 관찰 후 해당 워크플로우 2개의 `schedule:` 제거.

### Phase 3 — Threads 배급
대상: `post-threads-background`

AI 비용과 외부 게시가 걸리므로 Phase 1~2가 안정된 뒤에 옮긴다. 중복 실행 위험은 dedup(`ai_context.threads`)과 게시 직전 재확인(`isStillUnposted`)이 막지만, 겹치는 동안 하루 게시량이 늘 수 있으므로 GitHub 쪽을 **같은 날 안에** 끈다.

```sql
select * from ops.activate_phase(3);
```

관찰: `select * from distribution_run_log order by run_at desc limit 10;` — `run_at` 간격이 30분에 가까워지는지. 이때 `post-threads-background`의 실측 주기 추정(`estimateRunsPerHourFromLog`)도 자동으로 따라 올라가 실행당 게시 건수가 줄어든다(설계된 동작).

### Phase 4 — 체인 파이프라인 (AI 비용 최대)
대상: `nj-news-1~5`, `nj-publish-1~6`

3시간 주기라 한 사이클 검증에 3시간 이상 걸린다. **중복 실행 시 AI 비용이 두 배로 나가므로, 이 단계는 GitHub 워크플로우 `schedule`을 먼저 제거한 뒤 pg_cron을 활성화한다**(다른 단계와 순서가 반대). 두 파이프라인은 3시간에 한 번이라 한 사이클 빠져도 손실이 작다.

```sql
select * from ops.activate_phase(4);
```

관찰: `ops.invoke_health`에서 11개 잡 전부 200/202가 찍히는지, 그리고 오프셋 순서대로 호출됐는지.

### Phase 5 — 일/주 배치
대상: `nj-daily-*`, `nj-insights-*`, `nj-weekly-*`

```sql
select * from ops.activate_phase(5);
```

실측 배율이 1.0~1.2배로 거의 정상이라 급하지 않다. 스케줄러를 한 곳으로 모으는 일관성 목적으로 마지막에 옮긴다.

## 전환 후 남는 것

- **워크플로우 파일은 삭제하지 않는다.** `schedule:`만 제거하고 `workflow_dispatch:`를 남겨 수동 실행·긴급 복구 경로를 유지한다. pg_cron에 문제가 생기면 `schedule:` 블록을 되살리면 즉시 원복된다.
- `netlify.toml`은 건드리지 않는다(Netlify 네이티브 schedule은 2026-07-26에 이미 전부 제거됨).

## 정기 점검

전환의 목적이 "스케줄러가 밀리는 걸 조기에 발견하는 것"이므로, 아래를 주간 점검에 넣는다.

```sql
select * from ops.cron_health;                              -- schedule vs avg_gap_min 비교
select * from ops.invoke_health where status_code not in (200, 202) limit 20;  -- 실패 호출
```

`avg_gap_min`이 `schedule`보다 1.5배 이상 크면 스케줄러가 밀리는 신호다.

## 롤백

```sql
-- 단계 단위 되돌리기(가장 흔한 경우 — 스케줄은 남고 실행만 멈춘다)
select ops.deactivate_phase(3);

-- 전체 정지(스케줄은 남기고 전부 비활성)
select cron.alter_job(jobid, active := false) from cron.job where jobname like 'nj-%';

-- 스케줄 자체를 삭제(완전 원복)
select cron.unschedule(jobname) from cron.job where jobname like 'nj-%';

-- 특정 함수만 호출 차단(스케줄은 유지 — 원인 조사 중에 유용)
update ops.netlify_job set enabled = false where name = 'collect-news';

-- 특정 잡만 비활성화(cron.job 직접 UPDATE보다 공식 API를 쓴다)
select cron.alter_job(jobid, active := false) from cron.job where jobname = 'nj-post-threads';
```

이후 해당 `.github/workflows/*.yml`에 `schedule:` 블록을 복구한다.
