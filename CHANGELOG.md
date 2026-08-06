# CHANGELOG

뉴스저울 마스터 스펙 v1(자기진화형 매체로의 전환) 실행 기록. 이 파일은 "왜 이렇게 판단했는가"를 남기는
용도다 — 승인 없이 진행하는 작업의 판단 근거를 여기 기록하고 계속 다음 작업으로 넘어간다.

## 실행 원칙 (요약)
- 문서 내 작업은 승인 없이 끝까지 진행. 판단이 갈리면 스스로 결정하고 이유를 여기 기록.
- 예외 3가지만 채팅으로 확인: (1) 크레덴셜/권한 없어 물리적으로 불가, (2) 결제 발생, (3) Track 4 비주얼 톤 A/B/C 선택.
- 막힌 것은 아래 BLOCKED 섹션에 기록하고 그 작업만 건너뛴다.

---

## BLOCKED

### ~~distribution_ops_logging_migration.sql~~ — 적용 완료 (2026-08-06 확인)
아래 "DDL 2건" 중 1번은 이미 해결됐다. `docs/pg-cron-migration-plan.md`가 `distribution_run_log`
실측값(GitHub Actions 주기 밀림 배율)을 근거로 쓰고 있으므로 표가 존재하고 적재도 되고 있다.
남은 것은 아래 2번(node_insights 복구)뿐이다.

### DDL 2건 대기 중 — 2026-08-03 (사용자 실행 필요)
PostgREST는 DDL을 지원하지 않고 이 세션에는 Supabase 관리 자격이 없다(위 2026-07-30 항목과 동일한 제약).
아래 2개를 Supabase 대시보드 → SQL Editor에서 순서대로 실행해야 완결된다.

1. `supabase/distribution_ops_logging_migration.sql` → 이어서 `supabase/global_rls_policy.sql`
   - **왜**: `DISTRIBUTION_RUN_LOG_FAILED`의 실제 원인. `distribution_run_log` /
     `distribution_skip_log` / `hero_history` 3개 테이블이 실DB에 존재하지 않아 PostgREST가
     `PGRST205`(404)를 반환하고 있었다(2026-08-03 anon key 조회로 확인). 코드는 정상이었다.
   - 미적용 상태여도 Threads 게시 자체는 정상 동작한다(로그 3종만 계속 누락).
2. `supabase/incident_2026_08_03_node_insights_repair.sql`
   - **왜**: `generate-node-insights`의 ai_context 덮어쓰기로 정체된 Topic 28건을 되살린다.
     STEP 1 SELECT로 대상을 눈으로 확인한 뒤 STEP 2를 실행하도록 구성했고, 대상이 40건을
     넘으면 스스로 중단한다.

### 2026-08-03 사고 기록 — generate-node-insights의 ai_context 통째 덮어쓰기
가장 피해가 컸던 버그라 별도로 남긴다. 이 파일만 저장소에서 유일하게 병합 없이
`ai_context: context`로 교체 저장하고 있었다(다른 8개 writer는 전부 spread 병합).
`ai_context`는 plan(에디터 배정)/gate/draft/evidence/threads(게시 dedup)/engines의 SSOT다.

- **왜 하필 이 함수인가**: 대상 선정이 `ai_outlook=is.null`인데, plan은 draft보다 먼저
  기록되므로 "plan 있음 + ai_outlook null"인 구간이 **정상적으로** 존재한다. 그 구간의
  Topic을 집으면 plan/gate/draft/evidence가 한 번에 사라졌다.
- **왜 스스로 안 낫는가**: `generate-editorial-plan-background`는 `editorial_status=eq.pending`만
  집는다. 피해 Topic은 상태값만 `planned`/`degraded`로 남아 다시 배정받을 기회가 영구히 사라진
  좀비 상태가 됐다 — 발행까지 절대 도달하지 못한다.
- **피해 실측**: plan 잃고 정체된 Topic 28건, 그 28건 **전부**에 node-insights 흔적
  (`industry_impact`/`watchpoints` 등) 존재 — 상관관계 100%. published Topic 피해는 0건.
