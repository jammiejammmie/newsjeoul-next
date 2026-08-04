-- ============================================================================
-- 뉴스저울 스케줄러를 GitHub Actions → Supabase pg_cron으로 전환
-- 작성: 2026-08-04
-- ============================================================================
-- 왜 옮기는가(실측 근거)
--   distribution_run_log를 켠 뒤 측정한 결과, GitHub Actions가 cron을 전혀 지키지 않고
--   주기가 짧을수록 더 심하게 밀어낸다(같은 저장소의 모든 스케줄 워크플로우 공통 현상):
--     설정 20분  → 실측 평균 109분 (5.5배 느림)
--     설정 30분  → 실측 평균  94분 (3.1배)
--     설정 60분  → 실측 평균 143분 (2.4배)
--     설정 180분 → 실측 평균 222분 (1.2배)
--   실효 하한이 약 90~150분이라 cron을 줄이는 방식으로는 밀도를 올릴 수 없었다.
--   이는 2026-07-22에 Netlify 네이티브 cron이 광범위하게 죽어 GitHub Actions로 전부
--   옮겼던 사고와 같은 유형이다 — 3개월 사이 플랫폼 스케줄러 장애가 두 번 반복됐다.
--   pg_cron은 우리 DB 안에서 도는 스케줄러라 외부 플랫폼 큐 상태에 영향받지 않는다.
--
-- 구성
--   pg_cron  : 스케줄링(Postgres 내부)
--   pg_net   : HTTP 호출(비동기 — 요청을 큐에 넣고 즉시 반환하므로 cron 잡이 오래 붙잡히지 않는다)
--   Vault    : x-admin-key 보관(이 파일에는 키 값이 들어가지 않는다)
--
-- 안전 설계
--   · 호출 대상은 ops.netlify_job 테이블에 등록된 화이트리스트로 제한한다.
--     임의 URL/함수를 호출할 수 없으므로, 헬퍼가 노출돼도 피해 범위가 고정된다.
--   · 헬퍼를 public이 아닌 ops 스키마에 둔다. PostgREST는 기본적으로 public만 노출하므로
--     REST(anon key)로 호출할 수 없다. 추가로 anon/authenticated 권한을 명시적으로 회수한다.
--   · 각 잡마다 timeout을 따로 둔다. 동기 함수(collect-news 등)는 응답까지 60~90초가
--     걸리므로 pg_net 기본값 5초로는 요청이 중간에 끊긴다.
--
-- ── 이 파일은 통째로 한 번에 실행해도 안전하다 ─────────────────────────────
-- 스케줄을 등록하되 **전부 비활성(active=false)** 상태로 만들기 때문이다. 즉 이 파일을 실행한
-- 직후에는 아무 잡도 돌지 않고, GitHub Actions가 그대로 유일한 트리거로 남는다.
-- 실제 전환은 STEP 6에서 단계별로 한 줄씩 활성화하며 진행한다.
--
-- 그렇게 설계한 이유:
--   · 23개 잡을 한꺼번에 켜면 GitHub Actions와 이중 실행이 되어 AI 호출 비용이 두 배로 나간다
--     (특히 news/publish 체인 11개가 Claude를 대량 호출한다).
--   · Vault 키 등록(STEP 2)은 값을 직접 넣어야 하는 수동 단계라, 파일을 통째로 실행하면
--     건너뛰게 된다. 잡이 비활성이면 키가 없어도 실패 로그가 쌓이지 않는다.
--
-- 유일한 수동 단계: STEP 2에서 ADMIN_KEY를 넣어 한 줄 실행. 이건 자동화하지 않는다
-- (키를 파일·git·커밋에 남기지 않기 위해서다).
-- ============================================================================


-- ============================================================================
-- STEP 1. 확장 활성화
-- ============================================================================
-- Supabase 대시보드 → Database → Extensions에서 pg_cron / pg_net을 켜도 된다(동일 효과).
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 확인: 둘 다 installed_version이 나와야 한다.
select name, default_version, installed_version
from pg_available_extensions
where name in ('pg_cron', 'pg_net', 'supabase_vault')
order by name;


