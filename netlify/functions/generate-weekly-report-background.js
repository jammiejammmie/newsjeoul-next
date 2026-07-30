// generate-weekly-report-background.js — Evolution Engine Track 2-3
// 근거: 마스터 스펙 v1 Track 2-3("이게 오늘 우리가 수동으로 했던 진단을 시스템이 스스로 하는
// 버전"). 2026-07-30 세션에서 수동으로 했던 카테고리 분포/에디터 활용률 진단을 매주 월요일
// 자동으로 재실행해 weekly_reports에 저장한다. admin 화면에서 최신 리포트를 보여준다(Track2-2).
//
// 안전장치: weekly_reports 테이블이 마이그레이션 전이면 저장은 실패하지만 함수는 정상 종료
// (CHANGELOG.md BLOCKED 참고, distribution_skip_log와 동일 패턴).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseGet(table, params) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
  });
  if (!res.ok) throw new Error(`GET ${table} 실패: ` + await res.text());
  return res.json();
}

function mondayOfThisWeek() {
  const now = new Date();
  const day = now.getUTCDay(); // 0=일
  const diff = (day + 6) % 7; // 월요일까지 며칠 전인지
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

async function computeCategoryDistribution(since) {
  const rows = await supabaseGet('topics', `?select=category&editorial_status=eq.published&created_at=gte.${encodeURIComponent(since)}&limit=2000`);
  const dist = {};
  rows.forEach((r) => { dist[r.category] = (dist[r.category] || 0) + 1; });
  return { total: rows.length, byCategory: dist };
}

async function computeEditorUtilization(since) {
  const editors = await supabaseGet('editors', '?select=perspective_tag,assignment_count,last_assigned_at');
  const byTag = {};
  editors.forEach((e) => {
    const tag = e.perspective_tag || '(미지정)';
    if (!byTag[tag]) byTag[tag] = { editors: 0, total_assignment_count: 0, active_this_week: 0 };
    byTag[tag].editors += 1;
    byTag[tag].total_assignment_count += e.assignment_count || 0;
    if (e.last_assigned_at && e.last_assigned_at >= since) byTag[tag].active_this_week += 1;
  });
  const zeroAssignment = Object.entries(byTag)
    .filter(([, v]) => v.total_assignment_count === 0)
    .map(([tag]) => tag);
  return { byTag, zeroAssignment };
}

async function saveReport(reportWeekStart, categoryDist, editorUtil) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/weekly_reports`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      report_week_start: reportWeekStart,
      category_distribution: categoryDist,
      editor_utilization: editorUtil.byTag,
      zero_assignment_perspectives: editorUtil.zeroAssignment,
    }),
  });
  if (!res.ok) {
    console.error('WEEKLY_REPORT_SAVE_FAILED(마이그레이션 미적용 가능성):', await res.text());
    return { saved: false };
  }
  return { saved: true };
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
    const monday = mondayOfThisWeek();
    const sinceIso = monday.toISOString();
    const [categoryDist, editorUtil] = await Promise.all([
      computeCategoryDistribution(sinceIso),
      computeEditorUtilization(sinceIso),
    ]);
    const result = await saveReport(monday.toISOString().slice(0, 10), categoryDist, editorUtil);

    console.log(`WEEKLY_REPORT: 이번 주(${monday.toISOString().slice(0, 10)}~) 발행 ${categoryDist.total}건, 0회 배정 perspective ${editorUtil.zeroAssignment.length}개`);
    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, reportWeekStart: monday.toISOString().slice(0, 10), categoryDistribution: categoryDist, zeroAssignmentPerspectives: editorUtil.zeroAssignment, saved: result.saved }),
    };
  } catch (e) {
    console.error('generate-weekly-report-background 에러:', e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
