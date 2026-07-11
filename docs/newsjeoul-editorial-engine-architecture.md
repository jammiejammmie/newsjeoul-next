# 뉴스저울 Editorial Engine 아키텍처 설계서 (v3)

> 디자인팀(노차장) "Editorial OS v1 설계서"에 대한 개발팀(노실장) 아키텍처 응답. **구현 코드 아님 — 설계 문서.** 승인이 필요한 DB/외부API/비용 요소는 `docs/newsjeoul-editorial-engine-approval-items.md`에 별도 정리. v3는 `docs/newsjeoul-editorial-engine-crosscheck.md`의 4개 논의사항에 대한 채과장 결정(2026-07-11)을 반영.
> 기준 입력: `뉴스저울 - Editorial OS v1 설계서.dc.html`(사건 유형 10종 × 축/관점/근거/QA), 기존 파이프라인(`docs/newsjeoul-ai-editorial-bible.md`), 기존 DB 스키마(`supabase/*.sql`).

## 0. 한 줄 결론

Editorial OS의 FIXED/AI-JUDGED/QA 3층 분리는 좋은 뼈대다. 이 문서는 그걸 4개 레이어(Zeitgeist / Classification·Planning / Generation·Evidence / QA·Publish)로 배치하고, 화두를 이벤트 반복 추출에서 **공유 배치 자산**으로 분리하고, "관점(Perspective)+문체+리듬+강조방식"을 하나로 묶은 **Editorial Persona**를 통해 100명 에디터 확장 메커니즘을 만들고, 장문 결과물을 **구조화 블록 스키마**(영상·차트 확장을 처음부터 고려)로 뽑아 QA와 프론트 렌더링 양쪽이 그대로 소비하게 하며, 실패 처리는 **사람 검토 없이 AI 내부 검증(Self-Review/QA/Retry/Confidence)만으로 기본 동작**하되 필요 시 사람이 들여다볼 수 있는 Hook만 남긴다.

### v3 결정 반영 요약 (2026-07-11)

| # | 논의사항 | 결정 |
|---|---|---|
| 1 | 문체(Style) | 독립 레이어 유지. 다만 자유값이 아니라 **사건유형+관점(Persona)의 영향을 받는 가변 레이어**(§6) |
| 2 | 100명 에디터 | Persona Registry 채택. 단 Persona = 관점+문체+리듬+강조방식을 묶은 **Editorial Persona**(§7). 구체적 인물 설계는 별도 진행 |
| 3 | 영상·차트 | Phase 5 보류 확정. 단 **Block 구조는 처음부터 확장 가능하게 설계**(§8) |
| 4 | 실패 처리 | 사람 검토 큐를 기본 전제로 하지 않음. **Self-Review/QA/Retry/Confidence로 무인 동작**, 사람 개입은 옵션 Hook만(§10) |

---

## 1. Editorial OS에서 유지 / 수정 / 보완할 항목

| 구분 | 항목 | 내용 |
|---|---|---|
| **유지** | 사건 유형 10종 분류 체계 | 판별 신호까지 이미 잘 정의됨. 그대로 룩업 테이블화 |
| **유지** | 유형별 축 가중치·생략가능축 | FIXED 룩업 데이터로 그대로 사용 |
| **유지** | 유형별 필수 근거 유형 목록 | QA 결정론적 체크의 기준값으로 그대로 사용 |
| **유지** | 유형9(분쟁)·10(재난)의 관점 고정 규칙 | "예외 없음"이 명시된 안전 규칙 — 그대로 하드락 대상 |
| **확정(승인됨)** | 화두(Zeitgeist) 추출 위치 | 이벤트별 스텝 → 하루 1회 배치로 이동(§5) |
| **확정(승인됨)** | 문체(Editorial Style) | 독립 레이어로 유지, 다만 사건유형+Persona 영향을 받는 가변값으로 재설계(§6) |
| **확정(승인됨)** | Perspective와 "누가 썼는가"의 관계 | Editorial Persona(관점+문체+리듬+강조방식 번들)로 보완(§7) |
| **보완 필요** | 장문 결과물 자체의 구조 | Editorial OS는 입력(Plan)만 정의, 출력(본문) 스키마가 없음 — §8에서 신규 정의 |
| **보완 필요** | 재분류·재시도 루프백 경로 | `type_confidence<0.7이면 재분류` 같은 조건은 있으나 어디서 루프백하는지 흐름이 없음 — §4, §10에서 명시 |
| **보완 필요** | 미디어(영상·차트) 조달 출처 | "필요 근거"에 영상·차트가 등장하나 어디서 가져오는지 미정의 — §9에서 현재 인프라 대비 갭 정리 |

