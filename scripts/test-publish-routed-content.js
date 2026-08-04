// publish-routed-content-background.js 회귀 테스트 — 실행: node scripts/test-publish-routed-content.js
// 이 함수는 "이미 생성된 expansion draft를 published로 승격"만 하므로, 검증 핵심은
// (1) 잘못된 대상을 승격하지 않는가(특히 DEEP_DIVE 결과물 덮어쓰기) (2) 변환 결과가
// 토픽 페이지/Threads 게이트가 기대하는 모양인가 (3) 앵글 매핑이 생성 함수와 어긋나지 않는가다.
process.env.SUPABASE_URL = 'https://fake.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'fake';

const fs = require('fs');
const pathMod = require('path');
const modPath = pathMod.resolve(__dirname, '../netlify/functions/publish-routed-content-background.js');
const { evaluateTopic, buildDraftFromExpansion, ROUTE_ANGLE, ROUTABLE_GATES, MIN_BODY_LENGTH } = require(modPath)._testUtils;

const results = [];
const check = (label, pass) => { results.push({ label, pass }); console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label); };

const body4 = ['첫 문단입니다.', '둘째 문단입니다.', '셋째 문단입니다.', '넷째 문단입니다.'].join('\n\n') + 'x'.repeat(320);
// lead는 실측값 범위(50~172자, 평균 109자)를 반영한다 — 처음엔 9자짜리 가짜 lead를 써서
// 4d가 실패했는데, 코드 문제가 아니라 픽스처가 실제 데이터와 동떨어져 있던 것이었다.
const realisticLead = '자살을 시도한 사람이 병원 문을 나선 순간부터가 진짜 시작이다. 정부가 이 그 다음을 국가 차원에서 챙기는 지원 체계를 만들고 있다.';
function expansion(over) {
  return Object.assign({
    angle: 'brief-short', label: '요약', title: '제목', lead: realisticLead,
    body: body4, display_keywords: ['키워드1', '키워드2'],
    editor: { id: 'e1', name: '테오', perspective: '기술덕후' }, generated_at: '2026-07-29T04:02:15.406Z',
  }, over || {});
}
function topic(over) {
  return Object.assign({
    id: 't1', name: '토픽', slug: 'topic-1', category: 'Society',
    gate_status: 'SHORT_BRIEF', importance_score: 300,
    ai_context: { plan: { editors_assigned: [{ name: '테오' }] }, expansion_drafts: [expansion()] },
  }, over || {});
}

// ── 1. 정상 승격 ──
{
  const v = evaluateTopic(topic());
  check('1) SHORT_BRIEF + brief-short 앵글 → 승격 대상', v.ok === true && v.expansion.angle === 'brief-short');
}

// ── 2. DEEP_DIVE 결과물 보호(가장 중요) ──
{
  const t = topic({ ai_context: { draft: { lead: '장문 리드', blocks: [{ axis: '비교', content: '장문' }] }, expansion_drafts: [expansion()] } });
  const v = evaluateTopic(t);
  check('2) ai_context.draft가 이미 있으면 승격하지 않음(장문 덮어쓰기 방지)', v.ok === false && v.reason === 'draft_already_exists');
}
{
  const v = evaluateTopic(topic({ gate_status: 'DEEP_DIVE' }));
  check('2b) DEEP_DIVE는 대상이 아님(전용 파이프라인 소유)', v.ok === false && v.reason === 'gate_not_routable');
}
{
  const rejected = ['REJECT', 'pending_gate', 'reject', 'hold'].every((g) => evaluateTopic(topic({ gate_status: g })).ok === false);
  check('2c) REJECT/pending_gate/hold 등은 대상이 아님', rejected);
}

