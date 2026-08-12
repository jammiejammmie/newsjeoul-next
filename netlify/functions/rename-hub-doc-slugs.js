// rename-hub-doc-slugs.js
// hub_documents의 slug를 대장(lib/hubs/doc-slug-renames.ts)대로 바꾼다.
//
// 왜 함수인가: 이 테이블은 RLS로 anon 쓰기가 막혀 있고(supabase/global_rls_policy.sql),
// 쓰기에 필요한 service key는 함수 런타임에만 있다. 로컬 스크립트로 하려면 키를 개발자
// 기기로 내려야 하는데, 한 번 쓰고 말 작업을 위해 그럴 이유가 없다.
//
// 안전 설계:
//  · 기본은 dry-run이다. 실제로 바꾸려면 ?apply=true를 명시해야 한다.
//  · 대장의 title과 DB 문서의 title이 다르면 **건드리지 않는다**. 해시 slug는 사람이 보고
//    무슨 문서인지 알 수 없어서, 제목 대조가 "엉뚱한 문서를 옮기지 않는다"의 유일한 근거다.
//  · 목적지 slug가 이미 있으면 건너뛴다(같은 허브에서 slug가 겹치면 문서 하나가 가려진다).
//  · 이미 옮긴 항목은 조용히 'already' 처리한다 — 재실행해도 안전해야 한다.
//
// 사용법:
//   curl "$SITE/.netlify/functions/rename-hub-doc-slugs?key=$ADMIN_KEY"              # dry
//   curl "$SITE/.netlify/functions/rename-hub-doc-slugs?key=$ADMIN_KEY&apply=true"   # 실제 변경

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE_URL = process.env.URL || 'https://newsjeoul.co.kr';

async function sb(method, path, body, extraHeaders) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json', ...(extraHeaders || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${path} 실패: ` + (await res.text()).slice(0, 300));
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (key !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  const apply = event.queryStringParameters?.apply === 'true';
  const onlyHub = event.queryStringParameters?.hub || null;

  try {
    const res = await fetch(`${BASE_URL}/hub-doc-renames.json`);
    if (!res.ok) throw new Error(`대장 조회 실패(${res.status})`);
    let renames = await res.json();
    if (onlyHub) renames = renames.filter((r) => r.hub === onlyHub);

    // 대상 허브의 문서를 한 번에 읽어 둔다(항목마다 조회하면 45번 왕복한다).
    const hubs = [...new Set(renames.map((r) => r.hub))];
    const inList = hubs.map((h) => `"${h}"`).join(',');
    const docs = await sb('GET', `hub_documents?hub_slug=in.(${inList})&select=id,hub_slug,slug,title&limit=5000`);
    const bySlug = new Map((docs || []).map((d) => [`${d.hub_slug}|${d.slug}`, d]));

    const results = [];
    const stats = { total: renames.length, renamed: 0, merged: 0, already: 0, skipped: 0, failed: 0 };

    for (const r of renames) {
      const src = bySlug.get(`${r.hub}|${r.from}`);
      const dst = bySlug.get(`${r.hub}|${r.to}`);

      if (!src) {
        // 목적지가 이미 있으면 지난 실행에서 옮긴 것이다. 아니면 대장이 실재하지 않는 문서를 가리킨다.
        // 병합 항목은 출발지가 사라진 것이 곧 완료 상태다.
        const kind = dst ? 'already' : 'missing';
        if (kind === 'already') stats.already++; else stats.skipped++;
        results.push({ hub: r.hub, from: r.from, to: r.to, status: kind });
        continue;
      }

      // 병합 항목은 "옮기기"가 아니라 "지우기"다(2026-08-12). 목적지 문서가 이미 있는 것이
      // 정상이고 출발지는 없애야 하는 중복이므로, 아래 conflict 분기보다 먼저 판단해야 한다 —
      // 순서가 바뀌면 병합 항목이 매번 conflict로 걸러져 중복 문서가 영원히 남는다.
      if (r.merged) {
        if (!dst) {
          stats.skipped++;
          results.push({ hub: r.hub, from: r.from, to: r.to, status: 'merge-target-missing', note: '합칠 목적지 문서가 없어 삭제하지 않는다' });
          continue;
        }
        if (src.title !== r.title) {
          // 제목 대조는 삭제에서 특히 중요하다 — 이름만 맞는 엉뚱한 문서를 지우면 되돌릴 수 없다.
          stats.skipped++;
          results.push({ hub: r.hub, from: r.from, to: r.to, status: 'title-mismatch', note: `대장="${r.title}" / DB="${src.title}"` });
          continue;
        }
        if (!apply) {
          stats.merged++;
          results.push({ hub: r.hub, from: r.from, to: r.to, status: 'would-delete', title: src.title, id: src.id });
          continue;
        }
        try {
          // id 하나로만 지운다. hub_slug/slug 같은 조건으로 지우면 조건이 틀렸을 때 여러 건이
          // 함께 날아간다 — 삭제는 대상이 하나임이 확정된 뒤에만 실행한다.
          await sb('DELETE', `hub_documents?id=eq.${src.id}`, null, { Prefer: 'return=minimal' });
          stats.merged++;
          results.push({ hub: r.hub, from: r.from, to: r.to, status: 'deleted', title: src.title, id: src.id });
        } catch (e) {
          stats.failed++;
          results.push({ hub: r.hub, from: r.from, to: r.to, status: 'failed', note: e.message.slice(0, 160) });
        }
        continue;
      }

      if (dst) {
        stats.skipped++;
        results.push({ hub: r.hub, from: r.from, to: r.to, status: 'conflict', note: '목적지 slug가 이미 존재' });
        continue;
      }
      if (src.title !== r.title) {
        stats.skipped++;
        results.push({
          hub: r.hub, from: r.from, to: r.to, status: 'title-mismatch',
          note: `대장="${r.title}" / DB="${src.title}"`,
        });
        continue;
      }

      if (!apply) {
        stats.renamed++;
        results.push({ hub: r.hub, from: r.from, to: r.to, status: 'would-rename', title: src.title });
        continue;
      }

      try {
        await sb('PATCH', `hub_documents?id=eq.${src.id}`, { slug: r.to }, { Prefer: 'return=minimal' });
        stats.renamed++;
        results.push({ hub: r.hub, from: r.from, to: r.to, status: 'renamed', title: src.title });
      } catch (e) {
        stats.failed++;
        results.push({ hub: r.hub, from: r.from, to: r.to, status: 'failed', note: e.message.slice(0, 160) });
      }
    }

    console.log(
      `HUB_DOC_RENAME${apply ? '' : '[dry]'}: 대상 ${stats.total} → ` +
      `변경 ${stats.renamed}, 병합삭제 ${stats.merged}, 이미완료 ${stats.already}, 건너뜀 ${stats.skipped}, 실패 ${stats.failed}`
    );
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, apply, ...stats, results }) };
  } catch (e) {
    console.error('HUB_DOC_RENAME_ERROR:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
