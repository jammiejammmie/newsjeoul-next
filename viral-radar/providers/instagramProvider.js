// viral-radar/providers/instagramProvider.js
// Instagram Reels도 TikTok과 마찬가지로 공개 discovery용 공식 API가 없다(공식 Graph API는
// 본인 소유 계정 데이터만 접근 가능 — POKKI 조사에서도 이 한계가 드러났다, SOURCE_AUDIT.md 참고).
// MVP 추천 공급자는 TikTok과 동일하게 EnsembleData(Instagram User Posts/Reels/Stats 엔드포인트).
//
// 현재 ENSEMBLEDATA_TOKEN이 없어 비활성. 발급되면 platform 필드는 'instagram_reels'로 채운다.

async function collect() {
  const token = process.env.ENSEMBLEDATA_TOKEN;
  if (!token) {
    return {
      provider: 'instagram_ensembledata',
      videos: [],
      errors: [{ error: 'ENSEMBLEDATA_TOKEN 미설정 — 계약/키 발급 전이라 비활성. 발급처: https://ensembledata.com/' }],
    };
  }
  throw new Error('instagramProvider.collect()는 아직 미구현 — 키 발급 후 실응답으로 매핑을 완성할 것');
}

module.exports = { collect };