-- ============================================================================
-- STEP 2. 시크릿 등록 (★ 이 블록만 값을 직접 넣어 실행 — 파일에 키를 저장하지 마세요)
-- ============================================================================
-- 아래 한 줄의 <PASTE_ADMIN_KEY_HERE>를 Netlify 환경변수 ADMIN_KEY 값으로 바꿔서 실행한다.
-- (GitHub Actions에서는 secrets.NEWSJEOUL_ADMIN_KEY로 쓰던 그 값이다.)
-- 실행 후에는 SQL Editor의 쿼리 히스토리에서 이 문장을 지우는 것을 권장한다.
--
--   select vault.create_secret('<PASTE_ADMIN_KEY_HERE>', 'newsjeoul_admin_key', 'Netlify 함수 호출용 x-admin-key');
--
-- 이미 등록한 뒤 값을 바꿀 때는 create가 아니라 update를 쓴다:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'newsjeoul_admin_key'),
--     '<PASTE_NEW_ADMIN_KEY>'
--   );
--
-- 확인(값은 보지 않고 등록 여부만):
select name, description, created_at
from vault.secrets
where name = 'newsjeoul_admin_key';


-- ============================================================================
-- STEP 3. 잡 정의 + 호출 헬퍼
-- ============================================================================
create schema if not exists ops;

-- 호출 가능한 Netlify 함수 화이트리스트.
-- enabled=false로 두면 스케줄은 남기고 호출만 멈출 수 있다(전환 중 단계별 검증에 사용).
create table if not exists ops.netlify_job (
  name        text primary key,           -- Netlify 함수 이름(=URL 경로 마지막 조각)
  timeout_ms  integer not null default 15000,
  enabled     boolean not null default true,
  note        text
);

comment on table ops.netlify_job is
  'pg_cron이 호출할 수 있는 Netlify 함수 화이트리스트. 여기 없는 이름은 ops.invoke가 거부한다.';

-- timeout 기준: -background 접미사 함수는 즉시 202를 반환하므로 짧게, 동기 함수는 실제 소요시간
-- (netlify.toml의 timeout 설정 참고)보다 넉넉하게 준다. pg_net 기본값 5초로는 동기 함수가 끊긴다.
insert into ops.netlify_job (name, timeout_ms, note) values
  ('collect-news',                          120000, '동기 · RSS 수집(netlify timeout 90s)'),
  ('process-stories-background',             15000, 'Background · 즉시 202'),
  ('extract-entities',                       90000, '동기 · netlify timeout 60s'),
  ('resolve-topics-background',              15000, 'Background'),
  ('generate-updates-background',            15000, 'Background'),
  ('generate-editorial-plan-background',     15000, 'Background'),
  ('generate-publish-gate-background',       15000, 'Background'),
  ('generate-editorial-draft-background',    15000, 'Background'),
  ('generate-expansion-drafts-background',   15000, 'Background'),
  ('publish-routed-content-background',      15000, 'Background · 2026-08-03 신규(라우팅 발행)'),
  ('generate-relation-context-background',   15000, 'Background'),
  ('post-threads-background',                15000, 'Background · 최대 15분 실행'),
  ('update-topic-weight-background',         15000, 'Background · Hero 무게 갱신'),
  ('scan-comments-shadow-background',        15000, 'Background'),
  ('check-pipeline-health',                  30000, '동기 · 정체 감지'),
  ('update-news',                            90000, '동기 · netlify timeout 60s'),
  ('update-news-evening',                    90000, '동기 · netlify timeout 60s'),
  ('generate-zeitgeist-background',          15000, 'Background'),
  ('refresh-relationships',                  90000, '동기 · netlify timeout 60s'),
  ('generate-insights',                      90000, '동기 · netlify timeout 60s'),
  ('generate-node-insights-background',      15000, 'Background · 2026-08-03 동기→Background 전환'),
  ('detect-coverage-gaps-background',        15000, 'Background · 주간'),
  ('generate-weekly-report-background',      15000, 'Background · 주간')
