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
