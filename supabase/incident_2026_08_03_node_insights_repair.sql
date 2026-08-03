-- ============================================================
-- 사고 복구: generate-node-insights의 ai_context 통째 덮어쓰기로 정체된 Topic 되살리기
-- 작성: 2026-08-03
-- ============================================================
-- 사고 요약
--   generate-node-insights가 이 저장소에서 유일하게 ai_context를 병합하지 않고 교체 저장하고
--   있었다(`ai_context: context`). ai_context는 plan(에디터 배정)/gate/draft/evidence/threads의
--   SSOT이므로, 이 함수가 처리한 Topic은 그 전부를 잃었다.
--   코드 자체는 같은 날 병합 저장으로 수정했다(netlify/functions/generate-node-insights-background.js).
--   이 파일은 "이미 손상된 기존 데이터"를 되살리기 위한 1회성 복구다.
--
-- 왜 스스로 복구되지 않는가
--   generate-editorial-plan-background는 `editorial_status=eq.pending`인 Topic만 집는다.
--   피해 Topic은 plan을 잃은 채 상태값만 'planned'/'degraded'로 남아 있어서, 다시 배정받을
--   기회가 영구히 사라졌다(발행까지 절대 도달하지 못하는 좀비 상태).
--
-- 실측(2026-08-03, anon key 조회)
--   plan 없는 non-pending active Topic 28건 = 27 planned + 1 degraded
--   그 28건 전부에 node-insights 흔적(industry_impact/watchpoints 등)이 있었다 — 상관관계 100%.
--   ai_outlook은 28건 모두 채워져 있어 node-insights 재처리 대상에서는 이미 빠져 있다.
--
-- 복구 방식
--   editorial_status를 'pending'으로 되돌려 Editorial Plan 단계부터 다시 타게 한다.
--   plan → gate → draft가 순서대로 재생성되므로 잃어버린 값이 정상 경로로 복원된다.
--   insights 키(industry_impact 등)는 유효한 콘텐츠이므로 지우지 않고 그대로 둔다.
--   published Topic은 건드리지 않는다(현재 노출 중인 콘텐츠에 영향 없음 — 피해 28건 중 published는 0건).
--
-- 실행: Supabase 대시보드 → SQL Editor에 붙여넣고 Run
-- ============================================================

-- ── STEP 1. 먼저 대상을 눈으로 확인한다(범위를 넓히지 않기 위한 필수 단계) ──
-- 아래 SELECT를 단독 실행해서 28건 내외인지, 전부 planned/degraded인지 확인한 뒤 STEP 2로 넘어간다.
SELECT
  editorial_status,
  count(*) AS cnt,
  count(*) FILTER (WHERE ai_context ? 'industry_impact') AS node_insights_흔적,
  count(*) FILTER (WHERE ai_context ? 'draft') AS draft_남아있음
FROM public.topics
WHERE status = 'active'
  AND editorial_status IN ('planned', 'degraded')
  AND ai_context -> 'plan' IS NULL
GROUP BY editorial_status;

-- 개별 목록도 함께 확인(원하면 실행)
-- SELECT id, name, editorial_status, gate_status, importance_score
-- FROM public.topics
-- WHERE status = 'active' AND editorial_status IN ('planned','degraded') AND ai_context -> 'plan' IS NULL
-- ORDER BY importance_score DESC;

-- ── STEP 2. 복구 실행 ──
-- 예상 범위(40건)를 넘으면 조건이 의도보다 넓어졌다는 뜻이므로 실행을 중단한다.
-- STEP 1의 SELECT와 완전히 동일한 WHERE를 쓴다(조건이 갈라지면 의도하지 않은 행이 바뀐다).
DO $body$
DECLARE
  target_count integer;
  updated_count integer;
BEGIN
  SELECT count(*) INTO target_count
  FROM public.topics
  WHERE status = 'active'
    AND editorial_status IN ('planned', 'degraded')
    AND ai_context -> 'plan' IS NULL;

  IF target_count = 0 THEN
    RAISE NOTICE '복구 대상이 없습니다 — 이미 복구된 상태로 보입니다.';
    RETURN;
  END IF;

  IF target_count > 40 THEN
    RAISE EXCEPTION '복구 대상이 %건으로 예상(최대 40건)을 초과했습니다. 조건을 다시 검토하기 전에는 실행하지 않습니다.', target_count;
  END IF;

  UPDATE public.topics
  SET editorial_status = 'pending',
      -- degraded로 떨어진 Topic이 이전 재시도 횟수 때문에 즉시 다시 degraded 되지 않도록 초기화.
      editorial_retry_count = 0
  WHERE status = 'active'
    AND editorial_status IN ('planned', 'degraded')
    AND ai_context -> 'plan' IS NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE '복구 완료: %건을 editorial_status=pending으로 되돌렸습니다(Editorial Plan 단계부터 재생성).', updated_count;
END;
$body$;

-- ── STEP 3. 확인 ──
-- pending이 늘고, plan 없는 planned/degraded가 0건이 되어야 한다.
SELECT editorial_status, count(*)
FROM public.topics
WHERE status = 'active'
GROUP BY editorial_status
ORDER BY editorial_status;

SELECT count(*) AS 남은_좀비_topic
FROM public.topics
WHERE status = 'active'
  AND editorial_status IN ('planned', 'degraded')
  AND ai_context -> 'plan' IS NULL;