on conflict (name) do update
  set timeout_ms = excluded.timeout_ms,
      note       = excluded.note;

-- 호출 헬퍼. 화이트리스트에 있고 enabled인 잡만 호출하며, 키는 Vault에서 읽는다.
-- security definer 이유: Vault 복호화 뷰 접근 권한이 필요하다. 대신 아래에서 실행 권한을
-- postgres로만 제한한다(anon/authenticated는 호출 불가).
create or replace function ops.invoke(job_name text)
returns bigint
language plpgsql
security definer
set search_path = ops, public, vault, net, pg_temp
as $fn$
declare
  v_timeout integer;
  v_enabled boolean;
  v_key     text;
  v_request bigint;
begin
  select timeout_ms, enabled into v_timeout, v_enabled
  from ops.netlify_job where name = job_name;

  if v_timeout is null then
    raise exception 'ops.invoke: 화이트리스트에 없는 잡 이름 "%" — ops.netlify_job에 먼저 등록해야 한다', job_name;
  end if;

  if not v_enabled then
    raise notice 'ops.invoke: "%"는 enabled=false 상태여서 호출을 건너뜀', job_name;
    return null;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'newsjeoul_admin_key';

  if v_key is null or v_key = '' then
    raise exception 'ops.invoke: Vault에 newsjeoul_admin_key가 없다 — STEP 2를 먼저 실행해야 한다';
  end if;

  -- pg_net은 비동기다: 요청을 큐에 넣고 request id만 돌려준다. 결과는 net._http_response에 쌓인다.
  select net.http_post(
    url                  := 'https://newsjeoul.co.kr/.netlify/functions/' || job_name,
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-admin-key',  v_key
                            ),
    timeout_milliseconds := v_timeout
  ) into v_request;

  insert into ops.invoke_log (job_name, request_id) values (job_name, v_request);
  return v_request;
end;
$fn$;

-- 호출 이력 — cron.job_run_details는 "잡이 돌았는가"만 알려주고 어떤 함수를 불렀는지는 남지 않는다.
-- request_id로 net._http_response와 조인해 응답 코드까지 추적하기 위해 따로 남긴다.
create table if not exists ops.invoke_log (
  id          bigserial primary key,
  job_name    text not null,
  request_id  bigint,
  invoked_at  timestamptz not null default now()
);
create index if not exists idx_ops_invoke_log_invoked_at on ops.invoke_log (invoked_at desc);
create index if not exists idx_ops_invoke_log_job on ops.invoke_log (job_name, invoked_at desc);

-- 권한 잠금 — REST(anon/authenticated)로는 절대 호출되지 않게 한다.
-- ops 스키마는 PostgREST 노출 대상(public)이 아니지만, 설정이 바뀌어도 안전하도록 이중으로 막는다.
revoke all on schema ops from anon, authenticated;
revoke all on all tables in schema ops from anon, authenticated;
revoke all on function ops.invoke(text) from public, anon, authenticated;
grant usage on schema ops to postgres;
grant execute on function ops.invoke(text) to postgres;


-- ============================================================================
-- STEP 4. 스케줄 등록 (전부 비활성 상태로 — 이 STEP 실행만으로는 아무것도 돌지 않는다)
-- ============================================================================
-- 원칙
--   · pg_cron은 UTC로 동작한다(기존 GitHub Actions cron도 UTC였으므로 값을 그대로 옮긴다).
--   · GitHub Actions에서 "단계 사이 sleep"으로 순서를 만들던 체인은, pg_net이 비동기라
--     sleep을 쓸 수 없다. 대신 단계마다 분(minute) 오프셋을 줘서 순서를 만든다
--     (원래 netlify.toml이 쓰던 방식이며 sleep 길이를 그대로 반영했다).
--   · cron.schedule은 같은 jobname이면 갱신하므로 이 블록은 여러 번 실행해도 안전하다.
--   · 등록 직후 이 STEP 마지막에서 전부 active=false로 내린다. 활성화는 STEP 6에서 단계별로 한다.

