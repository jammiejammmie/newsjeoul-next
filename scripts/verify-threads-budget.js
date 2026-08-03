// 실제 후보 Topic의 slug/URL로 문구 예산을 검증한다 — Claude 호출 없이(비용 0), 게시 없이.
// post-threads-background.js가 실제로 쓰는 함수(buildTopicUrl/truncateAtSentenceBoundary)를
// 그대로 불러 쓰기 때문에, 여기서 통과하면 프로덕션 조립 경로도 같은 보장을 갖는다.
// 실행: node scripts/verify-threads-budget.js
const fs = require('fs');
const path = require('path');
const env = {};
fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim();
});
process.env.SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const { buildTopicUrl, truncateAtSentenceBoundary, THREADS_MAX_CHARS } =
  require('../netlify/functions/post-threads-background.js')._testUtils;

const U = env.NEXT_PUBLIC_SUPABASE_URL, K = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const H = { apikey: K, Authorization: 'Bearer ' + K };

// generateDeepPost의 조립 로직과 동일한 순서로 재현한다(링크 우선 확보 → 남은 예산에 본문).
const MIN_BODY_BUDGET = 120;
function assemble(topic, rawBody, activeTopicCount) {
  const url = buildTopicUrl(topic);
  let closing = `\n\n오늘 이 외에도 ${activeTopicCount}개 이슈를 다루고 있습니다 →\n${url}`;
  if (THREADS_MAX_CHARS - closing.length < MIN_BODY_BUDGET) closing = `\n\n${url}`;
  const body = truncateAtSentenceBoundary(rawBody.trim(), THREADS_MAX_CHARS - closing.length);
  return { text: `${body}${closing}`, url };
}

(async () => {
  const res = await fetch(
    `${U}/rest/v1/topics?select=id,slug,name&status=eq.active&editorial_status=eq.published` +
    `&ai_context->threads->>posted_at=is.null&order=importance_score.desc&limit=30`,
    { headers: H }
  );
  const pool = await res.json();
  console.log(`실제 미게시 후보 ${pool.length}건으로 검증 (상한 ${THREADS_MAX_CHARS}자)\n`);

  // Claude 본문 길이는 통제할 수 없으므로 짧은 것부터 극단적으로 긴 것까지 전부 넣어본다.
  const BODY_LENGTHS = [120, 280, 350, 500, 1200];
  const sentence = '이번 사안의 배경과 쟁점을 설명하는 문장입니다. ';
  let fail = 0;
  const urlLens = [];

  for (const topic of pool) {
    urlLens.push(buildTopicUrl(topic).length);
    for (const len of BODY_LENGTHS) {
      const rawBody = sentence.repeat(Math.ceil(len / sentence.length)).slice(0, len);
      const { text, url } = assemble(topic, rawBody, 627);
      const hasLink = text.includes(url);
      const endsWithLink = text.endsWith(url);
      const withinLimit = text.length <= THREADS_MAX_CHARS;
      if (!hasLink || !withinLimit || !endsWithLink) {
        fail++;
        console.log(`FAIL slug=${topic.slug.slice(0, 30)} 본문${len}자 → 전체 ${text.length}자 link=${hasLink} end=${endsWithLink} limit=${withinLimit}`);
      }
    }
  }

  console.log(`URL 길이(실측 30건): min ${Math.min(...urlLens)} / 평균 ${Math.round(urlLens.reduce((a, b) => a + b, 0) / urlLens.length)} / max ${Math.max(...urlLens)}`);
  console.log(`→ 본문 예산: 최소 ${THREADS_MAX_CHARS - 31 - Math.max(...urlLens)}자 확보(최장 URL 기준)`);
  console.log(`\n검증 조합 ${pool.length * BODY_LENGTHS.length}개 중 실패 ${fail}개`);

  // 실제 후보 1건의 최종 문구 모양을 눈으로 확인(본문은 대역 텍스트).
  const sample = assemble(pool[0], sentence.repeat(12), 627);
  console.log(`\n──── 조립 결과 예시(${sample.text.length}자) ────\n${sample.text}\n────────────────────────`);
  // process.exit()로 즉시 종료하면 Windows Node에서 libuv teardown assertion이 찍히므로
  // exitCode만 세팅하고 자연 종료시킨다(테스트 결과와 무관한 노이즈 제거).
  process.exitCode = fail === 0 ? 0 : 1;
})();
