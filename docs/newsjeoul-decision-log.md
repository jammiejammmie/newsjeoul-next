# 뉴스저울 Decision Log

> 프로젝트에 영향을 주는 결정을 "무엇으로 정했는가"가 아니라 **"왜 그렇게 정했는가"**, 그리고 **"그 제안이 어디서 나왔는가"** 중심으로 남기는 문서. 구현 문서 아님 — `docs/newsjeoul-editorial-engine-architecture.md` 등 실제 설계 문서와 분리해서, 나중에 방향을 재검토할 때 판단 근거와 출처를 빠르게 추적하기 위한 이력 전용 문서.
>
> **운영 원칙(2026-07-11 확정)**:
> 1. 결정의 내용보다 **결정의 출처**가 더 중요하다 — 모든 항목은 **디자인팀 제안 / 개발팀 제안 / PM 최종 결정**을 반드시 구분해서 기록한다(하나가 해당 없으면 "해당 없음"으로 명시, 생략하지 않는다).
> 2. 결정 이유는 가능한 한 **PM의 표현을 직접 인용**해 남긴다 — 나중에 "누가 어떤 논리로 정했는가"를 그대로 복원할 수 있어야 한다.
> 3. 새 결정이 생길 때마다 항목을 추가한다. 과거 항목은 수정하지 않고, 결정이 번복되면 새 ID를 추가하고 이전 항목에 "→ DEC-00X로 대체"만 표기한다.

## 인덱스

| ID | 결정 주제 | 제안 출처 | 결정일자 |
|---|---|---|---|
| DEC-001 | 오늘의 화두(Zeitgeist) 처리 방식 | 개발팀 제안 → PM 승인 | 2026-07-11 |
| DEC-002 | 문체(Editorial Style)를 독립 레이어로 유지 | 디자인팀 원안 유지, 개발팀 제안 기각 | 2026-07-11 |
| DEC-003 | 100명 에디터 = Editorial Persona Registry | 개발팀 제안 → PM 확장·확정 | 2026-07-11 |
| DEC-004 | 영상·차트 블록 Phase 5 보류 | 개발팀 제안 → PM 조건부 승인 | 2026-07-11 |
| DEC-005 | 사람 검토 큐를 기본 흐름에서 제외 | 개발팀 제안 기각 → PM 대안 지시 | 2026-07-11 |
| DEC-006 | Publish Gate를 CTR Engine보다 먼저 설계 | 개발팀 제안 → PM 순서 변경 지시 | 2026-07-16 |
| DEC-007 | 뉴스저울 = 대량 AI 편집국(선별 큐레이션 → 검색형 정보망), Publish Gate → Content Routing Gate, Persona Editor 중심 아키텍처 | 해당 없음 → PM 전략 전환 지시 | 2026-07-17 |

---

### DEC-001 — 오늘의 화두(Zeitgeist) 처리 방식

| 출처 | 내용 |
|---|---|
| **디자인팀 제안** | Editorial OS v1 원안 — 파이프라인에 "사건 수집 → 사건유형판별 → **오늘의 화두 반영** → 축선택 → ..." 처럼 화두 반영이 이벤트별 스텝으로 그려져 있음 |
| **개발팀 제안** | 이벤트마다 화두를 반복 추출하면 같은 날 이벤트끼리 해석이 미묘하게 갈릴 수 있고 계산도 낭비라고 판단, 하루 1회 배치로 분리해 모든 이벤트가 같은 값을 참조하는 구조로 변경 제안 |
| **PM 최종 결정** | 개발팀 제안 그대로 채택 |

- **결정 이유(가장 중요)**: "오늘의 화두는 기사마다 다시 만드는 값이 아니라, 일정 주기로 생성해 여러 사건이 공유하는 편집국 공통 컨텍스트로 관리하는 편이 자연스럽다"(PM 원문).
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §5(오늘의 화두 — 공유 자산화 방식), §2(Layer 0 Zeitgeist).

---

### DEC-002 — 문체(Editorial Style)를 독립 레이어로 유지

| 출처 | 내용 |
|---|---|
| **디자인팀 제안** | Editorial OS v1 원안 — 파이프라인에 "문체 적용"이 관점 배정 다음의 독립 스텝으로 그려져 있고, JSON 예시엔 `editor_style_profile: "친근한 거래처 직원체"` 등장 |
| **개발팀 제안** | 이 값이 사건마다 바뀌는 값이 아니라 브랜드 전체에 거의 고정된 값으로 보여, 매 사건 AI가 새로 판단하게 하면 오히려 톤이 흔들릴 위험이 있다고 판단 — "도메인 단위 FIXED"로 격하 제안 |
| **PM 최종 결정** | 개발팀 제안 **기각**. 문체는 독립 레이어로 유지하되, 완전 자유값이 아니라 **사건 유형과 관점(Editorial Persona)의 영향을 받는 가변 레이어**로 재설계 지시(계산 순서: 관점 선택 → Persona resolve → Persona 고유 문체를 사건유형 FIXED 규칙으로 클램프) |