---

## 2. 전체 파이프라인 — 레이어별 입력/출력

```
[Layer 0] Zeitgeist        하루 1회, 이벤트 무관
    ↓ zeitgeist_ref
[Layer 1] Classification & Planning   이벤트당 1회
    ↓ Editorial Plan (입력용 JSON, 아래 예시)
[Layer 2] Generation ‖ Evidence   병렬 fan-out
    ↓ Editorial Draft (§8 구조화 출력) + Evidence Bundle
[Layer 3] QA & Publish
    ↓ 발행된 Topic/TopicUpdate
```

| Layer | 입력 | 출력 | 구현 형태 |
|---|---|---|---|
| 0. Zeitgeist | 그날 active topics 전체(요약/카테고리) | `daily_zeitgeist{date, tags[]}` | 배치 함수, LLM 1회 |
| 1. Classification & Planning | 원문 기사(제목/본문/출처), `zeitgeist_ref` | Editorial Plan JSON(아래) | Rule 예비필터(코드) + LLM 구조화 출력 1회 |
| 2a. 본문 생성 | Editorial Plan + Persona 스니펫(§7) + Evidence Bundle(가능한 것만) | Editorial Draft(§8) | LLM 1회 + Self-Review(§10) |
| 2b. 근거 수집 | Editorial Plan의 `evidence_required` | Evidence Bundle{image_url, timeline_events, sources[], (Phase5: video_url, chart_data)} | 대부분 비-LLM(기존 파이프라인 재사용, §9) |
| 3a. 결정론적 QA | Editorial Draft + Evidence Bundle + Plan | pass / fail+사유 | 코드(정규식·필드체크) |
| 3b. LLM 정성 QA | 3a 통과분의 Editorial Draft | pass / fail+사유 | LLM 1회(체크리스트 구조화 출력) |
| Publish | 통과한 Draft + Evidence, 또는 실패 시 강등(§10) | `topics`/`topic_updates` 갱신 | 코드 |

**Editorial Plan 예시**(Layer 1의 출력, Layer 2·3 전체의 **단일 진실 소스** — 이후 어떤 단계도 이 값을 재해석하거나 새로 판단하지 않는다):

```jsonc
{
  "event_id": "evt_20260711_porsche_launch",
  "event_type": "신제품·모델출시",          // §4 Rule+AI Hybrid 결과
  "type_confidence": 0.94,                  // <0.7이면 §4 재분류 루프
  "domain": "자동차",
  "zeitgeist_ref": "2026-07-11",            // §5, 값 자체가 아니라 참조 키
  "axis_weights": { "핵심변화":0.35,"비교":0.30,"지금":0.15,"행위자":0.10,"역사":0.10,"연결":0 },
  "axis_overrides_reason": "가격 논쟁 화두로 '비교' +5%p",
  "perspectives": ["엔지니어","소비자전문"], // §6
  "editors_assigned": ["editor_marcus","editor_sera"], // §7 Persona Registry resolve 결과
  "requires_dual_perspective": false,
  "evidence_required": ["image_hero","spec_data","comparison_table","source>=2"],
  "target_length_range": [1400, 1800],
  "qa_flags": ["single_perspective_check","evidence_completeness","zeitgeist_alignment"]
}
```

---

## 3. FIXED / AI-JUDGED / QA — 실제 구현 경계

