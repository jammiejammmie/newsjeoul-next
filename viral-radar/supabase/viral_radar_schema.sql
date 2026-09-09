-- viral-radar/supabase/viral_radar_schema.sql
--
-- 아직 프로덕션 Supabase에 적용하지 않았다(이 세션엔 SUPABASE_SERVICE_KEY가 없어 쓰기 권한 자체가
-- 없다 — §27 기존 시스템 보호 원칙에 따라 승인 없이 프로덕션 DB를 건드리지 않는다).
-- 지금은 lib/db.js가 로컬 JSON 파일로 동일한 모양을 흉내내고 있다. 서비스 키가 생기면 이 파일을
-- `supabase db push` 또는 SQL Editor로 적용하고, lib/db.js 내부만 Supabase REST 호출로 교체한다
-- (호출부 스크립트는 그대로 둔다).
--
-- 기존 뉴스저울 테이블과 이름이 겹치지 않도록 전부 viral_ 접두사를 쓴다(독립 모듈 원칙, §27).

-- ── 비디오 마스터 (PRODUCT.md §11 공통 VIDEO schema) ────────────────────────
create table if not exists viral_videos (
  video_id text primary key, -- '{platform}:{platform_post_id}'
  platform text not null, -- 'youtube_shorts' | 'tiktok' | 'instagram_reels' | 'douyin' | ...
  platform_post_id text not null,
  canonical_url text not null,
  creator_name text,
  creator_handle text,
  creator_url text,
  title text,
  caption text,
  published_at timestamptz,
  first_detected_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  thumbnail_url text,
  duration_seconds integer,
  view_count bigint,
  like_count bigint,
  comment_count bigint,
  share_count bigint,
  provider text not null, -- 이 후보를 발굴한 데이터 공급자
  provider_detected_score numeric, -- 공급자 outlier/viral score. 후보발굴 참고용, 랭킹에 절대 안 씀
  language text,
  country_if_known text,
  primary_genre text, -- FUNNY|TOUCHING|ANGER|SHOCK|SATISFYING|AMAZING
  secondary_genres text[] default '{}',
  genre_scores jsonb,
  genre_confidence numeric,
  summary_ko text,
  source_status text not null default 'ok', -- 'ok'|'removed'|'error'|'needs_review'
  editorial_review_reason text, -- needs_review일 때 왜(§18)
  classified_by text -- 'claude_api:<model>' 또는 수동분류 표시
);
create index if not exists idx_viral_videos_platform_genre on viral_videos(platform, primary_genre);

-- ── metrics snapshot (§11-12, 시계열 보존 — 나중에 성장률/24시간 변화량 콘텐츠에 씀) ──────
create table if not exists viral_metrics_snapshots (
  id bigserial primary key,
  video_id text not null references viral_videos(video_id),
  captured_at timestamptz not null default now(),
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint
);
create index if not exists idx_viral_snapshots_video_time on viral_metrics_snapshots(video_id, captured_at);

-- ── DATE × PLATFORM × GENRE × RANK (PLATFORM.md §14, 2026-09-09 개편 — 랭킹의 원본 단위) ──
create table if not exists viral_rankings (
  id bigserial primary key,
  date date not null, -- KST 기준
  platform text not null,
  genre text not null,
  rank integer not null,
  video_id text not null references viral_videos(video_id),
  view_count_at_cutoff bigint not null,
  cutoff_at timestamptz not null,
  cutoff_policy text not null, -- 'CAPTURE_WINDOW' | 'UPLOAD_WINDOW' (PLATFORM.md §5, 감사문서에 채택 근거)
  unique (date, platform, genre, rank)
);
create index if not exists idx_viral_rankings_date_platform on viral_rankings(date, platform);

-- ── GLOBAL CONTENT CLUSTER (PLATFORM.md §9-10, 크로스플랫폼 확산 추적 — 랭킹과 독립) ─────
create table if not exists viral_content_clusters (
  cluster_id text primary key,
  first_seen_platform text,
  member_count integer not null default 1,
  is_cross_platform boolean not null default false,
  platforms jsonb not null default '{}' -- { platform: {video_id, view_count, canonical_url, published_at} }
);

-- RLS는 기존 뉴스저울과 동일 패턴을 따른다 — anon read, service write만.
-- (global_rls_policy.sql 참고, 실제 적용은 서비스 키 확보 후 별도 작업)