- **왜 오래 안 보였나**: 이 함수가 동시에 504(동기 26초 캡 초과)로 죽고 있어서 매 실행마다
  앞쪽 1~3건만 PATCH되고 중단됐다. 즉 피해가 하루 몇 건씩 조용히 누적됐다. 또 `update-topic-weight`가
  매시간 `weight`를 병합해 넣어주는 바람에 "insights 키만 남은" 지문이 시간이 지나면 흐려져,
  단순 조회로는 피해를 알아보기 어려웠다(그래서 28건 중 2건만 지문이 선명하게 남아 있었다).
- **같은 유형의 재발**: 2026-07-11 `generate-editorial-plan`에서 동일한 버그가 있었고 그 파일에는
  이미 경고 주석이 달려 있다 — 이 파일만 누락돼 있었다. 앞으로 `ai_context`를 쓰는 코드는
  예외 없이 `{ ...(topic.ai_context || {}), 새필드 }` 형태여야 한다.

### ~~DDL(CREATE TABLE) 실행 불가~~ — 2026-07-30 해결됨
사용자가 Supabase 대시보드 SQL Editor에서 `evolution_engine_migration.sql` 직접 실행,
성공. 실행 중 `CREATE POLICY IF NOT EXISTS` 문법 오류(PostgreSQL 미지원, 42601) 발견돼
`DROP POLICY IF EXISTS` + `CREATE POLICY`로 수정(커밋 `ddacdea`) 후 재실행해 최종 성공.

**End-to-end 검증**(4개 함수 수동 트리거 후 실제 테이블 확인):
- `comment_auto_reply_settings`: 시드 행 정상(`is_live: false`) — RLS anon SELECT 확인.
- `generate-weekly-report-background`: 실제 데이터로 `weekly_reports`에 리포트 1건 생성 확인
  (카테고리 분포 41건, 0회 배정 perspective 8개 — 아직 Track 1 반영 전 데이터라 정상).
- `detect-coverage-gaps-background`: 정상 실행됐으나 이번엔 제안 0건 — 후보 story는
  97건(457개 중 360개만 topic 연결) 있었으니 함수가 안 도는 게 아니라 Claude가 "반복되는
  새 패턴 없음"으로 판단한 것으로 추정(Track 1이 이미 큰 갭을 메꿔서 그럴 가능성 높음).
  다음 주 정기 실행에서 계속 관찰.
- `scan-comments-shadow-background`: 정상 실행, 로그 0건 — Threads Graph API로 직접
  대조 확인한 결과 실제로 최근 게시물에 댓글이 0개라 정상적인 결과(함수 문제 아님).

이제 Track 2/3 전체가 완전히 살아있는 상태 — 다음 주 월요일(Track 2)과 매시간(Track 3)
정기 실행부터는 CHANGELOG 갱신 없이도 자동으로 누적된다.

---

### (참고, 해결 전 기록) 원래 BLOCKED 내용
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

### 2026-08-06 — 운영 점검에서 나온 P1~P3 일괄 수정

라이브 실측(사이트맵·홈 카운터·워크플로 이력)으로 상태를 확인한 뒤 발견한 것들을 고쳤다.
공통 원인이 하나 있다: **고정 상수·고정 순서가 다른 엔진의 변경에 조용히 무력화됐다.**

1. **파일럿 허브 문서 편중(excel 0건 · ev-subsidy 2건, 32시간 방치)**
   `generate-hub-documents`가 남은 목록을 앞에서부터 `slice(0, 8)`로 잘라 써서, 앞 허브가
   16건을 다 채울 때까지 뒤 허브는 한 건도 못 받았다. excel은 목록 맨 뒤라 0건인 채로 홈
   "추적 중인 허브"에서 빈 착륙지로 링크되고 있었다. → `balanceByHub`로 **문서가 가장 적은
   허브부터** 배정한다.

2. **회당 8건 중 3~5건만 생성되던 문제**
   `max_tokens=3500`이 원인. 한국어로 "blocks 3~6개 × 각 2~5문단"을 쓰면 응답이 잘리고,
   잘린 JSON이 파싱 실패로 문서 전체가 버려졌다. → 8000으로 올리고, 그래도 잘리면
   **완결된 블록만 건져내는** 구제 경로를 넣었다(품질 기준 MIN_BLOCKS는 그대로 적용).
   실패 사유를 종류별로 로그에 남겨 다음엔 원인을 바로 좁힐 수 있게 했다.

