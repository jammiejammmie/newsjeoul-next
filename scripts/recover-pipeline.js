// Priority 1 파이프라인 복구 스크립트 (2026-07-22 22시간 정체 사고 대응)
//
// 목적: Editorial Plan → Gate → Draft → Weight → Expansion이 22시간 멈췄던 사고에서, ADMIN_KEY만
// 있으면 사람이 순서를 다시 생각할 필요 없이 즉시 실행할 수 있도록 만든 복구 절차.
// 실행: ADMIN_KEY=xxx node scripts/recover-pipeline.js
//
// 동작: 각 단계를 (1) 호출 → (2) 백로그 카운트가 줄어들 때까지 폴링(최대 poll 횟수) →
// (3) 필요하면 재호출, 순서로 진행한다. 전부 anon key(읽기)로 검증하고, 쓰기는 admin-key로
// 보호된 함수 호출을 통해서만 한다 — 이 스크립트 자체는 DB에 직접 쓰지 않는다.

const fs = require('fs');
try {
  fs.readFileSync('C:/newsjeoul-next/.env.local', 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  });
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_KEY = process.env.ADMIN_KEY;
const BASE = 'https://newsjeoul.co.kr';
const HEADERS = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY };

if (!ADMIN_KEY) {
  console.error('ADMIN_KEY 환경변수가 없습니다. 실행: ADMIN_KEY=xxx node scripts/recover-pipeline.js');
  process.exit(1);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function callFn(name, { background = false } = {}) {
  const res = await fetch(`${BASE}/.netlify/functions/${name}`, { method: 'POST', headers: { 'x-admin-key': ADMIN_KEY } });
  if (background) {
    console.log(`[${name}] 호출 → HTTP ${res.status}(Background — 즉시 202가 정상)`);
    return { status: res.status };
  }
  const body = await res.text();
  console.log(`[${name}] 호출 → HTTP ${res.status} | ${body.slice(0, 300)}`);
  return { status: res.status, body };
}

async function count(url) {
  const r = await fetch(url, { method: 'HEAD', headers: { ...HEADERS, Prefer: 'count=exact' } });
  return parseInt((r.headers.get('content-range') || '/0').split('/')[1], 10) || 0;
}

async function backlogCounts() {
  const [pending, planned] = await Promise.all([
    count(`${SUPABASE_URL}/rest/v1/topics?select=id&status=eq.active&editorial_status=eq.pending`),
    count(`${SUPABASE_URL}/rest/v1/topics?select=id&status=eq.active&editorial_status=eq.planned`),
  ]);
  return { pending, planned };
}

// 백그라운드 함수 호출 후, 백로그가 줄어들 때까지 waitMs 간격으로 최대 maxPolls번 확인.
// 매 폴링 사이 진행이 없으면(같은 값 반복) 한 번 더 호출해서 재시도한다.
async function runAndDrain(name, getBacklog, { waitMs = 45000, maxPolls = 6 } = {}) {
  let last = await getBacklog();
  console.log(`[${name}] 시작 전 백로그: ${last}`);
  for (let i = 0; i < maxPolls; i++) {
    await callFn(name, { background: true });
    await sleep(waitMs);
    const now = await getBacklog();
    console.log(`[${name}] poll ${i + 1}/${maxPolls} → 백로그 ${now}`);
    if (now === 0) { console.log(`[${name}] 완료 — 백로그 0`); return true; }
    if (now === last && i >= 2) { console.log(`[${name}] 3회 연속 진행 없음 — 다음 단계로 넘어가되 재확인 필요`); return false; }
    last = now;
  }
  console.log(`[${name}] 최대 폴링 도달, 백로그 ${last} 남음 — 나중에 이 스크립트를 다시 실행하면 이어서 처리됨`);
  return false;
}

async function main() {
  console.log('=== Priority 1 파이프라인 복구 시작:', new Date().toISOString(), '===\n');

  // 0. 최근 생산 확인(이 스크립트 실행 전 기준선)
  const before = await backlogCounts();
  console.log('시작 시점 백로그: pending(계획대기)', before.pending, '| planned(Gate/장문대기)', before.planned, '\n');

  // 1. 수집 체인 재가동(혹시 멈춰 있었다면) — 순서대로 1회씩, 서로 의존하므로 사이에 대기
  console.log('--- 1단계: 수집 체인(혹시 멈췄을 경우 대비) ---');
  await callFn('collect-news');
  await sleep(20000);
  await callFn('process-stories-background', { background: true });
  await sleep(30000);
  await callFn('extract-entities');
  await sleep(15000);
  await callFn('resolve-topics-background', { background: true });
  await sleep(30000);
  await callFn('generate-updates');
  await sleep(10000);

  // 2. Editorial Plan → Gate → Draft → Expansion → Relation Context → Weight
  //    (netlify.toml의 원래 3시간 주기 순서와 동일: 50→52→55→56→58→59)
  console.log('\n--- 2단계: Editorial Plan ---');
  await runAndDrain('generate-editorial-plan-background', async () => (await backlogCounts()).pending);

  console.log('\n--- 3단계: Content Routing Gate ---');
  await callFn('generate-publish-gate-background', { background: true });
  await sleep(45000);

  console.log('\n--- 4단계: Draft 생성 ---');
  await runAndDrain('generate-editorial-draft-background', async () => (await backlogCounts()).planned);

  console.log('\n--- 5단계: Expansion 생성 ---');
  await callFn('generate-expansion-drafts-background', { background: true });
  await sleep(60000);

  console.log('\n--- 6단계: Relation Context ---');
  await callFn('generate-relation-context-background', { background: true });
  await sleep(30000);

  console.log('\n--- 7단계: Weight 재계산(Hero 갱신 포함) ---');
  await callFn('update-topic-weight-background', { background: true });
  await sleep(45000);

  // 최종 확인 체크리스트
  console.log('\n=== 최종 확인 ===');
  const after = await backlogCounts();
  console.log('종료 시점 백로그: pending', after.pending, '(', before.pending, '→', after.pending, ')  planned', after.planned, '(', before.planned, '→', after.planned, ')');

  const heroRes = await fetch(`${SUPABASE_URL}/rest/v1/topics?select=name,importance_score,updated_at&status=eq.active&order=importance_score.desc&limit=1`, { headers: HEADERS });
  const hero = (await heroRes.json())[0];
  console.log('현재 Hero:', hero?.name, hero?.importance_score + 'g', '| 마지막 갱신:', hero?.updated_at);

  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const threadsToday = await count(`${SUPABASE_URL}/rest/v1/topics?select=id&status=eq.active&ai_context->threads->>posted_at=gte.${encodeURIComponent(todayStart)}`);
  console.log('오늘 Threads 게시 수:', threadsToday);

  console.log('\n=== 복구 스크립트 종료:', new Date().toISOString(), '===');
  console.log('백로그가 여전히 남아있으면 이 스크립트를 다시 실행하세요(BATCH_SIZE 한도 때문에 1회로 안 끝날 수 있음).');
}

main().catch((e) => { console.error('복구 스크립트 예외:', e.message); process.exit(1); });
