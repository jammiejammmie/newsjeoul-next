// resolve-topics.js
// story → 기존 Topic 매칭 또는 신규 Topic 생성 → topic_stories 연결 → topic_entities 집계 갱신
// manual(source_type='manual')로 만들어진 Topic도 매칭 후보에 포함된다.

const { fetchBuzzIndex, scoreTitle, bucketOf } = require('./buzz-engine');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const BATCH_SIZE = 15; // Background Function(15분 예산)이라 여유 있음 — 5→15 상향(2026-07-19 생산량 증대 지시, KPI=색인 페이지 수)

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

async function supabasePost(table, data, prefer) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': prefer || 'return=representation'
    },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`Supabase POST ${table} error: ` + await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

async function supabasePatch(table, params, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) console.error(`Supabase PATCH ${table} 실패:`, await res.text());
}

function slugify(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `topic-${Date.now()}`;
}

async function claudeResolveTopic(storyTitle, candidateTopics) {
  const candidateList = candidateTopics.length
    ? candidateTopics.map((t, i) => `${i}. [${t.id}] ${t.name} — ${t.summary || t.description || '(요약 없음)'}`).join('\n')
    : '(후보 없음)';

  const prompt = `다음은 새로 생성된 뉴스 스토리 제목과, 기존에 운영 중인 이슈(Topic) 후보 목록이다.
이 스토리가 기존 Topic 중 하나와 같은 이슈를 다루면 그 Topic에 매칭하고, 어느 것과도 다른 새로운 이슈라면 신규 Topic을 제안해라.
여러 Topic에 동시에 해당되면 여러 개를 배열로 반환해도 된다. 설명 없이 JSON만 반환해라.

뉴스저울은 정치/사회 뉴스만 다루는 사이트가 아니다. category는 세상 전체를 아래 대분류 중 가장 가까운 것으로 분류해라(정치를 특별 취급하지 말고, 아래 목록에서 실제 내용에 맞는 걸 골라라):
Technology(AI/스마트폰/PC/반도체/로봇/보안), Business(기업/스타트업/투자/M&A/IPO/브랜드),
Economy(경제/금리/환율/물가/원자재/소비), Automobile(자동차/EV/자율주행),
Health(질병/백신/병원/의약품/건강식품/정신건강), Lifestyle(여행/음식/카페/명품/패션/뷰티),
Sports(축구/야구/농구/올림픽/e스포츠/선수 이적·기록), Entertainment(영화/OTT/게임/음악/방송/연예인),
Science(우주/기후/환경/에너지), Crypto(Bitcoin/Ethereum/Web3),
Society(정치/선거/교육/취업/인구/범죄/복지/국제/외교)

주의: Sports는 2026-08-17 신설된 대분류다. 종전에는 Entertainment가 스포츠를 함께 삼켰는데,
스포츠와 연예에 각각 독립된 발행 쿼터가 생겨 더는 같은 분류에 둘 수 없다.
스포츠 경기·선수·구단 관련이면 Entertainment가 아니라 반드시 Sports로 분류해라.

스토리 제목: "${storyTitle}"

기존 Topic 후보:
${candidateList}

반환 형식 (배열):
[{"action": "match", "topic_id": "기존 topic id"}]
또는
[{"action": "new", "name": "이슈 이름", "slug_en": "kebab-case-english", "description": "1문장 설명", "summary": "AI 검색이 그대로 인용할 수 있는 자기완결형 2~3문장 요약 (주어·수치·날짜 명시)", "category": "위 대분류 중 하나"}]`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      // 2026-08-06: sonnet-5는 thinking 생략 시 adaptive thinking이 켜지고, max_tokens는
      // thinking+텍스트 합계 상한이다. 토픽 연결은 구조화 JSON이라 추론 여유가 필요 없다.
      // (이 단계는 과거 504로도 자주 실패했던 곳이라 실패 요인을 하나라도 더 줄인다)
      thinking: { type: 'disabled' },
      max_tokens: 1600,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const text = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
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
  const isDry = event.queryStringParameters?.dry === 'true';

  try {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recentStories = await supabaseGet('stories', `?created_at=gte.${since}&select=id,title&order=created_at.desc&limit=100`);
    if (!recentStories.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };

    const existingLinks = await supabaseGet('topic_stories', '?select=story_id');
    const processedIds = new Set(existingLinks.map(l => l.story_id));
    const unprocessed = recentStories.filter(s => !processedIds.has(s.id)).slice(0, BATCH_SIZE);
    if (!unprocessed.length) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, processed: 0 }) };

    // 후보 Topic: 최근 14일 내 active/dormant 상태, source_type 무관(manual 포함)
    const candidateSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const candidateTopics = await supabaseGet(
      'topics',
      `?status=in.(active,dormant)&updated_at=gte.${candidateSince}&select=id,name,summary,description,category&order=updated_at.desc&limit=20`
    );

    // ── 화제성 인덱스 (2026-08-17) ──────────────────────────────────────────
    // 여기서 계산한 buzz를 topics.ai_context.buzz에 적재한다. 이후 발행 단계
    // (editorial-plan / publish-gate / editorial-draft / publish-routed-content)는 전부
    // 이 값을 읽어 우선순위와 카테고리 쿼터를 집행한다.
    //
    // 왜 새 컬럼을 만들지 않았나: topics.ai_context는 이미 존재하는 jsonb이고, 새 컬럼을 만들면
    // Supabase SQL Editor 마이그레이션(승인 필요)을 기다려야 해서 코드 배포만으로는 동작하지
    // 않는다. 기존 jsonb에 키 하나를 더하는 쪽이 즉시 동작하고 되돌리기도 쉽다.
    let buzzIndex = null;
    try {
      buzzIndex = await fetchBuzzIndex({ perFeedLimit: 40, timeoutMs: 7000 });
      console.log(`buzz 인덱스 로드: 피드 ${buzzIndex.stats.feeds_ok}/8, 트렌드 ${buzzIndex.stats.trends}건`);
    } catch (e) {
      console.error('buzz 인덱스 로드 실패(buzz 없이 진행):', e.message);
    }

    // ai_context는 반드시 병합 저장한다 — 통째로 덮어쓰면 plan/gate/weight/draft가 사라진다
    // (2026-08-03 generate-node-insights에서 28건이 실제로 이 방식으로 손상됐다).
    async function saveBuzz(topicId, storyTitle, category) {
      if (!buzzIndex) return null;
      const r = scoreTitle(storyTitle, buzzIndex, { publishedAt: new Date().toISOString() });
      const [current] = await supabaseGet('topics', `?id=eq.${topicId}&select=ai_context`);
      const prev = (current && current.ai_context) || {};
      const prevBuzz = prev.buzz;
      // 같은 Topic에 여러 story가 붙으면 가장 화제성 높은 story 기준으로 유지한다
      // (토픽의 화제성은 그 토픽을 대표하는 가장 뜨거운 사안이 결정한다).
      if (prevBuzz && typeof prevBuzz.score === 'number' && prevBuzz.score >= r.score) return prevBuzz;

      const buzz = {
        score: r.score,
        reasons: r.reasons,
        matched: r.matched,
        bucket_hint: r.bucket_hint,
        quota_bucket: bucketOf(category, r.bucket_hint),
        source_title: storyTitle,
        computed_at: new Date().toISOString(),
      };
      await supabasePatch('topics', `?id=eq.${topicId}`, { ai_context: { ...prev, buzz } });
      return buzz;
    }

    const results = [];
    let topicsCreated = 0;
    let linksCreated = 0;
    let buzzWritten = 0;

    for (const story of unprocessed) {
      try {
        const decisions = await claudeResolveTopic(story.title, candidateTopics);
        const storyResult = { story_id: story.id, title: story.title, topics: [] };

        for (const d of decisions) {
          if (isDry) {
            storyResult.topics.push({ ...d, dry: true });
            continue;
          }

          let topicId = d.topic_id;
          if (d.action === 'new') {
            const slug = (d.slug_en && /^[a-z0-9-]+$/.test(d.slug_en)) ? d.slug_en : slugify(d.name);
            const [created] = await supabasePost('topics', {
              name: d.name,
              slug,
              description: d.description || null,
              summary: d.summary || d.description || null,
              category: d.category || null,
              source_type: 'ai',
            });
            if (!created) continue;
            topicId = created.id;
            topicsCreated++;
            candidateTopics.push({ id: topicId, name: d.name, summary: d.description, category: d.category || null });
          }
          if (!topicId) continue;

          // 화제성 적재 — 실패해도 Topic 연결 자체는 계속 간다(buzz는 우선순위 신호지 필수 경로가 아니다).
          try {
            const known = candidateTopics.find((t) => t.id === topicId);
            const category = d.action === 'new' ? (d.category || null) : (known && known.category) || null;
            const buzz = await saveBuzz(topicId, story.title, category);
            if (buzz) buzzWritten++;
          } catch (e) {
            console.error('buzz 적재 실패:', topicId, e.message);
          }

          await supabasePost('topic_stories', {
            topic_id: topicId,
            story_id: story.id,
            relevance_score: 100,
          }, 'return=minimal,resolution=ignore-duplicates').catch(() => {});
          linksCreated++;

          // topic_entities 집계 갱신: 이 story에 연결된 entity들을 topic과 이어준다
          const storyEntities = await supabaseGet('entity_stories', `?story_id=eq.${story.id}&select=entity_id`);
          for (const se of storyEntities) {
            const existing = await supabaseGet('topic_entities', `?topic_id=eq.${topicId}&entity_id=eq.${se.entity_id}&select=id,strength_score`);
            if (existing.length) {
              await supabasePatch('topic_entities', `?id=eq.${existing[0].id}`, {
                strength_score: Math.min(100, (existing[0].strength_score || 50) + 5),
                updated_at: new Date().toISOString(),
              });
            } else {
              await supabasePost('topic_entities', {
                topic_id: topicId,
                entity_id: se.entity_id,
                relation_type: 'mentioned_in',
                strength_score: 50,
              }, 'return=minimal,resolution=ignore-duplicates').catch(() => {});
            }
          }

          // 마지막 확인 시각 갱신 (topics.last_checked_at)
          await supabasePatch('topics', `?id=eq.${topicId}`, { last_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() });

          storyResult.topics.push({ ...d, topic_id: topicId });
        }
        results.push(storyResult);
      } catch (e) {
        console.error('resolve-topics story 처리 오류:', story.id, e.message);
      }
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        ok: true, dry: isDry, storiesProcessed: results.length, topicsCreated, linksCreated,
        buzzWritten, buzzFeeds: buzzIndex ? buzzIndex.stats : null,
        results: isDry ? results : undefined,
      }),
    };
  } catch (e) {
    console.error('resolve-topics 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
