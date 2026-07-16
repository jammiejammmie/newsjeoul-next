# 뉴스저울 Publish Gate 설계서 (v1)

> PM 지시(2026-07-14, 운영 데이터 기반): CTR Engine보다 먼저 "무엇을 발행할 것인가"를 결정하는 Gate가 필요하다.
> 이 문서는 **설계만** 다룬다 — 코드 구현은 포함하지 않는다.

## 0. 한 줄 결론

**Publish Gate는 클릭률을 높이는 장치가 아니라, 뉴스저울답지 않은 Topic이 장문 생성(비용이 드는 단계)에 아예 들어가지 못하게 막는 문지기다.** CTR Engine이 "여럿 중 무엇을 먼저 보여줄까"를 고르는 정렬 장치라면, Publish Gate는 그보다 앞서 "애초에 이 후보를 리스트에 넣을 가치가 있는가"를 판단한다. 이번 운영 데이터 전수조사에서 저CTR 행정성 Topic("취약계층 반려동물 의료비 지원" 등)이 필터 없이 전부 장문 생성까지 도달한 것이 확인됐고, 이게 ①LLM 비용 낭비 ②Home 품질 저하 ③CTR Engine이 나쁜 콘텐츠까지 정렬해야 하는 부담으로 이어진다는 게 이 설계의 출발점이다.

## 1. 파이프라인 위치

**현재**:
```
Collect → Stories → Topics → Editorial Plan → Draft → QA → Published
```

**변경 후**:
```
Collect → Stories → Topics → Editorial Plan → Publish Gate → Draft → QA → Published
                                                     │
                                                     ├─ PUBLISH_LONG → Draft 진행(기존 흐름 그대로)
                                                     ├─ PUBLISH_SHORT → Draft 스킵, 기존 요약형 폴백으로 종결
                                                     ├─ HOLD → 대기(사람 검토 또는 다음 주기 재평가)
                                                     └─ REJECT → Draft 영구 스킵, 노출 후보에서 제외
```

신규 함수 `generate-publish-gate-background.js`(Background Function, Editorial Engine 4개 함수와 동일 패턴)가 `editorial_status='planned'`이면서 `gate_status='pending_gate'`인 Topic을 대상으로 실행된다. 스케줄은 `generate-editorial-plan-background`(:50)와 `generate-editorial-draft-background`(:55) 사이— 예: `52 */3 * * *`.

**경합 안전장치**: `generate-editorial-draft-background`의 대상 쿼리를 `editorial_status=eq.planned` 단독에서 `editorial_status=eq.planned&gate_status=eq.publish_long`로 변경한다. Gate가 아직 그 주기에 못 돈 Topic은 자동으로 다음 주기까지 draft 생성 대상에서 제외되므로, 정확한 분 단위 타이밍에 의존하지 않고도 순서가 깨지지 않는다(기존 파이프라인의 "이번 주기에 못 처리하면 다음 주기가 이어받는다" 관성과 동일한 안전 패턴).

## 2. 평가 기준

Content Bible §1(CTR 4문항)과 CTR 바이블 §1·§5를 코드가 판단 가능한 기준으로 분해한다. 두 단계로 나눈다 — **Rule 예비필터(무료, 결정론적)** 다음 **LLM 정성 판단(1회 호출)**. 이 구조는 `generate-editorial-plan-background.js`의 기존 `DETECTION_PATTERNS` 예비필터 패턴을 그대로 재사용한다(신규 발명 아님).

### 2-1. Rule 예비필터 — 명백한 REJECT만 코드로 즉시 처리

`process-stories.js`의 `shouldSkipStory`(news-filters.js)가 이미 광고/스포츠/연예를 걸러내는 것과 같은 원리로, 아래 패턴에 강하게 해당하면 LLM 호출 없이 바로 `REJECT`:
- 제목에 "○○구/시/군 + 개통/개최/모집/공고/안내/시행" 조합(지자체 행정 공지 전형 패턴)
- "보도자료", "○○청 발표"류 표현이 사건성 없이 단독으로 등장
- Content Bible §4의 금지 문구·§1의 "절대 제외" 예시와 문자열 유사도가 높은 경우

