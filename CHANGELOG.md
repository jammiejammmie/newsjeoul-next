# CHANGELOG

뉴스저울 마스터 스펙 v1(자기진화형 매체로의 전환) 실행 기록. 이 파일은 "왜 이렇게 판단했는가"를 남기는
용도다 — 승인 없이 진행하는 작업의 판단 근거를 여기 기록하고 계속 다음 작업으로 넘어간다.

## 실행 원칙 (요약)
- 문서 내 작업은 승인 없이 끝까지 진행. 판단이 갈리면 스스로 결정하고 이유를 여기 기록.
- 예외 3가지만 채팅으로 확인: (1) 크레덴셜/권한 없어 물리적으로 불가, (2) 결제 발생, (3) Track 4 비주얼 톤 A/B/C 선택.
- 막힌 것은 아래 BLOCKED 섹션에 기록하고 그 작업만 건너뛴다.

---

## BLOCKED

### DDL(CREATE TABLE) 실행 불가 — Track 2/3 신규 테이블 4종
- **막힌 것**: `proposed_event_types`/`weekly_reports`(Track 2), `comment_auto_reply_log`/
  `comment_auto_reply_settings`(Track 3) 4개 신규 테이블 생성.
- **이유**: PostgREST(Supabase REST API)는 DML(insert/select/update)만 가능하고 DDL을 지원하지
  않는다. Netlify와 별개로 Supabase 자체 로그인 자격(관리 토큰/DB 커넥션 문자열)이 이 세션에
  없음 — `supabase login`은 비-TTY 환경이라 자동 진행 불가(`--token` 필요), Netlify 환경변수에도
  Supabase 관리용 토큰 없음(REST용 anon/service key만 존재).
- **준비된 것**: `supabase/evolution_engine_migration.sql`에 4개 테이블 전체 DDL + RLS 정책 작성
  완료. **Supabase 대시보드 SQL Editor에 붙여넣고 실행만 하면 됨(30초 작업).**
- **그 사이 처리**: 이 테이블들을 참조하는 Netlify 함수는 그대로 배포한다 — 기존 코드베이스의
  `distribution_skip_log`/`distribution_run_log`(Threads 파이프라인, 아직 마이그레이션 전인데도
  배포돼 있음)와 동일한 패턴으로, 테이블이 없으면 에러를 조용히 catch하고 로그만 남긴 뒤 계속
  진행하도록 작성. SQL 실행 즉시(다음 주간 cron부터) 자동으로 정상 동작 시작.
- **나머지 작업**: 이 블로커와 무관하게 계속 진행.

---

## 진행 기록

### 2026-07-30 — Track 1 완료: 다양성 회복

**1-1. outlets 확장** — IT(전자신문/지디넷코리아/디지털데일리/블로터), 자동차(오토뷰/모터그래프),
소비재(컨슈머타임스/소비자가만드는신문), 정책(정책브리핑) 9곳 추가. 20 → 29개.
- 판단: "주요 지자체 보도자료"는 특정 지역만 넣으면 편중 위험이 있어 1차에서는 제외하고
  전국 단위 정책브리핑(korea.kr)만 추가. 지자체별 소스는 Track 2 갭 감지 결과로 실제
  수요가 확인되는 지역부터 추가하기로 판단.

**1-2. event_type_rules 확장** — 라이프스타일·트렌드/건강·의료/스포츠/청년정책·복지/지역행정/
환경·기후/기술 7개 추가. 10 → 17개. 기존 스키마(axis_weights 6축 합=1.0, required/omittable_axes,
evidence_required, target_length, common_pitfalls, misclassification_risk)를 그대로 따라 작성.
- 판단: 마스터 스펙의 "소비자전문가"는 `editors.perspective_tag`의 실제 값인 "소비자전문"으로
  교정(exact-match 로직이라 오타면 그 페르소나가 여전히 선택 안 됨).
- 적용 방법: PostgREST는 임의 SQL을 지원하지 않아, `run-diversity-migration.js`(1회성 admin
  함수)를 배포 → ADMIN_KEY로 호출해 REST insert 실행 → 결과 확인 후 함수 제거하는 방식 사용.
  `supabase/diversity_expansion_migration.sql`에 SQL 형태로도 동일 내용 보존.

**적용 결과**: outlets 20→29, event_type_rules 10→17, 커밋 `e500482`(추가) + `d83c35f`(임시
함수 제거), origin/master 배포 확인.

