// 토픽 허브 계약 회귀 테스트 — 실행: node scripts/test-hubs.js
//
// 설계서(노차장 개편 설계서)가 못 박은 요건 중 코드로 강제할 수 있는 것을 고정한다.
// 특히 §6.1(URL에 연도 금지)과 §8.1(제휴 링크 규칙)은 어기면 검색 자산이 리셋되거나
// 페널티 사유가 되므로, 사람이 기억하는 대신 테스트가 막아야 한다.
//
// lib/hubs는 TS이므로 TypeScript 컴파일러로 트랜스파일해 불러온다(scripts/lib에 공용 로더).
const fs = require('fs');
const path = require('path');
const tsc = require('typescript');

function loadTs(relPath, stub) {
  const abs = path.resolve(__dirname, '..', relPath);
  const { outputText } = tsc.transpileModule(fs.readFileSync(abs, 'utf8'), {
    compilerOptions: { module: tsc.ModuleKind.CommonJS, target: tsc.ScriptTarget.ES2020 },
    fileName: path.basename(abs),
  });
  const req = (id) => {
    if (id === '@supabase/supabase-js') return { createClient: () => { throw new Error('DB 조회는 이 테스트에서 쓰지 않습니다'); } };
    if (id === './types') return {};
    if (id.startsWith('./')) return loadTs(path.join(path.dirname(relPath), id + '.ts'));
    return require(id);
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(req, mod, mod.exports);
  return mod.exports;
}

const hubsMod = loadTs('lib/hubs/index.ts');
const { ALL_HUBS, HUB_SLUGS, getHubConfig, findAffiliateSlot } = hubsMod;

const results = [];
const check = (label, pass) => { results.push({ label, pass }); console.log((pass ? 'PASS' : 'FAIL') + ' - ' + label); };

// ── 1. 레지스트리 ──
check(`1) 허브가 최소 1개 등록됨(현재 ${ALL_HUBS.length}개)`, ALL_HUBS.length >= 1);
check('1b) slug가 서로 중복되지 않음', new Set(HUB_SLUGS).size === HUB_SLUGS.length);
check('1c) getHubConfig가 등록된 slug를 찾고 미등록은 null', !!getHubConfig(HUB_SLUGS[0]) && getHubConfig('no-such-hub') === null);
{
  const KINDS = ['product', 'car', 'policy', 'program'];
  check('1d) 모든 허브에 kind가 지정됨(구조화 데이터 타입이 여기서 갈린다)', ALL_HUBS.every((h) => KINDS.includes(h.kind)));
}

// ── 2. URL 규칙 — 설계서 §6.1 (가장 중요) ──
// 연도가 붙으면 해마다 새 URL이 되어 누적 링크·색인 자산이 리셋된다.
{
  const offenders = HUB_SLUGS.filter((s) => /(19|20)\d{2}/.test(s) || /\d{4}-\d{2}/.test(s));
  if (offenders.length) console.log('   위반 slug: ' + offenders.join(', '));
  check('2) slug에 연도·날짜가 없음(§6.1 — 붙이면 색인 자산이 매년 리셋)', offenders.length === 0);
  check('2b) slug가 URL 안전 문자만 사용', HUB_SLUGS.every((s) => /^[a-z0-9-]+$/.test(s)));
}

// ── 3. 제휴 링크 규칙 — 설계서 §8.1 / §8.3 ──
{
  // §8.3: 신차·정책·지원금은 "없음 · 링크 금지". 문서에만 적어두면 나중에 누군가 링크를 넣는다.
  // 그건 되돌리기 어려운 신뢰 손상이므로 테스트가 막는다.
  const FORBIDDEN_KINDS = ['car', 'policy'];
  const violators = ALL_HUBS.filter((h) => FORBIDDEN_KINDS.includes(h.kind) && h.affiliate.allowed);
  if (violators.length) console.log('   위반: ' + violators.map((h) => `${h.slug}(${h.kind})`).join(', '));
  check('3) 신차·정책 허브에 제휴 링크가 없음(§8.3 — 링크 금지 카테고리)', violators.length === 0);

  const forbidden = ALL_HUBS.filter((h) => !h.affiliate.allowed);
  check('3b) 링크 금지 허브는 그 이유를 밝힌다(§6.3-2 — 링크 없는 섹션의 존재가 신뢰의 증거)',
    forbidden.every((h) => typeof h.affiliate.reason === 'string' && h.affiliate.reason.length >= 10));

  const slots = ALL_HUBS.flatMap((h) => (h.affiliate.allowed ? h.affiliate.slots : []));
  check('3c) 제휴 슬롯 id가 전 허브에서 유일함(/go/{slot} 충돌 방지)', new Set(slots.map((a) => a.slot)).size === slots.length);
  check('3d) 슬롯 id가 URL 안전 문자만 사용', slots.every((a) => /^[a-z0-9-]+$/.test(a.slot)));
  if (slots.length) {
    check('3e) findAffiliateSlot이 등록 슬롯을 찾고 미등록은 null',
      !!findAffiliateSlot(slots[0].slot) && findAffiliateSlot('nope-nope') === null);
  }

  // targetUrl은 비어 있거나 https 절대 URL이어야 한다.
  // 상대 경로·http·javascript: 등이 들어가면 /go가 오픈 리다이렉터가 된다.
  const bad = slots.filter((a) => a.targetUrl && !/^https:\/\/[a-z0-9.-]+\//i.test(a.targetUrl));
  if (bad.length) console.log('   잘못된 targetUrl: ' + bad.map((b) => `${b.slot}=${b.targetUrl}`).join(', '));
  check('3f) targetUrl은 비어 있거나 https 절대 URL(오픈 리다이렉터 방지)', bad.length === 0);
  check('3g) 모든 슬롯에 network가 지정됨(표기 문구가 네트워크별로 달라야 한다)', slots.every((a) => !!a.network));

  // 링크 금지 허브의 slug로 /go를 찔러도 아무것도 나오지 않아야 한다.
  const forbiddenSlotLeak = forbidden.some((h) => (h.affiliate.slots || []).length > 0);
  check('3h) 링크 금지 허브에는 슬롯 배열 자체가 없다(타입이 강제)', !forbiddenSlotLeak);
}

// ── 4. 에버그린 4포맷 — 설계서 §3.3 (전 카테고리 공통 골격) ──
{
  const keys = ['howto', 'troubleshoot', 'compare', 'buying'];
  const allHave = ALL_HUBS.every((h) => keys.every((k) => h.evergreen[k] && Array.isArray(h.evergreen[k].items)));
  check('4) 모든 허브가 에버그린 4포맷(사용법/오류해결/비교/구매가이드)을 갖춤', allHave);

  const allLabeled = ALL_HUBS.every((h) => keys.every((k) => typeof h.evergreen[k].label === 'string' && h.evergreen[k].label.length > 0));
  check('4b) 4포맷 각각에 카테고리별 라벨이 있음', allLabeled);

  // §3.3: 허브 1개당 최소 8편
  ALL_HUBS.forEach((h) => {
    const total = keys.reduce((n, k) => n + h.evergreen[k].items.length, 0);
    check(`4c) [${h.slug}] 가이드 ${total}편 — 최소 8편 요건(§3.3) 충족`, total >= 8);
  });

  // href 없는 항목은 링크로 렌더되지 않아야 하므로, href가 있으면 내부 절대경로여야 한다.
  const badHref = ALL_HUBS.flatMap((h) => keys.flatMap((k) => h.evergreen[k].items))
    .filter((g) => g.href && !g.href.startsWith('/'));
  check('4d) 가이드 href는 내부 절대경로만(외부 URL을 본문 링크로 쓰지 않음)', badHref.length === 0);
}

// ── 5. 구조화 데이터에 필요한 필드 — 설계서 §10.5 ──
{
  ALL_HUBS.forEach((h) => {
    check(`5) [${h.slug}] FAQPage용 FAQ가 1개 이상`, Array.isArray(h.faq) && h.faq.length > 0);
    check(`5b) [${h.slug}] FAQ 각 항목에 질문·답변이 모두 있음`, h.faq.every((f) => f.q && f.a));
    // kind별로 필요한 스키마 필드가 다르다. 제도에 brand를 요구하면 안 되고,
    // 가격 미공시 신차에 price를 강제하면 추정치를 구조화 데이터로 내보내게 된다.
    if (h.kind === 'product') {
      check(`5c) [${h.slug}] Product 스키마용 brand·price·currency가 있음`,
        !!h.schema.brand && typeof h.schema.price === 'number' && h.schema.currency === 'KRW');
    } else if (h.kind === 'policy') {
      check(`5c) [${h.slug}] GovernmentService 스키마용 provider가 있음`, !!h.schema.provider);
    } else if (h.kind === 'program') {
      check(`5c) [${h.slug}] SoftwareApplication 스키마용 applicationCategory가 있음`, !!h.schema.applicationCategory);
    } else {
      check(`5c) [${h.slug}] Car 스키마용 brand가 있음`, !!h.schema.brand);
    }
    // 가격을 넣었다면 currency도 반드시 함께 있어야 한다(Offer가 불완전해지지 않게).
    check(`5f) [${h.slug}] price를 넣었으면 currency도 있음`,
      typeof h.schema.price !== 'number' || h.schema.currency === 'KRW');
    check(`5d) [${h.slug}] Person용 에디터 이름·실사용 선언문이 있음(§5.1 E-E-A-T)`,
      !!h.editor?.name && !!h.editor?.statement);
    check(`5e) [${h.slug}] 정의문이 있음(검색 결과·OG 설명)`, typeof h.definition === 'string' && h.definition.length >= 20);
  });
}

// ── 6. 핵심 수치 4칸 + 추이 + 에디터 판단 — 설계서 §3.2 ──
{
  ALL_HUBS.forEach((h) => {
    check(`6) [${h.slug}] 핵심 수치가 4칸`, h.stats.length === 4);
    // 추이는 선택 항목이다(프로그램·일부 제도는 수치 추이가 의미 없다).
    if (h.trend) {
      check(`6b) [${h.slug}] 추이 점이 2개 이상`, h.trend.points.length >= 2);
      const sorted = h.trend.points.every((p, i, arr) => i === 0 || arr[i - 1].date <= p.date);
      check(`6c) [${h.slug}] 추이가 날짜 오름차순(마지막이 최신)`, sorted);
      check(`6d) [${h.slug}] 추이에 제목·라벨·단위가 있음`, !!h.trend.title && !!h.trend.label && !!h.trend.unit);
    }
    // 추이가 없어도 에디터 판단은 항상 있어야 한다(§4.1-2 — 수치만 두면 AI 요약에 먹힌다).
    check(`6e) [${h.slug}] 에디터 판단 1문장이 있음`, typeof h.verdict === 'string' && h.verdict.length >= 20);
    check(`6f) [${h.slug}] 섹션 제목(스펙·타임라인)이 유형에 맞게 지정됨`, !!h.specsTitle && !!h.timelineTitle);
  });
}

// ── 7. 관련 허브 링크가 실제 존재하는 허브만 가리키는지 ──
// 없는 허브로 링크하면 404가 쌓여 색인 품질이 떨어진다. 페이지는 미등록 허브를 링크하지 않고
// "준비 중"으로 표시하도록 구현했으므로, 여기서는 그 판단에 쓰는 데이터가 온전한지만 본다.
{
  const bad = ALL_HUBS.flatMap((h) => h.related).filter((r) => !r.slug || !/^[a-z0-9-]+$/.test(r.slug));
  check('7) 관련 허브 slug 형식이 올바름', bad.length === 0);
}

// ── 8. 라우트·robots 정책이 코드에 실제로 들어있는지(정적 검사) ──
{
  const page = fs.readFileSync(path.resolve(__dirname, '../app/hub/[slug]/page.tsx'), 'utf8');
  check('8) 허브 페이지에 rel="sponsored nofollow"가 있음(§8.1 — 누락 시 페널티 사유)',
    /rel="sponsored nofollow"/.test(page));
  check('8b) 허브 페이지가 Product·FAQPage·Person 스키마를 모두 넣음(§10.5)',
    /'Product'/.test(page) && /'FAQPage'/.test(page) && /'Person'/.test(page));

  const robots = fs.readFileSync(path.resolve(__dirname, '../app/robots.ts'), 'utf8');
  check('8c) robots가 /go/를 disallow(크롤 예산·링크 자산 보호)', /disallow:\s*'\/go\//.test(robots));

  const goRoute = fs.readFileSync(path.resolve(__dirname, '../app/go/[slot]/route.ts'), 'utf8');
  check('8d) /go 라우트가 미등록 슬롯을 404로 막음(오픈 리다이렉터 방지)', /status:\s*404/.test(goRoute));
  check('8e) /go 라우트가 302를 쓴다(목적지 교체가 즉시 반영되도록)', /status:\s*302/.test(goRoute));
}

const failCount = results.filter((r) => !r.pass).length;
console.log(failCount === 0 ? `\n전체 통과(${results.length}개)` : `\n일부 실패(${failCount}/${results.length})`);
process.exitCode = failCount === 0 ? 0 : 1;
