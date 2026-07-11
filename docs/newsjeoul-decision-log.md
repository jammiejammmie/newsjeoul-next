# 뉴스저울 Decision Log

> 프로젝트에 영향을 주는 결정을 "무엇으로 정했는가"가 아니라 **"왜 그렇게 정했는가"** 중심으로 남기는 문서. 구현 문서 아님 — `docs/newsjeoul-editorial-engine-architecture.md` 등 실제 설계 문서와 분리해서, 나중에 방향을 재검토할 때 판단 근거를 빠르게 추적하기 위한 이력 전용 문서. 새 결정이 생길 때마다 이 문서에 항목을 추가한다(과거 항목은 수정하지 않고, 번복 시 새 Decision ID로 추가하고 이전 항목에 "→ DEC-00X로 대체" 표기).

## 인덱스

| ID | 결정 주제 | 결정일자 |
|---|---|---|
| DEC-001 | 오늘의 화두(Zeitgeist) 처리 방식 | 2026-07-11 |
| DEC-002 | 문체(Editorial Style)를 독립 레이어로 유지 | 2026-07-11 |
| DEC-003 | 100명 에디터 = Editorial Persona Registry | 2026-07-11 |
| DEC-004 | 영상·차트 블록 Phase 5 보류 | 2026-07-11 |
| DEC-005 | 사람 검토 큐를 기본 흐름에서 제외 | 2026-07-11 |

---

### DEC-001 — 오늘의 화두(Zeitgeist) 처리 방식

- **제안 내용**: 개발팀이 Editorial OS v1의 파이프라인(사건마다 "오늘의 화두 반영" 스텝이 있는 구조)을 검토하며, 이벤트마다 화두를 반복 추출하면 같은 날 이벤트끼리 해석이 미묘하게 갈릴 수 있고 계산도 낭비라고 지적. 하루 1회 배치로 분리해 모든 이벤트가 같은 값을 참조하는 구조를 제안.
- **최종 결정 내용**: 제안 그대로 채택. 화두는 하루 1회 생성해 여러 사건이 공유하는 편집국 공통 컨텍스트로 관리.
- **결정 이유**: "오늘의 화두는 기사마다 다시 만드는 값이 아니라, 일정 주기로 생성해 여러 사건이 공유하는 편집국 공통 컨텍스트로 관리하는 편이 자연스럽다"(채과장).
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §5(오늘의 화두 — 공유 자산화 방식), §2(Layer 0 Zeitgeist).

---

### DEC-002 — 문체(Editorial Style)를 독립 레이어로 유지

- **제안 내용**: 개발팀은 Editorial OS의 `editor_style_profile` 예시값이 사건마다 바뀌지 않고 브랜드 전반에 거의 고정된 값으로 보인다고 판단, 매 사건 AI가 새로 판단하게 하면 톤이 흔들릴 위험이 있다고 보고 "도메인 단위 FIXED"로 격하할 것을 제안.
- **최종 결정 내용**: 기각. 문체는 독립 레이어로 유지하되, 완전 자유값이 아니라 **사건 유형과 관점(Editorial Persona)의 영향을 받는 가변 레이어**로 재설계(계산 순서: 관점 선택 → Persona resolve → Persona 고유 문체를 사건유형 FIXED 규칙으로 클램프).
- **결정 이유**: "같은 자동차 Topic이라도 신차 발표·리콜·실적 발표·CEO 인터뷰는 전달해야 하는 분위기와 리듬이 다르다"(채과장) — 도메인 단위로 고정하면 이 차이가 사라짐.
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §6(축·관점·문체·에디터 페르소나의 관계), §1(유지/수정/보완 표); `docs/newsjeoul-editorial-engine-crosscheck.md` A.

---

### DEC-003 — 100명 에디터 = Editorial Persona Registry

