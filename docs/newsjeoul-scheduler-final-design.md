# 뉴스저울 Scheduler Final Design v1

목표: 인증/실행/Worker/Lock/Logging을 하나의 구조로 단순화. **이전 설계(19개 `*-scheduler.js` + 별도 Worker로 HTTP 포워딩)를 폐기하고, 기존 Worker 파일 자체에 공용 가드 함수를 붙이는 방식으로 대체한다.** 새 공개 Endpoint를 만들지 않는다 — 이게 이번 사고의 근본 원인(파일이 존재하는 순간 공개 Endpoint가 된다는 사실을 놓친 것)을 구조적으로 없애는 방법이다.

## 1. 핵심 결정 — Scheduler/Worker 분리 폐기

이전 설계는 "Scheduler가 Worker를 HTTP로 호출하며 서버측 ADMIN_KEY를 첨부"하는 구조였다. 이건 (a) 19개의 새 공개 Endpoint를 만들고 (b) 그 Endpoint 각각에 별도로 인증을 걸어야 하는 부담을 만들었다. **더 단순한 답은 새 Endpoint를 아예 안 만드는 것이다.** 기존 Worker 파일(`collect-news.js` 등) 자체의 핸들러 최상단에 인증+잠금 로직을 붙이면, 새 URL도 새 위험 표면도 생기지 않는다.

## 2. 구조도

```
[이전 설계 — 폐기]
Public URL(신규)
        │
        ▼
Scheduler(cron-guard dispatch) ← 인증 없음
        │ (서버측 ADMIN_KEY 첨부)
        ▼
Worker(기존 URL)


[신규 설계]
기존 Worker URL(신규 URL 없음)
        │
        ▼
handler 최상단에서 guardScheduledOrManual() 호출
   ├─ 1. 인가 확인(최우선) — x-netlify-event(실제 값 확인된 것) 또는 유효한 x-admin-key
   │      → 아니면 즉시 401, 이후 코드 전혀 실행 안 함
   ├─ 2. 잠금/빈도 확인(cron_locks 있으면 사용, 없으면 이 단계 생략하고 통과 — Migration 비의존)
   └─ 3. 통과 시 기존 Worker 로직 그대로 실행
```

## 3. 공용 모듈(`lib/schedule-guard.js`, 제안 코드)

```js
async function guardScheduledOrManual(event, stageName, { minIntervalMs = 60000 } = {}) {
  // 1. 인가 확인 — 반드시 최우선, 잠금 로직보다 앞에 위치
  const isRealSchedule = event.headers?.['x-netlify-event'] === 'schedule'; // 값 확인 후 반영
  const adminKey = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
  const isValidManual = adminKey === process.env.ADMIN_KEY;
  if (event.httpMethod && !isRealSchedule && !isValidManual) {
    return { authorized: false, response: { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) } };
  }

  // 2. 잠금/빈도 확인 — Migration 미적용이어도 동작(try/catch로 옵셔널화, progressive enhancement)
  try {
    const [lock] = await supabaseGet('cron_locks', `?stage=eq.${stageName}&select=*`);
    if (lock?.running) return { authorized: true, skip: true, response: { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'already_running' }) } };
    if (lock?.last_success_at && Date.now() - new Date(lock.last_success_at).getTime() < minIntervalMs) {
      return { authorized: true, skip: true, response: { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'too_soon' }) } };
    }
    await supabaseUpsert('cron_locks', { stage: stageName, running: true, started_at: new Date().toISOString() }, 'stage');
  } catch (e) {
    console.log(`cron_locks 미사용(Migration 미적용 추정, ${stageName}) — 잠금 없이 진행:`, e.message);
  }

  return {
    authorized: true, skip: false,
    release: async (success) => {
      await supabaseUpsert('cron_locks', { stage: stageName, running: false, ...(success ? { last_success_at: new Date().toISOString() } : {}) }, 'stage').catch(() => {});
    },
  };
}
```

## 4. 각 Worker 적용 패턴(모든 19개 파일에 동일하게)

```js
exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const guard = await guardScheduledOrManual(event, 'collect-news', { minIntervalMs: 150 * 60 * 1000 });
  if (!guard.authorized) return guard.response;
  if (guard.skip) return guard.response;

  try {
    // ... 기존 로직 그대로 ...
    await guard.release(true);
    return successResponse;
  } catch (e) {
    await guard.release(false);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
```

기존 `if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {...}` 블록(19개 파일 전부)을 이 패턴으로 교체한다.

## 5. Migration 의존성

- **인가(1번)는 Migration과 무관** — 오늘 헤더 값만 확인되면 바로 배포 가능.
- **잠금(2번)은 `cron_locks` 테이블이 있어야 완전히 동작**하지만, 없어도 예외적으로 통과시키도록(try/catch) 설계해서 **Migration 전에도 인가 로직만으로 안전하게 배포 가능**하다. Migration은 "잠금 기능을 강화하는" 나중 단계로 격하된다.

## 6. 제거 대상

- `netlify/functions/*-scheduler.js` 19개 파일 전부 삭제
- `netlify/functions/lib/cron-guard.js` → `lib/schedule-guard.js`로 교체(이름도 "Scheduler/Worker 분리"라는 폐기된 개념을 안 남기도록 변경)
- `netlify.toml`의 스케줄은 기존 Worker 파일명을 그대로 가리키도록 유지(변경 불필요 — 애초에 스케줄은 Worker를 직접 가리키고 있었음)

## 7. 완료 기준

- Mock 테스트: (a) 유효한 스케줄 헤더 → 통과 / (b) 유효한 관리자 키 → 통과 / (c) 둘 다 없음 → 401 / (d) `cron_locks` 조회 실패(테이블 없음 시뮬레이션) → 그래도 인가만 맞으면 통과 / (e) 잠금 상태면 skip / (f) 최소 간격 미달이면 skip
- 배포 후 실제 Scheduled Invocation 최소 2회 연속 성공 확인(로그로 직접 확인 — collect-news 등 원본 워커의 정상 실행 로그, Duration이 5ms가 아니라 실제 처리시간인지 확인)
