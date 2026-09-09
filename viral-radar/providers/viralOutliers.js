// viral-radar/providers/viralOutliers.js
// Viral Outliers (viraloutliers.com) adapter — 조사 결과(SOURCE_AUDIT.md) 기반으로 인터페이스만
// 미리 맞춰둔 STUB. 현재 계정/API 키가 없어 실행되지 않는다(호출 시 명시적으로 비활성 상태를 반환).
//
// 확인된 사실: REST API + MCP 서버 제공, Bearer 토큰 인증(so_live_...), 크레딧제(Basic $17/월
// 250크레딧, Pro $37/월 750크레딧, Agency $149/월 3,000크레딧, 7일 무료체험).
// 엔드포인트: POST /api/v1/search/content(바이럴 포스트 검색), GET /api/v1/posts/{id},
// GET /api/v1/profiles/{id}, POST /api/v1/transcriptions, POST /api/v1/visual-analysis.
// likes/comments/shares 필드 제공 여부는 문서만으론 불명확 — 실제 계약 후 실호출로 검증 필요.
//
// PRODUCT.md 철학 반영: 이 provider가 주는 outlier/viral score는 candidate 발굴에만 쓰고
// (provider_detected_score 필드에 그대로 보존), NEWSJEOUL 공개 랭킹은 절대 이 점수를 쓰지 않는다
// — rank.js는 view_count만 본다.

async function collect() {
  const apiKey = process.env.VIRAL_OUTLIERS_API_KEY;
  if (!apiKey) {
    return {
      provider: 'viral_outliers',
      videos: [],
      errors: [{ error: 'VIRAL_OUTLIERS_API_KEY 미설정 — 계약/키 발급 전이라 비활성. 발급처: https://www.viraloutliers.com/ (7일 무료체험)' }],
    };
  }
  // TODO(키 발급 후): POST https://api.viraloutliers.com/api/v1/search/content 실호출로 교체.
  // 응답 스키마를 실제로 받아본 뒤 normalizeVideo() 매핑을 완성한다 — 문서만 보고 필드명을
  // 추측해서 하드코딩하지 않는다(가짜 매핑으로 조용히 깨지는 것을 방지).
  throw new Error('viralOutliers.collect()는 아직 미구현 — 키 발급 후 실응답으로 매핑을 완성할 것');
}

module.exports = { collect };