- **결정 이유(가장 중요)**: "같은 자동차 Topic이라도 신차 발표·리콜·실적 발표·CEO 인터뷰는 전달해야 하는 분위기와 리듬이 다르다"(PM 원문) — 도메인 단위로 고정하면 이 차이가 사라진다는 문제 제기.
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §6(축·관점·문체·에디터 페르소나의 관계), §1(유지/수정/보완 표); `docs/newsjeoul-editorial-engine-crosscheck.md` A.

---

### DEC-003 — 100명 에디터 = Editorial Persona Registry

| 출처 | 내용 |
|---|---|
| **디자인팀 제안** | Editorial OS v1 원안엔 없음 — "관점(Perspective)"은 `["엔지니어","소비자전문"]`처럼 추상 라벨로만 존재, 누가 그 관점으로 "말하는" 것처럼 보일지는 미정의 |
| **개발팀 제안** | 프론트엔드에 이미 존재하는(미사용) `EditorPersona` 타입을 근거로, 관점을 실제 이름·아바타가 있는 에디터로 resolve하는 Persona Registry(`editors` 테이블) 신설 제안 — 단 "100명 에디터"가 실제 인격체를 의미하는지 은유("100가지 관점")인지 불명확해 PM 확인 요청으로 올림 |
| **PM 최종 결정** | Persona Registry 방향 채택. 단 Persona는 단순 캐릭터 라벨이 아니라 **관점+문체+리듬+강조 방식을 포함하는 하나의 Editorial Persona**로 설계 지시(개별 100명의 구체적 이름·프로필 설계는 별도 진행 — 이번엔 필드 구조까지만 확정) |

- **결정 이유(가장 중요)**: "뉴스저울의 목표는 단순히 '100가지 문체'가 아니라 100명의 디지털 에디터가 존재하는 편집국이다"(PM 원문) — 은유가 아니라 실제 인격 단위의 확장을 의도함이 이 결정으로 명확화됨.
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §7(100명 에디터 — Editorial Persona 선택 및 적용 구조), §11(`editors` 테이블 스키마: `perspective_tag/style_signature/rhythm_profile/emphasis_pattern`).

---

### DEC-004 — 영상·차트 블록 Phase 5 보류

| 출처 | 내용 |
|---|---|
| **디자인팀 제안** | Editorial OS v1 원안 — 유형1(신제품)은 "영상(있으면 강력 권장)", 유형7(실적)은 "스파크라인 차트(필수)"로 명시. Research Board·편집 경험 목업도 차트·영상 비중이 시각적 핵심 |
| **개발팀 제안** | 현재 코드베이스에 영상 자동 수집(YouTube API 등)·차트용 구조화 데이터 소스가 전혀 없음을 확인, "렌더링 문제가 아니라 데이터 조달 자체가 없는 문제"로 규정하고 초기 Phase에서 제외(Phase 5로 보류) 제안 |
| **PM 최종 결정** | 보류 제안에 동의. 단 조건부 승인 — **Block 구조 자체는 처음부터 영상·차트 확장을 고려해 설계**할 것을 전제로 함(`blocks[].type` enum에 `video`/`chart` 값 예약, 나중에 스키마 변경 없이 추가 가능하도록) |

- **결정 이유(가장 중요)**: "현재는 Editorial Engine과 장문 콘텐츠 품질이 우선"이나, "디자인 목업과 실제 구현의 간극이 커지지 않도록 향후 확장 가능한 Block 구조는 처음부터 고려"할 것(PM 원문) — 우선순위는 개발팀 판단을 따르되 미래 확장성은 지금 담보해둘 것을 요구.
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §8(구조화 출력 스키마의 blocks[].type 예약), §9(이미지·영상·차트·타임라인·출처), §12(Phase 5); `docs/newsjeoul-editorial-engine-approval-items.md`(외부 API 항목, 여전히 미승인 상태로 보류).

---

### DEC-005 — 사람 검토 큐를 기본 흐름에서 제외