3. **에버그린 감지 28시간 0건**
   두 원인이 겹쳤다. (a) `HIGH_SCORE_MIN=500`이 2026-08-05 신선도 감쇠(ce1ec67) 도입 후
   **도달 불가능한 값**이 됐다 — 실측 상위 토픽이 398g다. 규칙 2는 감쇠 시점부터 구조적으로
   0건이었다. (b) 판정 예산 12칸을 회전 빠른 정치·국제 키워드가 매번 독식했고, 판정된 이름은
   영구 skipped라 IT·소비재·생활 후보에 순번이 오지 않았다.
   → 카테고리 성향(`categoryStance`)을 도입해 에버그린 성향은 완화 기준(250g)·우선순위 가중
   1.5배, 뉴스성은 기존 기준 유지·가중 0.4배. 추가로 **이번 실행의 무게 분포에서 상대 기준을
   같이 뽑아** 산식이 또 바뀌어도 규칙이 조용히 죽지 않게 했다.
   뉴스성 후보를 버리지는 않는다 — 최종 적합성 판정은 여전히 모델 게이트가 한다.

4. **홈 캘린더 6칸 중 3칸이 같은 사건**
   unique 제약이 `(topic_id, event_date, title)` 완전 일치라, 같은 사건이 다른 Topic에서
   뽑히거나 제목이 한 단어 다르거나 날짜가 하루 어긋나면 전부 별개 행으로 통과했다.
   → 토큰 자카드 유사도(0.7) + ±10일 창으로 접는다. **저장 시점과 표시 시점 양쪽**에 넣었다 —
   저장만 고치면 이미 쌓인 중복이 화면에 계속 남는다.

5. **`todayPublished`가 UTC 자정 기준** — 한국 사용자에게 매일 09:00 KST에 카운터가 리셋됐다.
   → `kstToday()` 도입, 비교값에 `+09:00` 오프셋을 명시(오프셋 없는 문자열은 DB 세션 타임존에
   따라 해석이 갈린다). `getUpcomingEvents`와 추출 함수의 "오늘"도 같이 맞췄다.

6. **`/tools/ev-subsidy` 사이트맵 누락** — 구조화 데이터까지 갖춘 착륙지인데 `staticRoutes`에
   `/`와 `/topic`만 하드코딩돼 빠져 있었다. → `lib/tools`에 레지스트리를 두고 사이트맵이 읽게
   했다(`ALL_HUBS`·`ROUTABLE_CONTENT_TYPES`와 같은 패턴). 도구가 늘어도 사이트맵은 안 건드린다.

7. **`.env.local.example` 추가** — 진단 스크립트가 전부 `.env.local`을 직접 읽는데(dotenv 미사용)
   머신마다 경로가 달라 새 머신에서 매번 막혔다. `.gitignore`의 `.env*`에 예외를 넣어 커밋한다.

회귀 테스트: `test-evergreen-queue` 43건, `test-home-modules` 28건, `test-hubs` 79건,
`test-post-threads` 73건 전부 통과. 표시 계층(TS)과 저장 계층(JS)의 중복 판정이 같은 답을
내는지 확인하는 드리프트 방지 테스트를 포함했다.

### 2026-07-30 — 긴급: 팩트 오류 토픽("이준석 대통령") 발견 및 대응

**증상**: 홈 히어로에 "이준석 대통령 칠레 순방"(543g, 1위) 노출. 이준석은 현직 대통령이
아님(실제로는 이재명 대통령의 칠레 순방).

**즉시 조치**: `topics.status`를 `active`→`closed`로 변경해 홈 노출 차단(주의: `status`
컬럼에 `topics_status_check` 제약이 있고 `inactive`는 거부됨 — `dormant`/`closed`는 허용
확인). `lib/topics.ts`의 `getActiveTopics()`는 `status=eq.active`만 필터링하고
`editorial_status`는 전혀 안 봄 — 처음 `editorial_status`를 바꿨던 시도는 효과 없었음.
변경 반영을 위해 홈 ISR 캐시도 재배포로 무효화(빈 커밋 2회).
추가로 동일 패턴 스캔 중 **"이준석 대통령 부동산 정책 대토론회"(status: active)**도 발견,
동일하게 비활성화.