- **제안 내용**: 개발팀이 프론트엔드에 이미 존재하는(미사용) `EditorPersona` 타입을 근거로, 관점(Perspective)을 실제 이름·아바타가 있는 에디터로 resolve하는 Persona Registry(`editors` 테이블) 신설을 제안하며, 이게 정말 원하는 방향인지("100가지 관점"이라는 은유일 수도 있다는 전제로) 확인 요청.
- **최종 결정 내용**: Persona Registry 방향 채택. 단 Persona는 단순 캐릭터 라벨이 아니라 **관점+문체+리듬+강조 방식을 포함하는 하나의 Editorial Persona**로 설계(개별 100명의 구체적 이름·프로필 설계는 별도 진행, 이번엔 필드 구조까지만 확정).
- **결정 이유**: "뉴스저울의 목표는 단순히 '100가지 문체'가 아니라 100명의 디지털 에디터가 존재하는 편집국이다"(채과장) — 은유가 아니라 실제 인격 단위의 확장을 의도함이 명확화됨.
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §7(100명 에디터 — Editorial Persona 선택 및 적용 구조), §11(editors 테이블 스키마: `perspective_tag/style_signature/rhythm_profile/emphasis_pattern`).

---

### DEC-004 — 영상·차트 블록 Phase 5 보류

- **제안 내용**: 개발팀이 현재 코드베이스에 영상 자동 수집(YouTube API 등)·차트용 구조화 데이터 소스가 전혀 없음을 확인, 이 두 블록을 "렌더링 문제가 아니라 데이터 조달 자체가 없는 문제"로 규정하고 초기 Phase에서 제외(Phase 5로 보류)할 것을 제안.
- **최종 결정 내용**: 보류 제안에 동의. 단 조건부 — **Block 구조 자체는 처음부터 영상·차트 확장을 고려해 설계**할 것을 전제로 승인(`blocks[].type` enum에 `video`/`chart` 값을 미리 예약, 나중에 스키마 변경 없이 추가 가능하도록).
- **결정 이유**: "현재는 Editorial Engine과 장문 콘텐츠 품질이 우선"이나, "디자인 목업과 실제 구현의 간극이 커지지 않도록 향후 확장 가능한 Block 구조는 처음부터 고려"할 것(채과장) — 우선순위는 개발팀 판단을 따르되 미래 확장성은 지금 담보해둘 것을 요구.
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §8(구조화 출력 스키마의 blocks[].type 예약), §9(이미지·영상·차트·타임라인·출처), §12(Phase 5); `docs/newsjeoul-editorial-engine-approval-items.md`(외부 API 항목, 여전히 미승인 상태로 보류).

---

### DEC-005 — 사람 검토 큐를 기본 흐름에서 제외

- **제안 내용**: 개발팀이 안전장치로 QA 재시도 상한(예: 2회) 초과 시 자동 발행을 막고 사람이 검토하는 큐(`/admin` 신규 탭)로 이관하는 방식을 제안.
- **최종 결정 내용**: 기각. 사람 검토를 기본 전제로 설계하지 않음. **Self-Review / QA / Retry / Confidence** 등 AI 내부 검증을 최대한 활용해 무인으로 동작하고, 재시도 상한 도달 시에는 사람 큐가 아니라 이미 운영 중인 짧은 형식(`ai_outlook`/`ai_counter_view`)으로 자동 강등(graceful degradation). 시스템적으로 사람이 들여다볼 수 있는 Hook(`topics.editorial_status='degraded'` 로그)만 남김.
- **결정 이유**: "뉴스저울의 목표는 AI 중심 편집국이다. 사람 검토를 기본 전제로 설계하지 않는다"(채과장) — 다만 "시스템적으로 사람이 개입할 수 있는 Hook 정도는 남겨두되, 운영의 기본 흐름은 사람 검토 없이도 동작하는 구조를 목표로 한다"는 단서를 명시.
- **영향 문서·섹션**: `docs/newsjeoul-editorial-engine-architecture.md` §4(오분류 대응 루프백), §10(품질평가·재생성·실패격리, Self-Review 스텝 추가·자동 강등 설계), §11(`topics.editorial_status` 필드 용도 재정의).

---

관련: `docs/newsjeoul-editorial-engine-architecture.md`(설계 본문), `docs/newsjeoul-editorial-engine-crosscheck.md`(디자인팀 원안 대조), `docs/newsjeoul-editorial-engine-approval-items.md`(승인 목록)
