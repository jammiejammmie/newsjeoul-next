# ADR-001 — Scheduler/Worker `dispatch()` 인증 부재 설계 결함

**상태**: 확정된 사실 기록 + 수정 설계안(코드 미배포). 관련: DEC-008(Cron 복구), 2026-07-17 운영 배포 오염 사고.

## 1. 최초 설계 의도

Netlify Scheduled Function이 관리자 키 없이 호출돼 401을 받는 문제(Phase 1)를 근본적으로 없애기 위해, "외부에 노출되는 얇은 Scheduler가 실행 요청만 전달하고, 실제 업무 로직은 서버측 ADMIN_KEY로만 호출되는 Worker에 있다"는 구조를 제안했다(PM 지시 2026-07-17, Cron 복구 Phase 2). 목적은 두 가지였다: (1) Netlify의 스케줄 호출은 인증 없이도 통과시키고, (2) 워커 자체의 엄격한 인증은 그대로 유지한다.

## 2. 왜 인증이 빠졌는가

`dispatch()`를 설계할 때 "이 호출이 스케줄에서 온 것인지 수동 호출인지"를 구분하는 로직(`event.headers['x-nf-event']` 체크)을 작성했다. 이 로직은 **오직 감사 로그에 남길 `source` 문자열("schedule"/"manual"/"unknown")을 결정하는 데만** 쓰였고, 이 값이 `"unknown"`일 때 요청을 거부하는 조건문을 별도로 작성하지 않았다. 즉 "누가 호출했는지 기록은 한다"와 "누가 호출했는지 검증해서 막는다"를 같은 것으로 착각했다 — 로깅과 인가(authorization)를 혼동한 것이 직접적 원인이다.

## 3. 왜 중복 실행만 고려했는가

이 설계를 만든 배경이 "Cron이 자동으로 안 돈다"는 가용성 문제였기 때문에, 사고가 온통 "호출이 왔을 때 중복으로 겹치지 않게" 쪽으로만 쏠렸다. `cron_locks`의 `running`/`last_success_at`은 전부 "동시에 여러 번 돌면 안 된다"는 요구만 반영했고, "애초에 이 호출을 받아들일지 말지"는 설계 항목에 없었다. 스케줄과 무관하게 새로 만든 모든 public Function은 그 자체로 새로운 위험 표면이 된다는 전제를 처음부터 놓쳤다.

## 4. 이번 사고로 배운 것

- `netlify/functions/` 하위에 파일을 만드는 것 자체가 `netlify.toml`의 `schedule` 등록 여부와 무관하게 즉시 공개 Endpoint를 만든다. "스케줄을 안 걸었으니 비활성"이라는 판단은 틀렸다 — 파일이 존재하는 순간 이미 활성이다.
- "인증 로깅"과 "인증 검증"은 다른 것이다. 헤더를 읽어서 분류하는 코드가 있다고 해서 인가가 되는 게 아니다.
- 이번 사고에서 실제로 Worker까지 도달하지 못한 이유는 설계된 방어가 작동해서가 아니라, `cron_locks` 마이그레이션이 우연히 미적용 상태였기 때문이다(2026-07-17 직접 확인: `PGRST205 — Could not find the table 'public.cron_locks'`). 이 우연한 차단은 마이그레이션이 적용되는 순간 사라진다.
- Migration 적용은 "기능을 켜는 작업"이 아니라 "그 기능이 가진 위험을 함께 켜는 작업"이라는 인식이 없었다.

## 5. 앞으로 Scheduler 설계 원칙

1. **"누가 호출하는가"를 중복 실행 방지보다 먼저 검증한다.** 어떤 형태로든(공유 시크릿, IP 검증, 서명 검증 등) 인가되지 않은 호출은 잠금 로직에 도달하기 전에 거부한다.
2. **로깅용 헤더 분류와 인가 결정은 반드시 분리된 코드 경로로 작성한다.** "이 호출이 스케줄인 것 같다"는 판단이 "이 호출을 받아들인다"는 결정이 되지 않게 한다.
3. **`netlify/functions/` 아래에 새 파일을 추가하는 순간부터 그 파일은 이미 배포된 공개 Endpoint로 취급한다.** `netlify.toml`의 `schedule` 등록 여부와 무관하다.
4. **Migration을 적용하기 전에, 그 Migration이 활성화할 코드 경로의 인증·인가가 이미 검증됐는지 반드시 먼저 확인한다.**
5. **Prototype/실험용 Scheduler·Worker 코드는 운영 배포 대상 디렉터리(`netlify/functions/`)가 아니라 별도 위치(`prototype/`, `experimental/` 등 빌드·배포 파이프라인에서 제외되는 경로)에 둔다.**

## 6. 수정 설계안(코드 미배포 — 승인 후 구현)

`dispatch()`에 아래 인가 검증을 잠금 확인보다 먼저 추가한다(제안, 미구현):

```js
async function dispatch(event, opts) {
  // 1. 인가 검증(잠금/빈도 확인보다 먼저) — 신규
  const isGenuineSchedule = event.headers?.['x-netlify-event'] === 'schedule'; // 값 확인 후 정확한 헤더명/값으로 교체
  const hasValidAdminKey = event.headers?.['x-admin-key'] === process.env.ADMIN_KEY;
  if (!isGenuineSchedule && !hasValidAdminKey) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }
  // 2. (기존) 중복 실행 방지, 최소 간격 확인, 워커 호출...
}
```

이 변경은 `x-netlify-event`의 실제 값이 확인된 뒤, 그리고 PM 승인 후에만 구현·배포한다.
