-- ============================================================
-- 전체 테이블 RLS 일괄 적용 스크립트
-- ============================================================
-- 대상: public 스키마의 모든 테이블 (articles, stories 등 기존에
--       커밋된 schema 파일이 없어 RLS가 빠져있었을 수 있는 테이블 포함)
--
-- 정책:
--   - SELECT: 누구나 가능 (anon 포함)
--   - INSERT/UPDATE/DELETE: service_role만 가능
--
-- topics_entities_schema.sql / insights_schema.sql 에 이미 적용된
-- "anon read" / "service write" 컨벤션과 동일하게 맞춤.
-- 재실행해도 안전(기존 동일 이름 정책은 제거 후 재생성).
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run
-- ============================================================

DO $body$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format($f$ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;$f$, tbl.tablename);

    EXECUTE format($f$DROP POLICY IF EXISTS %I ON public.%I;$f$, 'anon read', tbl.tablename);
    EXECUTE format($f$DROP POLICY IF EXISTS %I ON public.%I;$f$, 'service write', tbl.tablename);

    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT USING (true);$f$, 'anon read', tbl.tablename);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = %L);$f$, 'service write', tbl.tablename, 'service_role');
  END LOOP;
END;
$body$;

-- ============================================================
-- 확인용 (위 블록 실행 후 별도로 실행): 적용된 정책 전체 조회
-- ============================================================
-- SELECT schemaname, tablename, policyname, cmd, roles
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, policyname;
