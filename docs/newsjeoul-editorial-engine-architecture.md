# 뉴스저울 Editorial Engine 아키텍처 설계서 (v1)

> 디자인팀(노차장) "Editorial OS v1 설계서"에 대한 개발팀(노실장) 아키텍처 검토 응답. 구현 코드 아님 — 설계 문서.
> 기준 입력: `뉴스저울 - Editorial OS v1 설계서.dc.html`(사건 유형 10종 × 축/관점/근거/QA), 기존 파이프라인(`docs/newsjeoul-ai-editorial-bible.md`), 기존 DB 스키마(`supabase/*.sql`).

## 0. 한 줄 결론

Editorial OS의 FIXED/AI-JUDGED/QA 3층 분리는 그대로 좋은 뼈대다. 다만 지금 제안된 흐름은 **"오늘의 화두"가 이벤트마다 반복 추출되는 구조**와 **"판별→축→관점→문체"가 4번의 개별 판단처럼 그려진 구조**가 비효율적이다. 아래처럼 재구성할 것을 제안한다: 화두는 **하루 1번 배치로 분리**하고, 판별·축보정·관점선택은 **이벤트당 1번의 통합 LLM 호출**로 묶고, 본문 생성과 근거(이미지/차트) 수집은 **병렬화**하고, QA는 **결정론적 체크(공짜, 즉시) → LLM 정성 체크(비용 있음, 통과분만)** 2단으로 나눈다.

---

## 1. 전체 아키텍처 — 4개 레이어

```
[Layer 0] Zeitgeist Layer        하루 1회 배치, 이벤트와 무관
    ↓ (오늘의 화두 태그 리스트를 컨텍스트로 주입)
[Layer 1] Classification & Planning   이벤트당 1회, 통합 LLM 호출 1번
    → Editorial Plan (구조화 JSON, 단일 진실 소스)
    ↓
[Layer 2] Generation & Evidence   Plan을 입력으로 병렬 fan-out
    (2a) 본문 생성(LLM)   ‖   (2b) 근거 수집(이미지/차트/영상, 비-LLM 위주)
    ↓ (둘 다 완료되면 merge)
[Layer 3] QA & Publish
    (3a) 결정론적 체크 → 실패 시 Layer 2 재시도(bounded) → (3b) LLM 정성 체크 → 발행
```

기존 제안 흐름(수집→유형판별→화두추출→축결정→관점선택→문체적용→본문생성→미디어배치→QA→Topic생성)과 비교해 달라지는 지점:

| 기존 제안 | 문제 | 이 설계의 대응 |
|---|---|---|
| 화두 추출이 이벤트별 스텝 | 같은 날 이벤트끼리 화두 해석이 미묘하게 갈릴 수 있음, 매번 재계산 낭비 | Layer 0에서 하루 1번 계산, 캐시된 태그 리스트를 Layer 1에 컨텍스트로 주입 |
| 판별→축→관점→문체가 별도 스텝처럼 나열 | LLM 호출 4번 = 비용·지연 4배, 스텝 간 논리 불일치 위험(1번 호출의 판단을 2번 호출이 모름) | 판별+축보정+관점선택을 **구조화 출력 1회 호출**로 통합(문체는 아래 §4에서 별도 처리 제안) |
| 미디어 배치가 본문생성 뒤에 순차 | 근거 수집(이미지 URL 등)은 본문 내용에 의존하지 않는 경우가 대부분 → 불필요한 직렬화 | 본문 생성과 근거 수집을 Plan 확정 직후 병렬 실행 |
| QA가 한 덩어리 | 근거 누락 같은 결정론적 체크까지 LLM에 맡기면 느리고 비쌈 | 결정론적 체크(무료, 즉시) 먼저, 통과한 것만 LLM 정성 체크로 |

---

## 2. Layer별 역할

### Layer 0 — Zeitgeist Layer (신설 제안)
- **역할**: 그날 활성 토픽 전체를 훑어 "오늘의 화두 태그"(예: `["전동화", "가격논쟁", "AGI"]`) 산출. 하루 1회.
- **구현**: 기존 파이프라인의 `generate-insights.js`/`generate-node-insights.js`와 같은 급의 신규 배치 함수(예: `generate-zeitgeist.js`, 1일 1회 스케줄) — 이미 "1일 1회만 스케줄"인 함수군에 자연스럽게 합류.
- **출력**: `daily_zeitgeist { date, tags: string[] }` — 작은 테이블 하나로 충분. Layer 1이 그날 날짜로 조회해 프롬프트에 주입.
- **FIXED/AI-JUDGED 재분류**: 화두 추출 자체는 AI-JUDGED이지만, **"이 화두를 이벤트에 강제 반영할지"는 유형별 FIXED 규칙**이다(예: 유형10 재난은 Editorial OS 원문에 이미 "화두 반영 배제가 QA 원칙"이라고 명시돼 있음) — 이 예외 규칙을 Layer 1의 룩업 테이블에 명시적으로 넣어야 한다.

