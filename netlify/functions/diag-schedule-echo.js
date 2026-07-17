// diag-schedule-echo.js — 진단 전용, 임시(2026-07-17)
// 목적: 실제 Netlify Scheduled Function 호출이 어떤 event 모양으로 들어오는지 확인.
// DB 접근/쓰기/외부 API 호출 전혀 없음. 민감한 헤더 값(x-admin-key, authorization, cookie 등)은
// 절대 로그에 남기지 않는다 — 헤더 "이름 목록"만 남기고, 값은 x-nf-event 하나만 남긴다.
// 원인 확인 후 반드시 삭제할 것(PM 지시).

const SENSITIVE_HEADERS = new Set(['x-admin-key', 'authorization', 'cookie', 'set-cookie']);

exports.handler = async function (event) {
  const headerNames = Object.keys(event.headers || {});
  const safeHeaderPreview = {};
  headerNames.forEach((name) => {
    const lower = name.toLowerCase();
    if (SENSITIVE_HEADERS.has(lower)) {
      safeHeaderPreview[name] = '(민감정보 — 로그 생략)';
    } else if (lower === 'x-nf-event') {
      safeHeaderPreview[name] = event.headers[name];
    } else {
      safeHeaderPreview[name] = '(값 생략)';
    }
  });

  let bodyPreview = null;
  try {
    if (event.body) {
      const parsed = JSON.parse(event.body);
      bodyPreview = { next_run: parsed.next_run, keys: Object.keys(parsed) };
    }
  } catch (e) {
    bodyPreview = { parseError: true, rawLength: (event.body || '').length };
  }

  const diagnostic = {
    invokedAt: new Date().toISOString(),
    httpMethod: event.httpMethod,
    headerNames,
    headerPreview: safeHeaderPreview,
    isBase64Encoded: event.isBase64Encoded,
    bodyPreview,
    queryStringParameters: event.queryStringParameters ? Object.keys(event.queryStringParameters) : null,
  };

  console.log('DIAG_SCHEDULE_ECHO:', JSON.stringify(diagnostic));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(diagnostic),
  };
};
