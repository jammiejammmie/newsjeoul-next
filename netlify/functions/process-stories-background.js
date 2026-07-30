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
- 광고/스포츠/연예는 제외해라
- "이 대통령", "李대통령", "윤 대통령"처럼 성(姓)+직함만 축약해서 쓴 표기가 있어도, 그걸
  절대 실명으로 확장하지 마라(예: "이 대통령"을 임의로 "이OO 대통령"으로 풀어 쓰지 말 것 —
  기사 제목에 실명이 없는데 대표 제목에 실명을 새로 지어내면 팩트 오류다).
- "story_title"에 직함(대통령/총리/장관/시장/회장 등)과 이름을 함께 쓸 필요가 있다면,
  ① 원본 기사에 등장한 표기(축약형이면 축약형 그대로)를 그대로 유지하거나,
  ② 실명이 확실하지 않으면 이름 없이 직함만 써라(예: "대통령 칠레 순방").
  원본 기사 어디에도 없는 실명을 새로 만들어 넣는 것은 절대 금지.`;

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

// 팩트오류 방지 게이트(2026-07-30, "이준석 대통령 칠레 순방" 사고 이후 추가) — 프롬프트
// 지시만으로는 모델이 "이 대통령" 같은 축약 표기를 실명으로 잘못 확장하는 걸 100% 막지
// 못한다(실제로 발생한 사고). 그래서 코드 레벨로 한 번 더 검증한다: story_title에
// "실명(2자 이상)+직함" 조합이 있으면, 그 실명이 원본 기사 제목들에 실제로 등장하는지
// 확인하고, 등장하지 않으면 실명을 지우고 직함만 남긴다(이 파일 프롬프트가 명시한 안전한
// 대안과 동일한 형태로 폴백 — 사람 검토 없이도 팩트 오류가 발행되는 것 자체를 막는 게 목적).
const TITLE_WORDS = ['대통령', '총리', '장관', '시장', '회장'];
// 이름과 직함 사이 공백은 있을 수도 없을 수도 있다("이준석 대통령" vs "李대통령") — \s?로 둘 다 포착.
const NAME_TITLE_RE = new RegExp(`([가-힣\\u4e00-\\u9fff]{1,4})\\s?(${TITLE_WORDS.join('|')})`, 'g');

function verifyAndSanitizeTitle(storyTitle, sourceTitles) {
  const sourceText = sourceTitles.join(' ');
  let sanitized = storyTitle;
  let flagged = false;

  for (const match of [...storyTitle.matchAll(NAME_TITLE_RE)]) {
    const [full, namePart, titleWord] = match;
    // 1글자 성만 있는 축약형("이 대통령"의 "이", 한자 성 "李" 등)은 원문 표기를 그대로 옮긴
    // 안전한 경우이므로 검증 대상에서 제외 — 2자 이상(=합성된 실명으로 추정)만 검증한다.
    if (namePart.length < 2) continue;
    if (sourceText.includes(namePart)) continue;

    // 원본 어디에도 없는 실명 — 팩트 오류로 간주하고 직함만 남긴다.
    flagged = true;
    sanitized = sanitized.split(full).join(titleWord);
  }

  if (flagged) {
    console.error(`FACT_CHECK_GATE: story_title 실명 미검증으로 직함만 남김 — "${storyTitle}" → "${sanitized}"`);
  }
  return sanitized;
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

        // 팩트오류 방지 게이트 — 검증 안 된 실명은 여기서 걸러 직함만 남긴다.
        cluster.story_title = verifyAndSanitizeTitle(
          cluster.story_title,
          clusterArticles.map(a => a.title)
        );

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
