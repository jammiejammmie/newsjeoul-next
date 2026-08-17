// ═══════════════════════════════════════════════════════════════════════════
// 뉴스저울 Attention Engine — 이 파일은 그 첫 채널 어댑터(Threads)다. 2026-07-21 채과장 최종 리뷰 반영.
//
// 이 엔진의 목적은 "게시"가 아니다. 목적은 다음 흐름이다(이 철학은 개발자가 바뀌어도 유지돼야 한다):
//
//     Google Search 증가 → 색인 증가 → 외부 유입 증가 → 뉴스저울 내부 탐험(Exploration) 증가
//
// 클릭은 수단이지 목표가 아니다. 목표는 유입된 사용자가 뉴스저울 안에서 얼마나 오래·깊이
// 탐험하는가다. 그래서 아래 Distribution Score는 CTR 하나가 아니라 탐험 가능성(Exploration)을
// CTR과 동등하거나 더 중요하게 취급한다.
//
// 장기 아키텍처(지금은 Threads 어댑터 하나만 구현돼 있다):
//
//         Attention Engine
//               │
//               ▼
//        Distribution Engine   ← 이 파일의 선정 로직(채널 독립)
//               │
//     ┌─────────┼─────────────┬─────────┬───────────┬─────┬──────┐
//     ▼         ▼             ▼         ▼           ▼     ▼      ▼
//  Threads   Google           X      Facebook   Newsletter RSS  Push
//  (구현됨)  (구현 안 됨)   (구현 안 됨) (구현 안 됨) (구현 안 됨)(...)(...)
//     │
//     ▼
//  사용자 → 뉴스저울 → 탐험
//
// 채널은 전부 Adapter일 뿐이다. "관심(Attention)을 어디에 어떻게 배분할지"는 채널마다 다시
// 판단하는 게 아니라 이 파일의 공통 엔진(Editorial Score → Distribution Score → 적응형 문턱값)이
// 담당한다. 이 파일 안에서도 그 경계를 코드 섹션 배너로 명시해뒀다 — "채널 독립 영역"은 두 번째
// 채널이 추가돼도 그대로 재사용되고, "채널 종속 영역(Threads Adapter)"만 새로 작성하면 된다.
//
// 최종 원칙(2026-07-21 채과장 최종 승인 기준 — 이 8줄은 앞으로 이 파일과 그 뒤를 잇는 모든
// 채널 어댑터가 따라야 하는 계약이다):
//   1. 채널은 Adapter다.
//   2. 판단은 Distribution Engine이 한다 — 채널마다 판단 로직을 다시 만들지 않는다.
//   3. 콘텐츠 품질은 Editorial Score가 판단한다.
//   4. 배포 우선순위는 Distribution Score가 판단한다.
//   5. 최종 목표는 클릭이 아니라 Exploration이다.
//   6. Google 검색 유입이 가장 중요한 KPI다.
//   7. Distribution Engine은 장기적으로 뉴스저울의 Attention Engine으로 발전한다.
//   8. Threads는 그 첫 번째 Adapter일 뿐이다.
//
// 이번 재설계로 바뀐 것:
// - Thread Score → Editorial Score로 일반화(콘텐츠 자체 품질, 채널 무관).
// - Distribution Score를 계산만 하지 않고 저장한다(ai_context.engines.distribution, markTopicPosted
//   참고) — "왜 이 Topic을 선택했는가"를 나중에 분석·학습·운영 통계에 쓸 수 있도록. engines 네임
//   스페이스 아래 두고 version 필드를 넣은 이유는, 알고리즘이 바뀌어도(v2, v3) 과거 기록과 공존할
//   수 있게 하기 위해서다.
// - 향후 확장 지점을 코드에 명시적으로 남겨뒀다(구현은 안 함, 구조만 열어둠):
//   · Expected Session Time / Exploration Depth — CTR 대신 "얼마나 오래 머무는가"를 직접 점수화.
//   · Search Opportunity Score — 검색량/경쟁도/롱테일/Evergreen/트렌드 등을 종합한 점수.
//   두 컴포넌트 다 DISTRIBUTION_WEIGHTS에 아직 없다 — 추가할 때는 기존 가중치를 재조정해야 한다.
//
// 핵심 원칙(계속 유지):
// - Migration 비의존: topics.ai_context.threads/engines(기존 jsonb 컬럼)만으로 이력 관리.
// - 비용 보호: 자격증명 확인 → 후보 조회 → 점수 계산(전부 DB 데이터만 사용) → 품질/배급 게이트
//   통과 후에만 Claude 호출.
// - 동일 Topic은 평생 1회만 게시(ai_context.threads 존재 여부로 영구 제외).
// - Adaptive Distribution 유지: "오늘 20개 올려" 같은 수동 목표가 아니라, 오늘 실제 생산량에
//   비례해 게시 목표·품질 문턱값을 스스로 계산한다(computeDailyTarget). 운영자가 숫자를 바꿀
//   필요가 없다.
//
// 추가 반영(2026-07-22, PM 지시 — 배급량 재보정 + Background Function 전환):
// - 목표 계산 기준을 published Topic 수에서 원본 기사(articles) 수로 변경 + 최소 20/최대 60의
//   비례 목표(clamp(round(articles×0.10), 20, 60))로 재보정 — 이전 공식은 초기 생산 단계에서
//   목표가 3건까지 떨어져 "생산량 비례"의 취지에 비해 지나치게 낮았다.
// - 1회 실행당 최대 3건, 게시 사이 2~5분 간격을 두려면 26초 동기 함수 하드캡을 넘기 때문에 파일을
//   Background Function으로 전환했다(호출자는 202만 받고 실제 결과는 함수 로그로만 확인 가능).
// ═══════════════════════════════════════════════════════════════════════════
const CHANNEL = 'threads'; // 두 번째 채널 어댑터를 만들 때는 그 파일에서 이 값만 바꾸면 된다.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
// 토큰은 threads_credentials(DB)가 정본이고 환경변수는 폴백이다. 2026-08-10 전환 —
// Threads 장기 토큰은 60일 만료라 사람이 환경변수를 갈아끼우는 구조로는 반드시 다시 끊긴다
// (실제로 08-09 만료로 24시간 전면 중단됐다). refresh-threads-token이 30일마다 DB의 토큰을
// 연장하므로, 실행 시점마다 DB에서 읽어야 갱신분이 반영된다.
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN_ENV = process.env.THREADS_ACCESS_TOKEN;

