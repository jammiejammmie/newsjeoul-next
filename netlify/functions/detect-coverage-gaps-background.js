// detect-coverage-gaps-background.js — Evolution Engine Track 2-1
// 근거: 마스터 스펙 v1 Track 2("카테고리 커버리지 갭을 지원님이 발견하는 게 아니라 시스템이
// 스스로 발견하고 스스로 메꾸는 구조"). 주간 배치(weekly-evolution-report.yml)로 실행된다.
//
// 로직: 최근 7일간 생성된 story 중 어떤 topic에도 연결되지 않은("승격되지 못한") story들을
// 모아 Claude에게 보여주고, 반복되는 패턴(=기존 event_type_rules로 커버 안 되는 카테고리)이
// 있는지 판단시킨다. 결과는 proposed_event_types에 status='proposed'로만 저장 — 파이프라인에
// 어떤 영향도 주지 않는다(Human Promotion 필수, admin 승인 후에만 event_type_rules에 반영).
//
// 안전장치: proposed_event_types 테이블이 아직 마이그레이션 전이면(evolution_engine_migration.sql
// 미적용) insert가 실패하지만, 이 함수 자체는 에러 없이 조용히 skip하고 다음 주에 다시 시도한다
// (distribution_skip_log와 동일한 방어 패턴 — CHANGELOG.md BLOCKED 참고).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const LOOKBACK_DAYS = 7;
const MIN_ORPHANED_STORIES = 15; // 이보다 적으면 패턴 판단하기엔 샘플이 부족해 스킵
const MAX_TITLES_TO_CLAUDE = 150; // 프롬프트 비대화 방지

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`GET ${table} 실패: ` + await res.text());
  return res.json();
}

async function fetchOrphanedStories() {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString();
  const [stories, links] = await Promise.all([
    supabaseGet('stories', `?select=id,title,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=1000`),
    supabaseGet('topic_stories', `?select=story_id&created_at=gte.${encodeURIComponent(since)}&limit=1000`),
  ]);
  const linkedIds = new Set(links.map((l) => l.story_id));
  return stories.filter((s) => !linkedIds.has(s.id));
}

async function fetchCurrentEventTypes() {
  const rules = await supabaseGet('event_type_rules', '?select=event_type');
  return rules.map((r) => r.event_type);
}

async function claudeAnalyzeGaps(orphanedTitles, currentEventTypes) {
  const prompt = `너는 뉴스저울의 편집 시스템 진단가다. 아래는 최근 ${LOOKBACK_DAYS}일간 수집됐지만
어떤 Topic으로도 발행되지 못한("승격 실패") 기사 묶음(story)의 제목 목록이다.

현재 시스템이 다루는 사건 유형(event_type) 목록:
${currentEventTypes.join(', ')}

할 일: 이 승격 실패 제목들 중에서, 현재 event_type 목록 중 어디에도 자연스럽게 안 맞아서
반복적으로 탈락하고 있는 것으로 보이는 카테고리 패턴이 있는지 찾아라. 우연히 몇 건 안 걸린
개별 사건이 아니라, 반복되는 "유형"이어야 한다(최소 5건 이상 유사 패턴).

승격 실패 제목 목록:
${orphanedTitles.map((t, i) => `${i}. ${t}`).join('\n')}

설명 없이 아래 JSON 배열만 반환해라(패턴이 없으면 빈 배열 []):
[
  {
    "event_type_name": "새 event_type 이름(간결한 한글, 기존 목록과 겹치지 않게)",
    "rationale": "왜 이 카테고리가 필요한지, 왜 반복적으로 탈락하는지 설명",
    "suggested_perspective_candidates": ["관점1", "관점2"],
    "suggested_axis_weights": {"비교":0,"역사":0,"연결":0,"지금":0,"행위자":0,"핵심변화":0},
    "matching_titles": ["이 패턴에 해당하는 실제 제목들(최대 10개)"]
  }
]
suggested_axis_weights의 6개 값 합은 반드시 1.0이어야 한다.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5', max_tokens: 4000 /* 2026-08-06: sonnet-5 adaptive thinking이 max_tokens를 함께 소진한다 — 잘림 여유 확보 */, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const rawText = data.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = rawText.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('갭 분석 결과 파싱 실패: ' + rawText.slice(0, 200));
  return JSON.parse(match[0]);
}

async function saveProposals(proposals, orphanedCount) {
  if (!proposals.length) return { saved: 0 };
  const rows = proposals.map((p) => ({
    event_type_name: p.event_type_name,
    rationale: p.rationale,
    suggested_perspective_candidates: p.suggested_perspective_candidates || [],
    suggested_axis_weights: p.suggested_axis_weights || null,
    sample_article_titles: (p.matching_titles || []).slice(0, 10),
    detected_article_count: orphanedCount,
  }));
  const res = await fetch(`${SUPABASE_URL}/rest/v1/proposed_event_types`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    // 테이블 미생성 등으로 실패해도 배치 자체는 정상 종료 처리(CHANGELOG BLOCKED 참고)
    console.error('PROPOSED_EVENT_TYPES_SAVE_FAILED(마이그레이션 미적용 가능성):', await res.text());
    return { saved: 0, error: true };
  }
  return { saved: rows.length };
}

exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (adminKey !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const orphaned = await fetchOrphanedStories();
    console.log(`COVERAGE_GAP_SCAN: 승격 실패 story ${orphaned.length}건 (최근 ${LOOKBACK_DAYS}일)`);

    if (orphaned.length < MIN_ORPHANED_STORIES) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, skipped: true, reason: 'not_enough_samples', orphanedCount: orphaned.length }) };
    }

    const currentEventTypes = await fetchCurrentEventTypes();
    const titles = orphaned.slice(0, MAX_TITLES_TO_CLAUDE).map((s) => s.title);
    const proposals = await claudeAnalyzeGaps(titles, currentEventTypes);
    const result = await saveProposals(proposals, orphaned.length);

    console.log(`COVERAGE_GAP_RESULT: 후보 ${proposals.length}건 감지, ${result.saved}건 저장`);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, orphanedCount: orphaned.length, proposalsDetected: proposals.length, proposalsSaved: result.saved, migrationPending: !!result.error }),
    };
  } catch (e) {
    console.error('detect-coverage-gaps-background 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
