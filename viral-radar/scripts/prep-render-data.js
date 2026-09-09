#!/usr/bin/env node
// 오늘자 랭킹에서 FUNNY/TOUCHING TOP10(§PLATFORM.md §13 최소 PoC 범위)을 뽑아 썸네일을 base64로
// 내려받아 render/carousel-reel-data.json에 저장한다. Artifact CSP가 외부 이미지 호스트를
// 차단하므로(스크립트 외 리소스는 허용 CDN에서도 막힘) 데이터 URI로 인라인해야 한다.
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

const GENRES_FOR_PROTO = ['FUNNY', 'TOUCHING'];

async function toDataUri(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const type = res.headers.get('content-type') || 'image/jpeg';
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch (e) {
    console.error('썸네일 다운로드 실패:', url, e.message);
    return null;
  }
}

async function main() {
  const dateStr = db.todayKst();
  const ranking = db.loadRanking(dateStr);
  const genres = ranking.platforms.youtube_shorts.genres;

  const out = { date: dateStr, platform: 'youtube_shorts', genres: {} };
  for (const genre of GENRES_FOR_PROTO) {
    const items = genres[genre].items;
    const withThumbs = [];
    for (const item of items) {
      const dataUri = item.thumbnail_url ? await toDataUri(item.thumbnail_url) : null;
      withThumbs.push({
        rank: item.rank,
        title: item.title,
        creator_name: item.creator_name,
        view_count: item.view_count,
        canonical_url: item.canonical_url,
        summary_ko: item.summary_ko,
        thumbnail_data_uri: dataUri,
      });
      console.log(`[${genre}] #${item.rank} 썸네일 ${dataUri ? 'OK' : 'FAIL'}`);
    }
    out.genres[genre] = withThumbs;
  }

  const outFile = path.join(__dirname, '..', 'render', 'carousel-reel-data.json');
  fs.writeFileSync(outFile, JSON.stringify(out));
  const sizeMb = (fs.statSync(outFile).size / 1024 / 1024).toFixed(2);
  console.log(`저장 완료: ${outFile} (${sizeMb} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