**원인**: 원본 기사 제목은 전부 "이 대통령"/"李대통령"(성만 축약 표기, 실제 기사 6건 확인).
`process-stories-background.js`의 `claudeCluster()`(모델: `claude-haiku-4-5-20251001`)가
기사 "제목만" 보고 "사건을 대표하는 제목"을 새로 합성하도록 지시받는데, 이 축약 표기를
풀어 쓰는 과정에서 실제 현직 대통령이 아니라 유명 정치인 "이준석"으로 잘못 확장(모델의
사전 지식 편향/최신성 문제로 추정 — 실제 현직자와 무관하게 "이" 성을 가진 유명 정치인을
연상했을 가능성). 이후 `resolve-topics-background.js`의 토픽명 확정 단계, 그리고 장문
초안 생성 단계 전부 이 이름을 검증 없이 그대로 승계 — 어디에도 "직함+이름" 사실 검증
게이트가 없어 한 번의 초기 오류가 발행물까지 그대로 흘러감.

**점검 방법 제안**(아직 구현 안 함, 다음 세션에서 이어갈 것):
1. **즉시 사용 가능한 결정론적 체크**: "대통령"/"총리"/"장관"/"시장"/"회장" 등 직함 키워드가
   포함된 토픽명에서 이름 부분을 추출해, 별도로 유지하는 "직함 → 현재 실제 이름" 소규모
   레퍼런스 테이블과 대조 — 불일치하면 자동으로 사람 검토 큐에 올림(AI 호출 없이 SQL/정규식
   만으로 가능, 비용 거의 0). 이번 사고도 이 체크 하나로 즉시 잡혔을 것.
2. **Evolution Engine(Track 2)에 확장**: 주간 배치에 이 팩트체크 스캔을 추가해 정기적으로
   재확인.
3. 오늘 "대통령"/"총리"/"장관"/"시장"/"회장"/"초대"/"총장" 포함 active 토픽 58건을 수동으로
   1차 스캔한 결과, 위 2건 외 동일 패턴(직함 축약 확장 오류)으로 의심되는 건 추가 발견 안 됨
   — 단, 이름 하나하나의 사실관계까지 전수 검증한 것은 아님.

**별개 이슈**: 이 작업 중 ADMIN_KEY를 대화 중 평문으로 여러 번 노출함(사용자 지적) —
재발급 권장, 재발급 시 GitHub Actions secret(`NEWSJEOUL_ADMIN_KEY`)도 함께 갱신 필요.

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

### 2026-07-30 — Track 4-0 완료: 성능 진단 및 수정(레이아웃 작업 선행조건)

사용자가 세션 중간에 추가 지시 — 레이아웃 작업(4-1/4-2) 전에 반드시 먼저 처리하도록 순서 반영.

**실측 결과(수정 전)**:
- 홈(`/`): Cache-Status "Netlify Edge"; hit, Age 존재 — ISR 정상 동작(2026-07-29 커밋에서
  적용된 revalidate=300이 실제로 작동 중). warm 요청 TTFB 0.25초 수준.
- 토픽 상세(`/topic/[slug]`): `export const revalidate = 600`을 선언해뒀음에도 실측 결과
  **매 요청이 100% cache miss**(`Cache-Status: fwd=miss`, `Cache-Control: private,no-cache,
  no-store`) — 7/26에 발견됐던 "매 요청 Supabase 왕복" 문제가 토픽 상세에서는 사실상
  해결되지 않은 채였다. TTFB 0.58~0.74초(레이어 하나뿐이라 7/26 당시의 2~5초보다는 낫지만
  여전히 캐싱이 전혀 안 되고 있었음).

**원인**: `generateStaticParams`가 없는 동적 세그먼트는 Netlify Next.js 런타임이 ISR 대상으로
인식하지 못하고 완전 SSR(매 요청 서버 렌더링)로 빌드한다 — `revalidate` 값 자체는 죽은 코드였음.

**조치**: `app/topic/[slug]/page.tsx`, `app/topic/[slug]/[angle]/page.tsx`에 빈 배열을
반환하는 `generateStaticParams` 추가(커밋 `12eb05d`). 로컬 빌드 로그에서 라우트 표시가
`ƒ Dynamic` → `● SSG(uses generateStaticParams)`로 바뀐 것 확인.

