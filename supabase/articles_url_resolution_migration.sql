-- 뉴스저울: articles URL 정합성 마이그레이션 (2026-07-11)
-- 배경: articles.url이 지금까지 Google 뉴스 RSS의 리다이렉트 링크(news.google.com/rss/articles/...)를
--       그대로 저장해왔음 — 전체 6,195건 전수 확인 결과 100% 이 형태. 사람이 클릭하면 Google이 JS로
--       실제 언론사 페이지로 보내주지만, 서버(og:image 추출 등)는 이 링크를 직접 열 수 없어 원문에 접근 불가.
-- 목표: source_url(Google 원본, 영구 보존)과 url(실제 언론사 원문 URL로 점진 교체)을 분리.
--
-- 영향 범위: articles 테이블에 컬럼 3개 추가(기존 컬럼 변경 없음, 기존 코드가 읽는 url/og_image_url 형태는 그대로).
-- 재실행해도 안전(IF NOT EXISTS / WHERE 조건으로 멱등).

ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS url_resolution_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS url_resolved_at timestamptz;

-- 기존 6,195건 전부 url이 곧 Google 링크이므로 source_url로 백필(아직 원문 해제 전이라 status는 'pending' 유지)
UPDATE public.articles SET source_url = url WHERE source_url IS NULL;

CREATE INDEX IF NOT EXISTS idx_articles_url_resolution_status ON public.articles (url_resolution_status);

-- 이번 세션에서 og_image_url='' 로 오판정된 15건 복구.
-- 이 컬럼은 이번이 첫 실행이었고(og_image_url 컬럼 자체가 이 세션에 막 추가됨) 그 이전엔 빈 문자열이
-- 저장될 경로가 전혀 없었으므로, 지금 시점에 ''인 행은 전부 이번 오판정 15건뿐이다(전수 확인 완료).
-- "og:image가 진짜 없음"이 아니라 "원문 URL을 못 읽어서 Google 자체 페이지를 보고 오판정한 것"이므로
-- NULL로 되돌려 다음 이미지 보강 실행에서 다시(이번엔 해제된 원문 URL로) 시도되게 한다.
UPDATE public.articles SET og_image_url = NULL WHERE og_image_url = '';
