// card-content.js — 카드뉴스 신규 디자인(SPEC v1, 골격 8B + 연예 스킨 8D)용 콘텐츠 생성.
// 근거: 노차장 SPEC v1 §4(카피 상한)·§5.1(데이터 계약)·§5.2(검증), 카테고리 매핑 §6.2.
//
// 왜 필요한가: /card 라우트(app/card/route.tsx)는 새 표지·what·viewA/viewB·end 컴포넌트를
// 이미 지원하지만, quoteA/quoteB(≤16자)·title(≤12자×2줄)·weightA 같은 짧고 엄격한 카피는
// 기존 draft.perspective_markers(1~2문장)에서 그냥 잘라 만들 수 없다. SPEC이 "조용히 잘린
// 카피를 내보내지 말 것"으로 못박았고, perspective_markers.claim은 실제 발언이 아니라
// 에디터가 합성한 "관점"이라 따옴표를 붙이면 법무 위반(SPEC §8)이다. 그래서 압축·재구성
// 전용 Claude 호출을 새로 둔다.
//
// 범위(현재): T1(대립형)만 생성한다 — 8B+8D가 다루는 유형. 연예→skin=ent, 사회(정책 논쟁)
// →skin=news. 그 외 카테고리(T2~T4 대상)는 null을 반환해 호출부가 기존(LegacyCover 등)으로
// 폴백하게 한다. T2~T4는 §2.6 컴포넌트가 만들어진 뒤 이 파일에 추가한다.
//
// 캐시: topics.ai_context.card_content에 저장한다 — Threads/Instagram이 같은 결과를 재사용해
// 비용이 토픽당 1회로 끝나고, 두 채널이 같은 카드를 낸다(브랜드 일관성).

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const SKIN_BY_CATEGORY = { Entertainment: 'ent', Society: 'news' };

const len = (s) => [...String(s || '')].length;

// SPEC §4 슬롯별 글자 수 상한. 검증만 하고 자르지 않는다 — 넘치면 실패 처리 후 재시도/폴백.
function validate(d) {
  const errs = [];
  const check = (slot, v, max) => { if (len(v) > max) errs.push(`${slot} ${len(v)}자(상한 ${max}): "${v}"`); };

  check('cover.quoteA', d.cover?.quoteA, 16);
  check('cover.quoteB', d.cover?.quoteB, 16);
  check('cover.kicker', d.cover?.kicker, 14);
  (d.cover?.titleLines || []).forEach((l, i) => check(`cover.titleLines[${i}]`, l, 12));
  if (!d.cover?.titleLines?.length || d.cover.titleLines.length > 2) errs.push('cover.titleLines는 1~2줄이어야 한다');
  check('cover.labelA', d.cover?.labelA, 6);
  check('cover.labelB', d.cover?.labelB, 6);
  check('cover.badge', d.cover?.badge, 6);
  if (typeof d.cover?.weightA !== 'number' || d.cover.weightA < 0 || d.cover.weightA > 100) {
    errs.push(`cover.weightA는 0~100 숫자여야 한다: ${d.cover?.weightA}`);
  }

  (d.what?.subheadLines || []).forEach((l, i) => check(`what.subheadLines[${i}]`, l, 24));
  if (!d.what?.subheadLines?.length || d.what.subheadLines.length > 2) errs.push('what.subheadLines는 1~2줄이어야 한다');
  const bars = d.what?.bars || [];
  if (bars.length < 3 || bars.length > 4) errs.push(`what.bars는 3~4개여야 한다(받음 ${bars.length})`);
  bars.forEach((b, i) => {
    check(`what.bars[${i}].label`, b.label, 4);
    check(`what.bars[${i}].value`, b.value, 7);
    if (!Number.isFinite(b.width) || b.width < 200 || b.width > 700) errs.push(`what.bars[${i}].width는 200~700이어야 한다: ${b.width}`);
    if (!['ink', 'gray', 'red'].includes(b.color)) errs.push(`what.bars[${i}].color는 ink|gray|red여야 한다: ${b.color}`);
  });
  check('what.source', d.what?.source, 34);

  const vA = d.viewA?.headlineLines || [];
  const vB = d.viewB?.headlineLines || [];
  vA.forEach((l, i) => check(`viewA.headlineLines[${i}]`, l, 21));
  vB.forEach((l, i) => check(`viewB.headlineLines[${i}]`, l, 21));
  if (!vA.length || vA.length > 3 || !vB.length || vB.length > 3) errs.push('viewA/viewB.headlineLines는 1~3줄이어야 한다');
  if (vA.length !== vB.length) errs.push(`viewA·viewB 줄 수가 다르다(A=${vA.length}, B=${vB.length}) — 대칭이 깨진다(SPEC §2.4)`);
  check('viewA.body', d.viewA?.body, 52);
  check('viewB.body', d.viewB?.body, 52);
  check('viewA.attribution', d.viewA?.attribution, 16);
  check('viewB.attribution', d.viewB?.attribution, 16);

  const endH = d.end?.headlineLines || [];
  endH.forEach((l, i) => check(`end.headlineLines[${i}]`, l, 18));
  if (!endH.length || endH.length > 3) errs.push('end.headlineLines는 1~3줄이어야 한다');
  check('end.body', d.end?.body, 48);

  return errs;
}