-- ── 단독 잡 ────────────────────────────────────────────────────────────────
select cron.schedule('nj-check-pipeline-health', '*/20 * * * *', $$select ops.invoke('check-pipeline-health')$$);
select cron.schedule('nj-post-threads',          '*/30 * * * *', $$select ops.invoke('post-threads-background')$$);
select cron.schedule('nj-update-topic-weight',   '5 * * * *',    $$select ops.invoke('update-topic-weight-background')$$);
select cron.schedule('nj-scan-comments',         '30 * * * *',   $$select ops.invoke('scan-comments-shadow-background')$$);

-- ── 뉴스 파이프라인 체인(3시간마다) ─────────────────────────────────────────
-- 원본 sleep: collect(0) →3분→ process-stories →2분→ extract-entities → resolve-topics →1분→ generate-updates
-- 오프셋을 원본보다 조금 넉넉하게 잡았다: extract-entities와 resolve-topics는 원본에서 sleep 없이
-- 연속 호출됐는데, 그건 동기 호출이 끝나야 다음이 시작되기 때문이었다. pg_net은 비동기라 그 보장이
-- 없으므로 명시적 간격을 준다.
select cron.schedule('nj-news-1-collect',        '0 */3 * * *',  $$select ops.invoke('collect-news')$$);
select cron.schedule('nj-news-2-stories',        '4 */3 * * *',  $$select ops.invoke('process-stories-background')$$);
select cron.schedule('nj-news-3-entities',       '7 */3 * * *',  $$select ops.invoke('extract-entities')$$);
select cron.schedule('nj-news-4-topics',         '10 */3 * * *', $$select ops.invoke('resolve-topics-background')$$);
select cron.schedule('nj-news-5-updates',        '13 */3 * * *', $$select ops.invoke('generate-updates-background')$$);

-- ── 발행 파이프라인 체인(3시간마다, 뉴스 체인 다음) ─────────────────────────
-- 원본 sleep: plan(50) →2분→ gate →3분→ draft →1분→ expansion →2분→ routed-publish →2분→ relation
-- 마지막 단계가 정시(minute 60)를 넘지 않도록 뒤쪽 간격만 1분씩 압축했다.
select cron.schedule('nj-publish-1-plan',        '50 */3 * * *', $$select ops.invoke('generate-editorial-plan-background')$$);
select cron.schedule('nj-publish-2-gate',        '52 */3 * * *', $$select ops.invoke('generate-publish-gate-background')$$);
select cron.schedule('nj-publish-3-draft',       '55 */3 * * *', $$select ops.invoke('generate-editorial-draft-background')$$);
select cron.schedule('nj-publish-4-expansion',   '56 */3 * * *', $$select ops.invoke('generate-expansion-drafts-background')$$);
select cron.schedule('nj-publish-5-routed',      '58 */3 * * *', $$select ops.invoke('publish-routed-content-background')$$);
select cron.schedule('nj-publish-6-relation',    '59 */3 * * *', $$select ops.invoke('generate-relation-context-background')$$);

-- ── 일 1회 ─────────────────────────────────────────────────────────────────
select cron.schedule('nj-daily-news-morning',    '0 0 * * *',    $$select ops.invoke('update-news')$$);        -- 09:00 KST
select cron.schedule('nj-daily-news-evening',    '0 12 * * *',   $$select ops.invoke('update-news-evening')$$); -- 21:00 KST
select cron.schedule('nj-daily-zeitgeist',       '50 1 * * *',   $$select ops.invoke('generate-zeitgeist-background')$$); -- 10:50 KST

-- 인사이트 배치(원본 sleep 15분 x 2를 오프셋으로 변환)
select cron.schedule('nj-insights-1-relations',  '0 2 * * *',    $$select ops.invoke('refresh-relationships')$$);
select cron.schedule('nj-insights-2-insights',   '15 2 * * *',   $$select ops.invoke('generate-insights')$$);
select cron.schedule('nj-insights-3-nodes',      '30 2 * * *',   $$select ops.invoke('generate-node-insights-background')$$);