### Layer 1 — Classification & Planning (핵심 레이어)
- **역할**: 이벤트 원문 + Layer 0의 화두 태그를 입력받아 **Editorial Plan** 하나를 확정한다.
- **내부 서브스텝(§3에서 상술)**: (1) Rule 기반 유형 후보 압축 → (2) LLM 구조화 호출 1번으로 `event_type/type_confidence/axis_overrides/perspectives/requires_dual_perspective` 동시 산출.
- **출력**: 아래 §5의 Editorial Plan JSON. 이 객체가 Layer 2/3 전체의 유일한 입력이자 로그 대상 — "왜 이렇게 만들어졌는가"를 나중에 추적하려면 이 Plan을 `topic_updates`나 별도 `editorial_plans` 테이블에 통째로 영속화해야 한다(현재 `ai_context` jsonb 컬럼이 이 용도로 이미 존재하므로 그대로 확장 사용 가능).
- **문체(Editorial Style)는 이 레이어에서 다루지 않는다** — §4 참고.

### Layer 2 — Generation & Evidence (병렬)
- **(2a) 본문 생성**: Editorial Plan + Prompt Layer(§6)를 조합해 LLM 1회 호출로 장문 생성. 입력이 이미 Layer 1에서 100% 확정돼 있으므로 이 호출은 "쓰기"에만 집중 — 판단 로직이 섞이지 않는다.
- **(2b) 근거 수집**: `evidence_required`에 명시된 항목(이미지/스펙데이터/비교표/영상/원문 등)을 조달. 이미지의 경우 이미 구축된 `enrich-article-images.js` 파이프라인(og:image 추출, timeout/blocked/no_og_image/other_error 분류, topic 연결 우선순위)을 그대로 재사용 — 이 레이어가 새로 발명할 것은 거의 없다. 차트/영상은 신규 조달 로직 필요.
- **왜 병렬인가**: 2a는 순수 LLM 텍스트 생성, 2b는 대부분 외부 fetch/DB 조회 — 서로 의존성이 없다. 유일한 예외는 "본문이 인용한 특정 이미지"처럼 생성 결과가 근거 선택에 영향을 주는 경우인데, Editorial OS 예시를 보면 근거는 사건 자체에서 오지 본문에서 오지 않으므로(예: "이미지 필수(실물컷)") 이 예외는 사실상 없다.

### Layer 3 — QA & Publish
- **(3a) 결정론적 체크** (LLM 미사용, 즉시): `evidence_present` vs `evidence_required` 충족 여부, `target_length_range` 충족 여부, `requires_dual_perspective=true`인데 본문에 대립 구도 마커가 없는지(생성 프롬프트에 명시적 섹션 마커를 요구해두면 정규식으로 체크 가능), `type_confidence < 0.7`이면 이 시점에 Layer 1 재실행으로 루프백.
- **(3b) LLM 정성 체크** (3a 통과분만): "저품질 패턴" 목록(Editorial OS에 유형별로 이미 명시돼 있음 — 예: "보도자료 그대로 요약", "숫자만 나열하고 해석 없음")을 체크리스트화해 LLM에게 pass/fail+사유를 구조화 출력시킴. fail이면 Layer 2 재시도(사유를 프롬프트에 피드백으로 추가) — 재시도 횟수 상한 필요(무한루프 방지, 예: 최대 2회 후 사람 검토 큐로).
- **발행**: `topics`/`topic_updates`에 최종 기록, `ai_context`에 Editorial Plan 전체 보존.

---

## 3. Event Type 판단 방식 — Rule + AI Hybrid 제안

4가지 옵션 중 **Rule + AI Hybrid**를 추천한다. 이유:

