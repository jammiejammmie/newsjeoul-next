-- refresh-threads-token을 pg_cron에 등록한다. threads_credentials_migration.sql 실행 후에 돌린다.
--
-- 주기 30일: Threads 장기 토큰은 60일짜리이고 만료 뒤에는 갱신이 불가능하다. 30일 주기면
-- 한 회차가 통째로 실패해도 다음 회차까지 30일이 남아 있어 스스로 회복한다. 60일 주기로
-- 잡으면 한 번 실패가 곧바로 장애가 된다.
--
-- 매월 3일 04:10 UTC(13:10 KST)에 돈다. 다른 잡이 몰리지 않는 시간대이고, 월초 1~2일을
-- 피해 월말/월초 배치와 겹치지 않게 뒀다.

-- STEP 1) 화이트리스트 등록 — ops.invoke는 여기 없는 이름을 거부한다.
insert into ops.netlify_job (name, timeout_ms, note) values
  ('refresh-threads-token', 30000, '동기 · Threads 장기 토큰 60일 연장(2026-08-10 신설)')
on conflict (name) do update set
  timeout_ms = excluded.timeout_ms,
  note       = excluded.note;

-- STEP 2) 스케줄 등록 — 같은 jobname이면 갱신되므로 여러 번 실행해도 안전하다.
select cron.schedule(
  'nj-refresh-threads-token',
  '10 4 3 * *',
  $$select ops.invoke('refresh-threads-token')$$
);

-- ── 확인 ────────────────────────────────────────────────────────────────────
-- select jobname, schedule, active from cron.job where jobname = 'nj-refresh-threads-token';
--
-- 즉시 한 번 돌려보려면(최초 토큰 등록 후 24시간이 지나야 Threads가 갱신을 허용한다):
--   select ops.invoke('refresh-threads-token');
--   select * from ops.invoke_log where job_name = 'refresh-threads-token' order by invoked_at desc limit 3;
--   select expires_at, last_refreshed_at, refresh_error from threads_credentials;