function buildPrompt(topic, skin, correction) {
  const draft = topic.ai_context?.draft || {};
  const markers = draft.perspective_markers || [];
  const [mA, mB] = markers;
  const category = topic.category || '';

  return `너는 뉴스저울의 카드뉴스 편집자다. 아래 기사를 5장짜리 카드뉴스(대립형 T1)용 카피로
압축해라. 카드뉴스는 활자와 단색 도형만 쓰는 satori 렌더러라 슬롯별 글자 수 상한이 엄격하다
— 넘치면 렌더가 실패한다. 상한을 반드시 지켜라. 짧게 쓰되 의미가 비지 않게 써라.

★ 법무(중요): quoteA/quoteB/viewA·viewB의 문장은 실제 인물의 발언이 아니라 너가 요약한
"관점"이다. 큰따옴표(" ")를 붙이지 마라 — 실제 발언처럼 보이면 안 된다. "~는 시각",
"~라는 입장" 대신 그냥 그 입장을 짧은 평서문으로 써라(예: "팬 부담이 늘었다" O, "\\"팬 부담이
늘었다\\"" X).

기사 제목: ${topic.name}
카테고리: ${category}
리드: ${draft.lead || ''}
관점 A(${mA?.perspective || ''}): ${mA?.claim || ''} — 근거: ${mA?.basis || ''}
관점 B(${mB?.perspective || ''}): ${mB?.claim || ''} — 근거: ${mB?.basis || ''}
핵심 키워드: ${(draft.display_keywords || []).join(', ')}

슬롯별 글자 수 상한(코드포인트 기준, 반드시 지킬 것):
- cover.quoteA / cover.quoteB: 각 16자 이내. 관점 A/B를 대립하는 한 문장으로 압축(따옴표 없이)
- cover.kicker: 14자 이내. 이슈를 가리키는 짧은 구(그룹명·행사명 등)
- cover.titleLines: 1~2줄, 각 줄 12자 이내. 명사로 끊어라(예: "티켓값" / "18% 인상")
- cover.labelA / cover.labelB: 각 6자 이내. "팬 58"처럼 진영+숫자 또는 진영명
- cover.weightA: 0~100 정수. quoteA 쪽 비중(뚜렷한 근거 없으면 50)
- cover.badge: 6자 이내. 카테고리 배지(예: "연예", "사회")
- what.subheadLines: 1~2줄, 각 24자 이내. 사실만(해석 금지) — "무슨 일이 있었나"
- what.bars: 3~4개. 각 {label(4자 이내), value(7자 이내), width(200~700 정수, 시각적 비례로 직접 정할 것 — 값 차이가 작아도 최소 200), color(ink|gray|red 중 하나, 강조할 값에 red)}
- what.source: 34자 이내. 날짜·매체 수 등 출처 요약
- viewA/viewB.headlineLines: 1~3줄, 각 21자 이내. **viewA와 viewB는 줄 수가 반드시 같아야 한다.** 주장 문장
- viewA/viewB.body: 각 52자 이내. 근거(수치 1개 이상 포함 권장)
- viewA/viewB.attribution: 각 16자 이내. 그 입장을 대표하는 집단명
- end.headlineLines: 1~3줄, 각 18자 이내. 결론이 아니라 "다음에 확인할 시점"
- end.body: 48자 이내. 판단 유보 + 검증 시점

${correction ? `\n★ 이전 시도가 다음 상한을 넘겼다. 반드시 고쳐서 다시 써라:\n${correction}\n` : ''}
설명 없이 아래 JSON만 반환해라(코드블록 없이):
{
  "cover": {"quoteA":"","quoteB":"","kicker":"","titleLines":["",""],"labelA":"","labelB":"","weightA":0,"badge":""},
  "what": {"subheadLines":["",""],"bars":[{"label":"","value":"","width":0,"color":"ink"}],"source":""},
  "viewA": {"headlineLines":["","",""],"body":"","attribution":""},
  "viewB": {"headlineLines":["","",""],"body":"","attribution":""},
  "end": {"headlineLines":["","",""],"body":""}
}`;
}

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 1600,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Claude API 에러(card-content): ' + await res.text());
  const data = await res.json();
  const rawText = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('card-content 파싱 실패: ' + rawText.slice(0, 200));
  return JSON.parse(match[0]);
}