-- ── 주 1회(월요일 09:00 KST = 월요일 00:00 UTC) ────────────────────────────
select cron.schedule('nj-weekly-1-gaps',         '0 0 * * 1',    $$select ops.invoke('detect-coverage-gaps-background')$$);
select cron.schedule('nj-weekly-2-report',       '10 0 * * 1',   $$select ops.invoke('generate-weekly-report-background')$$);


-- ── 단계(Phase) 매핑 ────────────────────────────────────────────────────────
-- 어떤 잡을 언제 켤지 문서가 아니라 데이터로 관리한다.
-- docs/pg-cron-migration-plan.md의 Phase 구분과 동일하다.
create table if not exists ops.cron_phase (
  jobname      text primary key,
  phase        integer not null,
  activated_at timestamptz,
  note         text
);

insert into ops.cron_phase (jobname, phase, note) values
  ('nj-check-pipeline-health', 1, 'AI 비용 0 · 5.5배 밀림 · 20분 주기라 검증이 가장 빠름'),
  ('nj-update-topic-weight',   2, 'Hero 무게 갱신 — 체감 효과 가장 큼'),
  ('nj-scan-comments',         2, ''),
  ('nj-post-threads',          3, 'AI 비용 + 외부 게시 · dedup이 중복 방어'),
  ('nj-news-1-collect',        4, '체인 · AI 비용 최대 → GH를 먼저 끄고 켤 것'),
  ('nj-news-2-stories',        4, ''),
  ('nj-news-3-entities',       4, ''),
  ('nj-news-4-topics',         4, ''),
  ('nj-news-5-updates',        4, ''),
  ('nj-publish-1-plan',        4, ''),
  ('nj-publish-2-gate',        4, ''),
  ('nj-publish-3-draft',       4, ''),
  ('nj-publish-4-expansion',   4, ''),
  ('nj-publish-5-routed',      4, ''),
  ('nj-publish-6-relation',    4, ''),
  ('nj-daily-news-morning',    5, '실측 배율 1.0~1.2배로 이미 정상 · 일관성 목적'),
  ('nj-daily-news-evening',    5, ''),
  ('nj-daily-zeitgeist',       5, ''),
  ('nj-insights-1-relations',  5, ''),
  ('nj-insights-2-insights',   5, ''),
  ('nj-insights-3-nodes',      5, ''),
  ('nj-weekly-1-gaps',         5, ''),
  ('nj-weekly-2-report',       5, '')
on conflict (jobname) do update set phase = excluded.phase, note = excluded.note;

-- ── 아직 전환하지 않은 잡을 비활성으로 (★ 이 파일을 한 번에 실행해도 안전한 이유) ──
-- activated_at이 비어 있으면 = STEP 6에서 아직 켜지 않은 잡이므로 내린다.
-- 이미 켠 잡(activated_at 기록됨)은 건드리지 않으므로, 전환을 진행한 뒤 이 파일을 다시
-- 실행해도 운영 중인 스케줄이 멈추지 않는다(멱등).
-- cron.alter_job은 pg_cron의 공식 API다(cron.job 테이블 직접 UPDATE보다 안전).
select cron.alter_job(j.jobid, active := false)
from cron.job j
join ops.cron_phase p on p.jobname = j.jobname
where p.activated_at is null;

-- 단계 활성화 함수 — 한 줄로 해당 Phase의 잡을 전부 켠다.
create or replace function ops.activate_phase(p integer)
returns table (jobname text, schedule text)
language plpgsql
as $fn$
begin
  perform cron.alter_job(j.jobid, active := true)
  from cron.job j join ops.cron_phase cp on cp.jobname = j.jobname
  where cp.phase = p;

  update ops.cron_phase set activated_at = now() where phase = p and activated_at is null;

  return query
    select j.jobname::text, j.schedule::text
    from cron.job j join ops.cron_phase cp on cp.jobname = j.jobname
    where cp.phase = p order by j.jobname;
end;
$fn$;

-- 되돌리기용(해당 Phase만 다시 끈다)
create or replace function ops.deactivate_phase(p integer)
returns void
language plpgsql
as $fn$
begin
  perform cron.alter_job(j.jobid, active := false)
  from cron.job j join ops.cron_phase cp on cp.jobname = j.jobname
  where cp.phase = p;

  update ops.cron_phase set activated_at = null where phase = p;
