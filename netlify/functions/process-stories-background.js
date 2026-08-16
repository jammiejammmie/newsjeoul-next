// process-stories.js
// 수집된 기사 → buzz 우선 정렬 → Claude 클러스터링 → stories/story_articles 생성 → 논쟁지수 계산
// (2026-08-17: 침묵지수 산출 제거, buzz_score 기반으로 전환)

const { skipReason } = require('./news-filters');
const { fetchBuzzIndex, scoreTitle } = require('./buzz-engine');

// 클러스터링에 넣을 기사 상한. 이 위로는 잘려나가는데, 종전에는 그 기준이 "최신순"이라
// 화제성과 무관하게 잘렸다. 이제 buzz 점수 우선으로 정렬한 뒤 자른다(2026-08-17).
const CLUSTER_INPUT_LIMIT = 200;

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
- 주제로 배제하지 마라. 정치·스포츠·연예·경제·테크 전부 동등하게 묶어라
  (2026-08-17 개편 — 종전에는 "광고/스포츠/연예 제외" 지시가 있었으나, 이 때문에
   화제 이슈가 통째로 유실됐다. 주제별 분량은 발행 단계의 카테고리 쿼터가 조절한다.)
- 다만 명백한 광고/홍보성 기사는 묶지 마라
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

// ── 침묵지수 제거 (2026-08-17, PM 지시) ─────────────────────────────────────
// calcSilenceScore()는 "활성 언론사 29곳 중 몇 곳이 이 사안을 안 다뤘나"를 재던 지표로,
// 뉴스저울 초기 정체성이었다. buzz_score 기반으로 완전히 전환하면서 산출·저장·소비를 모두 제거한다.
// 관련 UI(SilenceTop10, TrackedSilenceSection, /top10)는 이미 2026-07-22 구브랜드 정리 때
// redirect·미사용 처리되어 있었으므로 이번 제거로 새로 사라지는 화면은 없다.
//
// 주의: stories.silence_score 컬럼 자체는 DDL 권한이 없어 남아 있다. 아래 INSERT는 이 컬럼을
// 더 이상 채우지 않는다 — 컬럼이 NOT NULL이면 INSERT가 실패하므로, 그 경우에만 0으로 재시도하는
// 호환 폴백을 둔다(파이프라인 전체가 멈추는 것보다는 낫다). 컬럼을 실제로 지우는 SQL은
// supabase/remove_silence_score_migration.sql 에 있다.

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

    let articlesWithName = unprocessed.map(a => ({
      ...a,
      outlet_name: outletMap[a.outlet_id] || '알 수 없음'
    }));

    // ── buzz 우선 정렬 (2026-08-17) ─────────────────────────────────────────
    // 화제성 인덱스는 실패해도 무시한다 — 그 경우 종전과 동일한 최신순으로 진행된다.
    // 여기서 계산한 점수는 클러스터 대표 제목으로 옮겨 담아, 뒤 단계(resolve-topics)가
    // 다시 계산하지 않아도 되게 한다.
    let buzzIndex = null;
    const buzzByArticleId = new Map();
    try {
      buzzIndex = await fetchBuzzIndex({ perFeedLimit: 40, timeoutMs: 7000 });
      for (const a of articlesWithName) {
        const r = scoreTitle(a.title, buzzIndex, { publishedAt: a.published_at });
        buzzByArticleId.set(a.id, r);
      }
      articlesWithName.sort((x, y) => {
        const d = (buzzByArticleId.get(y.id)?.score || 0) - (buzzByArticleId.get(x.id)?.score || 0);
        if (d !== 0) return d;
        return String(y.published_at || '').localeCompare(String(x.published_at || ''));
      });
      const topScore = buzzByArticleId.get(articlesWithName[0]?.id)?.score || 0;
      console.log(`buzz 정렬 완료: 최고 ${topScore}점, 피드 ${buzzIndex.stats.feeds_ok}/8`);
    } catch (e) {
      console.error('buzz 정렬 생략(최신순으로 진행):', e.message);
    }

    if (articlesWithName.length > CLUSTER_INPUT_LIMIT) {
      console.log(`클러스터 입력 ${articlesWithName.length}건 → 상위 ${CLUSTER_INPUT_LIMIT}건으로 절단(buzz 순)`);
      articlesWithName = articlesWithName.slice(0, CLUSTER_INPUT_LIMIT);
    }

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

        // 2026-08-17: 주제 배제는 사라졌다. 여기서 걸리는 건 광고/낚시/무정보 자동생성물뿐이다.
        const skip = skipReason(cluster.story_title);
        if (skip) {
          console.log(`스킵(${skip}):`, cluster.story_title);
          continue;
        }

        const repArticle = articlesWithName[cluster.representative_index] || clusterArticles[0];
        const controversyScore = calcControversyScore(clusterArticles);

        const storyRow = {
          title: cluster.story_title,
          representative_article_id: repArticle.id,
          controversy_score: controversyScore,
          published_at: repArticle.published_at,
        };

        let story;
        try {
          [story] = await supabasePost('stories', storyRow);
        } catch (e) {
          // silence_score가 NOT NULL로 남아 있는 경우에만 걸린다. 컬럼을 실제로 드롭하면
          // 이 경로는 영구히 죽는다(정상). 여기서 죽으면 스토리 생성이 전부 멈추므로 방어한다.
          if (!/silence_score/.test(e.message)) throw e;
          console.warn('silence_score NOT NULL 제약 감지 — 0으로 채워 재시도(컬럼 드롭 SQL 미적용 상태)');
          [story] = await supabasePost('stories', { ...storyRow, silence_score: 0 });
        }

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

        console.log(`스토리 생성: "${cluster.story_title}" (논쟁:${controversyScore} 출처:${uniqueOutletCount}곳)`);

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
