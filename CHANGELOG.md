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

**1-3. Before/After 카테고리 분포**
- Before(2026-07-23~30, 62건 published): Society 64.5% / Economy 21.0% / Science 6.5% /
  Technology 4.8% / Health 1.6% / Business 1.6% / Lifestyle·Entertainment·Crypto 0%.
- After: 새 event_type/소스가 실제로 기사 수집 → 게이트 통과 → 발행까지 파이프라인을 거치는 데
  최소 며칠(수집 주기 + 편집 파이프라인)이 걸려 이번 세션에서 즉시 측정 불가. 다음 세션(또는
  최소 3~7일 후)에 동일 쿼리로 재측정 필요 — Track 2-3(주간 자기 감시 리포트)이 구현되면
  이 재측정이 자동화된다.