// ── 3. 불완전한 expansion 방어 ──
{
  const cases = [
    ['expansion 없음', topic({ ai_context: { expansion_drafts: [] } }), 'expansion_missing'],
    ['앵글 불일치(update 앵글인데 gate는 SHORT_BRIEF)', topic({ ai_context: { expansion_drafts: [expansion({ angle: 'update' })] } }), 'expansion_missing'],
    ['body 비어있음', topic({ ai_context: { expansion_drafts: [expansion({ body: '' })] } }), 'expansion_body_empty'],
    ['body 너무 짧음', topic({ ai_context: { expansion_drafts: [expansion({ body: '짧다.' })] } }), 'body_too_short'],
    ['lead 비어있음', topic({ ai_context: { expansion_drafts: [expansion({ lead: '   ' })] } }), 'expansion_lead_empty'],
  ];
  const allOk = cases.every(([, t, reason]) => { const v = evaluateTopic(t); return v.ok === false && v.reason === reason; });
  check(`3) 불완전한 expansion ${cases.length}종 전부 사유와 함께 차단`, allOk);
}
{
  check(`3b) MIN_BODY_LENGTH가 Threads 품질 게이트와 같은 300`, MIN_BODY_LENGTH === 300);
}

// ── 4. 변환 결과 모양 ──
{
  const d = buildDraftFromExpansion(expansion());
  check(
    '4) draft가 lead/blocks/display_keywords를 갖고 blocks는 1개(탭 난립 방지)',
    typeof d.lead === 'string' && d.lead.length > 0 && Array.isArray(d.blocks) && d.blocks.length === 1 &&
    d.blocks[0].axis === '요약' && d.blocks[0].content.length >= MIN_BODY_LENGTH && d.display_keywords.length === 2
  );
  check(
    '4b) 원문 본문이 손실 없이 그대로 들어감(문단 구분 유지 — 렌더러가 빈 줄로 분리)',
    d.blocks[0].content === expansion().body.trim() && d.blocks[0].content.includes('\n\n')
  );
  check('4c) promoted_from에 앵글/에디터가 기록됨(되돌리기·통계용)', d.promoted_from.angle === 'brief-short' && d.promoted_from.editor.name === '테오');
}
{
  // 토픽 페이지가 draft.blocks[].axis/content를 읽고, Threads가 lead/blocks/bodyLen/keywords를 본다.
  const d = buildDraftFromExpansion(expansion());
  const bodyLen = d.blocks.reduce((s, b) => s + (b.content || '').length, 0);
  const passesThreadsCompleteness = d.lead.length >= 20 && bodyLen >= 300;
  check('4d) Threads 품질 게이트의 lead>=20 / bodyLen>=300 충족', passesThreadsCompleteness);
}

// ── 5. 앵글 매핑이 생성 함수(ANGLE_CONFIG)와 어긋나지 않는지 ──
//     어긋나면 해당 유형이 조용히 승격되지 않고 영구 적체된다 — 파일을 직접 읽어 고정한다.
{
  const gen = fs.readFileSync(pathMod.resolve(__dirname, '../netlify/functions/generate-expansion-drafts-background.js'), 'utf8');
  const mismatches = [];
  for (const [gate, angle] of Object.entries(ROUTE_ANGLE)) {
    // ANGLE_CONFIG의 `GATE: { slug: 'angle', ...}` 한 줄에서 slug를 뽑아 비교
    const re = new RegExp(`${gate}:\\s*\\{[^}]*slug:\\s*'([^']+)'`);
    const m = gen.match(re);
    if (!m) mismatches.push(`${gate}: 생성 함수 ANGLE_CONFIG에 정의 없음`);
    else if (m[1] !== angle) mismatches.push(`${gate}: 생성='${m[1]}' vs 승격='${angle}'`);
  }
  if (mismatches.length) mismatches.forEach((m) => console.log('   ' + m));
  check(`5) ROUTE_ANGLE ${ROUTABLE_GATES.length}종이 생성 함수 ANGLE_CONFIG와 일치`, mismatches.length === 0);
}

// ── 6. DEEP_DIVE가 승격 대상에 절대 포함되지 않는지(매핑 레벨) ──
{
  check('6) ROUTE_ANGLE에 DEEP_DIVE/REJECT 키가 없음', !('DEEP_DIVE' in ROUTE_ANGLE) && !('REJECT' in ROUTE_ANGLE));
}

const failCount = results.filter((r) => !r.pass).length;
console.log(failCount === 0 ? `\n전체 통과(${results.length}개)` : `\n일부 실패(${failCount}/${results.length})`);
process.exitCode = failCount === 0 ? 0 : 1;
