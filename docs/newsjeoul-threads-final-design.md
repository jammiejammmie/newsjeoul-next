# 뉴스저울 Threads Final Design v1

목표: 한 번 승인하면 그대로 구현·배포해서 쓸 수 있는 구조. 핵심 설계 변경점은 **핵심 중복방지 로직을 신규 Migration에 의존하지 않게 만든 것**이다 — 기존 설계는 `threads_posts`의 신규 컬럼이 없으면 후보 조회 자체가 실패했는데(2026-07-17 직접 확인), 이번 설계는 기존 `topics.ai_context`(이미 존재하는 jsonb 컬럼)만으로 핵심 기능이 전부 동작하도록 바꿨다.

## 1. Trigger 정리 — 두 개의 트리거 문제 해결

현재 GitHub Actions(`post-threads.yml`, `0 1 * * *`)와 Netlify 자체 schedule(`netlify.toml`의 `post-threads` `0 1 * * *`)이 같은 시각에 동시 존재한다. Scheduler 헤더명이 고쳐지면 두 트리거가 같은 순간 동시 발동할 위험이 생긴다.

**결정**: `netlify.toml`에서 `[functions."post-threads"] schedule = "0 1 * * *"` 줄을 제거한다. **GitHub Actions만을 유일한 트리거로 유지**한다(이미 실사용 이력이 있고, Secret 관리도 이미 GitHub 쪽에 구성돼 있음).

## 2. 후보 선정 — Migration 비의존 설계

```js
async function fetchCandidateTopic() {
  const cutoff = new Date(Date.now() - 86400000).toISOString();
  // ai_context->threads->>posted_at 이 없거나(한 번도 게시 안 함) 24시간보다 오래됐으면 후보
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,slug,name,summary,importance_score,ai_context` +
    `&status=eq.active&editorial_status=eq.published` +
    `&or=(ai_context->threads->>posted_at.is.null,ai_context->threads->>posted_at.lt.${encodeURIComponent(cutoff)})` +
    `&order=importance_score.desc&limit=5`,
    { headers }
  );
  if (!res.ok) throw new Error('topics 조회 실패: ' + await res.text());
  const rows = await res.json();
  return rows[0] || null;
}
```

이 쿼리는 **기존 `topics.ai_context` 컬럼만 사용** — `threads_posts`의 신규 컬럼이나 `cron_locks`류 신규 테이블에 전혀 의존하지 않는다. Migration 없이 지금 당장 구현·배포 가능하다.

## 3. Claude 호출 순서 — 자격 증명 확인을 최우선으로

기존 결함(Claude 호출 뒤에 `THREADS_USER_ID`/`THREADS_ACCESS_TOKEN` 확인)을 제거한다.

```
handler:
  1. THREADS_USER_ID / THREADS_ACCESS_TOKEN 존재 확인 → 없으면 즉시 500, Claude 호출 안 함
  2. fetchCandidateTopic() → 없으면 200 skip
  3. generateHookCopy() → Claude 호출(이 시점부터 비용 발생)
  4. createContainer() + publishPost() → Threads API
  5. 성공 시: topics.ai_context.threads 갱신(핵심, 항상 수행) + threads_posts 상세 로그(best-effort)
```

## 4. Dedup — 이중 구조

- **1차(필수, Migration 불필요)**: 성공 시 `supabasePatch('topics', ..., { ai_context: { ...topic.ai_context, threads: { posted_at, post_id, hook_type } } })`. 이건 기존 `ai_context` merge 패턴을 그대로 재사용 — 이 프로젝트 전체에서 이미 검증된 패턴.
- **2차(선택, 상세 로그용, Migration 필요)**: `threads_posts`에 `topic_id/hook_type/editors/status/failure_reason/source_url` INSERT는 **best-effort**로 시도한다. 실패해도 예외를 던지지 않고, **1차 dedup(ai_context)은 이미 완료된 뒤**이므로 핵심 기능에 영향 없음.

## 5. Error Handling

```js
try {
  // 1~2단계
} catch (e) {
  return 500; // Claude 호출 전 실패 — 비용 없음
}

// 3단계(Claude) 이후부터는 실패해도 "비용은 이미 발생했다"는 사실을 명확히 로그+응답에 남긴다
try {
  const hook = await generateHookCopy(...);
} catch (e) {
  console.error('THREADS_CLAUDE_CALL_FAILED:', e.message); // 비용 발생 여부 불확실 — 이후 조사 가능하도록 명확한 prefix
  return 500;
}

try {
  postId = await createContainer/publishPost(...);
} catch (e) {
  console.error('THREADS_POST_FAILED_AFTER_CLAUDE_CALL:', e.message); // 명시적으로 "Claude 비용은 발생했으나 게시 실패"임을 표시
  return 500;
}

// 여기 도달했으면 게시 성공 — dedup 갱신은 반드시 수행
await supabasePatch('topics', ..., {...}); // 실패 시 throw(이건 던져도 됨 — 이미 게시는 성공했고, 재시도해도 게시가 중복되진 않음. 무엇보다 이 실패는 반드시 알아야 함)
await savePostLog({...}).catch((e) => console.error('THREADS_LOG_SAVE_FAILED(비필수):', e.message)); // best-effort
```

## 6. Migration(선택 사항, 나중에 적용 가능)

`threads_posts_extend_migration.sql`은 그대로 유지하되, **핵심 기능의 필수 조건에서 제외됐으므로 Release Plan에서 우선순위를 낮출 수 있다**(적용 안 해도 Threads 정상 동작).

## 7. 완료 기준

- 이 설계는 **Migration 없이 로컬 Mock 테스트만으로 전체 흐름 검증 가능**
- 승인 후 구현 → Mock 테스트(자격증명 우선확인/후보없음 skip/성공시 dedup 갱신/Claude 실패시 500/게시 실패시 Claude 비용 발생 사실 로그 확인) → 배포 → 실제 dry-run(`?dry=true`)으로 안전 확인 → 실제 게시 1건 확인 → 다음 자동 실행(GitHub Actions) 1회 성공 확인
