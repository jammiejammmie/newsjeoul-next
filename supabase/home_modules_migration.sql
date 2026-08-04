-- ============================================================================
-- 홈 2a 6개 모듈 실데이터 인프라
-- 작성: 2026-08-05
-- 근거: 노차장 개편 설계서 확정 홈 시안 2a. 시안의 모듈을 더미가 아니라 실제로 굴러가는
--       데이터로 채우기 위해 필요한 테이블·권한·인덱스를 만든다.
-- ============================================================================
-- 6개 모듈과 데이터 출처(무엇을 새로 만들고 무엇을 이미 있는 것으로 쓰는가)
--
--   ① 색인 카운터   : topics 집계          — 이미 있음. 새 테이블 불필요
--   ② 순위 변동     : ai_context.weight_history — 이미 있음(상위 40건 전부 보유, delta_from_prev 포함)
--   ③ 캘린더        : upcoming_events      — ★신설. 아래 설명 참고
--   ④ 계산기        : 계산 로직            — DB 불필요(클라이언트 계산)
--   ⑤ 조회수        : topic_reads          — ★신설. 기존 user_reads는 story 단위라 topic에 못 쓴다
--   ⑥ 구독          : email_subscribers    — 이미 있음(id, email만) → 컬럼 보강
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run. 재실행해도 안전.
-- ============================================================================


-- ============================================================================
-- ③ 캘린더 — upcoming_events (신설)
-- ============================================================================
-- 왜 새 테이블인가: topic_timeline_events가 이미 있지만 그건 "일어난 일"의 기록이다
-- (실측: 746건 전부 과거·현재 시점, 미래 일정 0건). 파이프라인이 보도된 사실을 적는 표라
-- 구조적으로 미래 일정이 들어오지 않는다.
--
-- 캘린더는 "앞으로 일어날 일"이 필요하다. 그래서 별도 표를 두고, 본문에 명시된 미래 날짜를
-- 추출하는 함수(netlify/functions/extract-upcoming-events-background.js)가 채운다.
-- 추출이므로 원문 근거(source_quote)를 반드시 함께 저장한다 — 근거 없는 일정은 표시하지 않는다.
create table if not exists upcoming_events (
  id           uuid primary key default gen_random_uuid(),
  topic_id     uuid not null references topics(id) on delete cascade,
  -- 날짜만 저장한다. 본문에 "8월 11일 오전 10시"처럼 시각이 있어도 시각까지 신뢰하기 어렵다.
  event_date   date not null,
  title        text not null,
  -- release(출시·오픈) / deadline(마감·종료) / announcement(발표·공개) / other
  kind         text not null default 'other',
  -- 추출 근거가 된 본문 문장. 이게 없으면 표시하지 않는다(근거 없는 일정 금지).
  source_quote text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- 같은 토픽에 같은 날짜·같은 제목이 중복 적재되지 않게 한다(추출 함수가 매번 돌기 때문).
  unique (topic_id, event_date, title)
);

create index if not exists idx_upcoming_events_date on upcoming_events (event_date);
create index if not exists idx_upcoming_events_topic on upcoming_events (topic_id);

comment on table upcoming_events is
  '앞으로 일어날 일정(출시·마감·발표). topic_timeline_events(일어난 일)와 역할이 다르다. 본문에서 추출하며 source_quote 없이는 표시하지 않는다.';


-- ============================================================================
-- ⑤ 조회수 — topic_reads (신설)
-- ============================================================================
-- 기존 user_reads는 (id, story_id, read_at, count) 구조로 story 단위다. 홈·목록·허브가 모두
-- topic 단위로 동작하므로 그 표로는 "많이 본 이슈"를 만들 수 없다. topic 단위 표를 따로 둔다.
--
-- 로그 누적(행 추가)이 아니라 카운터 증가 방식을 쓴다: 조회는 트래픽에 비례해 무한히 쌓이는데
-- 행을 계속 추가하면 집계 비용이 계속 커진다. topic당 1행을 유지하면 집계가 항상 O(topic 수)다.
-- 시간대별 추세가 필요해지면 그때 별도 롤업 표를 만든다(지금 필요 없는 구조를 미리 만들지 않는다).
create table if not exists topic_reads (
  topic_id     uuid primary key references topics(id) on delete cascade,
  views        bigint not null default 0,
  -- 24시간 창 집계용. 창이 지나면 window_views를 0으로 리셋하고 창 시작 시각을 갱신한다.
  window_views bigint not null default 0,
  window_start timestamptz not null default now(),
  last_read_at timestamptz not null default now()
);

create index if not exists idx_topic_reads_window on topic_reads (window_views desc);
create index if not exists idx_topic_reads_views on topic_reads (views desc);

comment on table topic_reads is
  'Topic 단위 조회수 카운터. 행 누적이 아니라 topic당 1행 증가 방식 — 집계 비용을 트래픽과 무관하게 유지한다.';