async function supabasePatch(topicId, cardContent) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${topicId}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    // ai_context 전체를 새로 읽어 병합하는 대신, PostgREST의 jsonb 병합 연산은 REST로 못 하므로
    // 호출부가 최신 ai_context를 들고 있다고 가정하고 그 스냅샷 위에 card_content만 얹어 보낸다
    // (post-threads-background.js/instagram-publish.js가 topic을 막 읽은 직후 호출하므로 안전하다).
    body: JSON.stringify({ ai_context: cardContent.__mergedAiContext }),
  });
  if (!res.ok) console.error('card-content 캐시 저장 실패:', res.status, await res.text());
}

// buildCardContent(topic) → CardData(T1) | null
// null이면 호출부는 기존(LegacyCover 등)으로 폴백해야 한다 — 절대 게시를 막지 않는다.
async function buildCardContent(topic) {
  const cached = topic.ai_context?.card_content;
  if (cached?.cover) return cached;

  const skin = SKIN_BY_CATEGORY[topic.category];
  if (!skin) return null; // T2~T4 대상 카테고리 — 아직 미구현

  const draft = topic.ai_context?.draft || {};
  const markers = draft.perspective_markers || [];
  if (!draft.lead || markers.length < 2) return null; // 대립 관점 2개 미만이면 T1 성립 안 함
  if (!ANTHROPIC_KEY) { console.error('CARD_CONTENT: ANTHROPIC_API_KEY 없음'); return null; }

  let correction = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = await callClaude(buildPrompt(topic, skin, correction));
      const errs = validate(parsed);
      if (!errs.length) {
        const result = { skin, type: 'T1', ...parsed, generated_at: new Date().toISOString() };
        result.__mergedAiContext = { ...(topic.ai_context || {}), card_content: result };
        await supabasePatch(topic.id, result);
        delete result.__mergedAiContext;
        return result;
      }
      console.warn(`CARD_CONTENT[시도${attempt}]: 검증 실패 —`, errs.join(' / '));
      correction = errs.join('\n');
    } catch (e) {
      console.error(`CARD_CONTENT[시도${attempt}] 실패:`, e.message);
    }
  }
  return null; // 2회 실패 — 폴백
}

module.exports = { buildCardContent, validate };