Editorial OS의 3분류를 "무엇으로 구현되는가"까지 못박는다:

| 분류 | 정의 | 구현물 | 예 |
|---|---|---|---|
| **FIXED** | 유형이 정해지면 값도 정해짐, 이벤트마다 안 바뀜 | **DB 룩업 테이블**(코드 아님, 데이터) — `event_type_rules` 1개 테이블에 유형별 축가중치·생략축·필수근거·길이범위·관점고정여부를 행 하나씩 저장 | 유형1의 축가중치 `{핵심변화:0.35,...}` |
| **AI-JUDGED** | 이벤트마다 LLM이 구조화 출력으로 산출 | **LLM 호출의 output schema 필드** | `type_confidence`, `axis_overrides_reason`, `perspectives` |
| **QA** | 생성 후 재확인 | **3a(코드 정규식/필드비교) 또는 3b(LLM 체크리스트)** — Editorial OS의 "흔한 저품질 패턴"은 3b의 체크리스트 항목으로 그대로 이식 | "보도자료 그대로 요약했는지" |

이렇게 나누면 FIXED를 바꾸는 건 **DB row 수정**(배포 불필요), AI-JUDGED를 바꾸는 건 **prompt/schema 수정**(승인 필요, `AGENTS.md` 기존 규칙과 일치), QA를 바꾸는 건 **체크리스트 데이터 수정**으로 각각 변경 비용과 승인 필요 여부가 갈린다.

---

## 4. 사건 유형 분류 방식과 오분류 대응

**Rule + AI Hybrid** 채택. 4옵션(단일LLM/단계별분류/다중Agent/Rule+AI Hybrid) 중 이유:
- Editorial OS가 이미 유형별 "판별 신호"(키워드·구조 패턴)를 텍스트로 정의해둠 — 규칙 엔진 초안이 사실상 존재.
- 순수 단일 LLM은 인접 유형(규제↔분쟁, 보안사고↔재난)에서 흔들릴 위험 — Editorial OS 스스로 이 조합을 "가장 위험한 오판"으로 지목.
- 다중 Agent는 "논쟁형 문제"가 아니라 "패턴 매칭형 분류 문제"에 과설계.

**흐름**:
1. Rule 예비필터(코드, 무료) → 후보 1~3개 + 신뢰도.
2. 후보가 1개면 LLM 스킵, 2개 이상이면 LLM 확정 호출(10지선다 아니라 좁혀진 후보 중 선택) → `event_type`, `type_confidence`, `axis_overrides_reason` 동시 산출.
3. **안전 오버라이드**: 유형9·10 신호가 Rule 단계에서 강하게 감지되면, LLM이 다른 유형으로 판단해도 유형9·10의 구조 규칙(양측병치/단일관점)은 최소 유지한 채 진행 — 오판 시 "가장 치명적"이라 명시된 두 유형이므로 AI 자율판단보다 규칙 우선.

**오분류 대응(루프백)**:
- `type_confidence < 0.7` → Layer 1 재실행(Rule 후보를 넓혀 재시도), 2회 실패 시 §10의 자동 강등(사람 큐 아님).
- 3a QA에서 "유형과 실제 본문 내용 불일치" 감지(예: 대립관점 요구 유형인데 단일 시각만 생성됨) → Layer 1부터 재실행, 상한 도달 시 §10의 자동 강등.

---

## 5. 오늘의 화두 — 공유 자산화 방식

이벤트마다 반복 추출하지 않는다. **하루 주기 배치 + 공유 참조** 구조:

