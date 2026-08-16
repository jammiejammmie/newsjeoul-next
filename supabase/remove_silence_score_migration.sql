-- remove_silence_score_migration.sql
-- 2026-08-17, PM 지시: "침묵지수 관련 코드 전부 제거. buzz_score 기반으로 완전히 전환."
--
-- 코드(파이프라인·lib·컴포넌트)에서 silence_score 참조는 이미 전부 제거된 상태로 배포된다.
-- 이 SQL은 마지막 남은 DB 컬럼을 실제로 드롭한다. Supabase Dashboard → SQL Editor에서 실행.
--
-- ── 실행 전 확인 ────────────────────────────────────────────────────────────
-- 코드 배포가 먼저다. 컬럼을 먼저 드롭하면, 아직 옛 코드가 돌고 있는 동안
-- INSERT(silence_score 포함)가 전부 실패해 스토리 생성이 멈춘다.
--   순서: (1) 코드 배포 완료 확인 → (2) 이 SQL 실행
--
-- ── 되돌리기 ────────────────────────────────────────────────────────────────
-- 아래 롤백 블록 참고. 드롭 후에는 과거 침묵지수 값이 복구되지 않는다(값 자체가 사라진다).
-- 값 보존이 필요하면 1번 백업 블록을 먼저 실행할 것.

-- ── 0. 현재 상태 확인 ───────────────────────────────────────────────────────
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'stories' and column_name = 'silence_score';

-- ── 1. (선택) 값 백업 ───────────────────────────────────────────────────────
-- 나중에 "그때 침묵지수가 몇이었나"를 다시 볼 일이 있을 수 있으면 이 줄을 먼저 실행한다.
-- create table if not exists stories_silence_score_backup_20260817 as
--   select id, silence_score, created_at from public.stories where silence_score is not null;

-- ── 2. 컬럼 드롭 ────────────────────────────────────────────────────────────
alter table public.stories drop column if exists silence_score;

-- ── 3. 검증 ─────────────────────────────────────────────────────────────────
-- 0건이 나와야 정상.
select count(*) as remaining_silence_columns
from information_schema.columns
where table_schema = 'public' and table_name = 'stories' and column_name = 'silence_score';

-- ── 롤백 (필요 시) ──────────────────────────────────────────────────────────
-- alter table public.stories add column silence_score integer;
-- update public.stories s set silence_score = b.silence_score
--   from stories_silence_score_backup_20260817 b where b.id = s.id;