### 2026-07-30 — Track 2 완료(코드): Evolution Engine

`detect-coverage-gaps-background.js`(주간 승격실패 story 분석 → proposed_event_types 제안),
`generate-weekly-report-background.js`(카테고리 분포 + 에디터 활용률 스냅샷),
`approve-proposed-event-type.js`(admin 승인 시에만 event_type_rules 반영, Human Promotion
필수), `weekly-evolution-report.yml`(매주 월요일 09:00 KST GH Actions), admin 대시보드에
제안 큐 + 최신 리포트 카드 추가. 커밋 `9000ed7`.
- **판단**: 스케줄링은 Netlify 네이티브 schedule이 아니라 GitHub Actions로 구현 —
  커밋 8124a03에서 "Netlify 네이티브 cron이 광범위하게 죽어있던 것"을 이유로 이미 전면
  GH Actions로 전환한 팀 컨벤션을 그대로 따름(새로 native schedule을 또 추가하면 같은 장애
  반복 위험).
- BLOCKED: 신규 테이블 4종(proposed_event_types/weekly_reports 포함) — 아래 BLOCKED 섹션 참고.

### 2026-07-30 — Track 3 완료(섀도우 모드까지): 댓글 자동응답

`scan-comments-shadow-background.js`(최근 게시물 20건의 신규 댓글을 Claude로 분류+답변
초안 생성, comment_auto_reply_log에 저장), `scan-comments-shadow.yml`(매시 30분 GH
Actions), `update-comment-reply-settings.js`(admin 토글 전용), admin에 섀도우 로그 집계 +
라이브 전환 토글 카드 추가. 커밋 예정.
- **3-1 가드레일**: 정치적_논쟁성/욕설_혐오/개인정보_요구 즉시 제외, 그 외에도 애매하면
  기본값 제외(needs_human_review) — 허용은 정보 보충 질문/감사·공감 표현/단순 사실확인만.
- **판단(중요)**: **실제로 Threads에 답글을 게시하는 코드는 이번 세션에서 만들지 않았다.**
  마스터 스펙 자체가 "섀도우 모드로 시작 → 7일 검토 → 토글 전환"을 명시했는데, 게시 코드까지
  한 세션에서 미리 만들어두면 실제 사람에게 자동 응답이 나가는 위험 표면을 검증 없이 키우는
  셈이라 과도하다고 판단. is_live 토글은 지금도 동작하지만(DB 값만 바꿈), 이 값을 읽어서
  실제로 게시하는 코드가 아직 없으므로 켜도 아무 일도 안 일어난다 — 다음 단계(7일치 로그
  검토 후)에서 게시 코드를 별도로 구현하는 게 맞다고 판단.
- **3-3 빈도 제한**: `comment_auto_reply_settings.max_replies_per_hour`(기본 20) 컬럼은
  준비해뒀지만, 위와 같은 이유로 게시 코드가 없어 아직 실제로 사용되진 않음 — 게시 코드
  구현 시 반드시 이 값을 체크하도록 연결할 것.
- **3-3 Meta 정책 자체 점검**: Threads 전용 명문 정책은 못 찾았으나, Meta의 Instagram/Messenger
  자동화 정책 패턴(사용자가 먼저 남긴 댓글/DM에 대한 응답은 허용, 콜드 아웃리치/비공식 API
  사용은 금지)과 일치하는 방식(자사 게시물의 사용자 발신 댓글에만, 공식 Graph API로 응답)이라
  원칙적으로 허용 범위 안에 있을 것으로 판단 — 단 라이브 전환 직전 Threads 전용 정책 문서를
  다시 한번 확인 필요.

**1-3. Before/After 카테고리 분포**
- Before(2026-07-23~30, 62건 published): Society 64.5% / Economy 21.0% / Science 6.5% /
  Technology 4.8% / Health 1.6% / Business 1.6% / Lifestyle·Entertainment·Crypto 0%.
- After: 새 event_type/소스가 실제로 기사 수집 → 게이트 통과 → 발행까지 파이프라인을 거치는 데
  최소 며칠(수집 주기 + 편집 파이프라인)이 걸려 이번 세션에서 즉시 측정 불가. 다음 세션(또는
  최소 3~7일 후)에 동일 쿼리로 재측정 필요 — Track 2-3(주간 자기 감시 리포트)이 구현되면
  이 재측정이 자동화된다.