- `daily_zeitgeist` 테이블(신규, §12): `date PK, tags jsonb, generated_at`. 하루 1번 갱신(기존 "1일 1회 스케줄" 함수군 — `refresh-relationships`/`generate-insights`와 같은 시간대에 실행되도록 `netlify.toml`에 새 크론 추가).
- Layer 1은 이 테이블을 **오늘 날짜로 조회만** 하고 재계산하지 않는다 — Editorial Plan에는 값 자체가 아니라 `zeitgeist_ref: "2026-07-11"` 참조 키만 기록해, 나중에 "그날 화두가 뭐였길래 이렇게 판단했나"를 추적 가능하게 한다.
- **화두 반영 여부 자체는 FIXED 규칙**(유형별로 다름): 대부분 유형은 화두를 축가중치 미세조정에 반영하지만, 유형10(재난)은 Editorial OS 원문에 "화두 반영 배제가 QA 원칙"이라 명시돼 있다 — 이 예외를 `event_type_rules` 테이블에 `zeitgeist_excluded: true` 같은 필드로 명문화해야 실수로 재난 기사에 화두가 섞이는 걸 코드 레벨에서 막을 수 있다.

---

## 6. 축 · 관점 · 문체 · 에디터 페르소나의 관계 (v3 재설계)

**결정 1(문체는 독립 레이어, 사건유형+관점의 영향을 받는 가변값) + 결정 2(Persona=관점+문체+리듬+강조 번들)를 반영하면, 문체는 더 이상 "관점과 분리된 값"이 아니라 관점(=배정된 Editorial Persona)에 내재된 속성이면서 동시에 사건 유형이 강제하는 상한/하한을 받는 값이다.**

```
축(Axis)     = "무엇을 얼마나 다룰 것인가"   — 유형별 FIXED 가중치 + 화두로 미세조정(AI-JUDGED)
관점(Perspective) = "어떤 분석 렌즈로 볼 것인가" — 유형별 후보군 중 AI가 1~3개 선택 (여전히 독립 개념)
Editorial Persona = "그 관점을 실제로 누가, 어떤 문체·리듬·강조방식으로 말하는가" — §7
문체/리듬/강조   = Persona에 내재된 속성. 단, 사건유형의 FIXED 규칙이 상한선을 강제(예: 재난 유형은
                 배정된 Persona가 평소 발랄한 톤이어도 "간결·속보체"로 강제 override)
```

**계산 순서**:
1. 축가중치 결정(유형 FIXED + 화두 미세조정) — 기존과 동일.
2. 관점(Perspective) 후보 결정 — 유형별 FIXED 후보군에서 AI가 선택, 기존과 동일.
3. 각 관점을 Editorial Persona로 resolve(§7) — 이 순간 그 Persona 고유의 문체·리듬·강조방식이 후보로 딸려온다.
4. **문체 최종값 = Persona의 기본 문체를 사건유형의 FIXED 톤 규칙으로 클램프(clamp)한 값.** 대부분 유형(1~8)은 클램프가 약해 Persona 개성이 거의 그대로 드러나고, 유형9(분쟁)·10(재난)은 클램프가 강해(§4 안전 오버라이드와 동일한 원리) Persona 개성보다 안전한 표준 톤이 우선한다.

이렇게 하면 "같은 자동차 도메인이라도 신차발표/리콜/실적발표/CEO인터뷰가 다른 분위기"라는 요구(결정 1의 이유)가 만족된다 — 왜냐하면 유형이 다르면 배정되는 관점 조합이 다르고(Editorial OS에 이미 유형별로 다르게 정의돼 있음), 관점이 다르면 resolve되는 Persona가 다르고, Persona가 다르면 문체·리듬·강조방식이 자연히 달라지기 때문이다. **별도의 "문체 결정 LLM 호출"을 추가하지 않고도 목표를 달성**하므로 §3(FIXED/AI-JUDGED/QA 경계)나 Layer 1의 호출 횟수(1회)에 영향이 없다.

---

## 7. 100명 에디터 — Editorial Persona 선택 및 적용 구조 (v3 재설계)

프론트엔드에는 이미 `EditorPersona`(`name`/`styleTag`/`avatarColor`) 타입이 `CardShell.tsx` 등 카드 컴포넌트 전반에 깔려 있으나 항상 `undefined`다. 이 자리를 채우는 게 이번 설계의 목적.