// 한 번의 함수 실행 안에서는 여러 건을 게시하므로 호출당 1회만 읽고 재사용한다.
let cachedToken = null;
async function getAccessToken() {
  if (cachedToken) return cachedToken;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/threads_credentials?select=access_token,expires_at&id=eq.threads&limit=1`,
      { headers: REQUEST_HEADERS }
    );
    if (r.ok) {
      const [row] = await r.json();
      if (row?.access_token) {
        if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
          console.error(`THREADS_TOKEN: DB 토큰이 만료됨(${row.expires_at}) — 재발급 필요`);
        }
        cachedToken = row.access_token;
        return cachedToken;
      }
    } else {
      console.error(`THREADS_TOKEN: threads_credentials 조회 실패(${r.status}) — 환경변수로 폴백`);
    }
  } catch (e) {
    console.error('THREADS_TOKEN: threads_credentials 조회 예외 — 환경변수로 폴백:', e.message);
  }
  cachedToken = THREADS_ACCESS_TOKEN_ENV || null;
  return cachedToken;
}
const BASE_URL = 'https://newsjeoul.co.kr';
const REQUEST_HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };

// ── 2026-08-12 전면 개편(PM 지시) ────────────────────────────────────────────
// 이전까지 이 채널로 나가는 것은 뉴스 Topic 100%였다. 허브 에버그린 문서 213건이 어느
// 채널로도 나가지 않고 있었고, 링크는 본문 끝에 붙어 본문 예산을 260자까지 밀어내고 있었다.
// 바뀐 것 5가지(전부 아래 코드에 반영):
//   1. 유형이 둘이다 — news(Topic) / evergreen(허브 문서). 선택은 threads-strategy.js가 한다.
//   2. 비율 강제가 아니라 트리거 — 신규 문서·허브 연결이 우선하고, 30~40%는 감시 밴드다.
//   3. 링크가 본문에서 첫 댓글로 내려갔다 — 본문은 링크 없이 완결이고 예산이 500자로 늘었다.
//   4. 시간대가 유형을 가른다 — 뉴스 07~14시(KST), 에버그린 18~23시(KST).
//   5. 뉴스 제목이 허브 키워드를 건드리면 그 허브 링크를 댓글에 함께 단다(관련성 70점 이상).
const strategy = require('./threads-strategy');
const { buildCta } = require('./engagement-cta');
const { buildCoverHook } = require('./cover-hook');
const { QUOTA_PLAN, bucketOf } = require('./buzz-engine');

// ── 배급 일시 정지 스위치(2026-08-12 PM 지시) ────────────────────────────────
// 지금은 **정지 상태**다. 재개하려면 아래 기본값을 false로 바꿔 배포하면 된다(한 줄).
//
// 왜 코드에 두는가: pg_cron에는 이미 설계된 스위치가 있지만(ops.netlify_job.enabled=false)
// 그건 ops.invoke를 거치는 호출만 막는다. 이 함수는 GitHub Actions와 관리자 수동 호출로도
// 들어올 수 있어서, 경로마다 따로 잠그면 하나를 빠뜨린다. 함수 안에서 막으면 어디로 들어오든
// 멈춘다 — "정지"는 빠짐없이 걸리는 쪽이 맞다.
//
// 왜 핸들러 맨 앞인가: 이 아래로 내려가면 후보 조회·Claude 호출로 비용이 발생한다.
// 정지 판단은 돈이 나가기 전에 끝나야 한다.
//
// 환경변수는 테스트가 뒤집기 위한 것이다(운영에서 굳이 설정할 필요 없다).
const DISTRIBUTION_PAUSED = process.env.THREADS_DISTRIBUTION_PAUSED
  ? process.env.THREADS_DISTRIBUTION_PAUSED === 'true'
  : false; // ← 정지하려면 true

// ── 에버그린 배급 스위치(2026-08-12 PM 지시로 OFF) ───────────────────────────
// 지금은 **뉴스만** 나간다. 에버그린(허브 문서) 게시는 품질 점검이 끝날 때까지 멈춘다.
// 재개하려면 아래 기본값을 true로 바꿔 배포한다.
//
// 정지 스위치와 따로 둔 이유: "전부 멈춤"과 "뉴스만"은 다른 상태다. 하나로 겸하면 둘 중
// 하나를 표현할 수 없고, 지금 어느 쪽으로 돌려놨는지도 코드에서 읽히지 않는다.
//
// OFF일 때는 허브 목록·문서 목록·dedup·오늘 에버그린 수 조회를 아예 하지 않는다 —
// 쓰지 않을 데이터를 위해 매 회차 네 번씩 왕복할 이유가 없다.
const EVERGREEN_ENABLED = process.env.THREADS_EVERGREEN_ENABLED
  ? process.env.THREADS_EVERGREEN_ENABLED === 'true'
  : false; // ← 에버그린 재개 시 true

// 허브 목록(newsKeywords 포함)은 앱이 내보내는 JSON에서 읽는다 — lib/hubs/*.ts는 빌드에
// 컴파일되므로 함수가 직접 읽을 수 없다(app/hub-targets.json/route.ts 주석 참고).
const HUB_TARGETS_URL = `${BASE_URL}/hub-targets.json`;
// 에버그린 후보 조회 상한. 문서 213건 전체를 매 회차 끌어와도 payload가 크지 않지만,
// blocks(본문)까지 받으면 수 MB가 되므로 목록 조회에서는 본문을 빼고 선택 후 1건만 다시 읽는다.
const EVERGREEN_POOL_LIMIT = 500;

// ── 상수(마법 숫자 금지 — 전부 여기서 관리, 근거를 주석에 명시) ─────────────
const MIN_EDITORIAL_SCORE = 60; // 콘텐츠 자체 품질 하한선(100점 만점) — Distribution Score와 별개의 하드 게이트.
const MIN_BODY_LENGTH = 300; // 본문이 이보다 짧으면 "지나치게 빈약"으로 간주해 무조건 제외.
const CANDIDATE_POOL_SIZE = 30; // 점수 계산 대상으로 가져올 후보 풀 크기.
const RECENT_HISTORY_WINDOW = 3; // 최근 게시 패턴(recentPattern) 판단에 쓰는 "최근 게시 N건".

// 오늘 목표 게시 수 — PM 재조정 지시(2026-07-22): 기준을 "오늘 published Topic 수"에서 "오늘
// 원본 기사(articles) 수"로 변경. published Topic만 기준으로 삼으면(예: 오늘 10건) 목표가 3건까지
// 떨어져 "생산량에 비례"라는 원래 취지와 달리 실제 배급량이 지나치게 작아지는 문제가 있었다(콘텐츠
// 공장이 커지는 초기 단계엔 기사 생산이 published Topic 전환보다 훨씬 앞서 달리기 때문). 최소/최대
// 하한·상한을 명시적으로 둔 이유는 "기사 100건 이하"처럼 생산이 아직 적은 시기에도 배급 채널 자체가
// 죽어있는 것처럼 보이지 않게 하기 위해서다(PM 지시: "기본 목표는 하루 20건 이상").
// ── 2026-08-17 PM 지시: 하루 10~15건으로 축소 ───────────────────────────────
// 종전 20~60건은 "많이 올려 색인을 늘린다"는 목표에 맞춘 값이었다. 이번 개편의 목표는 반대다 —
// buzz 상위 이슈만 골라 카드뉴스 이미지 + 4단 댓글 연재로 깊게 올린다. 건당 무게가 커졌으므로
// 건수를 줄인다(같은 품으로 60건을 만들 수 없고, 만들 이유도 없다).
// 비율(0.10)은 그대로 두고 상하한만 조인다 — 기사 540건/일 기준 54 → 상한 15로 clamp된다.
// 2026-08-17 재조정(PM 결정): 10~15 → 20 고정에 가깝게.
// 근거는 쿼터 반올림이다. 카테고리 상한은 floor(비율 × 목표)로 계산되는데, 목표가 15면
// 15%×15=2.25 → 2로 깎여 7개 버킷 합이 13건이 된다(목표보다 2건 적다).
// 목표 20이면 15%×20=3, 20%×20=4, 10%×20=2로 전부 정수라 손실이 0이고 합이 정확히 20이 된다.
// 카테고리마다 최소 2건이 확보되는 지점이기도 하다.
const ARTICLE_TARGET_RATIO = 0.10; // articles × 10%
const MIN_DAILY_TARGET = 20;
const MAX_DAILY_TARGET = 20;
// 목표치 이내일 때(공급 여유 있음) 요구 점수는 낮게, 목표치를 초과했을 때(이미 충분히 배급됨)는
// 정말 뛰어난 후보만 통과하도록 점진적으로 엄격해진다 — 고정 상한이 아니라 적응형 문턱값이다.
const DISTRIBUTION_SCORE_FLOOR = 55;
const DISTRIBUTION_SCORE_CEILING = 80;

// 1회 실행(Netlify Background Function, 최대 15분 예산)당 최대 게시 건수와 게시 사이 간격.
// 매시간 1건씩만으로는 "하루 20건 이상"을 달성하기 어려워(하루 최대 24건) PM 지시로 도입 —
// 남은 목표를 남은 시간으로 나눠 이번 실행에서 몇 건을 시도할지 결정한다(computePostsThisRun).
// 간격을 두는 이유는 Threads API 연속 호출로 인한 스팸성 패턴을 피하기 위함.
// 2026-08-03: PM 지시로 배급 밀도 상향 — 상한 3 → 4건, cron 1시간 → 30분 주기.
//
// 상한을 4로 정한 근거(더 올리지 않은 이유): Background Function 예산이 15분이다.
// 게시 사이 간격이 최대 5분이던 기존 설정에서 4건을 시도하면 간격만 3×5=15분으로 예산을
// 그대로 초과해 마지막 게시가 중간에 죽는다. 그래서 간격을 2~3분으로 좁혔다 —
// 최악의 경우 3×3=9분 + 건당 오버헤드(Claude 호출·컨테이너 대기·API ≈ 15초)×4 ≈ 10분으로
// 예산 안에 안전하게 들어온다. 간격을 좁혀도 스팸성 패턴 우려가 커지지 않는 이유는
// 실행 주기 자체가 30분으로 짧아져 게시가 하루 전체에 더 고르게 퍼지기 때문이다.
// 2026-08-04 재조정: 상한을 4 → 6으로 올렸다. 근거는 아래 "실측 주기" 항목 —
// GitHub Actions가 cron을 그대로 지켜주지 않아 실행 횟수가 설정의 1/3 수준이므로, 부족한
// 횟수를 실행당 건수로 메워야 한다. 6건이 안전한 이유는 아래 RUN_BUDGET_MS 가드 때문이다
// (정적 상한만 믿지 않고 실제 경과 시간을 보며 멈춘다).
// 2026-08-17: 6 → 2. 하루 목표가 10~15건으로 줄었고, 이제 한 건당 본문 + 이미지 + 댓글 4개를
// 올리므로(=API 호출 6회 + Claude 1회) 건당 소요 시간이 3배 가까이 늘었다. 6건을 그대로 두면
// Background Function 15분 예산을 넘긴다.
const MAX_POSTS_PER_RUN = 2;

// ── buzz 상위 선별 (2026-08-17 PM 지시 "buzz_score 상위 토픽만 선별") ────────
// 후보 중 buzz가 계산된 것이 충분히 쌓였을 때만 이 문턱을 적용한다. 전환 초기에는 buzz를 가진
// Topic이 소수라(배포 직후 실측 15건) 문턱을 무조건 걸면 배급이 통째로 멈춘다.
// 표본이 찰 때까지는 기존 Distribution Score 경로로 돌아가고, 차면 그때부터 상위만 남긴다.
const MIN_BUZZ_SCORE_FOR_POST = 25;
const BUZZ_FLOOR_MIN_SAMPLE = 10;

// 워크플로우 cron이 선언하는 시간당 실행 횟수 — 실측값을 구할 수 없을 때의 폴백으로만 쓴다.
// .github/workflows/post-threads.yml의 cron과 일치해야 한다(테스트 11g가 고정한다).
const CONFIGURED_RUNS_PER_HOUR = 2;

// ── 실측 주기(2026-08-04에 추가한 이유) ──────────────────────────────────────
// distribution_run_log를 켠 뒤 실측해보니 GitHub Actions가 cron을 전혀 지키지 않는다.
// 같은 저장소의 모든 스케줄 워크플로우가 설정보다 느리고, 주기가 짧을수록 더 심하게 밀린다:
//   20분 설정 → 실측 109분(5.5배)  |  30분 → 94분(3.1배)
//   60분 설정 → 실측 143분(2.4배)  |  180분 → 222분(1.2배)
// 즉 실효 하한이 약 90~150분이라 cron을 짧게 줄이는 것으로는 밀도를 올릴 수 없다
// (1시간 → 30분 변경의 실제 효과가 거의 0이었다).
//
// 문제는 이게 페이싱 계산을 조용히 망가뜨린다는 점이다. computePostsThisRun은 "남은 목표 ÷
// 남은 실행 기회"인데, 남은 기회를 cron 선언값(시간당 2회)으로 계산하면 실제(시간당 약 0.64회)의
// 3배로 과대평가해서 실행당 시도 건수를 그만큼 과소 산정한다 — 4건을 시도해야 할 때 1건만
// 시도하고, 목표는 영원히 미달한다. 실제로 08-03 하루 누적이 4건(목표 47)이었다.
//
// 그래서 선언값을 신뢰하지 않고 distribution_run_log의 최근 실행 간격으로 실측한다.
// 플랫폼 스케줄러 동작이 바뀌어도(더 느려지든 정상화되든) 코드를 고치지 않고 따라간다.
const CADENCE_SAMPLE_SIZE = 8; // 최근 N회 실행 간격으로 추정(너무 적으면 우발적 지연에 흔들린다)
const MIN_RUNS_PER_HOUR = 0.2; // 5시간에 1회보다 느리다고는 보지 않는다(과대 배급 방지)
const MAX_RUNS_PER_HOUR = 4;   // 15분에 1회보다 빠르다고는 보지 않는다(과소 배급 방지)

// 1회 실행이 쓸 수 있는 시간 예산. Netlify Background Function 한도는 15분이지만, 한도에
// 닿으면 실행이 강제 종료되어 마지막 게시가 컨테이너 생성 후 publish 전에 죽을 수 있다.
// 13분에서 스스로 멈춰 그 사고를 피한다(정적 상한이 아니라 이 가드가 실제 안전장치다).
// 예산 12분 + 건당 추정 45초 = 12.75분으로, 플랫폼 한도(15분)까지 2분 이상 여유를 남긴다.
// 건당 추정을 넉넉히(45초) 잡은 이유: Claude가 느린 날에는 한 건이 40초를 넘을 수 있고, 추정이
// 실제보다 짧으면 가드가 "한 건 더 가능"이라 판단한 뒤 그 건이 예산을 넘겨 죽는다.
const RUN_BUDGET_MS = 12 * 60 * 1000;
const PER_POST_ESTIMATE_MS = 45 * 1000; // Claude 호출 + 컨테이너 3초 대기 + publish 왕복 + 지연 여유

// 후보 단위 실패(Claude 빈 응답 등) 시 다른 후보로 재시도할 최대 횟수 — 실행당 누적이다.
// 2로 잡은 이유: 재시도마다 Claude 호출 비용이 다시 나가므로 무한정 돌 수 없고, 한 실행에서
// 연속 3번(최초 1 + 재시도 2) 실패한다면 후보 개별 문제가 아니라 API/프롬프트 차원의 문제라
// 보고 멈추는 편이 낫다.
const MAX_CANDIDATE_RETRIES = 2;
// 테스트에서만 오버라이드 가능(운영 기본값은 2~3분) — 실제 분 단위 대기를 mock 테스트에서
// 그대로 기다리면 테스트가 몇 분씩 걸리므로, 테스트 전용 환경변수로만 짧게 조정할 수 있게 열어둔다.
const MIN_GAP_MS = Number(process.env.POST_GAP_MIN_MS) || 2 * 60 * 1000; // 2분
const MAX_GAP_MS = Number(process.env.POST_GAP_MAX_MS) || 3 * 60 * 1000; // 3분

// Distribution Score 구성 가중치(합=1.0) — PM 지시 §1의 9개 요소를 7개 계산 컴포넌트로 매핑.
// (카테고리 생산량 + 카테고리별 오늘 게시 수 → categoryAllocation 하나로 통합: 두 값의 격차가
//  실제로 의미 있는 신호이기 때문)
// 2026-08-17(PM 지시 "화제성/자극성 높은 이슈 우선"): buzz를 0.20으로 신설하고 나머지를
// 0.8배로 비례 축소해 합 1.0을 유지했다. buzz는 단일 컴포넌트 중 categoryAllocation과 함께
// 가장 큰 가중치다 — 즉 "무엇을 올릴지"는 이제 화제성이 사실상 1순위로 정한다.
const DISTRIBUTION_WEIGHTS = {
  buzz: 0.20,               // 화제성(buzz-engine) — Top Stories/섹션/트렌드 검색량 기반
  editorialScore: 0.16,     // Editorial Score(콘텐츠 자체 품질 — 채널 무관, 구 Thread Score)
  categoryAllocation: 0.16, // 카테고리 생산량 vs 카테고리별 오늘 게시 수 격차("오늘 부족한 분야" 우선)
  recentPattern: 0.08,      // 최근 게시 패턴(직전/최근 3건과의 반복 여부)
  searchIntent: 0.12,       // 검색 의도 적합성
  expectedCTR: 0.12,        // 예상 CTR(구조적 proxy — 실제 클릭 데이터 없음, 아래 함수 주석 참고)
  topicWeight: 0.08,        // Topic Weight(importance_score)
  exploration: 0.08,        // Exploration 가능성 — 클릭 이후 더 탐험할 거리가 있는가(아래 주석 참고)
};
// 합계는 1.0이어야 한다. 아래 두 컴포넌트는 PM 지시(2026-07-21 §3, §6)로 미리 문서화만 해두는
// 확장 지점이다 — 지금은 구현하지 않는다. 실제로 추가할 때는 반드시 위 가중치를 재조정해서
// 합이 1.0을 유지하도록 해야 한다(새 키를 0이 아닌 값으로 넣고 기존 값들을 비례 축소).
//   - expectedSession(또는 explorationDepth): CTR 대신 "얼마나 오래/깊이 머무는가"를 직접 점수화.
//     필요 데이터: 실제 세션 시간·페이지뷰 로그(현재 없음 — 애널리틱스 연동 필요).
//   - searchOpportunity: 검색량·경쟁도·롱테일 여부·Evergreen 여부·검색 의도 명확성·계절성·트렌드
//     상승 여부를 종합한 점수. 필요 데이터: 검색 키워드 볼륨/트렌드 데이터(현재 없음 — 외부 API
//     연동 필요, 예: Google Trends/Search Console).

// ═══ 채널 독립 영역 시작(Attention/Distribution Engine 공통) ═══════════════
// 여기서부터 selectCandidate()까지는 Threads를 전혀 몰라도 되는 코드다. 두 번째 채널(Google/X/
// Facebook/Newsletter/RSS/Push)을 추가할 때 이 영역은 건드리지 않는 것이 목표다 — 채널마다
// 새로 판단하는 게 아니라, 여기서 계산된 Editorial/Distribution Score를 그대로 재사용한다.
//
// ── Editorial Score(콘텐츠 자체 품질 — Distribution Score의 입력 중 하나일 뿐, 최종 기준 아님) ──
// 구 "Thread Score". Threads뿐 아니라 어떤 채널에도 재사용 가능한, 콘텐츠 자체의 품질 점수라는
// 의미로 이름을 일반화했다(PM 지시 2026-07-21 §2) — 계산 로직 자체는 바뀌지 않았다.
// 총점 100 = 무게25 + 완성도20 + 출처10 + 왜중요한가10 + 키워드10 + 논쟁성10 + 최신성15
function computeEditorialScore(topic) {
  const b = {};
  const draft = topic.ai_context?.draft || {};
  const evidence = topic.ai_context?.evidence || {};
  const weight = topic.ai_context?.weight || {};

  b.weight = Math.min(25, Math.round(((topic.importance_score || 0) / 999) * 25));

  const leadLen = (draft.lead || '').length;
  const blockCount = Array.isArray(draft.blocks) ? draft.blocks.length : 0;
  const bodyLen = (draft.blocks || []).reduce((s, blk) => s + (blk.content || '').length, 0);
  b.completeness = (leadLen >= 20 ? 5 : 0) + (blockCount >= 2 ? 5 : 0) + (bodyLen >= MIN_BODY_LENGTH ? 10 : 0);

  b.source = (evidence.sources || []).some((s) => s.url) ? 10 : 0;
  b.whyItMatters = (weight.reasons || []).length > 0 ? 10 : 0;

  const kwCount = (draft.display_keywords || []).length;
  b.keywords = kwCount >= 2 ? 10 : kwCount === 1 ? 5 : 0;

  const comp = weight.components || {};
  b.controversy = Math.min(10, Math.round(((comp.controversy_score_bonus || 0) + (comp.dual_perspective_bonus || 0)) / 10));

  const hoursSince = topic.updated_at ? (Date.now() - new Date(topic.updated_at).getTime()) / 3600000 : 999;
  b.recency = hoursSince <= 6 ? 15 : hoursSince <= 24 ? 9 : hoursSince <= 48 ? 4 : 0;

  const score = Object.values(b).reduce((a, v) => a + v, 0);
  return { score, breakdown: b, bodyLen };
}

// 최소 품질 게이트(전부 하드 조건 — 하나라도 실패하면 제외, PM 지시 §4)
function passesMinimumQuality(topic, scored) {
  const draft = topic.ai_context?.draft;
  const evidence = topic.ai_context?.evidence;
  if (!topic.name) return false;
  if (!draft || !draft.lead) return false;
  if (!Array.isArray(draft.blocks) || draft.blocks.length === 0) return false;
  if (!evidence?.sources?.some((s) => s.url)) return false;
  if (scored.bodyLen < MIN_BODY_LENGTH) return false;
  if (scored.score < MIN_EDITORIAL_SCORE) return false;
  return true;
}

// ── Distribution Score 하위 컴포넌트 ────────────────────────────────
// 오늘 생산은 많은데 게시는 적게 된 분야("부족한 분야")에 가산점을 준다. gap이 클수록(생산 비중 >
// 게시 비중) 점수가 올라간다 — 자동차만 100개 생산돼도 자동차만 계속 오르는 문제를 여기서 막는다.
function computeCategoryAllocationScore(category, producedStats, postedStats) {
  const catCount = Object.keys(producedStats.byCategory).length || 1;
  const producedShare = producedStats.total > 0
    ? (producedStats.byCategory[category] || 0) / producedStats.total
    : 1 / catCount;
  const postedShare = postedStats.total > 0 ? (postedStats.byCategory[category] || 0) / postedStats.total : 0;
  const gap = producedShare - postedShare;
  return Math.max(0, Math.min(100, 50 + gap * 200));
}

function computeRecentPatternScore(category, recentCategories) {
  if (!recentCategories.length) return 100;
  if (recentCategories[0] === category) return 0; // 직전과 동일 — 강한 감점
  if (recentCategories.includes(category)) return 40; // 최근 3건 안에 등장 — 약한 감점
  return 100;
}

const SEARCH_INTENT_SCORE_BY_GATE = {
  SEARCH_GUIDE: 100, COMPARE: 95, PRODUCT_BRIEF: 90, UPDATE: 75,
  BACKGROUND: 60, DEEP_DIVE: 55, SHORT_BRIEF: 40, REJECT: 20,
};
function computeSearchIntentScore(topic) {
  return SEARCH_INTENT_SCORE_BY_GATE[topic.gate_status] ?? 50;
}

// 예상 CTR — 실제 클릭 로그가 아직 없어 "측정치"가 아니라 "구조적 proxy"다. 숫자·비교 표현·
// 대립 시각·키워드 밀도처럼 클릭을 유도하는 것으로 알려진 구조적 신호만 사용한다. 실제 Threads
// 클릭 데이터가 쌓이면 이 함수를 실측 기반으로 교체해야 한다(현재는 근사치임을 명시).
function estimateExpectedCTR(topic) {
  let s = 40;
  const title = topic.name || '';
  if (/\d/.test(title)) s += 15;
  if (/vs\.?|대비|비교|얼마|왜|어떻게|누가/i.test(title)) s += 15;
  const perspectives = topic.ai_context?.draft?.perspective_markers || [];
  if (perspectives.length > 1) s += 15;
  const kw = topic.ai_context?.draft?.display_keywords || [];
  if (kw.length >= 2) s += 15;
  return Math.min(100, s);
}

function computeTopicWeightScore(topic) {
  return Math.max(0, Math.min(100, Math.round(((topic.importance_score || 0) / 999) * 100)));
}

// Exploration Score — PM 지시(2026-07-21 §4): "클릭 → 탐험"이 뉴스저울의 철학이고, Exploration은
// 앞으로 CTR보다 더 중요한 지표가 된다. 유입된 방문자가 클릭 이후 얼마나 더 오래·깊이 다른 색인
// 페이지로 이동할 가능성이 있는지를 반영한다.
//
// 이 함수가 다뤄야 할 신호 9가지와 현재 구현 상태(향후 아래 목록을 다 채우는 게 목표 — 지금은
// 함수 구조만 열어두고, 이미 공짜로 있는 데이터부터 채웠다):
//   [구현됨] Guide 존재 여부      — expansion_drafts에 angle:'guide' 존재
//   [구현됨] Compare 존재 여부    — expansion_drafts에 angle:'compare' 존재
//   [구현됨] FAQ 존재 여부        — expansion_drafts에 angle:'faq' 존재
//   [구현됨] History 존재 여부    — expansion_drafts에 angle:'background' 존재(배경 설명 = History)
//   [구현됨] Timeline 존재 여부   — expansion_drafts에 angle:'update' 존재(진행 상황 갱신 = Timeline)
//   [구현됨] Expansion Draft 수   — expansion_drafts.length
//   [미구현] Related Topic 수     — topic_relations 쿼리 필요(아래 참고)
//   [미구현] 내부 링크 수         — topic_relations + expansion_drafts 상호링크 집계 필요
//   [미구현] 연결된 Entity 수     — topic_entities 쿼리 필요
// 미구현 3개는 후보 30개마다 매시간 관계/엔티티 쿼리를 추가로 던지는 비용 대비 이득을 아직
// 검증하지 못해 보류했다. 이 컴포넌트를 별도 함수로 분리해둔 이유가 그것이다: 나중에 그 신호를
// 추가해도 가중치 구조(DISTRIBUTION_WEIGHTS.exploration)는 그대로 두고 이 함수 내부만 확장하면 된다.
const EXPLORATION_SIGNAL_ANGLES = ['guide', 'compare', 'faq', 'background', 'update'];
function computeExplorationScore(topic) {
  const drafts = topic.ai_context?.expansion_drafts || [];
  const anglesPresent = new Set(drafts.map((d) => d.angle));
  const signalCount = EXPLORATION_SIGNAL_ANGLES.filter((a) => anglesPresent.has(a)).length;
  const importance = topic.importance_score || 0;
  const potentialBonusAngles = importance >= 400 ? 3 : importance >= 250 ? 2 : 1;
  return Math.min(100, drafts.length * 15 + signalCount * 10 + potentialBonusAngles * 10);
}

// buzz 원점수를 0~100으로 정규화한다. 원점수 상한은 Top(60)+섹션(30)+트렌드(50)+최신성(15)=155지만
// 실제로 셋 다 동시에 최상위인 경우는 드물다 — 실측 상위권이 70~100대라 120을 만점 기준으로 잡는다.
//
// ★ buzz가 **아직 계산되지 않은** Topic은 0이 아니라 null을 반환한다. 이 구분이 결정적이다:
// buzz 도입 이전에 만들어진 Topic(현재 1,286건 대부분)에는 ai_context.buzz가 없는데, 이를 0점으로
// 처리하면 배포 직후 모든 후보의 Distribution Score가 일제히 20% 내려앉아 적응형 문턱을 못 넘고
// 배급이 통째로 멈춘다(실제로 기존 테스트 108건 중 43건이 이 이유로 깨졌다).
// null이면 아래에서 buzz 가중치를 제외하고 남은 가중치를 재정규화한다 — "정보 없음"을
// "화제성 없음"으로 오해하지 않기 위해서다. 계산은 했는데 매칭이 없어 낮은 것은 진짜 0점이 맞다.
function computeBuzzComponent(topic) {
  const buzz = topic?.ai_context?.buzz;
  if (!buzz || typeof buzz.score !== 'number') return null; // 미계산 — 중립 처리
  if (buzz.score <= 0) return 0;
  return Math.min(100, Math.round((buzz.score / 120) * 100));
}

// ── 카테고리 쿼터 하드 상한 (2026-08-17 PM 지시) ────────────────────────────
// 실측(8/10~8/16): 정치/국제가 매일 42~65%를 먹었다. 상한 20%의 2~3배다.
// 원인은 명확했다 — 쿼터를 발행 파이프라인(editorial-draft / publish-routed-content)에만 걸고
// 배급(Threads/Instagram)에는 안 걸었다. 배급에는 categoryAllocation이라는 가중치 0.16짜리
// **소프트** 신호밖에 없어서, 정치 후보가 다른 축(품질·무게·buzz)에서 조금만 앞서면 그대로 이긴다.
// 소프트 신호로는 편중이 안 잡힌다는 것이 7일치 데이터로 증명됐으므로 하드 상한을 건다.
//
// 상한은 "오늘 목표 × 카테고리 비율"이다. 이미 상한에 닿은 버킷의 후보는 후보군에서 아예 뺀다.
// 전부 상한에 닿으면 원본을 돌려준다 — 배급이 0건이 되는 것보다는 상한을 넘기는 편이 낫다.
function applyCategoryQuotaToPool(pool, postedStats, dailyTarget) {
  const counts = {};
  for (const q of QUOTA_PLAN) counts[q.bucket] = 0;
  for (const [category, n] of Object.entries((postedStats && postedStats.byCategory) || {})) {
    const b = bucketOf(category, null);
    counts[b] = (counts[b] || 0) + n;
  }

  const capOf = {};
  for (const q of QUOTA_PLAN) {
    // 최소 1건은 허용 — 목표가 15건이면 기타(5%)는 floor로 0이 되어 영원히 못 나간다.
    capOf[q.bucket] = Math.max(1, Math.floor(q.cap * dailyTarget));
  }

  const allowed = pool.filter((t) => counts[bucketOf(t.category, null)] < capOf[bucketOf(t.category, null)]);
  if (!allowed.length) {
    console.log(`CATEGORY_QUOTA_ALL_FULL[${CHANNEL}]: 전 버킷 상한 도달 — 쿼터 미적용으로 진행`);
    return pool;
  }
  if (allowed.length < pool.length) {
    const blocked = QUOTA_PLAN.filter((q) => counts[q.bucket] >= capOf[q.bucket]).map((q) => `${q.label}(${counts[q.bucket]}/${capOf[q.bucket]})`);
    console.log(`CATEGORY_QUOTA_APPLIED[${CHANNEL}]: ${pool.length}건 → ${allowed.length}건, 상한도달=[${blocked.join(', ')}]`);
  }
  return allowed;
}

// buzz 문턱 적용 — 표본이 충분할 때만 거른다(위 BUZZ_FLOOR_MIN_SAMPLE 주석 참고).
// 문턱을 넘는 후보가 하나도 남지 않으면 거르지 않은 원본을 그대로 돌려준다(배급 정지 방지).
function applyBuzzFloor(pool) {
  const withBuzz = pool.filter((t) => typeof t?.ai_context?.buzz?.score === 'number');
  if (withBuzz.length < BUZZ_FLOOR_MIN_SAMPLE) {
    console.log(`BUZZ_FLOOR_SKIPPED[${CHANNEL}]: buzz 보유 후보 ${withBuzz.length}건 < 표본 ${BUZZ_FLOOR_MIN_SAMPLE}건 — 문턱 미적용`);
    return pool;
  }
  const passed = withBuzz.filter((t) => t.ai_context.buzz.score >= MIN_BUZZ_SCORE_FOR_POST);
  if (!passed.length) {
    console.log(`BUZZ_FLOOR_EMPTY[${CHANNEL}]: ${MIN_BUZZ_SCORE_FOR_POST}점 이상 후보 0건 — 문턱 미적용`);
    return pool;
  }
  console.log(`BUZZ_FLOOR_APPLIED[${CHANNEL}]: ${pool.length}건 → ${passed.length}건(${MIN_BUZZ_SCORE_FOR_POST}점 이상)`);
  return passed;
}

function computeDistributionScore(topic, baseQuality, ctx) {
  const buzzComponent = computeBuzzComponent(topic);
  const components = {
    buzz: buzzComponent === null ? 0 : buzzComponent,
    editorialScore: baseQuality.score,
    categoryAllocation: computeCategoryAllocationScore(topic.category, ctx.producedStats, ctx.postedStats),
    recentPattern: computeRecentPatternScore(topic.category, ctx.recentCategories),
    searchIntent: computeSearchIntentScore(topic),
    expectedCTR: estimateExpectedCTR(topic),
    topicWeight: computeTopicWeightScore(topic),
    exploration: computeExplorationScore(topic),
  };

  // buzz 미계산이면 그 가중치를 빼고 나머지를 재정규화한다(합이 다시 1.0이 되도록).
  // 이렇게 하면 buzz가 붙은 Topic만 상대적으로 유리해지고, 아직 안 붙은 Topic은 개편 전과
  // 정확히 같은 점수를 받는다 — 마이그레이션 없이 점진 전환이 가능한 이유다.
  const activeWeights = { ...DISTRIBUTION_WEIGHTS };
  if (buzzComponent === null) {
    delete activeWeights.buzz;
    const total = Object.values(activeWeights).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(activeWeights)) activeWeights[k] /= total;
  }

  const distributionScore = Math.round(
    Object.entries(activeWeights).reduce((sum, [key, w]) => sum + components[key] * w, 0)
  );
  return { distributionScore, components, buzzApplied: buzzComponent !== null };
}

// 오늘 원본 기사(articles) 수에 비례한 목표치 — clamp(round(articles×0.10), 20, 60).
// "고정 20건"이 아니라 "최소 20, 최대 60인 비례 목표"다: 기사가 늘어나면 목표도 60까지 계속
// 늘어난다(PM 지시 2026-07-22 — 기사100→20, 210→21, 500→50, 600+→60 상한).
function computeDailyTarget(todayArticles) {
  const raw = Math.round(todayArticles * ARTICLE_TARGET_RATIO);
  return Math.max(MIN_DAILY_TARGET, Math.min(MAX_DAILY_TARGET, raw));
}

// 이번 실행에서 몇 건을 시도할지 — "남은 목표 ÷ 남은 실행 기회"(PM 지시 2026-07-22 계산의
// 일반화). 목표를 이미 채웠어도 0건이 아니라 1건은 시도한다 — 정말 뛰어난 후보라면 적응형
// 문턱값(computeAdaptiveMinDistributionScore)이 알아서 통과시키고, 아니면 자연히 Skip된다.
//
// 2026-08-03: 분모를 "남은 시간"에서 "남은 실행 기회(남은 시간 × RUNS_PER_HOUR)"로 바꿨다.
// 원래 공식은 1시간 주기를 암묵적으로 가정하고 있었다 — cron을 30분으로 줄이면 같은 목표를
// 시간당 2번씩 배정해 하루 몫을 오전에 다 태우고, 그 뒤엔 적응형 문턱값이 올라가 오후·밤
// 배급이 말라버린다. 주기와 분모를 명시적으로 묶어 그 결합을 드러냈다.
function computePostsThisRun(dailyTarget, postedToday, now = new Date(), runsPerHour = CONFIGURED_RUNS_PER_HOUR) {
  const remaining = Math.max(0, dailyTarget - postedToday);
  if (remaining <= 0) return 1;
  const hoursRemainingToday = Math.max(1, 24 - (now.getUTCHours() + now.getUTCMinutes() / 60));
  const runsRemainingToday = Math.max(1, Math.round(hoursRemainingToday * runsPerHour));
  return Math.min(MAX_POSTS_PER_RUN, Math.max(1, Math.ceil(remaining / runsRemainingToday)));
}

// 최근 실행 간격의 중앙값으로 시간당 실행 횟수를 추정한다. 평균이 아니라 중앙값을 쓰는 이유는
// 수동 실행(workflow_dispatch)이나 일시적 장애로 생긴 극단값 하나가 추정을 크게 흔들기 때문이다.
// 표본이 부족하면(로그를 켠 직후 등) 선언값을 그대로 쓴다.
function estimateRunsPerHourFromLog(runAtList) {
  const times = (runAtList || [])
    .map((r) => new Date(r).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);
  if (times.length < 3) return { runsPerHour: CONFIGURED_RUNS_PER_HOUR, source: 'configured(표본부족)', samples: times.length };
  const gapsMin = [];
  for (let i = 0; i < times.length - 1; i++) gapsMin.push((times[i] - times[i + 1]) / 60000);
  const sorted = gapsMin.slice().sort((a, b) => a - b);
  const medianGap = sorted[Math.floor(sorted.length / 2)];
  if (!(medianGap > 0)) return { runsPerHour: CONFIGURED_RUNS_PER_HOUR, source: 'configured(간격이상)', samples: times.length };
  const raw = 60 / medianGap;
  const runsPerHour = Math.min(MAX_RUNS_PER_HOUR, Math.max(MIN_RUNS_PER_HOUR, raw));
  return { runsPerHour, source: `measured(중앙값 ${Math.round(medianGap)}분)`, samples: times.length };
}

// 실측 주기 조회(best-effort) — 실패하면 선언값으로 조용히 폴백한다(배급 자체를 막지 않는다).
async function fetchRunsPerHour() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/distribution_run_log?select=run_at&channel=eq.${CHANNEL}` +
      `&order=run_at.desc&limit=${CADENCE_SAMPLE_SIZE}`,
      { headers: REQUEST_HEADERS }
    );
    if (!res.ok) return { runsPerHour: CONFIGURED_RUNS_PER_HOUR, source: 'configured(조회실패)', samples: 0 };
    const rows = await res.json();
    return estimateRunsPerHourFromLog(rows.map((r) => r.run_at));
  } catch {
    return { runsPerHour: CONFIGURED_RUNS_PER_HOUR, source: 'configured(예외)', samples: 0 };
  }
}

