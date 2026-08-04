-- ============================================================================
-- 에버그린 갱신 큐 — 허브 자동 감지·생성 파이프라인
-- 작성: 2026-08-05
-- ============================================================================
-- 목적: 허브를 사람이 하나씩 기획하지 않고, 수집되는 topics에서 "허브로 만들 값이 있는
--       실체"를 자동 감지해 큐에 쌓고, 큐에서 자동으로 허브를 생성한다.
--
-- 3개 표:
--   evergreen_queue  — 감지된 허브 후보 대기열
--   hub_documents    — 에버그린 4포맷 문서(가이드 본문). 파일럿 5개의 빈 문서도 이걸로 채운다
--   hubs (확장)      — config jsonb 추가. 자동 생성 허브는 TS 파일이 없으므로 DB가 정본이 된다
--
-- 실행: Supabase 대시보드 → SQL Editor. 재실행해도 안전.
-- ★ 이 파일은 home_modules_migration.sql과 다른 파일이다. 둘 다 실행해야 한다.
-- ============================================================================


-- ============================================================================
-- 1. evergreen_queue — 허브 후보 대기열
-- ============================================================================
create table if not exists evergreen_queue (
  id               uuid primary key default gen_random_uuid(),
  -- 만들 허브의 URL slug. 영문 소문자·숫자·하이픈. 연도를 넣지 않는다(§6.1).
  hub_slug         text not null,
  suggested_title  text,
  category         text,
  kind             text,          -- product | car | policy | program (HubKind)

  -- 감지 근거 --------------------------------------------------------------
  trigger_topic_id uuid references topics(id) on delete set null,
  -- keyword_cluster | high_score_no_hub | repeat_surge
  trigger_reason   text not null,
  -- 사람이 읽고 판단할 수 있는 근거 문장. 근거 없는 큐 항목을 만들지 않는다는 원칙을
  -- 여기서도 지킨다 — "왜 이걸 만들려 하는가"를 설명할 수 없으면 큐에 넣지 않는다.
  trigger_detail   text,
  -- 감지에 쓰인 키워드. 생성 단계에서 뉴스·기사 조회 키워드로 재사용한다.
  keywords         text[] not null default '{}',

  priority         integer not null default 0,
  -- pending → processing → done / failed / skipped
  --   skipped: 감지는 됐지만 에버그린 허브로 부적합(뉴스 이벤트 등). 이유를 남긴다.
  status           text not null default 'pending',
  attempts         integer not null default 0,
  error_message    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 같은 허브가 대기열에 두 번 들어가지 않게 한다. done/skipped는 이력으로 남기므로 제외 —
-- 부분 인덱스라 재감지 후 재시도가 가능하다.
create unique index if not exists idx_evergreen_queue_active_slug
  on evergreen_queue (hub_slug) where status in ('pending', 'processing');

create index if not exists idx_evergreen_queue_pending
  on evergreen_queue (priority desc, created_at) where status = 'pending';

comment on table evergreen_queue is
  '허브 자동 생성 대기열. topics에서 감지된 에버그린 후보. trigger_detail 없이는 큐에 넣지 않는다.';


-- ============================================================================
-- 2. hubs 확장 — 자동 생성 허브의 정본을 DB에 둔다
-- ============================================================================
-- 왜 필요한가: 지금 허브 설정은 lib/hubs/*.ts에 있고 빌드에 컴파일된다. 런타임에 생성되는
-- 허브는 TS 파일을 만들 수 없다. 따라서 자동 생성 허브는 config를 DB에 저장하고,
-- 페이지가 TS 레지스트리 → DB 순으로 설정을 찾는다.
alter table hubs add column if not exists config          jsonb;
alter table hubs add column if not exists auto_generated  boolean not null default false;
-- unreviewed | reviewed | rejected — 자동 생성물의 사람 검수 상태를 추적한다.
alter table hubs add column if not exists review_status   text not null default 'reviewed';
alter table hubs add column if not exists source_queue_id uuid references evergreen_queue(id) on delete set null;

comment on column hubs.config is
  '자동 생성 허브의 HubConfig 전체(jsonb). TS 레지스트리에 있는 허브는 null이고 TS가 정본이다.';
comment on column hubs.review_status is
  '자동 생성 허브의 검수 상태. 기본값 reviewed는 기존 수동 허브용 — 자동 생성 시 unreviewed로 넣는다.';


-- ============================================================================
-- 3. hub_documents — 에버그린 4포맷 문서
-- ============================================================================
-- 왜 필요한가: 허브의 가이드 칸(§3.3 에버그린 4포맷)은 지금 제목만 있고 문서가 없다
-- (실측: 파일럿 5개 합계 97개 항목 중 href 1개). 제목만 있는 목록은 독자에게 막다른 길이다.
-- 문서를 DB에 두는 이유는 자동 생성 허브와 파일럿이 같은 엔진을 쓰게 하기 위해서다.
create table if not exists hub_documents (
  id           uuid primary key default gen_random_uuid(),
  hub_slug     text not null,
  -- howto | troubleshoot | compare | buying (HubEvergreen의 키와 동일)
  format       text not null,
  -- URL 조각. /hub/{hub_slug}/{slug}
  slug         text not null,
  title        text not null,
  lead         text,
  -- [{ heading, content }] 형태. 렌더러가 소제목+본문으로 그린다.
  blocks       jsonb not null default '[]',
  -- 문서가 근거로 삼은 것(공고·공식 스펙 등). 없으면 그렇다고 표시한다.
  source_note  text,
  status       text not null default 'published',
  -- ai | editor — 자동 생성물임을 숨기지 않는다.
  generated_by text not null default 'ai',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (hub_slug, slug)
);

create index if not exists idx_hub_documents_hub on hub_documents (hub_slug, format);

comment on table hub_documents is
  '허브 에버그린 4포맷 문서 본문. 허브 페이지의 가이드 목록이 이 표에 있는 문서로 링크된다.';


-- ============================================================================
-- 갱신 시각 자동 유지
-- ============================================================================
create or replace function touch_updated_at()
returns trigger language plpgsql as $fn$
begin new.updated_at = now(); return new; end;
$fn$;

drop trigger if exists trg_evergreen_queue_touch on evergreen_queue;
create trigger trg_evergreen_queue_touch before update on evergreen_queue
  for each row execute function touch_updated_at();

drop trigger if exists trg_hub_documents_touch on hub_documents;
create trigger trg_hub_documents_touch before update on hub_documents
  for each row execute function touch_updated_at();


-- ============================================================================
-- RLS — 저장소 공통 컨벤션(anon read / service write)
-- ============================================================================
alter table evergreen_queue enable row level security;
drop policy if exists "anon read" on evergreen_queue;
drop policy if exists "service write" on evergreen_queue;
create policy "anon read" on evergreen_queue for select using (true);
create policy "service write" on evergreen_queue for all using (auth.role() = 'service_role');

alter table hub_documents enable row level security;
drop policy if exists "anon read" on hub_documents;
drop policy if exists "service write" on hub_documents;
create policy "anon read" on hub_documents for select using (true);
create policy "service write" on hub_documents for all using (auth.role() = 'service_role');


-- ============================================================================
-- 스케줄 — pg_cron
-- ============================================================================
-- ★ 지시는 "GitHub Actions 3시간마다"였지만 pg_cron으로 등록한다.
--   이 프로젝트는 2026-08-03에 전체 스케줄을 pg_cron으로 이전했고, 그 이유가 실측이다:
--   GitHub Actions 스케줄이 설정보다 1.2~5.5배 밀렸다(20분 주기가 109분 간격으로 실행).
--   지금 GH Actions에 새 스케줄을 추가하면 그때 고친 문제를 다시 들이는 셈이다.
--   주기(3시간)와 동작은 지시 그대로다.
insert into ops.netlify_job (name, timeout_ms, note) values
  ('detect-evergreen-candidates-background', 15000, 'Background · 2026-08-05 신규(허브 후보 감지)'),
  ('generate-evergreen-hub-background',      15000, 'Background · 2026-08-05 신규(허브 자동 생성)'),
  ('generate-hub-documents-background',      15000, 'Background · 2026-08-05 신규(에버그린 문서 생성)')
on conflict (name) do update
  set timeout_ms = excluded.timeout_ms, note = excluded.note;

-- 감지 → 생성 → 문서 순서. 같은 3시간 창 안에서 앞 단계 결과를 뒤 단계가 쓴다.
-- 발행 체인(minute 50~59)·캘린더(minute 5)와 겹치지 않는 시간대로 뗀다.
select cron.schedule('nj-evergreen-1-detect',   '15 */3 * * *', $$select ops.invoke('detect-evergreen-candidates-background')$$);
select cron.schedule('nj-evergreen-2-generate', '25 */3 * * *', $$select ops.invoke('generate-evergreen-hub-background')$$);
select cron.schedule('nj-evergreen-3-docs',     '35 */3 * * *', $$select ops.invoke('generate-hub-documents-background')$$);

insert into ops.cron_phase (jobname, phase, note) values
  ('nj-evergreen-1-detect',   4, '허브 후보 감지'),
  ('nj-evergreen-2-generate', 4, '허브 자동 생성 · priority 상위 3개'),
  ('nj-evergreen-3-docs',     4, '에버그린 4포맷 문서 생성')
on conflict (jobname) do update set phase = excluded.phase, note = excluded.note;

-- cron.job 직접 UPDATE는 42501이 난다(확장 소유 표). 검증된 함수를 쓴다.
select * from ops.activate_phase(4);


-- ============================================================================
-- 확인
-- ============================================================================
select 'evergreen_queue' as t, count(*)::text as v from evergreen_queue
union all select 'hub_documents', count(*)::text from hub_documents
union all select 'hubs.config 컬럼', (select count(*)::text from information_schema.columns
  where table_name = 'hubs' and column_name in ('config','auto_generated','review_status','source_queue_id'))
union all select 'cron 등록', (select count(*)::text from ops.cron_health where jobname like 'nj-evergreen-%' and active);