- Editorial OS 문서 자체가 이미 유형별 "판별 신호"(예: 유형1은 `"공개"/"출시"/"발표" + 제품명 + 스펙언급`)를 텍스트로 정의해뒀다 — 이건 사실상 규칙 엔진의 초안이 이미 존재한다는 뜻이다. 이걸 버리고 매번 10지선다 LLM 분류를 새로 시키는 건 이미 있는 자산을 낭비하는 것.
- **순수 단일 LLM 판단**은 10개 카테고리 중 결이 비슷한 것들(유형3 규제 vs 유형9 분쟁, 유형6 보안사고 vs 유형10 재난)에서 흔들릴 수 있는데, 이 문서가 스스로 "가장 위험한 오판"/"가장 치명적인 오판"으로 지목한 게 정확히 이 인접 카테고리들이다.
- **순수 다중 Agent**(여러 LLM이 토론)는 이 작업이 "판단 근거를 다투는 논쟁형 문제"가 아니라 "패턴 매칭형 분류 문제"라 과설계다. 지연·비용만 늘고 정확도 이득이 크지 않다.

**구체적 2단 설계**:
1. **Rule 예비필터**: 키워드/패턴 매칭으로 후보 1~3개 + 신뢰도 스코어 산출(빠르고 무료, 로그 남기기 쉬움 → 나중에 패턴 튜닝 가능).
2. **LLM 확정 호출**: 10지선다가 아니라 Rule이 좁혀준 후보 중에서 확정 + `type_confidence` + `axis_overrides_reason`을 구조화 출력. 후보가 명확히 하나뿐이면 이 호출도 스킵하고 Rule 결과를 그대로 채택(비용 절감), 애매하면(후보 2개 이상 또는 신뢰도 낮음) LLM에 위임.
3. **안전 오버라이드(신규 제안)**: 유형9(분쟁·전쟁)·10(재난)은 이 문서가 명시한 대로 "예외 없이" 적용되는 구조 규칙(9=양측 병치 강제, 10=단일관점 강제+화두배제)을 가진다. 이 두 유형에 대해서는 **Rule이 강한 신호로 감지하면 LLM의 유형 판단과 무관하게 구조 규칙을 하드락**해야 한다 — LLM이 확신을 갖고 다른 유형으로 재분류하더라도, 재난/분쟁 신호가 강하면 안전 규칙(단일관점/양측병치)은 최소한 유지한 채로 진행하고, 신뢰도가 낮으면 사람 검토 큐로 보낸다. "잘못 분류해서 재난 기사에 대립 관점이 붙는" 실패는 이 문서 스스로 "가장 위험"이라 부른 만큼, 이 지점만큼은 AI 자율판단보다 규칙이 이겨야 한다.

---

## 4. Perspective 구조 — 배열 유지 + Persona Registry로 확장 제안

Editorial OS의 JSON 예시는 이미 `perspectives: ["엔지니어", "소비자전문"]`처럼 **배열**로 설계돼 있다. 이건 맞는 방향이니 그대로 유지할 것을 제안하되, 개념을 두 겹으로 명확히 분리하자:

- `perspectives: string[]` — 본문에 녹일 분석 렌즈(1~3개, 복수 가능). 대부분은 조화롭게 섞여 하나의 목소리로 서술됨.
- `requires_dual_perspective: boolean` — 그 중 특정 두 관점을 **명시적 대립 구도**(양측 인용/반박)로 구조화할지 여부. 이건 "관점이 몇 개냐"와 다른 질문("관점을 어떻게 배치하냐")이므로 별도 필드로 유지해야 한다 — 이미 그렇게 설계돼 있어 좋다.

**여기에 신규 레이어 하나를 제안한다: Persona/Editor Registry.**

이유: 프론트엔드 코드에 이미 `EditorPersona`(`name`/`styleTag`/`avatarColor`) 타입이 `CardShell.tsx` 등 카드 컴포넌트 전반에 깔려 있는데, 지금은 전부 `undefined`인 채로 "디지털 편집국 단계에서 실제 연결"이라는 주석만 달려 있다. 즉 **"100명의 에디터" 프론트엔드 자리는 이미 파여 있고 백엔드 데이터만 없는 상태**다.

지금 Editorial OS의 `perspectives`는 추상적 렌즈("엔지니어")일 뿐 이름·아바타·고정 목소리가 있는 인격체가 아니다. 이걸 실제 "100명의 에디터"로 만들려면:

```
editors 테이블(신규):
  id, name(예: "마르쿠스"), perspective_tag(예: "엔지니어"),
  avatar_color, voice_style_ref(문체 프로필 키),
  domains[](담당 분야, 예: ["자동차","전자기기"]), bio, active
```