// 목표 대비 진행률에 따라 요구 점수를 부드럽게 올린다(하드 컷오프 아님) — 목표를 채웠어도
// 정말 좋은 후보는 여전히 통과할 수 있다. 목표가 0(오늘 생산 없음)이면 예외적인 경우만 허용.
function computeAdaptiveMinDistributionScore(dailyTarget, postedToday) {
  if (dailyTarget <= 0) return DISTRIBUTION_SCORE_CEILING;
  const progress = postedToday / dailyTarget;
  if (progress <= 1) return DISTRIBUTION_SCORE_FLOOR;
  const over = Math.min(1, progress - 1);
  return Math.round(DISTRIBUTION_SCORE_FLOOR + (DISTRIBUTION_SCORE_CEILING - DISTRIBUTION_SCORE_FLOOR) * over);
}

// ── Data(채널 독립 — CHANNEL 상수로 파라미터화, 두 번째 채널이 생겨도 그대로 재사용) ──────
// 평생 1회 게시 원칙 — ai_context[CHANNEL]이 이미 있으면(=posted_at 존재) 영구 제외. 채널별로
// 독립된 dedup 키를 쓰기 때문에(ai_context.threads / 나중엔 ai_context.google 등) 한 Topic이
// 여러 채널에 각각 게시되는 것은 막지 않는다 — "평생 1회"는 채널 단위다.
async function fetchCandidatePool() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,slug,name,summary,category,gate_status,importance_score,updated_at,ai_context` +
    `&status=eq.active&editorial_status=eq.published&ai_context->${CHANNEL}->>posted_at=is.null` +
    `&order=importance_score.desc&limit=${CANDIDATE_POOL_SIZE}`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) throw new Error('topics 조회 실패: ' + await res.text());
  return res.json();
}

// 최근 게시 이력(전체 기간 중 최근 N건, 카테고리 반복 패턴 판단용) — jsonb 경로 정렬 문법 리스크를
// 피해 넉넉히 가져와 클라이언트에서 정렬한다.
async function fetchRecentPostedCategories(limit) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=category,ai_context&status=eq.active` +
    `&ai_context->${CHANNEL}->>posted_at=not.is.null&limit=30`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return rows
    .sort((a, b) => (b.ai_context?.[CHANNEL]?.posted_at || '').localeCompare(a.ai_context?.[CHANNEL]?.posted_at || ''))
    .slice(0, limit)
    .map((r) => r.category)
    .filter(Boolean);
}

