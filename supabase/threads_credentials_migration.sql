-- threads_credentials — Threads 장기 토큰을 DB에 두고 자동 갱신한다.
--
-- 계기(2026-08-10): THREADS_ACCESS_TOKEN을 Netlify 환경변수에 수동으로 넣어둔 구조였는데,
-- Threads 장기 토큰은 60일 만료다. 08-09 05:40 PDT에 만료되면서 그 이후 실행 25회·시도
-- 47건이 전부 OAuthException(code 190)으로 실패했고, 24시간 동안 아무도 몰랐다.
--
-- 만료된 토큰은 갱신할 수 없다(재발급만 가능). 그래서 "만료 전에 자동으로 늘리는" 구조가
-- 필요하다. Threads는 24시간 이상 지났고 아직 만료되지 않은 토큰이면
-- GET /refresh_access_token 으로 다시 60일을 준다. 30일 주기로 돌리면 한 번 실패해도
-- 다음 회차에서 회복할 여유가 30일 남는다.
--
-- 환경변수가 아니라 DB에 두는 이유: 갱신된 토큰을 프로그램이 다시 써야 하는데, Netlify
-- 환경변수를 함수에서 갱신하려면 Netlify API 토큰이라는 자격증명이 하나 더 필요하다.
-- DB는 이미 서비스 키로 읽고 쓰는 곳이라 새 자격증명이 늘지 않는다.

CREATE TABLE IF NOT EXISTS threads_credentials (
  -- 단일 행 테이블. 두 번째 계정이 생기면 id를 계정 식별자로 쓴다.
  id                text PRIMARY KEY DEFAULT 'threads',
  access_token      text NOT NULL,
  user_id           text,
  -- 이 토큰이 만료되는 시각. 갱신 성공 시 now() + 60일로 갱신된다.
  expires_at        timestamptz,
  last_refreshed_at timestamptz,
  -- 마지막 갱신 시도가 실패했다면 사유. 성공하면 NULL로 지운다.
  refresh_error     text,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 토큰이 anon 키로 절대 읽히면 안 된다. RLS를 켜고 정책을 하나도 만들지 않으면
-- service_role(RLS 우회)만 접근할 수 있다. 정책을 추가하지 말 것.
ALTER TABLE threads_credentials ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE threads_credentials IS
  'Threads 장기 토큰. service_role 전용(RLS 정책 없음). refresh-threads-token 함수가 30일마다 갱신한다.';

-- ── 최초 1회: 새로 발급한 장기 토큰을 넣는다 ─────────────────────────────────
-- 아래 <붙여넣기> 두 곳을 실제 값으로 바꿔 실행한다. 값이 SQL Editor 기록에 남으므로
-- 실행 후 히스토리를 지우는 편이 좋다.
--
-- INSERT INTO threads_credentials (id, access_token, user_id, expires_at, last_refreshed_at)
-- VALUES ('threads', '<새_장기_토큰_붙여넣기>', '<THREADS_USER_ID_붙여넣기>', now() + interval '60 days', now())
-- ON CONFLICT (id) DO UPDATE SET
--   access_token      = EXCLUDED.access_token,
--   user_id           = EXCLUDED.user_id,
--   expires_at        = EXCLUDED.expires_at,
--   last_refreshed_at = EXCLUDED.last_refreshed_at,
--   refresh_error     = NULL,
--   updated_at        = now();