**실측 결과(수정 후, 배포+캐시 워밍 후)**: `Cache-Status: "Netlify Edge"; hit`로 전환,
warm 요청 TTFB 0.25~0.28초로 안정화(수정 전 0.58~0.74초 대비 개선, 홈페이지와 동일 수준
도달).

**추가로 발견했지만 이번엔 손대지 않은 것들(별도 판단 필요해 보류)**:
- `entity/[slug]`, `compare/[slug]`, `guide/[slug]`, `review/[slug]`, `shop/[slug]`,
  `story/[id]`, `category/[name]` 7개 라우트는 `revalidate`도 `generateStaticParams`도
  전혀 없음 — 전부 완전 SSR로 매 요청 Supabase 왕복 중. 토픽 상세만 부분적으로 ISR
  전환됐던 2026-07-29 작업 범위 밖. 트래픽이 적어 체감 영향은 낮을 수 있으나 동일한
  구조적 문제 — 다음 성능 작업 때 일괄 검토 권장.
- 폰트 로딩: Google Fonts(Instrument Serif)와 Pretendard(jsDelivr CDN)를 전부 render-blocking
  `<link>` 태그로 로드 — `next/font`로 전환하면 외부 요청 자체가 제거되고 자체 호스팅된다.
  다만 폰트/타이포그래피는 Track 4-1/4-2에서 "여백·폰트 크기 전수 점검"을 어차피 진행할
  예정이라, 시각적 변경을 동반하는 이 작업은 그때 함께 검증하며 처리하는 게 중복 작업을
  피할 수 있다고 판단해 지금은 보류.
- 이미지 최적화: 확인 결과 현재 공개 페이지 어디에도 실제 이미지(og_image 등)가 렌더링되고
  있지 않음(전부 텍스트/색상 기반 카드) — `next/image` 미사용이 성능 문제로 이어지고 있진
  않음. 향후 이미지가 추가되면 그때 next/image로 시작하면 됨.

Track4-1(editoy 벤치마킹+레이아웃)은 이 성능 수정이 배포·검증된 뒤이므로 이제 착수 가능.

### 2026-07-30 — Track 4-1: editoy 벤치마킹 + A/B/C 시안 준비 완료

editoy.com 실제 구조 확인(브라우저 방문) — 카드형 그리드가 아니라 헤드라인 위주 고밀도
단일 리스트 + 하단 키워드/해시태그 클라우드였음(당초 예상과 다름, 실측 후 반영).

정적 HTML 목업 3종 제작(로컬 스크래치패드, 실데이터 없음, 기존 design-tokens.ts 색상/타이포
그대로 사용):
- **A안 저울 리스트**: editoy 철학을 가장 직접 계승 — 절반 밀도 헤드라인 리스트 + 행마다
  좌우 관점 균형 미니바 + 상단 키워드 레일.
- **B안 질문의 저울대**: 좌우 비교 대비를 카드 디테일이 아니라 페이지 구조 자체로 승격 —
  이슈마다 물리적 2분할, 상단 전체 무게중심 저울대 시각화.
- **C안 탐험 매거진 2.0**: 기존 v5 벤토 그리드의 진화형 — 히어로 축소, 인물/국가/키워드
  탐색 레일 신설, 그리드 밀도 상향 + 맥락 설명 카드 삽입.

셋 다 Playwright로 스크린샷 캡처(claude-in-chrome 확장의 screenshot 도구가 이번 세션
내내 내부 오류로 작동 안 해 대체 수단 사용) 후 Artifact 갤러리로 게시,
사용자에게 A/B/C 선택 요청(마스터 스펙 유일한 예외 지점).

**1-3. Before/After 카테고리 분포**
- Before(2026-07-23~30, 62건 published): Society 64.5% / Economy 21.0% / Science 6.5% /
  Technology 4.8% / Health 1.6% / Business 1.6% / Lifestyle·Entertainment·Crypto 0%.
- After: 새 event_type/소스가 실제로 기사 수집 → 게이트 통과 → 발행까지 파이프라인을 거치는 데
  최소 며칠(수집 주기 + 편집 파이프라인)이 걸려 이번 세션에서 즉시 측정 불가. 다음 세션(또는
  최소 3~7일 후)에 동일 쿼리로 재측정 필요 — Track 2-3(주간 자기 감시 리포트)이 구현되면
  이 재측정이 자동화된다.