// 오늘(UTC) 실제 웹 생산량 — 총량과 카테고리별 분포. computeDailyTarget과 categoryAllocation의 입력.
async function fetchTodayProducedStats() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,category&status=eq.active&editorial_status=eq.published` +
    `&created_at=gte.${encodeURIComponent(todayStart)}`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) return { total: 0, byCategory: {} };
  const rows = await res.json();
  const byCategory = {};
  rows.forEach((r) => { byCategory[r.category] = (byCategory[r.category] || 0) + 1; });
  return { total: rows.length, byCategory };
}

// 오늘(UTC) 원본 기사(articles) 수 — computeDailyTarget의 유일한 입력. 카테고리 배분과는 무관하고
// 오직 "오늘 배급 목표"를 정하는 데만 쓴다(PM 지시 2026-07-22 — articles 수=오늘 배급 규모 결정,
// published Topic/장문=실제 게시 후보, 이 둘의 역할을 분리).
async function fetchTodayArticleCount() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/articles?select=id&created_at=gte.${encodeURIComponent(todayStart)}`,
    { headers: { ...REQUEST_HEADERS, Prefer: 'count=exact' }, method: 'HEAD' }
  );
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1], 10) || 0 : 0;
}

// 현재 활성 Topic 총 개수 — 심층형 포스팅 마무리 문구("오늘 이 외에도 N개 이슈를 다루고
// 있습니다")에 쓰는 실제 수치. 홈(app/page.tsx)의 "오늘 N개의 세계가 열려 있습니다"와 같은
// 성격의 숫자이되, 그쪽은 getActiveTopics(41)로 조회 상한이 41이라 실제 활성 수가 더 많아도
// 41로 잘린다 — 여기서는 count=exact HEAD로 상한 없이 실제 총량을 구한다.
async function fetchActiveTopicCount() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id&status=eq.active`,
    { headers: { ...REQUEST_HEADERS, Prefer: 'count=exact' }, method: 'HEAD' }
  );
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1], 10) || 0 : 0;
}

// 오늘(UTC) 이 채널의 게시 실적 — 총량과 카테고리별 분포. 운영 보고(오늘 게시 성공 수)에도 그대로 쓴다.
async function fetchTodayPostedStats() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/topics?select=id,category&status=eq.active` +
    `&ai_context->${CHANNEL}->>posted_at=gte.${encodeURIComponent(todayStart)}`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) return { total: 0, byCategory: {} };
  const rows = await res.json();
  const byCategory = {};
  rows.forEach((r) => { byCategory[r.category] = (byCategory[r.category] || 0) + 1; });
  return { total: rows.length, byCategory };
}

// ── 에버그린(허브 문서) 데이터 계층 ─────────────────────────────────────────
// 허브 목록 — 실패해도 배급을 막지 않는다(허브 연결과 에버그린만 이번 회차에서 쉰다).
async function fetchHubTargets() {
  try {
    const res = await fetch(HUB_TARGETS_URL, { headers: { 'accept': 'application/json' } });
    if (!res.ok) return [];
    const rows = await res.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error(`HUB_TARGETS_FETCH_FAILED[${CHANNEL}](에버그린·허브연결만 이번 회차 중단):`, e.message);
    return [];
  }
}

// 문서 목록(본문 제외) — 선택에 필요한 메타만 가져온다.
async function fetchHubDocuments() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/hub_documents?select=hub_slug,slug,format,title,created_at,status` +
    `&status=eq.published&order=created_at.desc&limit=${EVERGREEN_POOL_LIMIT}`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) {
    console.error(`HUB_DOCUMENTS_FETCH_FAILED[${CHANNEL}]:`, await res.text());
    return [];
  }
  return res.json();
}

// 선택된 문서의 본문. 목록 조회에서 blocks를 뺀 대신 여기서 1건만 읽는다.
async function fetchHubDocumentBody(hubSlug, docSlug) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/hub_documents?select=hub_slug,slug,format,title,lead,blocks,source_note` +
    `&hub_slug=eq.${encodeURIComponent(hubSlug)}&slug=eq.${encodeURIComponent(docSlug)}&limit=1`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) throw new Error('hub_documents 본문 조회 실패: ' + await res.text());
  const [row] = await res.json();
  if (!row) throw new Error(`hub_documents에 ${hubSlug}/${docSlug}가 없다`);
  return row;
}

// 에버그린 dedup — Topic처럼 ai_context를 걸 자리가 없어서 threads_posts의 실제 게시 기록을
// 정본으로 쓴다(마이그레이션 없이 되는 방법이고, "실제로 게시된 것"이 정의상 정확하다).
// source_url에 /hub/가 들어간 성공 기록의 '{hub_slug}/{doc_slug}'를 집합으로 만든다.
async function fetchPostedEvergreenKeys() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/threads_posts?select=source_url&status=eq.success` +
    `&source_url=like.*${encodeURIComponent('/hub/')}*&limit=2000`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) {
    console.error(`EVERGREEN_DEDUP_FETCH_FAILED[${CHANNEL}](중복 게시 위험 — 이번 회차 에버그린 중단):`, await res.text());
    return null; // null은 "확인 불가" — 호출자는 에버그린을 시도하지 않는다(중복보다 미게시가 낫다).
  }
  const keys = new Set();
  for (const row of await res.json()) {
    const m = String(row.source_url || '').match(/\/hub\/([^/?#]+)\/([^/?#]+)/);
    if (m) keys.add(`${m[1]}/${m[2]}`);
  }
  return keys;
}

// 오늘(UTC) 유형별 게시 실적 — 유형 선택(비중 밴드)의 입력.
// 뉴스는 topics.ai_context.threads가 정본이고, 에버그린은 threads_posts.hook_type이 정본이다.
// hook_type은 2026-07-29 개편으로 비어 있던 컬럼을 게시 유형 표기로 되살려 쓰는 것이다
// (news / news_hub / evergreen) — 새 컬럼을 만들지 않고 유형별 집계를 얻기 위해서다.
async function fetchTodayEvergreenCount() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/threads_posts?select=id&hook_type=eq.evergreen&status=eq.success` +
    `&posted_at=gte.${encodeURIComponent(todayStart)}`,
    { headers: { ...REQUEST_HEADERS, Prefer: 'count=exact' }, method: 'HEAD' }
  );
  const range = res.headers.get('content-range');
  return range ? parseInt(range.split('/')[1], 10) || 0 : 0;
}

// 오늘 이미 에버그린이 나간 허브 목록 — 한 허브가 저녁 시간대를 독점하지 않게 한다.
async function fetchHubsPostedToday() {
  const todayStart = new Date().toISOString().slice(0, 10) + 'T00:00:00';
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/threads_posts?select=source_url&status=eq.success` +
    `&posted_at=gte.${encodeURIComponent(todayStart)}&limit=200`,
    { headers: REQUEST_HEADERS }
  );
  if (!res.ok) return new Set();
  const hubs = new Set();
  for (const row of await res.json()) {
    const m = String(row.source_url || '').match(/\/hub\/([^/?#]+)/);
    if (m) hubs.add(m[1]);
  }
  return hubs;
}

// 후보 선정 전체 파이프라인 — Thread Score(품질 하한선) → Distribution Score(배급 우선순위) →
// 오늘 생산량 기반 적응형 문턱값. 반환: { topic, reason, detail } — topic이 null이면 reason에
// 사유가 담긴다(no_candidate/below_quality_threshold/below_distribution_threshold).
// 게시하지 않은 후보 로그(best-effort) — 지금은 알고리즘보다 "왜 게시가 적었는지" 분석할 수 있는
// 데이터가 더 중요하다(PM 지시 2026-07-22). 실패해도 메인 흐름을 막지 않는다. distribution_skip_log
// 테이블이 아직 마이그레이션 전이면(supabase/distribution_ops_logging_migration.sql 미적용) 조용히
// 실패하고 넘어간다.
//
// 로그 적재 실패 사유를 사람이 읽을 수 있게 번역한다(2026-08-03 추가).
// 실제 사고: 이 두 로그가 몇 주간 계속 실패하고 있었는데 원인은 코드가 아니라 "마이그레이션
// 미적용"이었다 — PostgREST가 없는 테이블에 대해 PGRST205(404)를 돌려주는데, 원문 에러를 그대로
// 찍고 있어서 "로그만 누락"이라는 문구에 묻혀 아무도 원인을 알 수 없었다. 이제 이 경우만 따로
// 골라 적용해야 할 파일명을 로그에 직접 적는다.
function describeLogFailure(detail) {
  if (typeof detail === 'string' && detail.includes('PGRST205')) {
    return '테이블이 DB에 없음 — supabase/distribution_ops_logging_migration.sql 미적용 상태다. ' +
      '이 SQL을 Supabase SQL Editor에서 실행한 뒤 supabase/global_rls_policy.sql도 다시 실행해야 한다. 원문: ' + detail;
  }
  return detail;
}

async function logSkippedCandidates(rows) {
  if (!rows.length) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/distribution_skip_log`, {
      method: 'POST',
      headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!res.ok) console.error(`DISTRIBUTION_SKIP_LOG_FAILED[${CHANNEL}](참고용 로그만 누락):`, describeLogFailure(await res.text()));
  } catch (e) {
    console.error(`DISTRIBUTION_SKIP_LOG_FAILED[${CHANNEL}](참고용 로그만 누락):`, e.message);
  }
}

// 하드 실패(후보는 선정됐는데 그 뒤 단계에서 깨진 경우)를 distribution_skip_log에 남긴다.
// 2026-08-03에 추가: 이 로그가 없어서 "posts_attempted=1 posts_succeeded=0"인 실행 3건의
// 원인을 DB만으로는 특정할 수 없었다(사유가 Netlify 함수 로그에만 있었고, 함수 로그는 세션에서
// 접근할 수 없다). distribution_run_log는 건수만 기록하므로 "왜 실패했는가"를 담을 자리가 없다.
// skip_log는 이미 "왜 게시하지 않았는가"를 담는 테이블이니 하드 실패도 여기 모은다 —
// 새 컬럼/마이그레이션이 필요 없고, reason으로 필터하면 실패 유형별 빈도를 바로 볼 수 있다.
async function logHardFailure(topic, reason, errorMessage, extra) {
  await logSkippedCandidates([{
    channel: CHANNEL,
    topic_id: topic?.id ?? null,
    topic_name: topic?.name ?? null,
    category: topic?.category ?? null,
    reason,
    detail: { error: String(errorMessage || '').slice(0, 500), ...(extra || {}) },
  }]);
}

// excludeIds: 이번 실행에서 이미 시도했다가 실패한 Topic들. 같은 후보를 다시 골라 같은 실패를
// 반복하는 것을 막는다(2026-08-04 — 아래 attemptOnePost/handler 주석 참고).
// 허브 연결 트리거 가산점(PM 지시 2026-08-12 §1·§5). 가중치 표(DISTRIBUTION_WEIGHTS)에 새
// 컴포넌트를 넣지 않고 합산 뒤 더하는 이유: 기존 7개 가중치의 합=1.0 계약을 건드리지 않고
// "트리거"라는 성격(점수의 일부가 아니라 우선 발동 신호)을 코드 모양으로도 남기기 위해서다.
// 12점은 카테고리 배분·최근 패턴 같은 다른 신호를 뒤집을 만큼 크지는 않되, 동점권에서는
// 허브가 걸린 토픽이 항상 먼저 나가도록 정한 값이다.
const HUB_TRIGGER_BONUS = 12;

async function selectCandidate(excludeIds = new Set(), hubs = []) {
  const [poolRaw, recentCategories, producedStats, postedStats, articleCount] = await Promise.all([
    fetchCandidatePool(),
    fetchRecentPostedCategories(RECENT_HISTORY_WINDOW),
    fetchTodayProducedStats(),
    fetchTodayPostedStats(),
    fetchTodayArticleCount(),
  ]);
  const pool = poolRaw.filter((t) => !excludeIds.has(t.id));
  const dailyTarget = computeDailyTarget(articleCount);
  const adaptiveMinScore = computeAdaptiveMinDistributionScore(dailyTarget, postedStats.total);
  const baseDetail = { dailyTarget, todayArticleCount: articleCount, todayProducedTotal: producedStats.total, todayPostedTotal: postedStats.total };

  if (!pool.length) {
    await logSkippedCandidates([{ channel: CHANNEL, reason: 'no_candidate', detail: { poolSize: 0 } }]);
    return { topic: null, reason: 'no_candidate', detail: { poolSize: 0, ...baseDetail } };
  }

  // buzz 상위 선별(2026-08-17) — 품질 게이트보다 먼저 적용한다. 화제성이 없는 이슈는
  // 아무리 잘 쓰였어도 이번 개편의 대상이 아니기 때문이다.
  const buzzFiltered = applyBuzzFloor(pool);

  // 카테고리 하드 상한 — buzz 문턱 **다음**에 건다. 순서가 중요하다:
  // 쿼터를 먼저 걸면 "정치 상한이 남았으니 약한 정치 기사라도 통과"가 되어 화제성이 희생된다.
  // buzz를 먼저 걸어 강한 후보만 남긴 뒤 쿼터로 분배해야 "카테고리별로 강력한 것만"이 된다.
  const quotaFiltered = applyCategoryQuotaToPool(buzzFiltered, postedStats, dailyTarget);

  const scoredAll = quotaFiltered.map((t) => ({ topic: t, base: computeEditorialScore(t) }));
  const eligible = scoredAll.filter((s) => passesMinimumQuality(s.topic, s.base));
  const ineligible = scoredAll.filter((s) => !passesMinimumQuality(s.topic, s.base));
  const ineligibleRows = ineligible.map((s) => ({
    channel: CHANNEL, topic_id: s.topic.id, topic_name: s.topic.name, category: s.topic.category,
    editorial_score: s.base.score, reason: 'quality_threshold', detail: { breakdown: s.base.breakdown },
  }));

  if (!eligible.length) {
    await logSkippedCandidates(ineligibleRows);
    return {
      topic: null, reason: 'below_quality_threshold',
      detail: { poolSize: pool.length, minEditorialScore: MIN_EDITORIAL_SCORE, topEditorialScoreSeen: Math.max(...scoredAll.map((s) => s.base.score), 0), ...baseDetail },
    };
  }

  const ctx = { producedStats, postedStats, recentCategories };
  const ranked = eligible
    .map((s) => {
      const scored = computeDistributionScore(s.topic, s.base, ctx);
      // 허브 연결 판정 — 제목이 허브 키워드를 건드리는 토픽은 트리거로 먼저 나간다.
      // 관련성이 문턱(70) 미만이면 match는 null이고, 그 토픽은 그냥 일반 뉴스로 발행된다
      // ("어색한 연결 방지" — PM 지시 §5).
      const match = strategy.pickHubForTopic(s.topic.name, hubs);
      return {
        topic: s.topic,
        ...scored,
        hubMatch: match,
        distributionScore: scored.distributionScore + (match ? HUB_TRIGGER_BONUS : 0),
      };
    })
    .sort((a, b) => b.distributionScore - a.distributionScore);

  const winner = ranked.find((r) => r.distributionScore >= adaptiveMinScore);

  const belowDistributionRows = ranked
    .filter((r) => r.topic.id !== winner?.topic.id && r.distributionScore < adaptiveMinScore)
    .map((r) => ({
      channel: CHANNEL, topic_id: r.topic.id, topic_name: r.topic.name, category: r.topic.category,
      editorial_score: r.components.editorialScore, distribution_score: r.distributionScore,
      reason: 'distribution_threshold', detail: { components: r.components, adaptiveMinScore },
    }));
  await logSkippedCandidates([...ineligibleRows, ...belowDistributionRows]);

  if (!winner) {
    return {
      topic: null, reason: 'below_distribution_threshold',
      detail: { adaptiveMinScore, topDistributionScoreSeen: ranked[0]?.distributionScore || 0, candidatesConsidered: ranked.length, ...baseDetail },
    };
  }

  return {
    topic: winner.topic, reason: 'success', hubMatch: winner.hubMatch || null,
    detail: {
      distributionScore: winner.distributionScore, components: winner.components, adaptiveMinScore,
      candidatesConsidered: ranked.length, recentCategories,
      hubTrigger: winner.hubMatch
        ? { slug: winner.hubMatch.hub.slug, relevance: winner.hubMatch.relevance, bonus: HUB_TRIGGER_BONUS }
        : null,
      ...baseDetail,
    },
  };
}

