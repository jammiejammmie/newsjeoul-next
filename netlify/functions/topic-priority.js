// topic-priority.js — 공유 모듈(자체 handler 없음)
// URL 해제/이미지 보강 배치가 "가장 최근에 수집된 기사"가 아니라 "실제 화면(topic/story)에 걸린 기사"부터
// 처리하도록 우선순위 후보군을 구해준다. topic_stories가 43행 수준으로 작아 매번 통째로 조회해도 가볍다.
// (2026-07-11: created_at desc만으로는 Hero/카드에 뜨는 토픽과 무관한 최신 잡기사가 먼저 처리되는
//  문제가 실제로 발견되어 추가됨 — topic에 걸린 기사를 최우선으로 돌린다.)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params || ''}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error('Supabase GET error: ' + await res.text());
  return res.json();
}

// 현재 topic_stories에 걸려 있는(=실제 토픽 화면에 쓰이는) 기사 id 목록을 반환한다.
async function getTopicLinkedArticleIds() {
  const links = await supabaseGet('topic_stories', '?select=story_id');
  const storyIds = [...new Set(links.map((l) => l.story_id))];
  if (storyIds.length === 0) return [];

  const storyArticles = await supabaseGet(
    'story_articles',
    `?select=article_id&story_id=in.(${storyIds.join(',')})`
  );
  return [...new Set(storyArticles.map((r) => r.article_id))];
}

// 발행(published)·계획(planned) 상태 Topic의 근거 기사 id만 반환한다 — 이미지 보강 배치가
// "아무 Topic에나 걸린 기사"보다 "실제로 Editorial Draft가 붙는 Topic"을 최우선으로 처리하도록
// 한 단계 더 좁힌 우선순위 티어(2026-07-12, PM 지시 — 이미지 커버리지 개선).
async function getEditorialPriorityArticleIds() {
  const topics = await supabaseGet('topics', "?editorial_status=in.(published,planned)&status=eq.active&select=id");
  const topicIds = topics.map((t) => t.id);
  if (topicIds.length === 0) return [];

  const links = await supabaseGet('topic_stories', `?topic_id=in.(${topicIds.join(',')})&select=story_id`);
  const storyIds = [...new Set(links.map((l) => l.story_id))];
  if (storyIds.length === 0) return [];

  const storyArticles = await supabaseGet(
    'story_articles',
    `?select=article_id&story_id=in.(${storyIds.join(',')})`
  );
  return [...new Set(storyArticles.map((r) => r.article_id))];
}

module.exports = { getTopicLinkedArticleIds, getEditorialPriorityArticleIds };
