-- 뉴스저울: articles.og_image_url 컬럼 추가
-- 목적: enrich-article-images.js가 원문 og:image를 백필해 저장하는 컬럼.
--       collect-news.js는 이 컬럼을 채우지 않음(기본 NULL) — 별도 백필 함수가 채운다.
-- 실행: Supabase SQL Editor에 그대로 붙여넣기 실행. 재실행해도 안전(IF NOT EXISTS).

ALTER TABLE articles ADD COLUMN IF NOT EXISTS og_image_url text;
