// viral-radar/lib/classify.js
// PRODUCT.md §16-17 "AI 장르 분류". metadata(title/caption/query hint) 기반 1차 분류.
//
// ANTHROPIC_API_KEY가 있으면 실제 Claude API를 호출한다(운영 시 경로).
// 이 세션은 로컬에 키가 없다(.env.local 확인됨) — 그 경우 classify()는 예외를 던지지 않고
// { needsManualClassification: true }를 반환해서, 오늘자 POC는 사람(=이 세션의 Claude)이
// 직접 분류해 채운 JSON을 쓴다는 것을 스크립트가 명확히 알 수 있게 한다.
// (거짓으로 자동분류된 척하지 않는다 — PRODUCT.md "가짜 데이터 금지" 원칙과 같은 정신)

const { GENRES } = require('./schema');

const MODEL = 'claude-sonnet-5';

function buildPrompt(video) {
  return `다음은 숏폼 바이럴 영상 후보의 메타데이터다. 장르를 분류하라.

제목: ${video.title || '(없음)'}
설명/캡션: ${(video.caption || '(없음)').slice(0, 300)}
채널: ${video.creator_name || '(없음)'}
검색으로 발견된 장르 힌트(참고만, 맹신하지 말 것): ${video.discovery_genre_hint || '(없음)'}

장르 후보: ${GENRES.join(', ')}

각 장르에 대해 0~1 점수를 매기고, 가장 높은 것을 primaryGenre로 지정하라.
confidence가 0.5 미만이면 needsReview를 true로 하라.
반드시 아래 JSON 형식으로만 답하라:
{"primaryGenre":"FUNNY","genreScores":{"FUNNY":0.9,...},"confidence":0.9,"reason":"...", "summaryKo":"...", "needsReview": false}`;
}

async function classifyViaClaude(video, apiKey) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: buildPrompt(video) }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API 호출 실패 HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text = json.content?.[0]?.text || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Claude 응답에서 JSON을 못 찾음: ${text.slice(0, 200)}`);
  return JSON.parse(match[0]);
}

/**
 * @returns {Promise<{needsManualClassification: true} | {primaryGenre, genreScores, confidence, reason, summaryKo, needsReview}>}
 */
async function classify(video) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { needsManualClassification: true };
  }
  return classifyViaClaude(video, apiKey);
}

module.exports = { classify, buildPrompt, GENRES };
