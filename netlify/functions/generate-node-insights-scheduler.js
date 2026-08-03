// generate-node-insights-scheduler.js — Scheduler(얇은 레이어). 실제 로직은
// generate-node-insights-background.js(Worker)에 있다.
// 근거: PM 지시(2026-07-17, Cron 복구 Phase 2 — Scheduler/Worker 분리).
// netlify.toml의 schedule은 이 함수만 가리켜야 한다 — Worker 자체를 직접 스케줄링하지 않는다.
// 2026-08-03: Worker가 동기 26초 캡을 넘겨 504로 실패하고 있어 Background Function으로
// 전환했다 — workerPath도 -background 경로로 함께 옮겼다(경로가 안 맞으면 조용히 404가 된다).
const { dispatch } = require('./lib/cron-guard');

exports.handler = async function (event) {
  return dispatch(event, {
    stage: 'generate-node-insights',
    workerPath: '/.netlify/functions/generate-node-insights-background',
    minIntervalMs: 1200 * 60 * 1000,
  });
};
