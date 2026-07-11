-- 뉴스저울 Editorial Engine Phase 4 — editors 중복 정리 + 재발 방지
-- 배경: editors 테이블에 RLS "anon read" 정책이 없어 매번 "삽입 안 된 것처럼" 보였고,
-- 그래서 같은 시드 INSERT를 두 번 실행해 (name, perspective_tag) 조합이 모두 2행씩 중복됨.
-- id(uuid)만 유니크라 ON CONFLICT DO NOTHING이 중복을 못 막았음. 재실행해도 안전.

-- 1) 같은 (name, perspective_tag) 중 가장 먼저 만든 것만 남기고 나머지 삭제
DELETE FROM editors a USING editors b
WHERE a.name = b.name
  AND a.perspective_tag = b.perspective_tag
  AND a.created_at > b.created_at;

-- 2) 재발 방지 — 같은 조합 재삽입을 DB 레벨에서 차단
ALTER TABLE editors ADD CONSTRAINT editors_name_perspective_unique UNIQUE (name, perspective_tag);
