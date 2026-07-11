<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 작업 원칙 (2026-07-06 확정, 채과장 지시)

큰 구조 변경(뉴스저울 2.0 Topic/Entity 개편 등) 작업에서 반드시 지킬 것:

1. 역할 분리: 채과장(사용자)이 설계, Claude가 구현. 설계가 확정되기 전에는 코드/DB 구조를 임의로 바꾸지 않는다. 애매하면 먼저 질문한다.
2. 순서: 설계 → 새 파일 작성 → 연결 → Build → Commit. 한 번에 구현까지 밀어붙이지 않는다.
3. SQL, 설계 문서, 10줄 이상 바뀌는 코드 파일은 **Edit(부분 치환) 금지**. 절차는 다음을 따른다:
   - (1) 기존 파일을 삭제(rm)한다
   - (2) 빈 파일을 새로 만든다
   - (3) 채과장이 제공한 완성본을 한 글자도 바꾸지 않고 그대로 저장한다 — 임의 수정/병합/보완 금지
   - (4) 다시 읽어 원문과 100% 동일한지만 검증한다
   - (5) Build/Commit/추가 수정은 별도 승인 전까지 하지 않는다
4. 같은 파일의 같은 위치를 두 번 이상 Edit로 재시도하지 않는다 — 실패 시 즉시 위 절차로 전환.
5. 새 기능은 가능한 새 파일(lib, docs 등)로 분리한다. 대형 파일(page.tsx 등)은 최소 줄만 수정한다.
6. 승인 화면에서 같은 컬럼/함수/import/index가 두 번 보이면 그 수정은 실패로 간주하고 재시도하지 않는다 — 원인 설명 후 승인을 다시 받는다.

# 뉴스저울 바이블 (2026-07-10 신설)

새 작업을 시작하기 전 아래 4개 문서를 먼저 확인한다. 새로운 아이디어가 나오면 구현보다 먼저 여기에 기록한다.

- `docs/newsjeoul-content-bible.md` — 콘텐츠 원칙(질문형 제목, CTR 4문항, 전문가급 본문, 금지 문구)
- `docs/newsjeoul-ux-bible.md` — UX/디자인 원칙(디자인 잠금 상태, 카드→드로어→Question Detail 루프, 이미지 원칙)
- `docs/newsjeoul-ai-editorial-bible.md` — 파이프라인 구조, 진단 기록, 승인 경계
- `docs/newsjeoul-ctr-bible.md` — CTR 원칙(Hero 기준, 카드/Threads 디자인, 좋은/나쁜 예시)
- `docs/newsjeoul-editorial-engine-architecture.md` — Editorial Engine 아키텍처(파이프라인 레이어, Event Type 판단, Persona Registry, 구조화 출력 스키마, DB 제안, Phase 계획, 2026-07-11 신설)
- `docs/newsjeoul-editorial-engine-approval-items.md` — 위 아키텍처에서 파생되는 DB/외부API/비용 승인 목록(구현 착수 신호 아님)
- `docs/newsjeoul-decision-log.md` — 프로젝트 의사결정 이력("무엇을"이 아니라 "왜") — 프로젝트에 영향을 주는 결정이 날 때마다 여기에 추가(2026-07-11 신설)

## 의사결정 기록 규칙 (2026-07-11 확정)

프로젝트에 영향을 주는 결정(설계 방향 승인/기각, 우선순위 변경 등)이 날 때마다 `docs/newsjeoul-decision-log.md`에 Decision ID를 새로 추가한다. 항목당 필수: 결정 주제, 제안 내용, 최종 결정 내용, **결정 이유(왜 그렇게 정했는지가 핵심)**, 영향받는 문서·섹션, 결정일자. 과거 항목은 수정하지 않고, 결정이 번복되면 새 ID로 추가하고 이전 항목에 대체 표기만 남긴다.

## 승인 경계 (2026-07-10 확정)

**승인 없이 계속 진행**: 문서화/조사 기록, 파이프라인 원인 조사(읽기 전용), 기존 기능을 깨뜨리지 않는 admin 편의 기능 추가, 코드 정리(리팩토링/주석/미사용 코드 조사/Deprecated 정리), UX·CTR·SEO·콘텐츠 사례 조사(구현 없이).

**반드시 승인 필요**: Hero 변경, 메인 UI 변경, 콘텐츠 생성 방식/질문 생성 로직 변경, importance_score 알고리즘, topic_relations 생성 방식, Hero 화이트리스트, 이미지 컬럼 추가, DB 스키마 변경/마이그레이션, 자동 스케줄 변경, 파이프라인 구조 변경, AI 프롬프트 변경. **승인을 구하는 질문 자체도 반복해서 올리지 말 것** — 위 목록에 없으면 그냥 진행하고 결과만 보고한다.