**결정 2에 따라, Persona는 단순 캐릭터 라벨이 아니라 "관점+문체+리듬+강조방식"을 하나로 묶은 Editorial Persona로 설계한다.** 구체적인 개별 페르소나(이름·성격·프로필 100명)는 이번 단계에서 만들지 않고, 그 100명이 채워 넣을 **필드 구조**만 확정한다.

**신규 레이어: Persona Registry**(`editors` 테이블, §11)
- 필드: `id, name, perspective_tag(담당 관점, 예: "엔지니어"), style_signature(문체 특징, 예: "간결·데이터중심"), rhythm_profile(리듬, 예: "짧은 문장 반복" vs "만연체"), emphasis_pattern(강조 방식, 예: "숫자 강조" vs "인용구 중심"), domains[](담당 분야), avatar_color, bio, active`
- **선택 알고리즘**: Layer 1이 `perspectives: ["엔지니어","소비자전문"]`를 정하면, 각 perspective_tag에 대해 (1) `domains`가 이벤트 도메인과 매칭되는 에디터 후보를 추리고 (2) 후보가 여럿이면 **최근 배정 이력 기준 로테이션**(같은 에디터가 연속 배정되지 않도록 — 다양성·팬덤 형성 목적) → `editors_assigned: ["editor_marcus","editor_sera"]`로 Editorial Plan에 기록.
- **적용**: Layer 2a 프롬프트 조립 시 각 `editors_assigned`의 `style_signature`+`rhythm_profile`+`emphasis_pattern`을 하나의 페르소나 스니펫(3~5줄)으로 불러와 조합하고, §6의 "사건유형 클램프"를 통과시켜 최종 문체 지시문을 만든다. 발행 시 프론트 `EditorPersona`에 그대로 매핑 → 바이라인·아바타 자연 노출.
- **확장 경로**: 100명 확장 = `editors` 테이블에 row 추가 + 4개 속성 채우기. 파이프라인 코드·프롬프트 템플릿은 안 바뀜 — 이게 이 구조가 "100명"을 감당하는 핵심 이유.
- **QA 연계**: 3b(LLM 정성 체크)에 "이 글이 배정된 Persona의 관점·문체·리듬·강조방식과 일관되는가" 항목을 추가할 여지(초기엔 생략 가능, Phase 4 이후 고려).
- **범위 제한(명시)**: 이번 문서는 스키마·선택 알고리즘까지만 다룬다. 실제 100명(또는 초기 소수)의 이름·프로필·구체적 문체값 설계는 별도 진행 — 이 문서의 승인 대상이 아님.

---

## 8. 장문 에디토리얼 — 구조화 출력 스키마 (신규 정의)

Editorial OS는 입력(Plan)만 정의하고 출력(본문) 형태가 없다. QA(3a)가 파싱 가능하고 프론트(Research Board/편집 경험 목업의 블록형 UI)가 그대로 렌더링할 수 있도록 아래처럼 구조화 출력을 요구한다. **결정 3(영상·차트는 Phase 5로 보류하되 Block 구조는 처음부터 확장 가능해야 함)에 따라 `blocks[].type`을 처음부터 열거형(enum)으로 설계하고, Phase 1~4에서 쓰지 않는 타입도 값만 미리 예약해둔다** — 나중에 영상·차트를 붙일 때 스키마 자체를 바꾸는 breaking change 없이 새 `type` 값만 채우면 되게 하기 위함:

```jsonc
{
  "lead": "...",                              // 콜드오픈/리드 문단
  "blocks": [
    { "axis": "핵심변화", "type": "prose", "content": "...", "evidence_refs": ["spec_data"] },
    { "axis": "비교", "type": "prose_with_table", "content": "...", "evidence_refs": ["comparison_table"] },
    { "axis": "지금", "type": "prose", "content": "..." }
    // type enum(Phase 1~4에서 실제 채워지는 값): "prose" | "prose_with_table" | "image"
    // type enum(예약만, Phase 5 전까지 미사용): "video" | "chart" | "timeline"
  ],
  "perspective_markers": [                     // 3a가 requires_dual_perspective를 구조적으로 검증하는 근거
    { "perspective": "찬성", "editor": "editor_marcus", "claim": "..." },
    { "perspective": "신중/반대", "editor": "editor_sera", "claim": "..." }
  ],
  "evidence_refs_used": ["image_hero","source_1","source_2"],
  // evidence_refs_used의 키 네임스페이스도 "image_*/source_*"만이 아니라 "video_*/chart_*"를 처음부터
  // 예약해둬 evidence_required(§9)에 영상·차트가 추가돼도 이 필드 구조 자체는 안 바뀌게 한다.
  "closing_door": { "wider": "...(더 넓게 갈 다음 주제)", "deeper": "...(더 깊게 갈 다음 주제)" }
}
```

