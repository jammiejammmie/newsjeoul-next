// resolve-article-urls.js
// Google 뉴스 리다이렉트 링크만 갖고 있는 기존/누락 기사(url_resolution_status='pending')를
// 실제 언론사 원문 URL로 해제하는 수동 배치 백필 함수.
// collect-news.js도 수집 직후 20초 예산 내에서 즉시 해제를 시도하지만, 예산 초과분·과거 누적분은
// 전부 여기(관리자 수동 실행, 스케줄 없음)로 쌓여 배치로 처리된다.
// 이미지 보강(enrich-article-images.js)과는 의도적으로 분리 — 장애 원인 구분과 재실행 편의를 위해
// "원문 URL 복구"와 "이미지 보강"은 항상 별도 실행/별도 통계로 다룬다. 권장 실행 순서: URL 복구 → 이미지 보강.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const { resolveGoogleNewsUrl, mapWithConcurrency } = require('./resolve-google-news-url');
const { getTopicLinkedArticleIds } = require('./topic-priority');

const BATCH_SIZE = 30; // 2026-07-11: 첫 실행(20건, 100% 성공) 확인 후 1차 단계적 상향
const CONCURRENCY = 3; // Google에 순간적으로 과도한 요청을 보내지 않기 위한 동시성 제한

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

async function supabaseCount(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'HEAD',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Prefer': 'count=exact' }
  });
  if (!res.ok) throw new Error('Supabase COUNT error: ' + res.status);
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1], 10) : null;
}

async function supabasePatch(table, params, data) {
  return fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // Netlify Scheduled Function은 httpMethod='POST'로 호출되지만 x-admin-key 헤더가 없다
  // (event.headers['x-nf-event']==='schedule'로 식별) — 2026-07-17 실운영 검증 중 발견,
  // 이 조건이 없으면 자동 스케줄 호출이 전부 401로 조용히 거부돼 파이프라인이 절대 자동으로 안 돈다.
  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    // 우선순위: topic/story에 이미 걸려 실제 화면에 쓰이는 기사부터 처리 — 그래야 Hero/카드 이미지가
    // "가장 최근에 수집된 잡기사"가 아니라 "실제 노출되는 기사"부터 채워진다(2026-07-11 확인된 문제 대응).
    const topicLinkedIds = await getTopicLinkedArticleIds().catch(() => []);

    const [totalPending, priorityCandidates] = await Promise.all([
      supabaseCount('articles', '?url_resolution_status=eq.pending'),
      topicLinkedIds.length
        ? supabaseGet('articles', `?url_resolution_status=eq.pending&id=in.(${topicLinkedIds.join(',')})&select=id,url&order=created_at.desc&limit=${BATCH_SIZE}`)
        : [],
    ]);

    let candidates = priorityCandidates;
    if (candidates.length < BATCH_SIZE) {
      const excludeIds = candidates.map((c) => c.id);
      const excludeFilter = excludeIds.length ? `&id=not.in.(${excludeIds.join(',')})` : '';
      const rest = await supabaseGet(
        'articles',
        `?url_resolution_status=eq.pending${excludeFilter}&select=id,url&order=created_at.desc&limit=${BATCH_SIZE - candidates.length}`
      );
      candidates = [...candidates, ...rest];
    }

    const stats = { resolved: 0, duplicate: 0, resolveFailed: 0 };

    await mapWithConcurrency(candidates, CONCURRENCY, async (article) => {
      const canonical = await resolveGoogleNewsUrl(article.url, 6000);
      if (!canonical) {
        stats.resolveFailed++; // pending 유지 → 다음 배치에서 자동 재시도
        return;
      }

      const patchRes = await supabasePatch('articles', `?id=eq.${article.id}`, {
        url: canonical,
        url_resolution_status: 'resolved',
        url_resolved_at: new Date().toISOString(),
      });

      if (patchRes.ok) {
        stats.resolved++;
      } else if (patchRes.status === 409) {
        // 다른 기사가 이미 같은 원문 URL로 해제돼 있음 — 중복 기사로 확정, url(고유 제약)은 그대로 둔다
        await supabasePatch('articles', `?id=eq.${article.id}`, { url_resolution_status: 'duplicate' });
        stats.duplicate++;
      } else {
        stats.resolveFailed++;
      }
    });

    const remainingPending = await supabaseCount('articles', '?url_resolution_status=eq.pending');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        totalPending,
        targetedThisRun: candidates.length,
        topicLinkedTargeted: priorityCandidates.length,
        resolved: stats.resolved,
        duplicate: stats.duplicate,
        resolveFailed: stats.resolveFailed,
        remainingPending,
      }),
    };
  } catch (e) {
    console.error('resolve-article-urls 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