// ── 유형 선택(뉴스 / 에버그린) ──────────────────────────────────────────────
// PM 지시 2026-08-12 §1·§2·§4의 실제 진입점. 시간대와 오늘 비중, 신규 문서 트리거를 종합해
// 선호 순서를 정하고, 1순위 유형에 후보가 없으면 2순위로 내려간다(회차를 통째로 버리지 않는다).
//
// 반환: { type:'news', topic, hubMatch, detail } | { type:'evergreen', doc, hub, detail }
//       | { type:null, reason, detail }
async function selectItem(excludeIds = new Set(), excludeDocKeys = new Set()) {
  const now = new Date();
  const hour = strategy.kstHour(now);

  // 에버그린 OFF — 뉴스 경로만 태운다. 허브·문서 조회도 하지 않는다.
  if (!EVERGREEN_ENABLED) {
    const news = await selectCandidate(excludeIds, []);
    const mix = { kstHour: hour, preference: ['news'], evergreenEnabled: false };
    if (news.topic) {
      return { type: 'news', topic: news.topic, hubMatch: news.hubMatch, detail: { ...mix, ...news.detail } };
    }
    return { type: null, reason: news.reason, detail: { ...mix, ...news.detail } };
  }

  const [hubs, docs, postedKeysRaw, evergreenToday, newsStats, hubsPostedToday] = await Promise.all([
    fetchHubTargets(),
    fetchHubDocuments(),
    fetchPostedEvergreenKeys(),
    fetchTodayEvergreenCount(),
    fetchTodayPostedStats(),
    fetchHubsPostedToday(),
  ]);

  // dedup 조회가 실패하면(null) 에버그린을 시도하지 않는다 — 같은 문서를 두 번 올리는 것보다
  // 이번 회차를 뉴스로 채우는 편이 낫다.
  const dedupKnown = postedKeysRaw !== null;
  const postedKeys = new Set([...(postedKeysRaw || []), ...excludeDocKeys]);

  const hasFresh = dedupKnown && strategy.hasFreshPendingDoc(docs, postedKeys, now);
  const preference = strategy.pickTypePreference(hour, newsStats.total, evergreenToday, hasFresh);
  const mixDetail = {
    kstHour: hour, preference, todayNews: newsStats.total, todayEvergreen: evergreenToday,
    evergreenShare: newsStats.total + evergreenToday > 0
      ? Number((evergreenToday / (newsStats.total + evergreenToday)).toFixed(2)) : 0,
    freshDocTrigger: hasFresh, hubCount: hubs.length, docPool: docs.length,
  };
  console.log(`DISTRIBUTION_TYPE_PLAN[${CHANNEL}]:`, JSON.stringify(mixDetail));

  const attempts = [];
  for (const type of preference) {
    if (type === 'evergreen') {
      if (!dedupKnown) { attempts.push({ type, reason: 'dedup_unavailable' }); continue; }
      const picked = strategy.pickEvergreenDoc(docs, postedKeys, { now, hubsPostedToday });
      if (!picked) { attempts.push({ type, reason: 'no_candidate' }); continue; }
      const hub = hubs.find((h) => h.slug === picked.doc.hub_slug) || null;
      return {
        type: 'evergreen', doc: picked.doc, hub,
        detail: { ...mixDetail, evergreenScore: picked.score, format: picked.doc.format, hubSlug: picked.doc.hub_slug },
      };
    }
    const news = await selectCandidate(excludeIds, hubs);
    if (news.topic) {
      return { type: 'news', topic: news.topic, hubMatch: news.hubMatch, detail: { ...mixDetail, ...news.detail } };
    }
    attempts.push({ type: 'news', reason: news.reason, detail: news.detail });
  }

  // 사유는 뉴스 쪽을 우선 노출한다 — 운영 대시보드·기존 알림이 'no_candidate'/
  // 'below_quality_threshold' 같은 뉴스 경로 사유를 그대로 읽고 있고, 에버그린이 없어서
  // 못 나간 것과 뉴스가 말라서 못 나간 것 중 후자가 항상 더 중요한 신호이기 때문이다.
  const newsAttempt = attempts.find((a) => a.type === 'news');
  const chosen = newsAttempt || attempts[0];
  return {
    type: null,
    reason: chosen?.reason || 'no_candidate',
    detail: {
      ...mixDetail,
      attempted: attempts.map((a) => `${a.type}:${a.reason}`),
      ...(chosen?.detail || {}),
    },
  };
}

// 채널 독립 선정 로직은 여기까지다. 아래 저장 함수들은 CHANNEL 상수로 파라미터화돼 있어 그대로
// 재사용되지만, Threads Graph API 호출 자체(생성 문구/게시)는 채널마다 새로 작성해야 한다.
// ═══ 채널 독립 영역 끝 ═════════════════════════════════════════════════════