Layer 1이 `perspectives: ["엔지니어", "소비자전문"]`를 정하면, 그 다음(Layer 1의 마지막 서브스텝 또는 Layer 2 진입 직전) 각 perspective_tag를 `editors` 테이블에서 실제 편집자 1명으로 resolve한다(같은 태그에 여러 에디터가 있으면 도메인·로테이션으로 선택). 이러면:
- Perspective 선택(추상적 판단)과 Editor 배정(구체적 인격 부여)이 분리되어, perspective 체계를 안 건드리고도 에디터 숫자만 늘릴 수 있다(100명 확장의 핵심).
- 프론트엔드의 `EditorPersona` 슬롯을 그대로 채울 수 있다(바이라인, 아바타, "이 에디터의 다른 글" 같은 기능으로 자연 확장).
- QA에 "이 글이 진짜 이 에디터답게 써졌는가"라는 목소리 일관성 체크를 추가할 여지가 생긴다(§2 Layer 3b에 추가 가능).

---

## 5. Editorial Plan — Layer 1의 산출물 (단일 진실 소스)

Editorial OS 원문의 JSON 예시를 기반으로, 위 제안들(Zeitgeist 분리, Persona resolve, 문체 FIXED화)을 반영해 최종 필드를 정리하면:

```jsonc
{
  "event_id": "evt_20260711_porsche_launch",
  "event_type": "신제품·모델출시",         // Layer1, Rule예비필터+LLM확정
  "type_confidence": 0.94,                 // <0.7이면 Layer1 재실행 or 사람 검토
  "domain": "자동차",
  "zeitgeist_ref": "2026-07-11",           // Layer0 결과 조회 키(값 자체를 복붙하지 않고 참조)
  "axis_weights": { "핵심변화":0.35,"비교":0.30,"지금":0.15,"행위자":0.10,"역사":0.10,"연결":0 },
  "axis_overrides_reason": "가격 논쟁 화두로 '비교' +5%p",
  "perspectives": ["엔지니어","소비자전문"],
  "editors_assigned": ["editor_marcus","editor_sera"],  // 신규: Persona Registry resolve 결과
  "requires_dual_perspective": false,
  "style_profile": "domain:자동차",         // 신규: §6 참고, 기본은 도메인 FIXED 조회
  "evidence_required": ["image_hero","spec_data","comparison_table","source>=2"],
  "target_length_range": [1400, 1800],
  "qa_flags": ["single_perspective_check","evidence_completeness","zeitgeist_alignment"]
}
```

이 객체는 그대로 `topics.ai_context`(기존 컬럼)에 영속화하면 스키마 변경 없이 확장 가능하다. `editors_assigned`만 추가 컬럼 또는 `ai_context` 내부 필드로 흡수 가능.

---

## 6. Prompt Layer 설계 — 템플릿이 아니라 "조각 조합"

축·관점·문체를 프롬프트에서 관리하는 가장 효율적인 방법은 **거대한 프롬프트 하나를 유형별로 복붙**하는 게 아니라, **작은 프롬프트 조각(fragment)을 조합**하는 구조다.

- **Axis Instruction 변환**: `axis_weights`를 그대로("35%") 프롬프트에 넣기보다, `target_length_range`와 곱해 **글자수 예산으로 환산**해 명시한다(예: "핵심변화 축 약 600자, 비교 축 약 500자..."). LLM은 추상적 비율보다 구체적 분량 지시를 더 잘 따른다.
- **Perspective 조각**: perspective_tag(또는 §4의 `editors_assigned`) 하나당 짧은 "페르소나 스니펫"(그 인물의 관심사·말투 3~5줄)을 별도 저장(코드에 하드코딩하지 말고 DB나 버전관리되는 JSON 설정으로) — 새 에디터/관점 추가 = 새 조각 추가일 뿐, 파이프라인 코드나 프롬프트 템플릿 자체는 안 건드린다. 이게 100명 확장의 실질적 관건이다.
- **Style 조각**: 마찬가지로 스타일 프로필 키(`style_profile`) → 구체적 톤 지시문으로 별도 관리. **문체는 사건별 AI 판단이 아니라 도메인 단위 FIXED 조회로 격하할 것을 제안한다** — Editorial OS의 예시에도 `editor_style_profile`이 이벤트마다 달라지는 게 아니라 브랜드 전체에 거의 고정된 값("친근한 거래처 직원체")으로 등장한다. 매 사건마다 문체를 새로 판단하게 하면 같은 도메인 안에서 글마다 톤이 흔들릴 위험이 있다 — 오히려 "재난 유형처럼 원래 톤을 깨야 하는 예외"만 FIXED 규칙(유형별 override)으로 명시하는 게 안전하다.
- **조합 지점**: `[STYLE 조각] + [AXIS 예산 지시문] + [PERSPECTIVE 조각들] + [EVIDENCE 블록] + [OUTPUT FORMAT(대립관점 마커 등 QA가 파싱할 수 있는 구조)]` 순서로 하나의 최종 프롬프트를 런타임에 조립한다.
- **버전 관리**: 조각마다 버전 번호를 붙이고, 생성된 글의 `ai_context`에 "이 글이 어떤 조각 버전들로 만들어졌는지" 기록한다. `AGENTS.md`의 승인 경계에 "AI 프롬프트 변경"이 이미 승인 필요 항목으로 명시돼 있는데, 조각 단위 버전 관리가 있어야 "이번에 뭐가 바뀌었는지"를 정확히 승인받을 수 있다.

