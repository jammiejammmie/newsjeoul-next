#!/usr/bin/env node
// viral-radar/scripts/collect.js
// 오늘자 후보 수집 — 활성화된 provider를 전부 돌려서 candidates 로그 + video 마스터 + snapshot을 남긴다.
// Provider 장애가 전체 파이프라인을 죽이지 않는다(§32 테스트 요구사항) — 각 provider를 try/catch로 감싼다.

const db = require('../lib/db');
const youtubeConfirmedShorts = require('../providers/youtubeConfirmedShorts'); // 2026-09-09부터 YouTube 유일한 활성 provider(아래 설명)
const youtubeDataApi = require('../providers/youtubeDataApi');
const { GENRE_QUERIES } = require('../providers/youtubeSearchScrape'); // 검색어 상수만 재사용(이 provider의 collect()는 더 이상 안 씀)
const viralOutliers = require('../providers/viralOutliers');
const tiktokProvider = require('../providers/tiktokProvider'); // 2026-09-09: 보조 Radar로 강등(RESEARCH.md) — 여전히 돌리되 광고 필터가 대부분 걸러냄
const instagramProvider = require('../providers/instagramProvider');
const { makeSnapshot } = require('../lib/schema');

// ── 2026-09-09 PM 지시 §5 반영 ────────────────────────────────────────────────
// youtubeSearchScrape.js / youtubeReverseCli.js는 duration<=40분까지 관대하게 받아들여서
// "숏폼이 아닌 롱폼 컴필레이션"이 섞여 들어오는 문제가 있었다(§구버전). 이제 기본 파이프라인
// 에서는 뺐다 — 파일 자체는 legacy 참고용으로 repo에 남겨뒀다(제목/조회수 파싱 유틸은 여전히
// 재사용 가치가 있어서). 진짜 확인된 Shorts(<=60초)만, 진짜 최근(24h, 부족하면 48h로 표기)
// 것만 받는 youtubeConfirmedShorts.js가 YouTube의 유일한 활성 provider다.
const PROVIDERS = [
  { name: 'youtube_confirmed_shorts', run: () => youtubeConfirmedShorts.collect({ queriesPerGenre: 4, searchLimit: 40 }) },
  { name: 'youtube_data_api', run: () => youtubeDataApi.collect({ genreQueries: GENRE_QUERIES }) }, // YOUTUBE_API_KEY 있으면 이게 더 정확 — 없으면 즉시 비활성 보고
  { name: 'viral_outliers', run: () => viralOutliers.collect() },
  { name: 'tiktok_creative_center', run: () => tiktokProvider.collect() }, // 보조 Radar(RESEARCH.md) — 메인 TOP10엔 대부분 광고필터로 제외됨
  { name: 'instagram_ensembledata', run: () => instagramProvider.collect() },
];

async function main() {
  const dateStr = db.todayKst();
  console.log(`=== VIRAL RADAR COLLECT — ${dateStr} (KST) ===`);
  const summary = [];

  for (const p of PROVIDERS) {
    try {
      const result = await p.run();
      for (const video of result.videos) {
        db.upsertVideo(video);
        db.appendSnapshot(makeSnapshot(video));
        db.appendCandidateLog(dateStr, { collected_at: new Date().toISOString(), ...video });
      }
      summary.push({
        provider: p.name,
        videos: result.videos.length,
        errors: result.errors?.length || 0,
        error_detail: result.errors?.slice(0, 3) || [],
      });
      console.log(`[${p.name}] 후보 ${result.videos.length}건, 에러 ${result.errors?.length || 0}건`);
      if (result.funnel) {
        console.log(`  funnel: ${JSON.stringify(result.funnel)}`);
        db.saveFunnel(dateStr, p.name, result.funnel);
      }
    } catch (e) {
      // provider 자체가 통째로 죽어도 다음 provider는 계속 돈다.
      console.error(`[${p.name}] provider 실행 자체 실패(전체 중단하지 않음): ${e.message}`);
      summary.push({ provider: p.name, videos: 0, errors: 1, error_detail: [{ error: e.message }] });
    }
  }

  console.log('=== 수집 요약 ===');
  console.table(summary.map((s) => ({ provider: s.provider, videos: s.videos, errors: s.errors })));
  return summary;
}

if (require.main === module) {
  main().catch((e) => { console.error('COLLECT 치명적 실패:', e); process.exit(1); });
}

module.exports = { main };