// ── Post log(상세, best-effort) ──────────────────────────────────
async function savePostLog(fields) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/threads_posts`, {
    method: 'POST',
    headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`DISTRIBUTION_LOG_SAVE_FAILED[${CHANNEL}](핵심 동작에는 영향 없음, 상세 로그만 누락):`, detail);
    return { ok: false, detail };
  }
  return { ok: true };
}

// 핵심 dedup 기록 + Distribution Score 저장 — 기존 ai_context merge 패턴 재사용.
//
// ai_context.engines.distribution은 "왜 이 Topic이 선택됐는가"를 나중에 분석·AI 학습·운영
// 통계·점수 변화 추적에 쓸 수 있도록 계산 결과를 실제로 저장한다(PM 지시 2026-07-21 §4 — 계산만
// 하고 버리지 말 것). engines 네임스페이스 아래 두고 version을 남기는 이유는 채점 알고리즘이
// v2/v3로 바뀌어도 과거 기록과 공존시키기 위해서다. 지금은 채널이 하나뿐이라 topic당 1개 객체로
// 최신값만 덮어쓴다 — 두 번째 채널이 생겨 같은 Topic이 여러 채널에 각각 다른 시점에 게시될 수
// 있게 되면, 이 필드를 채널별/시점별 배열로 바꿔야 할 수 있다(지금은 그 정도로 충분하다고 판단).
const DISTRIBUTION_ENGINE_VERSION = 1; // 채점 알고리즘이 바뀌면 올린다 — 과거 기록(v1)과 새 기록(v2)이 공존해야 하므로 값 자체를 덮어쓰지 않고 버전을 남긴다.

async function markTopicPosted(topic, postId, distributionDetail) {
  const c = distributionDetail?.components || {};
  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${topic.id}`, {
    method: 'PATCH',
    headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      ai_context: {
        ...(topic.ai_context || {}),
        [CHANNEL]: { posted_at: new Date().toISOString(), post_id: postId },
        engines: {
          ...(topic.ai_context?.engines || {}),
          distribution: {
            version: DISTRIBUTION_ENGINE_VERSION,
            score: distributionDetail?.distributionScore ?? null,
            components: {
              editorial_score: c.editorialScore ?? null,
              expected_ctr: c.expectedCTR ?? null,
              exploration: c.exploration ?? null,
              topic_weight: c.topicWeight ?? null,
              category_allocation: c.categoryAllocation ?? null,
              recent_pattern: c.recentPattern ?? null,
              search_intent: c.searchIntent ?? null,
            },
            channel: CHANNEL,
            calculated_at: new Date().toISOString(),
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`핵심 dedup 기록 실패(topics.ai_context.${CHANNEL}): ` + await res.text());
}

// 게시 직전 최종 재확인(레이스 컨디션 방어) — 동시 실행 시 같은 Topic이 중복 선택될 가능성을 차단.
async function isStillUnposted(topicId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/topics?id=eq.${topicId}&select=ai_context`, { headers: REQUEST_HEADERS });
  if (!res.ok) return true; // 조회 실패 시엔 진행(과도한 차단 방지) — 이후 markTopicPosted가 최종 방어선
  const [row] = await res.json();
  return !row?.ai_context?.[CHANNEL]?.posted_at;
}

// ═══ 채널 종속 영역 시작(Threads Adapter) ═══════════════════════════════════
// 여기서부터 파일 끝까지는 이 채널(Threads)에만 해당하는 코드다. 두 번째 채널을 추가할 때는
// 새 파일에 이 영역만 새로 작성하고(문구 생성 프롬프트, API 포맷), 위 채널 독립 영역은 import해
// 재사용하면 된다(지금은 한 파일에 같이 있지만 분리 준비가 된 상태다).
//
// ── 문구 길이 예산(2026-08-03 사고 수정) ─────────────────
// 사고: 본문+마무리+링크를 이어붙인 뒤 통째로 slice(0, 499)했더니, 본문이 예산을 넘는 경우
// 잘려나가는 쪽이 항상 "맨 뒤에 붙은 링크"였다 — 글이 문장 중간에서 끊기고 링크도 없이 게시됐다.
// 실측(2026-08-03): slug 최대 64자 + UTM 4개(78자) + topic UUID(36자) 때문에 URL만 167~209자,
// 마무리 문구 29자를 더하면 본문에 남는 예산이 261자뿐인데 프롬프트는 "3~5문장 + 관점"(400자+)을
// 요구하고 있었다. 즉 구조적으로 거의 매번 링크가 잘려나가는 상태였다.
//
// 그래서 두 가지를 동시에 바꿨다:
//   1) 링크를 먼저 확보하고 남은 예산에 본문을 맞춘다(잘리는 쪽이 본문이 되도록 순서를 뒤집음).
//   2) URL에서 중복 UTM을 제거해 예산 자체를 늘렸다(아래 buildTopicUrl 주석 참고).
// 자르더라도 문장 중간에서 끊지 않는다(truncateAtSentenceBoundary).
// 문구 조립 자체의 실패(우리 코드 버그) — Claude API 실패와 구분해서 로그에 남기기 위한 전용 타입.
class ComposeError extends Error {
  constructor(message) { super(message); this.name = 'ComposeError'; }
}

const THREADS_MAX_CHARS = 500; // Threads API 텍스트 하드 리밋.
// 2026-08-12: 링크가 본문에서 첫 댓글로 내려가면서 본문 예산이 260자 → 500자로 늘었다.
// 목표를 420으로 잡는 이유는 종전과 같다 — 예산과 목표를 같게 두면 매번 잘림이 정상이 된다.
// 잘림은 예외여야 로그(THREADS_BODY_TRUNCATED)가 신호로 기능한다.
// 2026-08-17: PM 지시 "본문: 핵심 요약(500자)". 다만 500은 API 하드 리밋 그 자체라 목표를
// 500으로 두면 매 건이 잘림 경고를 낸다. 460으로 잡아 리밋 바로 아래를 노린다(위 원칙 유지).
const BODY_TARGET_CHARS = 460;
const BODY_BUDGET = THREADS_MAX_CHARS; // 본문에 링크가 없으므로 전액이 본문 예산이다.
// 댓글도 같은 하드 리밋(500자)을 받는다. 프롬프트는 400자를 요구하고, 여기서 한 번 더 막는다.
const COMMENT_BUDGET = THREADS_MAX_CHARS;

// 문장 경계에서 자른다 — 예산을 넘으면 예산 안의 마지막 문장 종결부까지만 남긴다. 종결부를
// 못 찾거나 너무 앞이면(=한 문장이 예산보다 긴 경우) 예산에서 자르고 말줄임표를 붙인다.
//
// 계약: 반환값 길이는 어떤 입력에도 budget을 넘지 않는다.
// 2026-08-03 재수정: 처음 구현에서 예산대로 자른 뒤 '…'를 덧붙여 budget+1자를 반환하는
// off-by-one이 있었다. 그 1자 때문에 전체 문구가 501자가 되어 아래 상한 검사가 throw하고,
// 게시가 claude_failed로 조용히 실패했다(17:47 실행 posts_succeeded=0으로 관측).
// 말줄임표도 예산에 포함되는 문자라, 붙일 자리를 미리 빼고 잘라야 한다.
function truncateAtSentenceBoundary(text, budget) {
  const t = (text || '').trim();
  if (t.length <= budget) return t;
  const slice = t.slice(0, budget);
  const m = slice.match(/^[\s\S]*[.!?。…](?=\s|$)/); // 소수점("3.5%") 오인 방지를 위해 뒤가 공백/끝인 경우만 종결부로 본다.
  if (m && m[0].trim().length >= budget * 0.5) return m[0].trim();
  // 말줄임표 1자를 예산 안에서 확보한다.
  return t.slice(0, Math.max(0, budget - 1)).trim().replace(/[,、·\s]+$/, '') + '…';
}

// 게시용 Topic URL — utm_campaign/utm_content를 뺐다(2026-08-03).
// utm_campaign='organic_threads'는 utm_source='threads'와 사실상 같은 정보고, utm_content는
// topic UUID(36자)를 담았지만 URL 경로에 이미 slug가 있어 유입 분석에 새로 주는 정보가 없다.
// 둘을 합쳐 114자를 잡아먹으면서 정작 본문 예산을 밀어내고 있었으므로 제거했다 —
// GA 유입 귀속에 필요한 최소 조합(source/medium)은 그대로 유지한다.
function buildTopicUrl(topic) {
  return `${BASE_URL}/topic/${topic.slug}?utm_source=threads&utm_medium=social`;
}

// 허브·허브 문서 URL — 유입 귀속은 Topic과 같은 최소 조합(source/medium)만 유지한다.
function buildHubUrl(hubSlug) {
  return `${BASE_URL}/hub/${hubSlug}?utm_source=threads&utm_medium=social`;
}
function buildHubDocUrl(hubSlug, docSlug) {
  return `${BASE_URL}/hub/${hubSlug}/${docSlug}?utm_source=threads&utm_medium=social`;
}

// ── 심층형 포스팅 생성 ─────────────────
// PM 지시(2026-07-29): 짧은 훅+링크유도 방식을 폐기하고, 링크를 누르지 않아도 그 자체로 읽을
// 가치가 있는 완결된 글로 전면 개편. 마지막 유도는 CTA 문구가 아니라 "오늘 이 외에도 활성
// 이슈가 몇 개 더 있는지"를 실제 수치로 안내하는 고정 형식이다(CTA_PHRASES/pickCtaPhrase/
// hook_type 분류는 이 개편으로 더 이상 필요 없어 제거했다).
async function generateDeepPost(topic) {
  const draft = topic.ai_context?.draft;
  const keywords = draft?.display_keywords || [];
  const perspectives = draft?.perspective_markers || [];

  const prompt = `너는 뉴스저울의 에디터다. 아래 이슈에 대해 Threads에 올릴 완결된 글을 작성해라.
목표: 링크를 누르지 않아도 그 자체로 읽을 가치가 있는 글. 저장하거나 공유하고 싶게 만드는 것 —
짧은 훅으로 클릭만 유도하는 낚시글이 아니다.

★ 길이(가장 중요): 본문은 공백 포함 ${BODY_TARGET_CHARS}자 이내로 써라. 절대 ${THREADS_MAX_CHARS}자를 넘기지 마라.
링크는 본문에 넣지 않는다(첫 댓글에 따로 붙는다) — 그만큼 예산이 늘었으니 사실을 더 담아라.
"자세한 내용은 링크에서" 같은 정보 은닉형 문장은 쓰지 마라. 이 글 안에서 답이 끝나야 한다.

★ 관점(2026-08-17 개편, 가장 중요한 차별점): 사건을 요약해서 전달하는 글은 이미 넘친다.
뉴스저울의 글은 **"이 이슈 이면에 뭐가 있나"**에 답해야 한다. 즉 무슨 일이 일어났는지가 아니라,
왜 지금 이게 터졌는지 / 누가 무엇을 얻고 잃는지 / 표면적 명분 뒤의 실제 이해관계가 무엇인지를 쓴다.

글 구조 — 아래 두 형식 중 **이 사안에 맞는 쪽 하나**를 골라 써라(문단 사이는 줄바꿈 두 번):

[형식 A] 대립형 — 찬반·진영·이해관계가 뚜렷하게 갈리는 사안일 때 (예: 탄핵, 규제 신설, 파업, 판결)
1. 무슨 일인지 2~3문장. 숫자·고유명사 필수.
2. "찬성측은 이렇게 본다:" 로 시작해 그쪽 논리를 1~2문장으로, 그 진영이 실제로 내세우는 근거 그대로.
3. "반대측은 이렇게 본다:" 로 시작해 마찬가지로 1~2문장.
4. 양쪽이 실제로 무엇을 걸고 다투는지(자리·예산·표·시장점유율 등 구체적 이해관계) 1~2문장.
   ※ 어느 쪽이 옳은지 판정하지 마라. 양쪽 분량을 비슷하게 맞춰라. 한쪽을 희화화하지 마라.

[형식 B] 이면형 — 대립 구도가 아닌 사안일 때 (예: 실적 발표, 신제품, 사고, 인사)
1. 무슨 일인지 2~3문장. 숫자·고유명사 필수.
2. "그런데 진짜 쟁점은" 또는 그에 준하는 전환으로, 표면 발표 뒤의 배경·타이밍·의도를 2~3문장.
3. 이 일로 누가 이득을 보고 누가 부담을 지는지 1~2문장.

허용: 구체적인 숫자·인물·기업·정책명, 사실에 기반한 대비·맥락, 각 진영이 실제로 한 주장의 인용.
금지: 사실과 다른 과장, 본문에 없는 결론 추가, 공포 조장, "충격"·"소름"·"난리 났다" 같은 저품질
상투어, "이것만 알면"·"끝까지 봐야 하는 이유" 같은 정보 은닉형 클릭 유도.
금지(추가): 근거 없는 음모론적 단정("사실은 ~를 노린 것"처럼 자료에 없는 의도 추정). 이면을 쓰되
반드시 아래 제공된 자료(요약·리드·엇갈리는 시각) 안에서 근거를 찾아 써라 — 추측을 사실처럼 쓰지 마라.
어느 진영도 조롱하거나 인신공격하지 마라.

제목: ${topic.name}
요약: ${topic.summary || ''}
핵심 키워드: ${keywords.join(', ') || '(없음)'}
리드: ${draft?.lead || ''}
엇갈리는 시각: ${perspectives.map((p) => `[${p.perspective}] ${p.claim}`).join(' / ') || '(없음)'}

★ 본문 + 댓글 연재(2026-08-17 개편): 이제 한 이슈를 본문 1개 + 댓글 2개로 나눠 연재한다.
같은 말을 세 번 반복하면 안 된다 — 각 칸은 서로 다른 것을 말해야 한다.
- 본문: 핵심 요약. 이것만 읽어도 무슨 일인지 알 수 있어야 한다. 위 [형식 A/B]의 1번 문단에
  해당하는 내용을 중심으로, ${BODY_TARGET_CHARS}자 이내.
- 댓글1(배경/맥락): 왜 지금 이 일이 벌어졌는지. 앞선 경위, 제도·구조적 배경, 직전에 있었던 일.
  본문에 이미 쓴 문장을 다시 쓰지 마라. 400자 이내.
- 댓글2(찬반/이면 심층): [형식 A]를 골랐으면 "찬성측은 이렇게 본다 / 반대측은 이렇게 본다"를
  여기에 쓴다(양쪽 분량을 맞추고 어느 쪽이 옳은지 판정하지 마라).
  [형식 B]를 골랐으면 표면 뒤의 진짜 쟁점과 이해관계(누가 얻고 누가 잃는가)를 쓴다. 400자 이내.
- 댓글3(앞으로 볼 것): 이 사안이 다음에 어떤 분기점을 맞는지 쓴다. 예정된 일정·표결·발표·판결,
  또는 무엇이 확인되면 방향이 갈리는지. 앞의 세 칸에서 이미 쓴 문장을 반복하지 마라. 400자 이내.
  ※ 예정에 없는 일정을 지어내지 마라. 자료에 날짜가 없으면 "무엇을 지켜봐야 하는지"만 써라.

설명 없이 아래 JSON만 반환해라(코드블록 없이):
{
  "format": "A" 또는 "B" (위에서 고른 형식),
  "text": "본문 — 핵심 요약(${BODY_TARGET_CHARS}자 이내, 링크 제외)",
  "comment_context": "댓글1 — 배경/맥락 상세(400자 이내, 링크 제외)",
  "comment_depth": "댓글2 — 찬반 또는 이면 심층(400자 이내, 링크 제외)",
  "comment_outlook": "댓글3 — 앞으로 볼 것(400자 이내, 링크 제외)"
}`;

  // ★ 2026-08-06: 게시 실패의 최대 원인 수정.
  //   실측(distribution_skip_log 최근 200건 중 claude_failed 70건): 응답이 전부
  //   {"stop_reason":"max_tokens","blockTypes":["thinking"],"rawLen":0} 형태였다.
  //   원인은 두 가지가 겹친 것이다.
  //    (1) claude-sonnet-5는 thinking 파라미터를 **생략하면 adaptive thinking이 켜진다**.
  //        이 호출은 thinking을 지정한 적이 없어서 계속 thinking을 하고 있었다.
  //    (2) max_tokens는 thinking과 응답 텍스트를 **합친** 총량의 상한이다.
  //        800토큰을 thinking이 다 써버려 text 블록이 0개인 응답이 돌아왔고,
  //        파싱이 실패해 그 회차 게시가 통째로 버려졌다.
  //   대응: 이 호출은 500자 내외 본문 + 고정 JSON 한 덩어리를 받는 짧은 정형 출력이라
  //   추론 여유가 필요 없다. thinking을 명시적으로 끄고, 그래도 잘리지 않도록 상한을 올린다.
  //   (budget_tokens는 sonnet-5에서 제거돼 400을 낸다 — 쓰지 말 것)
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const rawText = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) {
    // 2026-08-04: 실제로 rawText가 빈 문자열인 실패가 관측됐다(skip_log claude_failed,
    // "포스팅 본문 파싱 실패: " — 콜론 뒤가 비어 있었다). 원문만 찍으면 빈 문자열이라
    // 아무 단서가 없으므로, 응답의 구조 자체를 남긴다(stop_reason·블록 타입·길이).
    // 다음 발생 시 "모델이 빈 응답을 줬는가 / 형식이 달라졌는가"를 바로 구분할 수 있다.
    const shape = {
      stop_reason: data.stop_reason ?? null,
      blockTypes: (data.content || []).map((b) => b.type),
      rawLen: rawText.length,
      usage: data.usage ? { in: data.usage.input_tokens, out: data.usage.output_tokens } : null,
    };
    throw new Error(`포스팅 본문 파싱 실패(응답구조 ${JSON.stringify(shape)}): ` + rawText.slice(0, 200));
  }
  const parsed = JSON.parse(match[0]);
  // 댓글 본문은 없어도 게시를 막지 않는다 — 본문만으로도 완결이라는 것이 개편의 전제이고,
  // 댓글이 빠지는 것은 "연재가 짧아진 것"이지 실패가 아니다(빈 값은 postCommentChain이 건너뛴다).
  return {
    text: finalizeBody(parsed.text, 'news'),
    format: parsed.format || null,
    commentContext: truncateAtSentenceBoundary(String(parsed.comment_context || '').trim(), COMMENT_BUDGET),
    commentDepth: truncateAtSentenceBoundary(String(parsed.comment_depth || '').trim(), COMMENT_BUDGET),
    commentOutlook: truncateAtSentenceBoundary(String(parsed.comment_outlook || '').trim(), COMMENT_BUDGET),
  };
}

// 본문 마감 — 링크가 본문에서 빠진 뒤로 조립이 단순해졌다(예산 계산이 필요 없다).
// 링크 누락 검사도 함께 사라졌다: 이제 링크는 본문의 계약이 아니라 댓글의 계약이고,
// 그 계약은 postLinkComment가 지킨다.
function finalizeBody(rawText, kind) {
  const rawBody = String(rawText || '').trim();
  if (!rawBody) throw new ComposeError(`${kind} 본문이 비어 있다`);
  const body = truncateAtSentenceBoundary(rawBody, BODY_BUDGET);
  if (body.length < rawBody.length) {
    // 프롬프트가 예산을 넘기고 있다는 신호 — BODY_TARGET_CHARS 재조정 판단에 쓴다.
    console.warn(`THREADS_BODY_TRUNCATED[${CHANNEL}](${kind}): ${rawBody.length}자 → ${body.length}자(예산 ${BODY_BUDGET})`);
  }
  if (body.length > THREADS_MAX_CHARS) throw new ComposeError(`${body.length}자로 상한 초과(${kind})`);
  return body;
}

// ── 에버그린(허브 문서) 포스팅 생성 ─────────────────────────────────────────
// PM 지시 2026-08-12 §2. 뉴스와 다른 프롬프트를 쓰는 이유는 독자의 상태가 다르기 때문이다.
// 뉴스 독자는 "무슨 일이 있었나"를 모르는 상태고, 가이드 독자는 이미 문제를 겪고 있다
// ("배터리가 하루를 못 간다"). 그래서 이 글은 사건 서술이 아니라 증상 → 원인 → 조치 순서다.
const EVERGREEN_FORMAT_ANGLE = {
  howto: '설정·사용법. 어디를 눌러 무엇을 바꾸면 되는지 순서대로 말한다.',
  troubleshoot: '문제 해결. 증상을 먼저 짚고, 가장 흔한 원인과 조치를 말한다.',
  compare: '비교. 무엇이 어떻게 다른지 기준을 세워 가른다.',
  buying: '구매 판단. 지금 사도 되는지, 무엇을 확인해야 하는지 말한다.',
};

async function generateEvergreenPost(doc, hubTitle) {
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  const source = blocks
    .map((b) => `[${b.heading || ''}] ${(b.content || '').slice(0, 400)}`)
    .join('\n')
    .slice(0, 4000);

  const prompt = `너는 뉴스저울의 에디터다. 아래 가이드 문서를 바탕으로 Threads에 올릴 완결된 글을 작성해라.

이 글을 읽는 사람은 이미 그 문제를 겪고 있는 사람이다. 뉴스가 아니라 해결책을 찾는 중이다.
그래서 "무엇이 출시됐다"가 아니라 "이렇게 하면 된다"가 글의 중심이어야 한다.

★ 길이(가장 중요): 공백 포함 ${BODY_TARGET_CHARS}자 이내. 절대 ${THREADS_MAX_CHARS}자를 넘기지 마라.
링크는 본문에 넣지 않는다(첫 댓글에 붙는다). "링크에서 확인하세요" 같은 문장은 쓰지 마라 —
이 글만 읽고도 실제로 조치를 취할 수 있어야 한다.

글 구조(문단 사이는 줄바꿈 두 번):
1. 첫 문장은 증상이나 상황을 독자의 말로 짚는다(예: "폴드8 배터리가 하루를 못 간다면").
2. 문서에 있는 실제 방법·수치·경로를 2~4문장으로 구체적으로 말한다. 단계가 있으면 순서대로.
3. 흔히 놓치는 조건이나 주의점을 1문장 덧붙인다.

금지: 문서에 없는 사실을 지어내는 것, 과장, "충격"·"필수"·"이것만 알면" 류 상투어,
정보를 숨기고 클릭만 유도하는 표현.

허브: ${hubTitle || doc.hub_slug}
문서 유형: ${EVERGREEN_FORMAT_ANGLE[doc.format] || EVERGREEN_FORMAT_ANGLE.howto}
문서 제목: ${doc.title}
리드: ${doc.lead || ''}
문서 본문:
${source || '(본문 없음 — 제목과 리드만으로 쓰되, 확실하지 않은 수치는 쓰지 마라)'}

설명 없이 아래 JSON만 반환해라(코드블록 없이):
{
  "text": "Threads에 올릴 본문(위 1~3번 구조, ${BODY_TARGET_CHARS}자 이내, 링크 제외)"
}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 2000,
      thinking: { type: 'disabled' }, // 뉴스 경로와 동일한 이유(2026-08-06 사고 주석 참고)
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Claude API 에러: ' + await res.text());
  const data = await res.json();
  const rawText = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) {
    const shape = {
      stop_reason: data.stop_reason ?? null,
      blockTypes: (data.content || []).map((b) => b.type),
      rawLen: rawText.length,
    };
    throw new Error(`에버그린 본문 파싱 실패(응답구조 ${JSON.stringify(shape)}): ` + rawText.slice(0, 200));
  }
  return { text: finalizeBody(JSON.parse(match[0]).text, 'evergreen') };
}

// ── Threads API ─────────────────────────────────────────────────────────────
// 2026-08-17: 이미지 첨부 지원 추가(PM 지시 "본문에 카드뉴스 이미지 1장 첨부").
// imageUrl을 주면 media_type=IMAGE + image_url로 올린다. Threads API도 인스타와 마찬가지로
// 바이너리 업로드를 받지 않고 **공개 URL**만 받으므로, app/card/route.tsx가 만드는
// https://newsjeoul.co.kr/card?... 를 그대로 넘긴다.
async function createContainer(text, replyToId, imageUrl) {
  const fields = imageUrl
    ? { media_type: 'IMAGE', image_url: imageUrl, text, access_token: await getAccessToken() }
    : { media_type: 'TEXT', text, access_token: await getAccessToken() };
  // reply_to_id를 주면 같은 엔드포인트가 "답글 컨테이너"를 만든다(Threads API Create Replies).
  // 링크를 첫 댓글로 내리는 개편과, 이번 4단 댓글 연재가 이 파라미터 하나에 의존한다.
  if (replyToId) fields.reply_to_id = replyToId;
  const params = new URLSearchParams(fields);
  const res = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('createContainer 실패: ' + JSON.stringify(data));
  return data.id;
}

// CTA를 본문 뒤에 붙이되 Threads 하드리밋(500자)을 넘지 않게 한다.
// 넘칠 것 같으면 저장 유도(🔖)를 먼저 버리고 질문만 남긴다 — 질문이 참여에 직접 기여하는 쪽이라
// 둘 중 하나를 포기해야 하면 질문을 지킨다. 그래도 안 들어가면 CTA 없이 원문만 내보낸다.
function appendCta(baseText, ctaText) {
  const base = String(baseText || '').trim();
  const cta = String(ctaText || '').trim();
  if (!cta) return base;

  const full = `${base}\n\n${cta}`;
  if (full.length <= THREADS_MAX_CHARS) return full;

  const questionOnly = cta.split('\n')[0];
  const shorter = `${base}\n\n${questionOnly}`;
  if (shorter.length <= THREADS_MAX_CHARS) return shorter;

  console.warn(`THREADS_CTA_DROPPED[${CHANNEL}]: 링크 댓글이 ${base.length}자라 CTA를 넣을 자리가 없음`);
  return base;
}

// 카드뉴스 표지 이미지 URL — 인스타와 같은 /card 라우트를 공유한다(디자인이 두 채널에서 어긋나지 않는다).
const CATEGORY_BADGE_THREADS = {
  Society: '정치·사회', Economy: '경제', Business: '기업', Technology: '테크·AI',
  Sports: '스포츠', Entertainment: '연예', Health: '건강', Science: '과학',
  Automobile: '자동차', Lifestyle: '라이프', Crypto: '크립토',
};

function buildCardImageUrl(topic) {
  // 인스타와 완전히 같은 훅을 쓴다 — 두 채널에서 같은 이슈가 다른 얼굴로 나가면
  // 브랜드가 흩어지고, 어느 쪽 훅이 먹혔는지 비교도 안 된다.
  const hook = buildCoverHook(topic);
  const qs = new URLSearchParams({
    slide: 'cover',
    title: topic.name || '뉴스저울',
    category: topic.category || '',
    badge: CATEGORY_BADGE_THREADS[topic.category] || '오늘의 이슈',
    hook: hook.hook,
    sub: hook.sub,
    emoji: hook.emoji,
    stat: hook.stat,
    i: '1', n: '1',
  }).toString();
  return `https://newsjeoul.co.kr/card?${qs}`;
}

// ── 4단 댓글 연재 (2026-08-17 PM 지시) ──────────────────────────────────────
//   댓글1 배경/맥락 상세 · 댓글2 찬반/이면 심층 · 댓글3 허브 링크(있을 때만) · 댓글4 사이트 링크
// 각 댓글은 바로 앞 댓글에 답글로 달아 "연재"가 되게 한다(전부 본문에 달면 순서가 보장되지 않고
// 읽는 흐름이 끊긴다). 중간 하나가 실패해도 다음 댓글은 마지막으로 성공한 노드에 이어 붙인다 —
// 연재가 통째로 날아가는 것보다 한 칸 비는 편이 낫다.
async function postCommentChain(topicOrNull, rootPostId, comments) {
  let parentId = rootPostId;
  const results = [];
  for (const c of comments) {
    if (!c || !c.text || !c.text.trim()) continue;
    try {
      const containerId = await createContainer(c.text, parentId);
      await new Promise((r) => setTimeout(r, 3000));
      const postId = await publishPost(containerId);
      results.push({ label: c.label, ok: true, postId });
      parentId = postId; // 다음 댓글은 이 댓글에 이어 붙인다
      console.log(`DISTRIBUTION_COMMENT_OK[${CHANNEL}](${c.label}): ${postId}`);
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.error(`DISTRIBUTION_COMMENT_FAILED[${CHANNEL}](${c.label}):`, e.message);
      await logHardFailure(topicOrNull, 'comment_failed', e.message, { parentPostId: parentId, label: c.label });
      results.push({ label: c.label, ok: false, postId: null });
    }
  }
  return results;
}

// 링크 댓글(PM 지시 2026-08-12 §3) — 본문이 이미 게시된 뒤에 붙는다.
// 실패해도 본문 게시는 되돌리지 않는다: 본문은 링크 없이 읽어도 완결이라는 것이 이번 개편의
// 전제이므로, 댓글 실패는 "게시 실패"가 아니라 "유입 경로 누락"이다. 그래서 예외를 삼키고
// 결과만 돌려준 뒤 skip_log에 남긴다.
async function postLinkComment(parentPostId, text) {
  const containerId = await createContainer(text, parentPostId);
  await new Promise((r) => setTimeout(r, 3000));
  return publishPost(containerId);
}

async function publishPost(containerId) {
  const params = new URLSearchParams({ creation_id: containerId, access_token: await getAccessToken() });
  const res = await fetch(`https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`, { method: 'POST', body: params });
  const data = await res.json();
  if (!res.ok || !data.id) throw new Error('publishPost 실패: ' + JSON.stringify(data));
  return data.id;
}

// 후보 선정 → Claude 문구 생성 → 게시 → dedup 기록 → 상세 로그, 1건 전체 흐름.
// 이 함수 자체는 실패해도 throw하지 않는다 — 결과를 {ok, reason, ...} 객체로 반환해 호출자(핸들러
// 루프)가 다음 시도를 계속할지 멈출지 판단하게 한다(품질 미달/후보 없음이면 억지로 채우지 않고 중단).
async function attemptOnePost(excludeIds = new Set(), excludeDocKeys = new Set()) {
  const selected = await selectItem(excludeIds, excludeDocKeys);
  if (!selected.type) {
    console.log(`DISTRIBUTION_SKIP[${CHANNEL}](${selected.reason}):`, JSON.stringify(selected.detail));
    return { ok: false, skipped: true, reason: selected.reason, detail: selected.detail };
  }
  return selected.type === 'evergreen' ? attemptEvergreenPost(selected) : attemptNewsPost(selected);
}

// ── 뉴스(Topic) 1건 ─────────────────────────────────────────────────────────
async function attemptNewsPost({ topic, hubMatch, detail }) {
  console.log(`DISTRIBUTION_CANDIDATE_SELECTED[${CHANNEL}](news):`, topic.name, JSON.stringify(detail));

  const plan = topic.ai_context?.plan;
  const editors = (plan?.editors_assigned || []).map((e) => e.name);
  const url = buildTopicUrl(topic);

  // 2. Claude 문구 생성(여기부터 비용 발생) — 본문 + 댓글1(배경) + 댓글2(심층)를 호출 1회로 받는다.
  //    나눠 호출하면 비용이 3배가 되고, 무엇보다 세 칸이 서로 겹치는 말을 하게 된다.
  let text, commentContext, commentDepth, commentOutlook, postFormat;
  try {
    ({ text, commentContext, commentDepth, commentOutlook, format: postFormat } = await generateDeepPost(topic));
  } catch (genErr) {
    // 조립 실패(우리 버그)와 Claude API 실패(외부 요인)를 구분한다 — 사유가 섞이면
    // "posts_succeeded=0"의 원인을 엉뚱한 곳에서 찾게 된다.
    const reason = genErr instanceof ComposeError ? 'compose_failed' : 'claude_failed';
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](${reason}):`, genErr.message);
    await logHardFailure(topic, reason, genErr.message);
    // topicId를 함께 돌려준다 — 호출자(핸들러 루프)가 이 후보를 제외하고 다른 후보로
    // 재시도할 수 있어야 한다. 없으면 같은 후보를 다시 골라 같은 실패를 반복한다.
    return { ok: false, reason, error: genErr.message, topicId: topic.id };
  }
  console.log('포스팅 내용:\n', text);

  // 레이스 컨디션 방어 — Claude 호출 사이 다른 실행이 먼저 게시했을 가능성 재확인
  if (!(await isStillUnposted(topic.id))) {
    console.log(`DISTRIBUTION_SKIP[${CHANNEL}](duplicate_topic): 다른 실행이 먼저 게시함`);
    await logSkippedCandidates([{ channel: CHANNEL, topic_id: topic.id, topic_name: topic.name, category: topic.category, reason: 'duplicate', detail: {} }]);
    return { ok: false, skipped: true, reason: 'duplicate_topic', topicId: topic.id };
  }

  // 3. Threads 게시 — 2026-08-17부터 카드뉴스 표지 이미지 1장을 함께 올린다(PM 지시).
  //    이미지 URL이 죽어 있으면 Threads가 컨테이너 생성을 거부하므로, 이미지 때문에 게시가
  //    통째로 실패하는 일은 막는다: IMAGE로 실패하면 TEXT로 한 번 더 시도한다.
  let postId;
  const cardImageUrl = buildCardImageUrl(topic);
  try {
    let containerId;
    try {
      containerId = await createContainer(text, undefined, cardImageUrl);
    } catch (imgErr) {
      console.warn(`THREADS_IMAGE_FALLBACK[${CHANNEL}](텍스트 전용으로 재시도):`, imgErr.message);
      containerId = await createContainer(text);
    }
    await new Promise((r) => setTimeout(r, 3000));
    postId = await publishPost(containerId);
  } catch (postErr) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](threads_api_failed, Claude 비용은 이미 발생):`, postErr.message);
    await logHardFailure(topic, 'threads_api_failed', postErr.message);
    return { ok: false, reason: 'threads_api_failed', error: postErr.message, topicId: topic.id };
  }

  // 4. 댓글 4단 연재(PM 지시 2026-08-17) — 본문에는 링크가 없다.
  //    1) 배경/맥락  2) 찬반·이면 심층  3) 허브 링크(있을 때만)  4) 뉴스저울 링크
  //    링크를 마지막에 두는 이유: 연재를 다 읽은 사람이 가장 클릭 의사가 높고, 링크가 중간에
  //    끼면 거기서 이탈해 뒤 내용이 읽히지 않는다.
  const activeTopicCount = await fetchActiveTopicCount();
  // 2026-08-17 PM 지시로 내용 댓글을 3개로 늘렸다.
  // 근거: 4단 중 뒤 2칸이 링크뿐이라, 사람들이 "댓글 = 링크"로 학습해 아예 안 누르게 된다.
  // 링크 댓글 앞에 읽을거리를 한 칸 더 두면 연재를 끝까지 내려올 이유가 생긴다.
  const commentPlan = [
    { label: 'context', text: commentContext },
    { label: 'depth', text: commentDepth },
    { label: 'outlook', text: commentOutlook },
    hubMatch ? {
      label: 'hub',
      text: strategy.buildCommentText({
        primaryLabel: `${hubMatch.hub.title} 한눈에 보기`,
        primaryUrl: buildHubUrl(hubMatch.hub.slug),
      }),
    } : null,
    {
      label: 'site',
      // 참여 유도(2026-08-17 PM 지시)는 연재의 맨 끝, 링크와 같은 칸에 붙인다.
      // 별도 댓글로 하나 더 만들지 않는 이유: 댓글이 5개까지 늘어나면 연재가 늘어져 보이고
      // API 호출도 한 번 더 든다. 끝까지 읽은 사람이 보는 위치라는 목적은 그대로 달성된다.
      text: appendCta(
        strategy.buildCommentText({
          primaryLabel: `전문 보기(오늘 다루는 이슈 ${activeTopicCount}개)`,
          primaryUrl: url,
        }),
        buildCta(topic, { format: postFormat }).text
      ),
    },
  ].filter(Boolean);

  const chainResults = await postCommentChain(topic, postId, commentPlan);
  const siteComment = chainResults.find((r) => r.label === 'site');
  const commentResult = { ok: Boolean(siteComment && siteComment.ok), postId: siteComment ? siteComment.postId : null };

  // 5. 핵심 dedup 기록(실패해도 게시 자체는 이미 성공 — Post ID를 결과에 보존)
  try {
    await markTopicPosted(topic, postId, detail);
  } catch (dedupErr) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](dedup_save_failed, 게시는 이미 성공, Post ID 보존):`, postId, dedupErr.message);
    await logHardFailure(topic, 'dedup_save_failed', dedupErr.message, { postId });
    return { ok: false, reason: 'dedup_save_failed', error: dedupErr.message, postId, topicId: topic.id };
  }

  // 6. 상세 로그(best-effort). hook_type이 유형 집계의 정본이다(fetchTodayEvergreenCount 참고).
  const logResult = await savePostLog({
    topic_id: topic.id, post_id: postId, editors, status: 'success', source_url: url,
    hook_type: hubMatch ? 'news_hub' : 'news',
    distribution_score: detail.distributionScore, editorial_score: detail.components?.editorialScore,
  });

  console.log(`DISTRIBUTION_SUCCESS[${CHANNEL}](news):`, postId, '| topic:', topic.slug, '| url:', url,
    hubMatch ? `| hub: ${hubMatch.hub.slug}(${hubMatch.relevance})` : '');
  return {
    ok: true, reason: 'success', type: hubMatch ? 'news_hub' : 'news', postId, topicId: topic.id,
    slug: topic.slug, editors, title: topic.name, url, text,
    commentPostId: commentResult.postId, commentOk: commentResult.ok,
    commentChain: chainResults, cardImageUrl,
    hub: hubMatch ? { slug: hubMatch.hub.slug, relevance: hubMatch.relevance } : null,
    detailLogSaved: logResult.ok, scoreDetail: detail,
  };
}

// 링크 댓글 부착 — 실패는 게시 실패가 아니다(본문은 완결형이라는 것이 이번 개편의 전제).
// 다만 유입 경로가 통째로 사라지는 일이므로 조용히 넘기지 않고 skip_log에 남긴다.
async function attachLinkComment(topicOrNull, parentPostId, commentText) {
  try {
    const commentId = await postLinkComment(parentPostId, commentText);
    console.log(`DISTRIBUTION_COMMENT_OK[${CHANNEL}]: parent=${parentPostId} comment=${commentId}`);
    return { ok: true, postId: commentId };
  } catch (e) {
    console.error(`DISTRIBUTION_COMMENT_FAILED[${CHANNEL}](본문은 게시됨, 링크만 누락):`, parentPostId, e.message);
    await logHardFailure(topicOrNull, 'comment_failed', e.message, { parentPostId });
    return { ok: false, postId: null };
  }
}

// ── 에버그린(허브 문서) 1건 ─────────────────────────────────────────────────
// 뉴스와 다른 점 세 가지: (1) 후보가 topics가 아니라 hub_documents다, (2) dedup 정본이
// ai_context가 아니라 threads_posts.source_url이다, (3) 그래서 상세 로그 저장 실패가
// best-effort가 아니라 하드 실패다 — 기록이 없으면 같은 문서를 다시 올리게 된다.
async function attemptEvergreenPost({ doc, hub, detail }) {
  const docKey = `${doc.hub_slug}/${doc.slug}`;
  console.log(`DISTRIBUTION_CANDIDATE_SELECTED[${CHANNEL}](evergreen):`, docKey, JSON.stringify(detail));

  const docUrl = buildHubDocUrl(doc.hub_slug, doc.slug);
  let text;
  try {
    const full = await fetchHubDocumentBody(doc.hub_slug, doc.slug);
    ({ text } = await generateEvergreenPost(full, hub?.title));
  } catch (genErr) {
    const reason = genErr instanceof ComposeError ? 'compose_failed' : 'claude_failed';
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](evergreen ${reason}):`, genErr.message);
    await logSkippedCandidates([{
      channel: CHANNEL, topic_id: null, topic_name: doc.title, category: doc.format,
      reason, detail: { error: String(genErr.message || '').slice(0, 500), docKey },
    }]);
    return { ok: false, reason, error: genErr.message, docKey };
  }
  console.log('포스팅 내용(evergreen):\n', text);

  let postId;
  try {
    const containerId = await createContainer(text);
    await new Promise((r) => setTimeout(r, 3000));
    postId = await publishPost(containerId);
  } catch (postErr) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](evergreen threads_api_failed, Claude 비용은 이미 발생):`, postErr.message);
    await logSkippedCandidates([{
      channel: CHANNEL, topic_id: null, topic_name: doc.title, category: doc.format,
      reason: 'threads_api_failed', detail: { error: String(postErr.message || '').slice(0, 500), docKey },
    }]);
    return { ok: false, reason: 'threads_api_failed', error: postErr.message, docKey };
  }

  const comment = strategy.buildCommentText({
    primaryLabel: '전체 가이드 보기',
    primaryUrl: docUrl,
    secondaryLabel: hub?.title ? `${hub.title} 전체 정리` : '허브 전체 정리',
    secondaryUrl: buildHubUrl(doc.hub_slug),
  });
  const commentResult = await attachLinkComment(null, postId, comment);

  // dedup 정본 기록 — 여기가 실패하면 중복 게시로 이어지므로 하드 실패로 취급한다.
  const logResult = await savePostLog({
    topic_id: null, post_id: postId, editors: [], status: 'success', source_url: docUrl,
    hook_type: 'evergreen', distribution_score: detail.evergreenScore ?? null,
  });
  if (!logResult.ok) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](evergreen dedup_save_failed, 게시는 이미 성공):`, postId);
    await logSkippedCandidates([{
      channel: CHANNEL, topic_id: null, topic_name: doc.title, category: doc.format,
      reason: 'dedup_save_failed', detail: { postId, docKey },
    }]);
    return { ok: false, reason: 'dedup_save_failed', postId, docKey };
  }

  console.log(`DISTRIBUTION_SUCCESS[${CHANNEL}](evergreen):`, postId, '| doc:', docKey, '| url:', docUrl);
  return {
    ok: true, reason: 'success', type: 'evergreen', postId, docKey, url: docUrl, text,
    title: doc.title, format: doc.format, hubSlug: doc.hub_slug,
    commentPostId: commentResult.postId, commentOk: commentResult.ok, scoreDetail: detail,
  };
}

