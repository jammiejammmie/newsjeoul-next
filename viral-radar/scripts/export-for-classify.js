#!/usr/bin/env node
// 오늘 수집분을 플랫폼별로 dedupe한 대표(representative)만 뽑아 분류용 컴팩트 목록으로 내보낸다.
// ANTHROPIC_API_KEY가 없는 이번 세션에선 이 목록을 사람(=이 세션의 Claude)이 직접 읽고
// classification-input.json 형식에 맞춰 결과를 채운 뒤 scripts/apply-classification.js로 반영한다.
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');
const { clusterVideos } = require('../lib/dedupe');

const all = db.getAllVideos();
const byPlatform = {};
for (const v of all) { (byPlatform[v.platform] = byPlatform[v.platform] || []).push(v); }

const out = [];
for (const [platform, vids] of Object.entries(byPlatform)) {
  const clusters = clusterVideos(vids);
  for (const c of clusters) {
    const v = c.representative;
    out.push({
      video_id: v.video_id,
      platform: v.platform,
      title: v.title,
      creator_name: v.creator_name,
      view_count: v.view_count,
      duration_seconds: v.duration_seconds,
      discovery_genre_hint: v.discovery_genre_hint,
      variant_count: c.variant_count,
    });
  }
}
out.sort((a, b) => (b.view_count || 0) - (a.view_count || 0));

const outFile = path.join(__dirname, '..', 'data', 'classify-input.json');
fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
console.log(`분류 대상 ${out.length}건 → ${outFile}`);