- `blocks[].axis`가 채워져 있어야 3a가 "축별 분량이 실제로 배분됐는지"(빈 축 없는지) 기계적으로 확인 가능.
- `perspective_markers`가 있어야 "대립 관점이 실제로 병치됐는지"를 LLM 정성 판단 없이 구조로 먼저 거를 수 있음(§10).
- `closing_door`는 World 탐험 목업의 "더넓게/더깊게" 분기 UI에 직접 매핑되는 필드 — 설계 문서와 화면 목업을 여기서 연결.
- **타임라인도 `blocks[].type="timeline"`으로 흡수 가능**(§9에서 별도 섹션이 아니라 본문 블록 중 하나로 배치될 수도 있음 — Phase 3에서 실제 배치 위치는 프론트 목업과 다시 대조).

---

## 9. 이미지·영상·차트·타임라인·출처 — 생성 및 배치 방식

블록 타입별로 인프라 성숙도가 크게 다르다. 있는 것과 없는 것을 명확히 나눈다:

| 블록 | 현재 상태 | 조달 방식 |
|---|---|---|
| **이미지** | ✅ 이미 구현·검증됨(`enrich-article-images.js`) | 그대로 재사용 — og:image 추출, timeout/blocked/no_og_image/other_error 분류, topic 우선순위 백필까지 완성돼 있음. 신규 작업 없음 |
| **출처(원문 링크)** | ✅ 이미 존재 | `story_articles` 테이블 그대로 사용. 신규 작업 없음 |
| **타임라인** | ✅ 이미 존재 | `topic_timeline_events` 테이블(topic_id, event_date, title, summary, source_story_id) 이미 스키마 있음 — 지금까지 채우는 로직만 없었을 뿐. Layer 2b에서 이 테이블 조회/기록 로직만 추가하면 됨 |
| **영상** | ❌ 없음 | 관련 자동 수집 함수 없음(`app/youtube`는 정적 페이지로 확인, RSS 자동 연동 아님). **외부 API(YouTube Data API 등) 신규 연동 필요 — 승인 목록 대상** |
| **차트(실적·판매량 등)** | ❌ 없음 | 렌더링 문제가 아니라 **데이터 자체가 없음** — 구조화된 실적/판매량 데이터를 어디서 수집할지부터 미정. 가장 큰 신규 비용 요소. **승인 목록 대상** |

이미지/출처/타임라인 3종은 Layer 2b에서 바로 조립 가능하지만, 영상/차트 2종은 **결정 3(Phase 5 보류 확정)**에 따라 이번 Phase 범위에서 제외하고 Editorial Plan의 `evidence_required`에 있어도 "생략 가능"으로 처리한다. 단 §8에서 이미 `blocks[].type`과 `evidence_refs_used` 네임스페이스에 영상·차트 자리를 예약해뒀으므로, Phase 5 착수 시에도 스키마 변경 없이 조달 로직(2b)과 렌더링만 추가하면 된다.

---

## 10. 품질평가·재생성·실패격리·비용/실행시간 통제 (v3 재설계 — 무인 동작 기본)

**결정 4: 사람 검토를 기본 전제로 설계하지 않는다.** Self-Review / QA / Retry / Confidence로 AI 내부 검증을 최대한 활용하고, 그래도 실패하면 사람 큐로 보내는 게 아니라 **더 단순하지만 이미 검증된 기존 방식(짧은 `ai_outlook`/`ai_counter_view`)으로 자동 강등(graceful degradation)**한다. 사람 개입은 상시 운영 흐름이 아니라 선택적 Hook으로만 남긴다.