// ── Handler ──────────────────────────────────────────────────────
// Background Function(최대 15분 예산) — 파일명이 -background로 끝나면 Netlify가 호출자에게
// 즉시 202를 반환하고 이 핸들러는 백그라운드에서 계속 실행된다(호출자는 반환값을 받지 못한다 —
// 결과는 이 함수의 console.log와 DB 상태로만 확인 가능하다). 1회 실행(hourly)당 최대 3건까지
// 게시 사이 2~5분 간격을 두는 요구사항은 26초 하드캡이 있는 동기 함수로는 구현할 수 없어
// Background Function으로 전환했다(PM 지시 2026-07-22).
exports.handler = async function (event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  // 정지 스위치 — 후보 조회·Claude 호출·게시 어느 것도 하지 않고 즉시 끝낸다.
  // 실패가 아니라 의도된 정지이므로 200으로 답한다(헬스체크가 장애로 오인하지 않게).
  if (DISTRIBUTION_PAUSED) {
    console.log(`DISTRIBUTION_PAUSED[${CHANNEL}]: 정지 상태 — 이번 호출은 아무것도 하지 않는다(재개는 post-threads-background.js의 DISTRIBUTION_PAUSED 기본값을 false로)`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, paused: true, reason: 'distribution_paused' }) };
  }

  if (event.httpMethod && event.headers?.['x-nf-event'] !== 'schedule') {
    const key = event.headers?.['x-admin-key'] || event.queryStringParameters?.key;
    if (key !== process.env.ADMIN_KEY) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  const isDry = event.queryStringParameters?.dry === 'true';

  // 자격증명 확인 — Claude 호출보다 반드시 먼저(비용 보호)
  if (!isDry && (!THREADS_USER_ID || !(await getAccessToken()))) {
    console.error(`DISTRIBUTION_SKIP[${CHANNEL}](credential_missing)`);
    return { statusCode: 500, headers, body: JSON.stringify({ reason: 'credential_missing', error: 'THREADS_USER_ID 없음, 또는 threads_credentials·THREADS_ACCESS_TOKEN 어느 쪽에도 토큰 없음' }) };
  }

  if (isDry) {
    // dry 모드는 미리보기 1건만 — 실제 게시/루프 없음. 유형 선택까지 그대로 태워서
    // "지금 이 시각에 무엇이 나갈 것인가"를 실제 경로와 같은 판단으로 보여준다.
    const selected = await selectItem();
    if (!selected.type) {
      return { statusCode: 200, headers, body: JSON.stringify({ dry: true, skipped: true, reason: selected.reason, detail: selected.detail }) };
    }
    if (selected.type === 'evergreen') {
      const full = await fetchHubDocumentBody(selected.doc.hub_slug, selected.doc.slug);
      const { text } = await generateEvergreenPost(full, selected.hub?.title);
      const url = buildHubDocUrl(selected.doc.hub_slug, selected.doc.slug);
      const comment = strategy.buildCommentText({
        primaryLabel: '전체 가이드 보기', primaryUrl: url,
        secondaryLabel: selected.hub?.title ? `${selected.hub.title} 전체 정리` : '허브 전체 정리',
        secondaryUrl: buildHubUrl(selected.doc.hub_slug),
      });
      return { statusCode: 200, headers, body: JSON.stringify({ dry: true, reason: 'success', type: 'evergreen', title: selected.doc.title, url, text, comment, scoreDetail: selected.detail }) };
    }
    const { topic, hubMatch, detail } = selected;
    const url = buildTopicUrl(topic);
    const { text } = await generateDeepPost(topic);
    const activeTopicCount = await fetchActiveTopicCount();
    const comment = strategy.buildCommentText({
      primaryLabel: `전문 보기(오늘 다루는 이슈 ${activeTopicCount}개)`, primaryUrl: url,
      secondaryLabel: hubMatch ? `${hubMatch.hub.title} 한눈에 보기` : undefined,
      secondaryUrl: hubMatch ? buildHubUrl(hubMatch.hub.slug) : undefined,
    });
    return { statusCode: 200, headers, body: JSON.stringify({ dry: true, reason: 'success', type: hubMatch ? 'news_hub' : 'news', topicId: topic.id, title: topic.name, url, text, comment, scoreDetail: detail }) };
  }

  try {
    // 이번 실행에서 몇 건을 시도할지 미리 계산(운영 로그 가시성 + 루프 조건에 사용)
    const runStartedAt = Date.now();
    const [articleCount, postedStatsNow, cadence] = await Promise.all([
      fetchTodayArticleCount(), fetchTodayPostedStats(), fetchRunsPerHour(),
    ]);
    const dailyTarget = computeDailyTarget(articleCount);
    const postsThisRun = computePostsThisRun(dailyTarget, postedStatsNow.total, new Date(), cadence.runsPerHour);
    console.log(
      `DISTRIBUTION_RUN_PLAN[${CHANNEL}]: articles=${articleCount} dailyTarget=${dailyTarget}` +
      ` postedToday=${postedStatsNow.total} postsThisRun=${postsThisRun}` +
      ` | 주기 ${cadence.runsPerHour.toFixed(2)}회/시 ${cadence.source} 표본${cadence.samples}`
    );

    const results = [];
    const failedTopicIds = new Set(); // 이번 실행에서 실패한 후보 — 같은 후보를 다시 고르지 않게 제외
    // 이번 실행에서 이미 게시했거나 실패한 허브 문서. threads_posts 조회는 실행 시작 시점의
    // 스냅샷이라, 같은 실행 안에서 연달아 고르면 같은 문서를 두 번 올린다.
    const usedDocKeys = new Set();
    let candidateRetries = 0;

    for (let i = 0; i < postsThisRun; i++) {
      const result = await attemptOnePost(failedTopicIds, usedDocKeys);
      if (result.docKey) usedDocKeys.add(result.docKey);
      results.push(result);

      if (!result.ok) {
        // 2026-08-04: 예전엔 어떤 실패든 무조건 break였다. 그래서 Claude가 빈 응답을 한 번
        // 주면(실측: 07:12 실행, claude_failed "본문 파싱 실패" — 응답 텍스트가 빈 문자열)
        // 후보가 165건이나 남아 있는데도 그 실행이 0건으로 끝났다.
        //
        // 사유를 두 부류로 나눈다:
        //  · 중단해야 하는 것 — 다시 시도해도 결과가 같다(후보 없음/품질 미달/배급 문턱 미달),
        //    또는 계정·API 차원의 문제라 다음 후보로도 실패한다(threads_api_failed,
        //    dedup_save_failed는 이미 게시된 뒤의 저장 실패라 계속 진행하면 상태가 더 꼬인다).
        //  · 다음 후보로 넘어가야 하는 것 — 그 후보에 국한된 문제(claude_failed/compose_failed/
        //    duplicate_topic). 실패한 후보를 제외하고 다른 후보로 재시도한다.
        const perCandidate = ['claude_failed', 'compose_failed', 'duplicate_topic'].includes(result.reason);
        // 재시도도 Claude 호출과 시간을 쓴다. 게시 사이 대기(gap)와 달리 이 경로는 곧바로 다시
        // 시도하므로, 예산 검사를 여기에도 둬야 실행이 15분 한도에 걸려 강제 종료되지 않는다.
        const elapsedNow = Date.now() - runStartedAt;
        const budgetLeft = elapsedNow + PER_POST_ESTIMATE_MS <= RUN_BUDGET_MS;
        if (perCandidate && candidateRetries < MAX_CANDIDATE_RETRIES && budgetLeft) {
          candidateRetries++;
          if (result.topicId) failedTopicIds.add(result.topicId);
          console.log(
            `DISTRIBUTION_RETRY[${CHANNEL}]: ${result.reason} — 이 후보를 제외하고 다른 후보로 재시도` +
            ` (${candidateRetries}/${MAX_CANDIDATE_RETRIES}, 제외 ${failedTopicIds.size}건)`
          );
          i--; // 이번 시도는 게시 건수로 세지 않는다(재시도이므로 목표 건수를 소모하지 않음)
          continue;
        }
        console.log(`DISTRIBUTION_RUN_STOP[${CHANNEL}]: ${i + 1}번째 시도에서 중단(사유: ${result.reason})`);
        break; // 후보 없음/품질 미달/시스템 문제 — 억지로 채우지 않고 이번 실행 종료
      }
      if (i < postsThisRun - 1) {
        const gapMs = Math.round(MIN_GAP_MS + Math.random() * (MAX_GAP_MS - MIN_GAP_MS));
        // 시간 예산 가드 — 대기 + 다음 게시까지 갔을 때 예산을 넘길 것 같으면 지금 멈춘다.
        // 넘긴 채로 진행하면 Netlify가 15분에서 실행을 끊어, 컨테이너는 만들었지만 publish를
        // 못 한 상태로 죽을 수 있다(그러면 Claude 비용은 쓰고 게시는 안 된다).
        const elapsed = Date.now() - runStartedAt;
        if (elapsed + gapMs + PER_POST_ESTIMATE_MS > RUN_BUDGET_MS) {
          console.log(
            `DISTRIBUTION_RUN_BUDGET_STOP[${CHANNEL}]: ${i + 1}건 게시 후 중단` +
            `(경과 ${Math.round(elapsed / 1000)}초 + 대기 ${Math.round(gapMs / 1000)}초가 예산 ${RUN_BUDGET_MS / 60000}분 초과)`
          );
          break;
        }
        console.log(`DISTRIBUTION_GAP[${CHANNEL}]: 다음 게시까지 ${Math.round(gapMs / 1000)}초 대기`);
        await new Promise((r) => setTimeout(r, gapMs));
      }
    }

    const successCount = results.filter((r) => r.ok).length;
    const evergreenCount = results.filter((r) => r.ok && r.type === 'evergreen').length;
    const hubLinkedCount = results.filter((r) => r.ok && r.type === 'news_hub').length;
    const commentFailures = results.filter((r) => r.ok && r.commentOk === false).length;
    const todaySuccessCount = postedStatsNow.total + successCount;
    console.log(
      `DISTRIBUTION_RUN_DONE[${CHANNEL}]: 이번 실행 성공 ${successCount}/${results.length}건` +
      `(에버그린 ${evergreenCount} · 허브연결 ${hubLinkedCount} · 링크댓글 실패 ${commentFailures})` +
      `, 오늘 뉴스 누적 ${todaySuccessCount}건(목표 ${dailyTarget})`
    );

    // 시간대별 목표/실적 기록(best-effort) — 하루가 끝난 뒤 Distribution Engine이 제대로
    // 동작했는지 시간대별로 재구성할 수 있게 한다(PM 지시 2026-07-22 §5).
    try {
      const logRes = await fetch(`${SUPABASE_URL}/rest/v1/distribution_run_log`, {
        method: 'POST',
        headers: { ...REQUEST_HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          channel: CHANNEL, today_article_count: articleCount, daily_target: dailyTarget,
          posted_before_run: postedStatsNow.total, posts_attempted: results.length,
          posts_succeeded: successCount, posted_after_run: todaySuccessCount,
        }),
      });
      if (!logRes.ok) console.error(`DISTRIBUTION_RUN_LOG_FAILED[${CHANNEL}](참고용 로그만 누락):`, describeLogFailure(await logRes.text()));
    } catch (e) {
      console.error(`DISTRIBUTION_RUN_LOG_FAILED[${CHANNEL}](참고용 로그만 누락):`, e.message);
    }

    // ── 인스타그램 동시 실행 (2026-08-17 PM 지시 "스레드와 동시 실행") ────────
    // 별도 cron을 새로 만들지 않고 이 실행에 물린다. 이유: 실제 트리거가 Supabase pg_cron
    // (nj-post-threads)이라 새 스케줄을 추가하려면 SQL 실행(승인 대상)이 필요한데, 여기서
    // 호출하면 지금 있는 트리거 하나로 두 채널이 같이 돈다.
    // 실패해도 스레드 결과에는 영향이 없다 — 인스타는 부가 채널이고, 자격증명이 아직 없으면
    // 함수가 스스로 skipped를 돌려준다.
    let instagram = null;
    try {
      const ig = require('./instagram-publish');
      const igRes = await ig.handler({ headers: {} });
      instagram = JSON.parse(igRes.body);
      console.log(`INSTAGRAM_RUN[${CHANNEL}]:`, JSON.stringify(instagram).slice(0, 300));
    } catch (e) {
      console.error('INSTAGRAM_RUN_FAILED(스레드 결과에는 영향 없음):', e.message);
      instagram = { ok: false, error: e.message };
    }

    return {
      statusCode: 200, headers,
      body: JSON.stringify({ ok: true, dailyTarget, postsAttemptedThisRun: results.length, postsSucceededThisRun: successCount, evergreenThisRun: evergreenCount, hubLinkedThisRun: hubLinkedCount, todaySuccessCount, instagram, results }),
    };
  } catch (e) {
    console.error(`DISTRIBUTION_RUN_ERROR[${CHANNEL}]:`, e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ reason: 'unexpected_error', error: e.message }) };
  }
};

// 테스트 전용 — 순수 함수 몇 개를 직접 단위 테스트하기 위해 노출한다(mock fetch/실제 대기 없이
// 공식만 검증). 프로덕션 코드 경로에서는 쓰이지 않는다.
exports._testUtils = {
  computeDailyTarget, computePostsThisRun, computeAdaptiveMinDistributionScore,
  truncateAtSentenceBoundary, buildTopicUrl, THREADS_MAX_CHARS,
  MAX_POSTS_PER_RUN, CONFIGURED_RUNS_PER_HOUR, MIN_GAP_MS, MAX_GAP_MS,
  estimateRunsPerHourFromLog, RUN_BUDGET_MS, PER_POST_ESTIMATE_MS,
  MIN_RUNS_PER_HOUR, MAX_RUNS_PER_HOUR, MAX_CANDIDATE_RETRIES,
};
