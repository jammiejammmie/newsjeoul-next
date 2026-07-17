// process-stories.js
// 수집된 기사 → Claude 클러스터링 → stories/story_articles 생성 → 침묵지수/논쟁지수 계산

const { shouldSkipStory } = require('./news-filters');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

async function supabasePost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Supabase POST error: ' + await res.text());
  return res.json();
}

async function supabaseInsertLog(data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/story_coverage_log`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal,resolution=ignore-duplicates',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
}

async function claudeCluster(articles) {
  const prompt = `다음은 최근 수집된 한국 뉴스 기사 제목 목록이다.
같은 사건/주제를 다루는 기사끼리 묶어서 JSON 배열로 반환해라.
설명 없이 JSON만 반환해라.

기사 목록:
${articles.map((a, i) => `${i}. [${a.outlet_name}] ${a.title}`).join('\n')}

반환 형식:
[
  {
    "story_title": "사건을 대표하는 제목",
    "article_indices": [0, 3, 7],
    "representative_index": 0
  }
]

주의:
- 같은 사건이 확실한 것만 묶어라
- 최소 2개 이상 언론사가 다룬 것만 스토리로 만들어라
- 광고/스포츠/연예는 제외해라`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Claude 클러스터링 JSON 없음');
  return JSON.parse(match[0]);
}

function calcSilenceScore(articleCount, totalOutlets) {
  const coverageRate = articleCount / totalOutlets;
  return Math.round((1 - coverageRate) * 100);
}

function calcControversyScore(articles) {
  const uniqueOutlets = new Set(articles.map(a => a.outlet_id)).size;
  return Math.min(100, Math.round(uniqueOutlets * 10));
}

exports.handler = async function(event) {
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
    console.log('process-stories 시작:', new Date().toISOString());

    const outlets = await supabaseGet('outlets', '?is_active=eq.true&select=id,name');
    const totalOutlets = outlets.length;
    const outletMap = Object.fromEntries(outlets.map(o => [o.id, o.name]));

    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    // 최근 기사 가져오기
    const recentArticles = await supabaseGet(
      'articles',
      `?created_at=gte.${since}&select=id,outlet_id,title,url,published_at&order=published_at.desc&limit=200`
    );

    if (!recentArticles.length) {
      console.log('처리할 기사 없음');
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stories: 0 }) };
    }

    // 이미 처리된 기사 제외
    const existingLinks = await supabaseGet('story_articles', '?select=article_id');
    const processedIds = new Set(existingLinks.map(l => l.article_id));
    const unprocessed = recentArticles.filter(a => !processedIds.has(a.id));

    if (!unprocessed.length) {
      console.log('처리할 새 기사 없음');
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stories: 0 }) };
    }

    // 기존 스토리 제목 (중복 방지)
    const existingStories = await supabaseGet('stories', `?created_at=gte.${since}&select=title`);
    const existingTitles = new Set(existingStories.map(s => s.title));

    const articlesWithName = unprocessed.map(a => ({
      ...a,
      outlet_name: outletMap[a.outlet_id] || '알 수 없음'
    }));

    console.log(`클러스터링 시작: ${articlesWithName.length}개 기사`);

    const clusters = await claudeCluster(articlesWithName);
    console.log(`클러스터 ${clusters.length}개 생성`);

    let storiesCreated = 0;

    for (const cluster of clusters) {
      try {
        const clusterArticles = cluster.article_indices
          .map(i => articlesWithName[i])
          .filter(Boolean);

        if (clusterArticles.length < 2) continue;

        // 중복 스토리 방지
        if (existingTitles.has(cluster.story_title)) {
          console.log(`중복 건너뜀: "${cluster.story_title}"`);
          continue;
        }

        if (shouldSkipStory(cluster.story_title)) {
          console.log('스킵:', cluster.story_title);
          continue;
        }

        const repArticle = articlesWithName[cluster.representative_index] || clusterArticles[0];
        const silenceScore = calcSilenceScore(clusterArticles.length, totalOutlets);
        const controversyScore = calcControversyScore(clusterArticles);

        const [story] = await supabasePost('stories', {
          title: cluster.story_title,
          representative_article_id: repArticle.id,
          silence_score: silenceScore,
          controversy_score: controversyScore,
          published_at: repArticle.published_at,
        });

        if (!story) continue;

        const storyArticles = clusterArticles.map(a => ({
          story_id: story.id,
          article_id: a.id,
          is_representative: a.id === repArticle.id,
        }));

        await supabasePost('story_articles', storyArticles);
        existingTitles.add(cluster.story_title);
        storiesCreated++;

        // T0 기록 — 실패해도 스토리 생성은 완료
        const uniqueOutletCount = new Set(clusterArticles.map(a => a.outlet_id)).size;
        supabaseInsertLog({
          story_id: story.id,
          outlet_count: uniqueOutletCount,
          total_outlets: totalOutlets,
          label: 'T0',
        }).catch(e => console.error('T0 log 실패:', e.message));

        console.log(`스토리 생성: "${cluster.story_title}" (침묵:${silenceScore} 논쟁:${controversyScore})`);

      } catch(e) {
        console.error('스토리 생성 오류:', e.message);
      }
    }

    console.log(`완료: ${storiesCreated}개 스토리 생성`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, stories: storiesCreated }) };

  } catch(e) {
    console.error('process-stories 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