| 출처 | 내용 |
|---|---|
| **디자인팀 제안** | 해당 없음 — Editorial OS v1엔 "품질검증" 스텝만 있고 사람 검토 관련 언급 없음. 다만 기존 `docs/newsjeoul-ai-editorial-bible.md`의 원비전이 "사람 편집국 없이 AI가 담당"이라 이 결정의 배경 맥락으로 작용 |
| **개발팀 제안** | 안전장치로 QA 재시도 상한(예: 2회) 초과 시 자동 발행을 막고 사람이 검토하는 큐(`/admin` 신규 탭)로 이관하는 방식 제안 |
| **PM 최종 결정** | 개발팀 제안 **기각**. 사람 검토를 기본 전제로 설계하지 않음 — **Self-Review / QA / Retry / Confidence** 등 AI 내부 검증을 최대한 활용해 무인으로 동작하고, 재시도 상한 도달 시엔 사람 큐가 아니라 기존 짧은 형식(`ai_outlook`/`ai_counter_view`)으로 자동 강등(graceful degradation)하도록 대안 지시. 시스템적으로 사람이 들여다볼 수 있는 Hook(`topics.editorial_status='degraded'` 로그)만 남기도록 함 |

- **결정 이유(가장 중요)**: "뉴스저울의 목표는 AI 중심 편집국이다. 사람 검토를 기본 전제로 설계하지 않는다"(PM 원문) — 다만 "시스템적으로 사람이 개입할 수 있는 Hook 정도는 남겨두되, 운영의 기본 흐름은 사람 검토 없이도 동작하는 구조를 목표로 한다"는 단서를 명시.
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §4(오분류 대응 루프백), §10(품질평가·재생성·실패격리, Self-Review 스텝 추가·자동 강등 설계), §11(`topics.editorial_status` 필드 용도 재정의).

---

### DEC-006 — Publish Gate를 CTR Engine보다 먼저 설계

| 출처 | 내용 |
|---|---|
| **디자인팀 제안** | 해당 없음 |
| **개발팀 제안** | 운영 데이터 전수조사(2026-07-14) 결과 보고 — 발행 19건 중 저CTR 행정성 Topic("취약계층 반려동물 의료비 지원" 등)이 필터 없이 전부 장문 생성까지 도달하는 것을 확인, CTR Engine 설계 착수를 제안 |
| **PM 최종 결정** | CTR Engine 착수를 보류하고 **Publish Gate를 먼저 설계**하도록 순서 변경 지시. "클릭률을 높이는 것이 아니라 뉴스저울답지 않은 Topic이 장문 생성까지 들어가지 않도록 막는 것"이 목표임을 명시. 이번 라운드는 설계만(코드 구현 금지), CTR 계산/Home 정렬/Balance Engine/클릭 데이터 활용은 명시적으로 제외 범위로 지정 |

- **결정 이유(가장 중요)**: "CTR Engine이 좋은 콘텐츠를 고르는 것이 아니라 좋지 않은 콘텐츠까지 정렬해야 하는 상황"이 되는 것을 막기 위해, 정렬(CTR Engine)보다 선별(Publish Gate)이 선행돼야 한다는 PM 판단(PM 원문 취지).
- **영향 문서·섹션**: `docs/newsjeoul-publish-gate-design.md`(신설, 설계 전문), §6(DB 변경사항 — 승인 대기), §10(승인 필요 목록). DEC-005(사람 검토 큐 미채택)와의 관계는 설계서 §8에서 명시적으로 구분함(Publish Gate의 HOLD는 QA 실패가 아니라 편집가치 판단이며, 무인 강등 경로를 유지해 DEC-005 원칙을 지킴).
- **현재 상태**: `Status: Designed` / `Implementation: Pending` / `DB Migration: Not Applied` / `Production: Not Deployed` — **이 상태 필드는 여기서 갱신하지 않는다.** 구현이 진행되면 이 항목을 수정하지 말고 `docs/newsjeoul-implementation-log.md`에 새 업데이트를 추가한다(Decision Log는 "왜 그렇게 정했는가"의 스냅샷으로 고정, 진행 상태 추적은 별도 문서 — 2026-07-16 PM 지시).

---

### DEC-007 — 뉴스저울 = 대량 AI 편집국, Publish Gate → Content Routing Gate, Persona Editor 중심 아키텍처

