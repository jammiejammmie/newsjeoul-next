-- ============================================================================
-- 토픽 허브(hubs) 레지스트리 — 파일럿 허브 1호(갤럭시 Z 폴드8) 기반
-- 작성: 2026-08-05
-- 근거: 노차장 개편 설계서 §3(토픽 허브 4a), §10.5(기술 요건)
-- ============================================================================
-- 이 테이블이 담는 것과 담지 않는 것
--
--   담는다   : 허브의 존재·정체성·갱신 메타(slug/title/category/최초·최종·횟수)
--   담지 않는다: 본문 콘텐츠(정의문·핵심 수치·에버그린 블록·FAQ·제휴 슬롯)
--
-- 콘텐츠를 DB가 아니라 코드(lib/hubs/*.ts)에 두는 이유:
--   · 허브 본문은 에디터의 판단이 담긴 편집물이다. git에 두면 변경 이력·리뷰·롤백이 공짜로 따라온다.
--   · 설계서 §10.3이 "LLM 초안 + 형식만 채운 대량 발행"을 최대 위험으로 지목한다. 코드 리뷰를
--     거치는 경로로 두면 그 대량 발행이 구조적으로 어려워진다.
--   · 반대로 가격·재고·일정처럼 자주 바뀌는 정형 데이터는 §10.5대로 별도 테이블에 두고 주입해야
--     한다(이번 파일럿 범위 밖 — 가격 추이는 우선 설정값으로 두고, 수집 파이프라인은 후속 작업).
--
-- 즉 이 테이블은 "허브 목록과 갱신 시각의 단일 출처"다. 사이트맵 lastmod, 갱신 메타 표시,
-- 나중에 갱신 큐(설계서 §5.2)가 붙을 지점이 전부 여기다.
--
-- 이 마이그레이션이 적용되지 않아도 허브 페이지는 렌더링된다(설정값으로 폴백).
-- 적용하면 갱신 메타가 DB 값으로 바뀌고 사이트맵 lastmod가 정확해진다.
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run. 재실행해도 안전.
-- ============================================================================

create table if not exists hubs (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  title        text not null,
  category     text,
  -- 갱신 횟수. 설계서 §3.2의 갱신 메타(최초/최종/횟수)를 화면에 표시하려면 필요하다.
  -- (요청 컬럼 목록에는 없었지만, 그 화면 요소를 만들려면 저장할 곳이 있어야 한다)
  update_count integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table hubs is
  '토픽 허브 레지스트리. 본문 콘텐츠는 lib/hubs/*.ts에 있고 이 테이블은 존재·분류·갱신 메타만 담는다.';
comment on column hubs.update_count is
  '갱신 횟수. 화면의 갱신 메타와 갱신 큐 우선순위 계산에 쓴다.';

create index if not exists idx_hubs_updated_at on hubs (updated_at desc);
create index if not exists idx_hubs_category on hubs (category);

-- 갱신 시 updated_at·update_count를 자동으로 올린다.
-- 애플리케이션이 잊어도 DB가 보장해야 한다 — 갱신일이 틀리면 설계서 §10.5의 dateModified가
-- 틀리고, 그건 검색 노출에 직접 영향을 준다.
create or replace function hubs_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at := now();
  -- slug/title/category 같은 내용 변경일 때만 갱신 횟수를 올린다.
  -- (updated_at만 바뀌는 touch성 업데이트로 횟수가 부풀지 않게 한다)
  if (new.slug, new.title, new.category) is distinct from (old.slug, old.title, old.category) then
    new.update_count := old.update_count + 1;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_hubs_touch on hubs;
create trigger trg_hubs_touch before update on hubs
for each row execute function hubs_touch_updated_at();

-- ── RLS: anon read / service write (저장소 전 테이블 공통 컨벤션) ────────────
-- supabase/global_rls_policy.sql과 같은 정책이다. 이 파일만 실행해도 허브가 동작하도록
-- 여기에 같이 넣었다(global 스크립트를 다시 돌려도 결과는 같다).
alter table hubs enable row level security;
drop policy if exists "anon read" on hubs;
drop policy if exists "service write" on hubs;
create policy "anon read" on hubs for select using (true);
create policy "service write" on hubs for all using (auth.role() = 'service_role');

-- ── 파일럿 허브 1호 등록 ─────────────────────────────────────────────────────
-- created_at을 설계 시안의 "최초 작성 2026.07.18"에 맞춘다(허브 개설 시점).
-- 콘텐츠 정본은 lib/hubs/galaxy-z-fold8.ts이고, 여기 title/category는 목록·사이트맵용 사본이다.
insert into hubs (slug, title, category, update_count, created_at, updated_at)
values ('galaxy-z-fold8', '갤럭시 Z 폴드8', '모바일', 0, '2026-07-18T09:00:00+09:00', now())
on conflict (slug) do update
  set title = excluded.title,
      category = excluded.category;

-- ── 확인 ────────────────────────────────────────────────────────────────────
select slug, title, category, update_count, created_at, updated_at from hubs order by updated_at desc;