end;
$fn$;

revoke all on function ops.activate_phase(integer), ops.deactivate_phase(integer) from public, anon, authenticated;


-- ============================================================================
-- STEP 5. 모니터링 뷰 (전환 검증과 이후 운영 점검에 그대로 사용)
-- ============================================================================
-- 잡별 최근 실행 상태 + 실제 실행 간격. GitHub Actions에서 겪은 "설정과 실제가 다른" 문제를
-- 다시 겪지 않으려면 실측 간격을 항상 볼 수 있어야 한다.
-- active/phase를 함께 보여준다 — 이 뷰가 "지금 무엇이 켜져 있고 얼마나 잘 도는가"를 한 번에
-- 답해야 한다. 2026-08-04 전환 중, 이 뷰만 봐서는 활성 여부를 알 수 없어 보완했다.
create or replace view ops.cron_health as
with runs as (
  select
    j.jobname,
    j.schedule,
    j.active,
    d.start_time,
    d.status,
    row_number() over (partition by j.jobname order by d.start_time desc) as rn,
    lag(d.start_time) over (partition by j.jobname order by d.start_time desc) as next_newer
  from cron.job j
  left join cron.job_run_details d on d.jobid = j.jobid
  where j.jobname like 'nj-%'
)
select
  r.jobname,
  cp.phase,
  r.active,
  r.schedule,
  max(r.start_time)                                    as last_run,
  count(*) filter (where r.status = 'succeeded')        as succeeded,
  count(*) filter (where r.status = 'failed')           as failed,
  round(avg(extract(epoch from (r.next_newer - r.start_time)) / 60) filter (where r.rn <= 10), 1) as avg_gap_min,
  -- 실측이 설정보다 1.5배 이상 느리면 스케줄러가 밀리는 신호(GitHub Actions에서 겪은 그 문제)
  case
    when not r.active then '대기(비활성)'
    when max(r.start_time) is null then '활성 · 첫 실행 대기'
    when max(r.start_time) < now() - interval '3 hours' then '★ 3시간 이상 실행 없음'
    else '정상'
  end                                                  as state
from runs r
left join ops.cron_phase cp on cp.jobname = r.jobname
group by r.jobname, cp.phase, r.active, r.schedule
order by cp.phase nulls last, r.jobname;

comment on view ops.cron_health is
  'pg_cron 잡별 활성 여부/단계/최근 실행/성공·실패 수/실측 평균 간격. avg_gap_min이 schedule과 크게 다르면 스케줄러가 밀리는 것이다.';

-- HTTP 응답까지 확인하는 뷰 — 잡이 "돌았다"와 함수가 "응답했다"는 다른 문제다.
create or replace view ops.invoke_health as
select
  l.job_name,
  l.invoked_at,
  r.status_code,
  r.error_msg,
  left(coalesce(r.content, ''), 200) as body_preview
from ops.invoke_log l
left join net._http_response r on r.id = l.request_id
order by l.invoked_at desc;

comment on view ops.invoke_health is
  'ops.invoke 호출별 HTTP 결과. 202=Background 정상 접수, 200=동기 정상, 401=키 문제, null=아직 응답 없음/타임아웃.';