```
2a-i. 본문 생성(LLM)
  ↓
2a-ii. Self-Review(같은 호출 체인 내 경량 자기검토 — Plan 체크리스트 대조, 필요시 즉시 inline 수정)
  ↓
Editorial Draft
  → 3a 결정론적 체크(코드, 즉시, 무료)
      - blocks[].axis 커버리지 == axis_weights의 0이 아닌 축 전부?
      - evidence_refs_used ⊇ evidence_required(생략가능 제외)?
      - length(글자수 합) ∈ target_length_range?
      - requires_dual_perspective=true인데 perspective_markers가 1개뿐?
      - type_confidence < 0.7?
      실패 → 원인별 분기(전부 Retry, 사람 개입 없음):
        evidence 부족 → Layer 2b 재시도(기존 og:image 재시도 로직과 동일 패턴 — NULL 유지·다음 배치 재시도)
        구조/길이 실패 → Layer 2a 재시도(실패 사유를 프롬프트에 피드백)
        confidence 낮음 → Layer 1 재실행
  → 3b LLM 정성 체크(3a 통과분만, 비용 있음, 가능하면 생성에 쓴 것과 다른 모델/컨텍스트로 — 자기 검토의 사각지대 보완)
      - Editorial OS 유형별 "흔한 저품질 패턴" 체크리스트를 구조화 pass/fail+사유+qa_confidence로 산출
      실패 → Layer 2a 재시도(사유 피드백)
  → 재시도 상한(유형당 최대 2회) 도달 시:
      **사람 검토 큐가 아니라 자동 강등** — 이 이벤트는 장문 Editorial Draft를 포기하고, 기존에 이미
      운영 중인 짧은 형태(`topics.ai_outlook`/`ai_counter_view`, 지금도 라이브)로만 발행한다. 즉
      "실패하면 아예 안 뜨거나 사람을 기다리는 것"이 아니라 "실패하면 예전 방식으로 자동 대체".
  → 발행
```

**Hook(선택적 사람 개입 지점, 상시 운영 전제 아님)**:
- `topics.editorial_status`(§11)에 `degraded`(강등 발행됨) 상태를 남겨 `/admin`에서 원하면 조회 가능하게만 한다 — 별도 "검토 필요" 큐 화면·알림·담당자 지정은 만들지 않는다.
- 이 로그는 순수 디버깅/튜닝용이다(예: 특정 유형이 계속 강등되면 §4 Rule 예비필터나 §1 FIXED 값을 고칠 신호로 사람이 "가끔" 참고). 운영의 기본 흐름은 이 로그를 아무도 안 봐도 멈추지 않는다.

**실패 격리 원칙(기존 이미지 파이프라인에서 이미 검증된 패턴 계승)**:
- 재시도는 **유형당 상한**(예: 최대 2회) — 상한 도달은 위 자동 강등으로 흡수, 파이프라인 자체는 멈추지 않음.
- 한 이벤트의 생성 실패가 다른 이벤트 처리에 영향 주지 않도록 이벤트 단위로 완전히 격리(기존 `mapWithConcurrency` 패턴 재사용 가능).
- **비용/실행시간 통제**: Layer 1과 Layer 2a는 이벤트당 각 LLM 호출 1회(+Self-Review 소폭 추가)로 캡, 3b(정성 QA)는 3a 통과분만 실행. 배치 실행 시 `collect-news.js`에 이미 적용된 "시간 예산 내 best-effort" 패턴(20초 예산, 초과분은 다음 배치로 이월) 그대로 이식.

---

## 11. 기존 DB 재사용 필드 vs 신규 테이블/컬럼

