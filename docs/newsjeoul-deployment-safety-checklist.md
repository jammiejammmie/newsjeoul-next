# 뉴스저울 Deployment Safety Checklist v1

근거: 2026-07-17 운영 배포 오염 사고("진단 함수만 Push 승인" → `git push`가 미승인 로컬 커밋 3개를 함께 전송). 이 체크리스트를 통과하지 않으면 Production에 배포하지 않는다.

## 1. Push 전 필수 확인(반드시 명령 실행 결과로, 기억이나 추측 아님)

```bash
git status
git branch --show-current
git fetch origin
git log --oneline origin/master..HEAD
git diff --stat origin/master..HEAD
git diff --name-status origin/master..HEAD
```

`origin/master..HEAD`가 승인받은 작업 **정확히 그것만** 포함하는지 확인한다. 로컬에 다른 미승인 커밋이 쌓여 있으면, 그 커밋들을 먼저 별도 브랜치로 옮기거나 정리한 뒤가 아니면 master에 직접 push하지 않는다.

## 2. Push 직전 반드시 제시하는 Deploy Impact Summary

```
Push 대상 브랜치:
현재 HEAD:
origin/master:
Push될 커밋 수:
Push될 커밋 목록(각각 author 포함):
변경 파일 목록:
새 Function:
새 Endpoint(공개 URL):
새 Cron/Schedule:
새 Workflow 변경:
새 Public URL:
새 Claude API 호출 경로:
새 DB Write 경로:
새 Secret/환경변수 필요 여부:
운영 영향:
승인 범위와 일치 여부:
```

**사용자 승인 없이는 위 요약을 제시한 이후에도 Push하지 않는다.** "이 정도는 승인 범위 안에 있을 것"이라는 자체 판단으로 확장하지 않는다.

## 3. Migration 적용 원칙

- Migration은 기능을 켜는 작업이 아니라 **그 기능이 가진 위험을 함께 켜는 작업**으로 취급한다.
- Migration이 활성화할 코드 경로(신규 테이블/컬럼을 사용하는 함수)의 인증·인가·에러 처리가 이미 검증되지 않았다면, Migration을 먼저 적용하지 않는다 — 코드 검증이 항상 Migration 적용보다 먼저다.
- Migration 적용 자체도 위 Deploy Impact Summary와 동일한 수준의 사전 요약 후 승인을 받는다.

## 4. Scheduler/자동 실행 함수 설계 원칙

- 새로 추가하는 모든 함수는 `netlify/functions/` 아래에 놓이는 순간 이미 배포된 공개 Endpoint로 취급한다(`netlify.toml`의 `schedule` 등록 여부와 무관).
- Scheduler 성격의 함수는 "누가 호출하는가"를 중복 실행 방지·빈도 제한보다 **먼저** 검증한다.
- 로깅/분류 목적의 헤더 체크와 인가(요청을 거부할지 결정하는) 로직은 반드시 분리해서 작성하고, 후자가 없으면 그 자체로 미완성 코드로 간주한다.
- Prototype/실험용 코드는 운영 배포 경로(`netlify/functions/`)가 아니라 별도 위치(`prototype/`, `experimental/`)에 두고, 실제 배포 대상으로 옮길 때 별도 승인을 받는다.

## 5. 작업 격리(브랜치 전략)

- master에는 승인된 작업만 merge한다.
- 기능별로 별도 브랜치를 사용한다. 예: `fix/netlify-cron`, `fix/threads`, `feature/scheduler-worker`, `feature/automation-health`.
- 여러 세션·에이전트가 같은 저장소를 동시에 쓸 가능성이 있으면 `git worktree`, 별도 clone, 또는 세션별 feature branch 중 하나를 사용한다.
- 승인받은 커밋만 골라서 필요하면 `cherry-pick`으로 별도 브랜치에 옮긴 뒤 push한다 — master에 쌓인 순서 그대로 push하지 않는다.

## 6. Rollback 기준

다음 중 하나라도 해당하면 즉시 Rollback을 요청한다(임의 실행은 하지 않고, 요청 형식으로 먼저 보고):
- 승인 범위를 벗어난 코드가 Production에 배포된 것이 확인된 경우
- 배포 후 실제 비용 발생(Claude API 등)이 확인됐거나 확인되지 않은 채로 임박한 경우
- 인증 없이 공개 접근 가능한 상태에서 DB Write 또는 외부 유료 API 호출이 가능한 상태로 확인된 경우

## 7. Kill Switch 기준

다음 조건을 모두 만족할 때만 Kill Switch(코드 배포로 즉시 차단) 대신 "현재 상태 유지"를 선택할 수 있다:
- 실제 DB 스키마 확인 결과, 문제의 코드 경로가 필수 테이블/컬럼 부재로 인해 확정적으로 실행 전에 실패함이 코드 로직 + 직접 조회로 모두 확인된 경우
- 그 필수 테이블/컬럼을 추가하는 Migration이 승인 없이 적용될 가능성이 없다고 확인된 경우(예: Migration 자체가 별도 승인 필요 목록에 있고, 그 승인이 나기 전까지는 실행되지 않음이 운영 규칙으로 확정된 경우)

위 두 조건 중 하나라도 불확실하면 Kill Switch를 우선한다. "지금 당장은 안전해 보인다"는 판단만으로 Kill Switch를 미루지 않는다.

## 8. Post-Deploy 확인

- 배포 후 Deploy ID, 배포된 commit SHA, `state: ready` 여부를 Netlify API로 직접 확인한다.
- Git SHA와 Deploy SHA가 정확히 일치하는지 확인한다.
- 새로 추가된 함수가 있다면 `searchSiteFunctions`로 실제 공개 Endpoint 목록에 나타나는지 확인한다.
