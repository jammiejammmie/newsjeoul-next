// generate-relation-context-background-scheduler.js — Scheduler(얇은 레이어). 실제 로직은 generate-relation-context-background.js(Worker)에 있다.
// 근거: PM 지시(2026-07-17, Cron 복구 Phase 2 — Scheduler/Worker 분리).
// netlify.toml의 schedule은 이 함수만 가리켜야 한다 — generate-relation-context-background.js 자체를 직접 스케줄링하지 않는다.
const { dispatch } = require('./lib/cron-guard');

exports.handler = async function (event) {
  return dispatch(event, {
    stage: 'generate-relation-context-background',
    workerPath: '/.netlify/functions/generate-relation-context-background',
    minIntervalMs: 150 * 60 * 1000,
  });
};
