// fix-pm-name-2026-08-21.js — 일회성 사고 대응 함수.
//
// 계기: PM(사용자)이 Threads "제주 실종" 글을 지우다가 무관한 전 역도선수 장미란과
// 엮인 것을 발견 + 뉴스저울에서 현재 국무총리가 아닌 "한덕수"가 지시를 내렸다는
// 내용을 발견(2026-08-21). 조사 결과:
//
//   1) 토픽 "제주 실종 장미란 관련 의혹"(id 9b8f31a1-...)은 AI가 실종자 이름
//      "장미란"을 실제 기사에 없는 "전 국가대표 역도선수"라는 속성과 엮어 만들어낸
//      허위 신원 결합이다(source 기사 어디에도 "전 국가대표"라는 서술 없음). 실존
//      공인을 미확인 실종/허위신고 의혹에 연루된 것처럼 서술해 명예훼손 위험이 큼 —
//      전체 비공개(status 변경) + Threads 게시물 삭제 대상.
//   2) 같은 사고의 다른 갈래로, source 기사가 "한 총리"라 줄여 쓴 것을 AI가
//      "한덕수"(구 총리/전 권한대행)로 잘못 풀어쓴 사례가 최근 21일 내 active
//      토픽 3건에서 발견됨. 실제 현직은 "한성숙"(2026-08-13 한국일보 "빌 게이츠
//      1년 만 방한… 한성숙 국무총리·정기선 HD현대 회장 회동" 원문 기사로 확인).
//      나머지 2건(전남 해상풍력, 가뭄 점검)은 실제 사건 자체는 유효한 뉴스라
//      비공개하지 않고 이름만 정정한다.
//
// 사용: POST /.netlify/functions/fix-pm-name-2026-08-21  body: {}  header: x-admin-key
//   기본은 dry_run(변경 없이 진단만) — body에 { "confirm": true }를 넣어야 실제로 쓴다.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const RETRACT_TOPIC_ID = '9b8f31a1-3153-4dc4-9e5b-8862d8529d62'; // 제주 실종 장미란 관련 의혹
const WRONG_NAME = '한덕수';
const RIGHT_NAME = '한성숙';
const NAME_FIX_TOPIC_IDS = [
  'c5064926-6024-4358-8d40-9ac008b808d4', // 전남 해상풍력 발전단지
  'dc18eb95-7a84-4074-ae1a-a7b1954ae0d4', // 가뭄 및 수급 상황 점검
  '2118d106-f564-4f09-ab65-a91d61856172', // 빌 게이츠 방한
];

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`GET ${table} 실패(${res.status}): ${await res.text()}`);
  return res.json();
}

async function supabasePatch(table, params, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} 실패(${res.status}): ${await res.text()}`);
  return res.json();
}

// ai_context(JSONB)를 문자열로 직렬화 후 오탈자를 치환하고 다시 파싱한다 — draft.lead,
// draft.blocks[].content, expansion_drafts[].lead/body 등 어디에 박혀 있든 한 번에 잡는다.
// 이 두 이름은 고유명사라 부분 문자열 오염(예: 다른 단어 안에 우연히 포함) 위험이 사실상 없다.
function replaceInJson(obj) {
  if (obj == null) return obj;
  const str = JSON.stringify(obj);
  if (!str.includes(WRONG_NAME)) return obj;
  return JSON.parse(str.split(WRONG_NAME).join(RIGHT_NAME));
}

exports.handler = async function (event) {
  const headers = { 'Content-Type': 'application/json' };
  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  if (adminKey !== process.env.ADMIN_KEY) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let confirm = false;
  try {
    confirm = JSON.parse(event.body || '{}').confirm === true;
  } catch {}

  const report = { dry_run: !confirm, retract: null, name_fixes: [] };

  try {
    // 1) 장미란 토픽 — 제목이 사실과 맞는지 대조 후에만 진행(옆 토픽을 잘못 건드리는 사고 방지)
    const [retractTopic] = await supabaseGet('topics', `?id=eq.${RETRACT_TOPIC_ID}&select=id,name,status`);
    if (!retractTopic) throw new Error('retract 대상 토픽을 찾을 수 없음 — id 확인 필요');
    if (retractTopic.name !== '제주 실종 장미란 관련 의혹') {
      throw new Error(`retract 대상 제목 불일치(안전장치 발동): "${retractTopic.name}"`);
    }
    // topics.status는 CHECK (status IN ('active','dormant','closed')) 제약이 걸려 있다
    // (supabase/topics_entities_schema.sql) — 'retracted'는 이 제약을 위반해 최초 시도가
    // 400으로 실패했다(2026-08-21). 'dormant'는 resolve-topics-background.js가 여전히
    // 재병합 후보로 취급하므로 이 사고엔 부적절 — 완전히 닫는 의미의 'closed'를 쓴다.
    report.retract = { id: retractTopic.id, name: retractTopic.name, from_status: retractTopic.status, to_status: 'closed' };
    if (confirm) {
      await supabasePatch('topics', `?id=eq.${RETRACT_TOPIC_ID}`, { status: 'closed' });
    }

    // 2) 이름 오류 정정 3건
    for (const id of NAME_FIX_TOPIC_IDS) {
      const [t] = await supabaseGet('topics', `?id=eq.${id}&select=id,name,summary,description,ai_outlook,ai_counter_view,ai_context`);
      if (!t) {
        report.name_fixes.push({ id, error: '토픽을 찾을 수 없음' });
        continue;
      }
      const patch = {};
      let changed = false;
      for (const field of ['summary', 'description', 'ai_outlook', 'ai_counter_view']) {
        if (typeof t[field] === 'string' && t[field].includes(WRONG_NAME)) {
          patch[field] = t[field].split(WRONG_NAME).join(RIGHT_NAME);
          changed = true;
        }
      }
      const newAiContext = replaceInJson(t.ai_context);
      if (newAiContext !== t.ai_context) {
        patch.ai_context = newAiContext;
        changed = true;
      }
      report.name_fixes.push({ id, name: t.name, changed, fields_changed: Object.keys(patch) });
      if (confirm && changed) {
        await supabasePatch('topics', `?id=eq.${id}`, patch);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify(report, null, 2) };
  } catch (e) {
    console.error('fix-pm-name-2026-08-21 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message, report }) };
  }
};