| 기존 재사용 | 용도 |
|---|---|
| `topics.ai_outlook / ai_counter_view / ai_context(jsonb)` | Editorial Plan 전체와 생성 메타데이터(사용된 prompt 조각 버전 등) 영속화 |
| `story_articles` | 출처 블록 |
| `topic_timeline_events` | 타임라인 블록(로직만 추가, 스키마는 이미 있음) |
| `topic_entities` / `entities` | 관련 엔티티 칩(포르쉐 Topic 탐험 목업의 엔티티 밴드) |
| `articles.og_image_url` / `url_resolution_status` | 이미지 블록(그대로) |

| 신규 제안 | 목적 |
|---|---|
| `event_type_rules`(테이블) | 유형10종의 FIXED 값(축가중치/생략축/관점고정/필수근거/길이범위/화두반영여부) 룩업 |
| `daily_zeitgeist`(테이블) | §5의 공유 화두 자산 |
| `editors`(테이블) | §7의 Persona Registry — `perspective_tag/style_signature/rhythm_profile/emphasis_pattern` 4속성 번들 |
| `topics.editorial_status`(컬럼, text) | `pending / generating / published / degraded` — §10의 Hook(강등 로그)용. 사람 검토 큐 아님, 조회 전용 |
| `topics.editorial_retry_count`(컬럼, int) | 재시도 상한 카운트 |

전부 §12 Phase 계획에서 승인 시점을 분리해 제안.

---

## 12. 구현 Phase별 계획과 완료 기준

| Phase | 범위 | 완료 기준 |
|---|---|---|
| **Phase 1 — FIXED 데이터화** | `event_type_rules` 테이블 생성 + Editorial OS 10유형 값 입력만(코드 로직 없음) | 10유형 전부 룩업 조회로 축가중치·필수근거·길이범위가 나오는지 수동 쿼리로 확인 |
| **Phase 2 — 분류+화두 배치** | Layer 0(Zeitgeist 배치 함수) + Layer 1의 Rule 예비필터 + LLM 분류 확정 호출 | 실제 기사 20~30건으로 유형 분류 정확도 수동 샘플 검수(오분류율 목표 설정 필요), `daily_zeitgeist` 하루 1회 정상 생성 확인 |
| **Phase 3 — 생성+결정론적 QA** | Layer 2a(본문생성+Self-Review, §8 구조화 출력) + Layer 2b 중 이미지/출처/타임라인만(영상·차트 제외) + 3a 결정론적 체크 + 재시도 상한 도달 시 자동 강등(§10) | 생성된 Draft가 스키마 검증 통과, evidence 커버리지·길이·대립관점 마커가 3a로 자동 판정되는지 확인, 재시도 루프와 강등 경로가 사람 개입 없이 끝까지 동작하는지 확인 |
| **Phase 4 — LLM 정성 QA + Persona** | 3b 정성 체크 + `editors` 테이블·Persona Registry 연결(§7, 4속성 번들) | 3b 체크리스트가 Editorial OS의 저품질 패턴을 실제로 걸러내는지 샘플 검수, 발행물에 에디터 바이라인이 실제로 붙는지, §6의 사건유형 클램프가 실제로 문체를 조정하는지 프론트·로그로 확인 |
| **Phase 5(보류) — 영상·차트** | §9에서 제외한 두 블록 | 데이터 소스·외부 API 선정이 먼저 승인된 뒤 착수(승인 목록 참고) |

각 Phase는 이전 Phase 완료 기준 충족 후에만 착수 — Phase 3까지만 완료돼도 "이미지 파이프라인처럼 실사용 데이터로 검증된 최소 기능"에 도달한다.

---

## 13. 승인 필요 목록

별도 문서 `docs/newsjeoul-editorial-engine-approval-items.md` 참고 — DB 스키마 변경, 외부 API 신규 사용, 비용/실행시간 증가 요소만 추려서 정리함.

---

관련: `docs/newsjeoul-ai-editorial-bible.md`(기존 파이프라인 진단), `docs/newsjeoul-content-bible.md`(콘텐츠 원칙), `docs/newsjeoul-editorial-engine-approval-items.md`(승인 목록)