---

## 7. QA Layer 설계 — 2단 게이트

```
생성 결과
  → (3a) 결정론적 체크 (무료, 즉시, 코드로 구현)
       - evidence_required ⊆ evidence_present ?
       - length ∈ target_length_range ?
       - requires_dual_perspective=true 인데 출력에 대립 마커 없음 ?
       - type_confidence < 0.7 ?
       → 실패: 사유별로 다르게 처리
           - evidence 실패 → Layer 2(2b) 재시도(근거 재조달, 이미 구축된 og:image 재시도/타임아웃 분류 로직 재사용)
           - length/구조 실패 → Layer 2(2a) 재시도(프롬프트에 실패 사유 피드백 추가)
           - confidence 낮음 → Layer 1 재실행 또는 사람 검토 큐
  → (3b) LLM 정성 체크 (3a 통과분만, 비용 있음)
       - Editorial OS의 유형별 "흔한 저품질 패턴" 체크리스트를 LLM에게 pass/fail+사유로 구조화 출력시킴
       → 실패: Layer 2(2a) 재시도(사유 피드백), 상한 도달 시 사람 검토 큐
  → 발행
```
재시도는 반드시 **상한**(예: 유형당 최대 2회)을 두고, 상한 도달분은 자동 발행하지 않고 사람 검토 큐에 쌓아야 한다 — 무한 재시도 루프가 비용을 태우는 걸 막는 안전장치.

---

## 8. Editorial OS 자체에 대한 수정 제안 요약

1. **화두(Zeitgeist)를 이벤트별 스텝에서 분리**해 하루 1회 배치로 옮길 것.
2. **문체(Style)를 AI-JUDGED에서 도메인 단위 FIXED로 격하**하고, 유형별 예외(재난 등)만 명시적 override 규칙으로 둘 것.
3. **Perspective와 Editor(Persona) 개념을 분리**해, Perspective는 추상 렌즈로 남기고 실제 인격(이름/아바타/목소리)은 신규 Persona Registry가 담당하게 할 것 — 이게 "100명 에디터" 확장의 실질 메커니즘.
4. 유형9(분쟁)·10(재난)의 구조 규칙(양측병치 강제/단일관점 강제)은 **AI 판단보다 규칙이 우선하는 안전 오버라이드**로 명문화할 것.
5. `type_confidence < 0.7` 재분류 루프, QA 실패 시 재시도 상한 등 **루프백 경로를 흐름도에 명시**할 것(현재 문서엔 값만 있고 어디서 쓰이는지 흐름이 없음).

---

## 9. 다음 결정이 필요한 것 (채과장 확인 필요, 구현 아님)

- Persona Registry(§4)를 이번 단계에서 함께 설계할지, 아니면 Perspective만 우선 구현하고 Persona는 다음 단계로 미룰지.
- 문체(Style)를 도메인 단위로 얼마나 세분화할지(도메인 1개 = 스타일 1개인지, 도메인 내에서도 톤 편차를 둘지).
- QA(3b) LLM 정성 체크를 전수 실행할지, 비용 관리를 위해 샘플링(예: 신뢰도 낮은 것만) 실행할지.
- 재시도 상한 도달 시 쌓이는 "사람 검토 큐"를 실제로 누가, 어떤 화면(예: 지금 `/admin`)에서 처리할지.

---

관련: `docs/newsjeoul-ai-editorial-bible.md`(기존 파이프라인 진단), `docs/newsjeoul-content-bible.md`(콘텐츠 원칙)
