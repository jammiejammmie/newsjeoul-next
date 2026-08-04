// 현재 실데이터로 Hero 회전 후보와 24시간 로테이션을 확인한다(운영 점검용).
const fs = require('fs'), path = require('path'), env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };

// lib/topics.ts의 Hero 로직과 동일한 상수/규칙(운영 점검 전용 사본 — 값이 갈리면 여기도 갱신)
const ROT_H = 4, POOL = 6, MAX_AGE_H = 24, MIN_RATIO = 0.5;
const eligible = (t, now) => {
  const w = t.ai_context?.weight, c = w?.computed_at ? Date.parse(w.computed_at) : NaN;
  if (!Number.isFinite(c)) return false;
  if ((now - c) / 3600000 > MAX_AGE_H) return false;
  return (w?.components?.recency_bonus ?? 0) > 0;
};
function poolOf(topics, now) {
  const fresh = topics.filter((t) => eligible(t, now));
  const base = fresh.length ? fresh : topics;
  const floor = (base[0]?.importance_score || 0) * MIN_RATIO;
  const seen = new Set(), out = [];
  for (const t of base) {
    if ((t.importance_score || 0) < floor) break;
    const c = t.category || '(없음)';
    if (seen.has(c)) continue;
    seen.add(c); out.push(t);
    if (out.length >= POOL) break;
  }
  return out;
}

(async () => {
  const topics = await fetch(
    `${U}/rest/v1/topics?select=name,slug,category,importance_score,ai_context&status=eq.active&order=importance_score.desc,popularity_score.desc&limit=41`,
    { headers: H }
  ).then((r) => r.json());
  const now = Date.now();
  const fresh = topics.filter((t) => eligible(t, now));
  console.log(`상위 41건 중 Hero 자격(24h 내 재계산 + 최근 기사): ${fresh.length}건`);
  if (!fresh.length) console.log('  ※ 0건 — 무게 엔진이 아직 못 따라잡은 상태(폴백으로 최고점 사용)');

  const pool = poolOf(topics, now);
  console.log(`\n=== 현재 회전 후보 ${pool.length}개(카테고리당 1개) ===`);
  pool.forEach((t, i) => {
    const ageH = t.ai_context?.weight?.computed_at
      ? Math.round((now - Date.parse(t.ai_context.weight.computed_at)) / 3600000) : null;
    console.log(` ${i + 1}. ${String(t.importance_score).padStart(4)} | ${(t.category || '-').padEnd(13)} | 무게 ${ageH === null ? '미계산' : ageH + 'h 전'} | ${t.name.slice(0, 34)}`);
  });

  console.log(`\n=== 향후 24시간 헤드 로테이션(${ROT_H}시간 간격) ===`);
  for (let h = 0; h < 24; h += ROT_H) {
    const t = now + h * 3600000;
    const p = poolOf(topics, t);
    const pick = p.length ? p[Math.floor(t / (ROT_H * 3600000)) % p.length] : null;
    console.log(` +${String(h).padStart(2)}h → ${pick ? `[${pick.category}] ${pick.name.slice(0, 40)}` : '(없음)'}`);
  }
})();