이 단계는 CTR 바이블 §5에 이미 예시로 박제된 "경기도 이주민 포털 개통", "취약계층 반려동물 의료비 지원" 같은 케이스를 **비용 0원으로** 잡아내는 것이 목적이다. 애매하면(Rule이 확신 없으면) 다음 단계로 넘긴다 — Rule은 "확실한 것만" 잡고 억지로 넓히지 않는다.

### 2-2. LLM 정성 판단 — 8개 기준 + CTR 4문항

Rule을 통과한 Topic만 LLM 1회 호출로 아래 8개 항목을 판단한다(PM 지시 항목을 그대로 채택):

| 기준 | 질문 | 응답 형식 |
|---|---|---|
| 탐험성 | 이 Topic에서 다른 인물/기관/사건으로 이어질 실마리가 있는가 | true/false + 근거 |
| 연결 가능성 | 기존에 이미 존재하는 다른 Topic과 연결될 개연성이 있는가 | true/false + 근거 |
| 공지성 | 단순 발표/공지로 끝나고 후속 전개 여지가 없는가(= 있으면 REJECT 방향) | true/false |
| 지역 행정성 | 특정 지자체 행정 사무에 국한되는가(= 있으면 REJECT 방향) | true/false |
| "왜?" 유발력 | 독자가 배경/이유를 궁금해할 만한 사건인가 | true/false + 근거 |
| 사회적 파급력 | 특정 소수를 넘어 더 넓은 사회적 영향이 있는가 | 0~2(없음/일부/넓음) |
| 시간성 | 지금 당장 다뤄야 하는 속보성인가, 며칠 늦어도 무방한가 | breaking/evergreen |
| 배경설명 필요도 | 장문으로 풀어야 할 만큼 맥락이 복잡한가(= 낮으면 SHORT 방향) | 0~2 |

추가로 CTR 바이블 §1의 4문항(내가 클릭할까/가족이 궁금해할까/Threads에서 멈출까/유튜브 썸네일이었다면 눌렀을까)을 그대로 물어 `ctr_test_pass_count`(0~4)를 함께 받는다.

**결정론적 매핑(코드가 최종 결정, LLM 추천은 참고만 — 기존 `deterministicQA`와 동일 철학)**:
- Rule에서 REJECT 확정 → `REJECT`(LLM 호출 자체를 생략, 비용 절감)
- `공지성=true` 또는 `지역행정성=true` 이면서 `ctr_test_pass_count ≤ 1` → `REJECT`
- `ctr_test_pass_count ≥ 3` **그리고** (`탐험성=true` 또는 `연결가능성=true`) **그리고** `배경설명필요도 ≥ 1` → `PUBLISH_LONG`
- `ctr_test_pass_count ≥ 2`이면서 위 LONG 조건 미충족 → `PUBLISH_SHORT`(궁금하긴 하지만 장문까지 갈 재료/파급력은 아님)
- 그 외 애매한 경계(예: ctr_test_pass_count=2, 탐험성/연결가능성 모두 false, 파급력=1) → `HOLD`

이 임계값은 v1 초안이며, 실제 판정 분포를 admin에서 관찰하며 조정하는 것을 전제로 한다(§7 참고).

## 3. 결과 유형 4가지

