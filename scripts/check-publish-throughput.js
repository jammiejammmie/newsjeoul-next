// 발행 처리량 실측 — 라우팅 승격 파이프라인(publish-routed-content-background) 효과 확인용.
const fs = require('fs'), path = require('path'), env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };
const ANG = { SHORT_BRIEF: 'brief-short', UPDATE: 'update', SEARCH_GUIDE: 'guide', BACKGROUND: 'background', PRODUCT_BRIEF: 'brief', COMPARE: 'compare' };

(async () => {
  const t = await fetch(`${U}/rest/v1/topics?select=editorial_status,gate_status,ai_context&status=eq.active&limit=1200`, { headers: H }).then((r) => r.json());
  const tally = (rows, f) => { const b = {}; rows.forEach((r) => { const k = f(r) || 'null'; b[k] = (b[k] || 0) + 1; }); return b; };

  console.log('=== editorial_status 분포 ===');
  console.log(tally(t, (r) => r.editorial_status));

  const pub = t.filter((r) => r.editorial_status === 'published');
  console.log('\n=== published 구성 ===');
  console.log(' 총', pub.length, '| gate별:', JSON.stringify(tally(pub, (r) => r.gate_status)));
  const promoted = pub.filter((r) => r.ai_context?.draft?.promoted_from);
  console.log(' 승격으로 발행된 것:', promoted.length, '| 장문(DEEP_DIVE) 발행:', pub.length - promoted.length);

  const planned = t.filter((r) => r.editorial_status === 'planned');
  const promotable = planned.filter((r) => {
    const a = ANG[r.gate_status]; if (!a) return false;
    const d = (r.ai_context?.expansion_drafts || []).find((x) => x.angle === a);
    return d && (d.body || '').trim().length >= 300 && !r.ai_context?.draft;
  });
  console.log('\n=== 남은 적체 ===');
  console.log(' planned 총', planned.length, '| 승격 가능(원고 준비됨):', promotable.length);
  console.log(' 승격 가능 gate별:', JSON.stringify(tally(promotable, (r) => r.gate_status)));

  // Threads 후보(미게시 published) — 사용자의 원래 걱정거리
  const unposted = pub.filter((r) => !r.ai_context?.threads?.posted_at);
  const withSrc = unposted.filter((r) => (r.ai_context?.evidence?.sources || []).some((s) => s.url));
  console.log('\n=== Threads 배급 후보 ===');
  console.log(' 미게시 published:', unposted.length, '| 그중 출처 있음(품질게이트 통과 가능):', withSrc.length);
})();