-- ============================================================================
-- STEP 6. 단계별 활성화 (★ 여기서부터가 실제 전환 — 한 줄씩, 관찰하면서)
-- ============================================================================
-- 위 STEP 1~5를 실행한 시점에는 모든 잡이 active=false다. 아래를 순서대로 진행한다.
-- 각 단계 사이에 최소 한 주기 이상 관찰하고, 확인되면 해당 GitHub 워크플로우의
-- schedule: 블록을 제거한다(workflow_dispatch:는 남긴다).
--
-- 전제: STEP 2(Vault 키 등록)를 반드시 먼저 완료해야 한다. 안 하면 모든 호출이
--       'Vault에 newsjeoul_admin_key가 없다' 예외로 실패한다.
--
-- 먼저 키가 제대로 들어갔는지 1회 호출로 확인한다(202가 나와야 정상):
--   select ops.invoke('post-threads-background');
--   select pg_sleep(3);
--   select job_name, status_code, error_msg from ops.invoke_health limit 3;
--
-- Phase 1 — check-pipeline-health (AI 비용 0, 20분 주기라 1시간이면 검증됨)
--   select * from ops.activate_phase(1);
--
-- Phase 2 — update-topic-weight, scan-comments (Hero 무게 갱신 — 체감 가장 큼)
--   select * from ops.activate_phase(2);
--
-- Phase 3 — post-threads
--   select * from ops.activate_phase(3);
--
-- Phase 4 — 체인 11개. ★ 이 단계만 순서가 반대다: GitHub 워크플로우
--   (news-pipeline.yml, publish-pipeline.yml)의 schedule:을 먼저 제거한 뒤 켠다.
--   중복 실행 시 AI 비용이 두 배로 나가고, 3시간 주기라 한 사이클 빠져도 손실이 작다.
--   select * from ops.activate_phase(4);
--
-- Phase 5 — 일/주 배치(이미 정상 동작 중이라 급하지 않음)
--   select * from ops.activate_phase(5);
--
-- 되돌리기: select ops.deactivate_phase(3);

-- 현재 단계별 전환 상태
select cp.phase, count(*) as jobs,
       count(*) filter (where j.active) as active_now,
       min(cp.activated_at) as activated_at
from ops.cron_phase cp join cron.job j on j.jobname = cp.jobname
group by cp.phase order by cp.phase;


-- ============================================================================
-- STEP 7. 검증 쿼리 (활성화 직후 + 30분 후 + 3시간 후에 확인)
-- ============================================================================
-- (1) 등록된 잡 목록과 활성 여부 — 23개 잡이 등록되고, 아직 전환 전이면 active가 전부 false
select j.jobname, j.schedule, j.active, cp.phase
from cron.job j left join ops.cron_phase cp on cp.jobname = j.jobname
where j.jobname like 'nj-%' order by cp.phase, j.jobname;

-- (2) 수동 1회 호출 테스트(스케줄을 기다리지 않고 즉시 확인).
--     202가 나와야 정상이다. 401이면 Vault 키가 틀렸고, 400이면 함수 이름이 잘못됐다.
-- select ops.invoke('post-threads-background');
-- select pg_sleep(3);
-- select * from ops.invoke_health limit 5;

-- (3) 실행 이력 — 30분쯤 지난 뒤 nj-post-threads / nj-check-pipeline-health가 보여야 한다
select * from ops.cron_health;

-- (4) HTTP 결과 — status_code가 200/202가 아닌 건이 있는지
select job_name, count(*), min(status_code) as min_code, max(status_code) as max_code
from ops.invoke_health
where invoked_at > now() - interval '2 hours'
group by job_name
order by job_name;

-- (5) 실패한 cron 잡 상세
select jobname, start_time, status, return_message
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname like 'nj-%' and d.status <> 'succeeded'
order by start_time desc limit 20;


-- ============================================================================
-- STEP 8. 롤백 (문제 시 즉시 되돌리기)
-- ============================================================================
-- 단계 단위 되돌리기(가장 흔한 경우 — 스케줄은 남고 실행만 멈춘다):
--   select ops.deactivate_phase(3);
--
-- 전체 정지(스케줄은 남기고 전부 비활성):
--   select cron.alter_job(jobid, active := false) from cron.job where jobname like 'nj-%';
--
-- 특정 함수만 호출 차단(스케줄·활성 상태는 유지 — 원인 조사 중에 유용):
--   update ops.netlify_job set enabled = false where name = 'collect-news';
--
-- 스케줄 자체를 삭제(완전 원복):
--   select cron.unschedule(jobname) from cron.job where jobname like 'nj-%';
--
-- 되돌린 뒤에는 .github/workflows/*.yml의 schedule 블록을 복구하면 원래 상태로 돌아간다
-- (전환 계획서 docs/pg-cron-migration-plan.md의 단계별 절차 참고).