| 상태 | 의미 | 이후 파이프라인 동작 |
|---|---|---|
| `PUBLISH_LONG` | 장문 에디토리얼 가치가 있다고 판단 | 기존 흐름대로 `generate-editorial-draft-background` 진행 |
| `PUBLISH_SHORT` | 발행은 하되 장문까지는 불필요 | Draft 생성 스킵. 기존에 이미 존재하는 "요약형 폴백"(topic.summary/description 기반 Topic 페이지)으로 그대로 서빙 — **신규 UI 필요 없음**, 이미 있는 경로를 재사용 |
| `HOLD` | 판단이 애매함 | Draft 생성 보류. Admin에 "검토 대기" 목록으로 노출(§5). 사람이 검토해 LONG/SHORT/REJECT로 수동 확정하거나, 방치 시 N주기(예: 3회, 9시간) 후 자동으로 `PUBLISH_SHORT`로 강등(DEC-005의 "사람 검토를 기본 전제로 하지 않는다" 원칙과 충돌하지 않도록 — 아래 §8 참고) |
| `REJECT` | 뉴스저울다운 발행 가치가 없음 | Draft 생성 영구 스킵. `status`는 유지하되(데이터 자체는 삭제 안 함) Home/카드 등 사용자 노출 표면에서 완전히 배제 |

## 4. 로그 / 설명 가능성

`topics.ai_context.gate`에 아래 구조로 저장(기존 `plan`/`draft`/`qa` 저장 관례와 동일한 위치):

```json
{
  "status": "REJECT",
  "score": { "ctr_test_pass_count": 1, "탐험성": false, "연결가능성": false, "공지성": true, "지역행정성": true, "사회적파급력": 0, "배경설명필요도": 0 },
  "reasons": ["행정 공지성", "탐험성 부족", "연결 Topic 없음", "영향 범위 제한(지역 단위)"],
  "rule_matched": "지자체 행정 공지 패턴",
  "evaluated_at": "2026-07-14T13:00:00Z",
  "overridden_by": null,
  "overridden_at": null
}
```

`reasons`는 PM이 예시로 든 형식("행정 공지성 / 탐험성 부족 / 연결 Topic 없음 / 영향 범위 제한")을 그대로 따르는 사람이 읽는 문장 배열이다 — 왜 이 판정이 나왔는지 admin에서 클릭 한 번으로 볼 수 있어야 한다(§5).

## 5. Admin UI

`/admin`에 신규 섹션 "🚪 Publish Gate" 추가(개발용 트리거 버튼들과 같은 위치 규칙):

- **목록 뷰**: Topic명 | Gate 결과(색상 배지: LONG=초록/SHORT=파랑/HOLD=노랑/REJECT=회색) | Gate Score(4문항 통과 수 등 요약) | 판단 이유(reasons 배열, 펼치기) | 평가 시각
- **필터**: 결과별 필터(특히 `HOLD`만 모아보는 "검토 대기" 뷰가 핵심 — DEC-005 정신을 지키려면 이 큐를 사람이 안 봐도 시스템은 굴러가야 하지만, PM이 보고 싶을 때 언제든 볼 수 있어야 함)
- **조작**:
  - **수정 버튼**: 4개 상태 중 하나로 수동 변경(드롭다운) — 변경 시 `overridden_by`(admin 식별 — 현재 인증 체계상 "admin"으로 고정 기록, 추후 다중 사용자 시 확장), `overridden_at` 기록
  - **강제 발행 버튼**: 결과와 무관하게 즉시 `gate_status='publish_long'`로 전환(REJECT/HOLD 상태여도 PM이 "이건 발행해야 한다" 판단하면 1클릭으로 뒤집을 수 있어야 함 — Gate가 PM의 판단을 대체하는 게 아니라 보조하는 것이라는 원칙)
- 개발용 수동 트리거: 기존 패턴대로 "▶ 지금 실행" 버튼(Background Function, 접수 후 비동기 처리)

## 6. DB 변경사항 (설계만 — 승인 전 구현 금지)

기존 `AGENTS.md` 승인 경계상 "DB 스키마 변경"에 해당 — 이 섹션은 승인 대기 항목으로만 기록한다.

| 대상 | 종류 | 비고 |
|---|---|---|
| `topics.gate_status` | 신규 컬럼(text, default `'pending_gate'`) | 값: `pending_gate`\|`publish_long`\|`publish_short`\|`hold`\|`reject`. 기존 컬럼 영향 없음(`ADD COLUMN IF NOT EXISTS`) |
| `topics.ai_context.gate` | 신규 jsonb 하위 키(마이그레이션 불필요, 기존 `ai_context` 컬럼 재사용) | §4 구조 |
| `generate-editorial-draft-background.js` 쿼리 | 코드 수정(스키마 아님) | `editorial_status=eq.planned` → `editorial_status=eq.planned&gate_status=eq.publish_long` |