| 출처 | 내용 |
|---|---|
| **디자인팀 제안** | 해당 없음 |
| **개발팀 제안** | 해당 없음 |
| **PM 최종 결정** | 뉴스저울의 방향을 "적은 수의 선별된 좋은 Topic"에서 "대량·다분야 AI 편집국·검색형 정보망"으로 전면 재정의. 최우선 KPI를 발행 유효 게시물 수/게시물당 정보량·검색가치/내부링크·Topic Cluster 규모로 변경(디자인·Home 재배치·CTR 정렬보다 선행). 분야 제한 폐지(정치/소상공인/세금/복지/부동산/자동차/가전/AI/기업/노동/의료/교육/국제/환경/생활정보 등 15개 분야 동시 운영 지시). Publish Gate(저가치 Topic을 버리는 게이트)를 **Content Routing Gate**(8종 라우터: DEEP_DIVE/SEARCH_GUIDE/PRODUCT_BRIEF/COMPARE/BACKGROUND/UPDATE/SHORT_BRIEF/REJECT)로 재정의 — REJECT는 광고·완전중복·무가치 홍보문구로만 한정하고 행정·정책 정보라는 이유만으로는 절대 거부 금지를 코드 레벨로 강제 지시. 100명 에디터를 "이름 목록"이 아니라 분야별 구체적 콘텐츠 미션(신청가이드/비교분석/구매판단/배경해설/데이터검증 등)을 가진 존재로 재정의. 추가로 "몇 g"(무게) 브랜드 장치는 유지·강화하되 발행 여부(Gate)와는 독립된 축으로 — 실제 근거(weight_reasons) 기록 의무화(당시 importance_score가 전부 50 고정값이라는 사실이 세션 중 확인됨). display_keywords(게시물별 강조 키워드) 신규 도입 지시. **우선순위 원칙**: 100명 Persona Editor가 핵심 가치이며 다른 기능(Gate/CTR/Weight Engine)은 Persona 중심으로 연결되도록 설계할 것을 명시. 승인 경계는 기존과 동일하되 API Key 추가·비용 발생 외부 API 사용이 승인 필요 목록에 명시적으로 추가됨 |

- **결정 이유(가장 중요)**: "지금부터 뉴스저울의 핵심은 선별의 정교함보다 생산 규모, 정보 깊이, 연결 밀도, 검색 유입입니다"(PM 원문). 행정·정책 정보를 "버리는" 게 아니라 검색 사용자 관점의 실용 정보로 "전환"해야 한다는 것이 핵심 — 예시로 든 "○○시 소상공인 지원사업 시행" → "2026년 ○○시 소상공인 지원금: 대상·금액·신청방법·마감일 총정리" 전환이 이 결정 전체의 축소판.
- **영향 문서·섹션**: `netlify/functions/generate-publish-gate-background.js`(8종 라우터로 전면 재작성), `netlify/functions/generate-editorial-plan-background.js`(Persona 배정 엔진 개선), `netlify/functions/generate-editorial-draft-background.js`(persona 문체 반영 강화 + display_keywords 생성 추가), `netlify/functions/update-topic-weight-background.js`(신설, 무게 산정 엔진), `netlify/functions/update-editor.js`(신설, Admin 에디터 관리), `app/admin/page.tsx`(Content Routing Gate + Persona 관리 UI), `app/topic/[slug]/page.tsx` / `app/page.tsx`(에디터 노출·무게 근거·키워드 UI), `supabase/persona_registry_100_migration.sql` / `persona_registry_100_seed.sql`(신규, 91명 추가). DEC-003(Persona Registry)의 확장이자 DEC-006(Publish Gate)의 방향 수정. 진행 상태는 이 항목을 수정하지 않고 `docs/newsjeoul-implementation-log.md`에 추적한다(DEC-007 섹션).
- **완료 기준(PM 명시)**: 문서·Persona 이름 목록이 아니라 — 100명 에디터가 분야별로 실존, 콘텐츠 형식 자동 결정, 적합 에디터 자동 배정, 실제 몇 g와 근거 노출, 강한 키워드 노출, Home/Topic 화면이 눈에 띄게 달라진 **운영 상태**. 수집범위 확대/Expansion Engine/대량생성/자동 내부링크/Sitemap·색인/Search Console 검증은 이번 라운드 범위 밖(§9 작업순서상 후속 단계로 명시적으로 분리됨).

---

관련: `docs/newsjeoul-editorial-engine-architecture.md`(설계 본문), `docs/newsjeoul-editorial-engine-crosscheck.md`(디자인팀 원안 대조), `docs/newsjeoul-editorial-engine-approval-items.md`(승인 목록), `docs/newsjeoul-publish-gate-design.md`(Publish Gate 설계), `docs/newsjeoul-implementation-log.md`(구현 진행 상태 추적)
