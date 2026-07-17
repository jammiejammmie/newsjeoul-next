// generate-zeitgeist-background-scheduler.js — Scheduler(얇은 레이어). 실제 로직은 generate-zeitgeist-background.js(Worker)에 있다.
// 근거: PM 지시(2026-07-17, Cron 복구 Phase 2 — Scheduler/Worker 분리).
// netlify.toml의 schedule은 이 함수만 가리켜야 한다 — generate-zeitgeist-background.js 자체를 직접 스케줄링하지 않는다.
const { dispatch } = require('./lib/cron-guard');

exports.handler = async function (event) {
  return dispatch(event, {
    stage: 'generate-zeitgeist-background',
    workerPath: '/.netlify/functions/generate-zeitgeist-background',
    minIntervalMs: 1200 * 60 * 1000,
  });
};