-- 조회 1회 기록 — 24시간 창을 넘겼으면 창을 리셋한다.
-- 애플리케이션에서 조건 분기하지 않고 DB 함수 하나로 처리하는 이유: 동시 요청에서
-- read-modify-write 경합이 생기면 카운트가 유실된다. upsert 한 문장이면 원자적이다.
create or replace function record_topic_read(p_topic_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  insert into topic_reads (topic_id, views, window_views, window_start, last_read_at)
  values (p_topic_id, 1, 1, now(), now())
  on conflict (topic_id) do update
    set views = topic_reads.views + 1,
        window_views = case
          when topic_reads.window_start < now() - interval '24 hours' then 1
          else topic_reads.window_views + 1
        end,
        window_start = case
          when topic_reads.window_start < now() - interval '24 hours' then now()
          else topic_reads.window_start
        end,
        last_read_at = now();
end;
$fn$;

-- anon이 이 함수만 실행할 수 있게 한다. 테이블 직접 쓰기 권한은 주지 않는다 —
-- 함수는 +1만 할 수 있고 임의 값 주입이 불가능하다.
grant execute on function record_topic_read(uuid) to anon, authenticated;


-- ============================================================================
-- ⑥ 구독 — email_subscribers 컬럼 보강
-- ============================================================================
-- 기존 표는 (id, email)뿐이다. 어디서·무엇을 구독했는지 모르면 발송 대상을 나눌 수 없고
-- 중복 가입도 막을 수 없다. 컬럼을 추가한다(기존 행에 영향 없음).
alter table email_subscribers add column if not exists created_at   timestamptz not null default now();
alter table email_subscribers add column if not exists source       text;          -- 'home' | 'hub:{slug}' 등
alter table email_subscribers add column if not exists keyword      text;          -- 키워드 구독 시
alter table email_subscribers add column if not exists status       text not null default 'active';
alter table email_subscribers add column if not exists unsubscribed_at timestamptz;

-- 같은 이메일이 같은 출처·키워드로 중복 가입되지 않게 한다.
-- 부분 인덱스가 아니라 일반 unique를 쓰면 keyword가 null인 행끼리 중복이 허용되므로
-- coalesce로 정규화한 표현식 인덱스를 쓴다.
create unique index if not exists idx_email_subscribers_unique
  on email_subscribers (lower(email), coalesce(source, ''), coalesce(keyword, ''));

create index if not exists idx_email_subscribers_created on email_subscribers (created_at desc);


-- ============================================================================
-- RLS — 저장소 공통 컨벤션(anon read / service write) + 위 함수 예외
-- ============================================================================
alter table upcoming_events enable row level security;
drop policy if exists "anon read" on upcoming_events;
drop policy if exists "service write" on upcoming_events;
create policy "anon read" on upcoming_events for select using (true);
create policy "service write" on upcoming_events for all using (auth.role() = 'service_role');

alter table topic_reads enable row level security;
drop policy if exists "anon read" on topic_reads;
drop policy if exists "service write" on topic_reads;
create policy "anon read" on topic_reads for select using (true);
create policy "service write" on topic_reads for all using (auth.role() = 'service_role');

alter table email_subscribers enable row level security;
drop policy if exists "anon read" on email_subscribers;
drop policy if exists "service write" on email_subscribers;
-- ★ 구독자 목록은 anon read를 주지 않는다. 이메일 주소는 개인정보이고, 다른 표들과 달리
--   공개 조회가 필요한 데이터가 아니다. 가입은 서버 라우트(service key)로만 처리한다.
create policy "service write" on email_subscribers for all using (auth.role() = 'service_role');


-- ============================================================================
-- ③ 캘린더를 자동으로 굴리기 — pg_cron 등록
-- ============================================================================
-- 표만 만들면 캘린더는 영원히 비어 있다. 추출 함수를 스케줄에 올려야 자동으로 채워진다.
-- 이 프로젝트의 모든 스케줄은 pg_cron으로 옮겨져 있다(2026-08-03 전환 완료).
--
-- 실행 시각: 발행 체인(minute 50~59) 다음 정시 직후. 갓 발행된 본문에서 일정을 뽑는다 —
-- 발행 전에 돌면 draft가 없어 뽑을 게 없다.
insert into ops.netlify_job (name, timeout_ms, note) values
  ('extract-upcoming-events-background', 15000, 'Background · 2026-08-05 신규(홈 캘린더 자동 적재)')
on conflict (name) do update
  set timeout_ms = excluded.timeout_ms, note = excluded.note;

-- 3시간마다, 발행 체인이 끝난 뒤(:59 다음 정시 5분). 하루 8회 × 12건 = 최대 96건 검사.
select cron.schedule(
  'nj-publish-7-upcoming',
  '5 */3 * * *',
  $$select ops.invoke('extract-upcoming-events-background')$$
);

-- Phase 매핑 — 발행 체인과 같은 Phase 5로 둔다(이미 활성 상태인 단계).
insert into ops.cron_phase (jobname, phase, note) values
  ('nj-publish-7-upcoming', 5, '홈 캘린더 적재 · 발행 체인 뒤에 붙는다')
on conflict (jobname) do update set phase = excluded.phase, note = excluded.note;

-- 발행 체인이 이미 켜져 있으므로 이 잡도 바로 켠다(비활성으로 두면 캘린더가 계속 빈다).
update cron.job set active = true where jobname = 'nj-publish-7-upcoming';
update ops.cron_phase set activated_at = now()
  where jobname = 'nj-publish-7-upcoming' and activated_at is null;


-- ============================================================================
-- 확인
-- ============================================================================
select 'upcoming_events' as t, count(*)::text as v from upcoming_events
union all select 'topic_reads', count(*)::text from topic_reads
union all select 'email_subscribers', count(*)::text from email_subscribers
union all select 'cron: nj-publish-7-upcoming',
  coalesce((select 'active=' || active::text || ' schedule=' || schedule
            from cron.job where jobname = 'nj-publish-7-upcoming'), '미등록');