리스크: 순수 추가(additive)라 기존 데이터에 영향 없음. 다만 **배포 직후 기존 `planned` Topic 11건은 전부 `gate_status='pending_gate'`(기본값)라서, Gate가 한 번 돌기 전까지는 draft 생성 대상에서 빠진다** — 즉 배포 시점에 일시적으로 "장문 생성이 멈춘 것처럼" 보일 수 있다(실제로는 Gate 백필을 기다리는 정상 상태). 배포 직후 Gate를 1회 수동 실행해 기존 backlog를 정리하는 것을 권장.

## 7. 향후 CTR Engine과의 연결 방식

Publish Gate는 이번 라운드에서 **CTR 계산/Home 정렬/Balance Engine/클릭 데이터 활용을 구현하지 않는다**(PM 명시 지시). 다만 설계상 아래를 염두에 둔다:

- Gate의 LLM 판단(탐험성/연결가능성/사회적파급력/시간성 등)은 **일회성 게이트 판정으로 버려지지 않고 그대로 CTR Engine의 1차 입력 신호가 된다** — CTR Engine이 별도로 같은 질문을 다시 LLM에 묻지 않아도 되도록, `ai_context.gate.score`를 향후 CTR Engine이 그대로 읽어가는 구조를 전제로 필드명을 설계했다(§4).
- `PUBLISH_LONG`으로 확정된 Topic만 CTR Engine의 정렬 대상 후보군이 된다 — CTR Engine은 "이미 발행 가치가 검증된 것들 중에서" 순서만 정하면 되므로, 이번에 우려했던 "나쁜 콘텐츠까지 정렬해야 하는 부담"이 구조적으로 해소된다.
- `PUBLISH_SHORT`/`REJECT`로 걸러진 Topic은 CTR Engine 계산 자체를 스킵해 비용을 아낀다.

## 8. DEC-005("사람 검토 큐 기본 흐름 제외")와의 관계 — 명시적 구분

DEC-005는 "QA 실패 시 사람 검토를 거치지 않고 자동 강등한다"는 결정이었다. Publish Gate의 `HOLD`는 **QA 실패가 아니라 편집 가치 판단의 애매함**을 다루므로 성격이 다르지만, 혼동을 막기 위해 명확히 한다:
- `HOLD`도 **사람이 안 봐도 시스템은 계속 돈다** — 방치되면 자동으로 `PUBLISH_SHORT`로 강등되어 무인 운영 원칙을 지킨다(§3).
- Admin의 "검토 대기" 뷰는 **선택적 가시성**이지 **필수 개입 지점**이 아니다 — DEC-005의 정신(무인 기본 동작)을 그대로 유지한다.

## 9. Phase 계획

1. Phase 1: DB 컬럼 추가 승인 → `generate-publish-gate-background.js` 구현(Rule 예비필터 + LLM 판단 + 결정론적 매핑)
2. Phase 2: `generate-editorial-draft-background.js` 쿼리 조건 추가(`gate_status=eq.publish_long`)
3. Phase 3: Admin UI 섹션 추가(목록/필터/수정/강제발행)
4. Phase 4: 배포 후 기존 backlog(현재 planned 11건) 대상 Gate 1회 수동 실행 + 임계값(§2-2) 실측 기반 조정

## 10. 승인 필요 목록 (요약)

- `topics.gate_status` 컬럼 추가(§6)
- `generate-editorial-draft-background.js` 쿼리 조건 변경(§6) — 콘텐츠 생성 방식 변경 범주
- LLM 프롬프트 신규 작성(§2-2) — AI 프롬프트 변경 범주
- Rule 예비필터 키워드 목록(§2-1) — 최초 구현 시 실제 리스트는 news-filters.js 스타일로 별도 작성 필요
