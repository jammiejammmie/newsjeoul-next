// collect-news-scheduler.js — Scheduler(얇은 레이어). 실제 로직은 collect-news.js(Worker)에 있다.
// 근거: PM 지시(2026-07-17, Cron 복구 Phase 2 — Scheduler/Worker 분리).
// netlify.toml의 schedule은 이 함수만 가리켜야 한다 — collect-news.js 자체를 직접 스케줄링하지 않는다.
const { dispatch } = require('./lib/cron-guard');

exports.handler = async function (event) {
  return dispatch(event, {
    stage: 'collect-news',
    workerPath: '/.netlify/functions/collect-news',
    minIntervalMs: 150 * 60 * 1000, // 3시간 주기 스케줄 대비 최소 간격(150분) — 과빈도 호출 방지
  });
};
