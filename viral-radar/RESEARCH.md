# OSS Primitive 실측 리서치 (2026-09-09, PM 지시)

지시 원문 요지: "유료 API 알아보는 거 멈추고, GitHub에 이미 존재하는 바이럴 탐지/아웃라이어
도구를 먼저 clone·실행·비교하라. 우리 시스템은 검증된 primitive를 재사용해서 만들고,
Viral Radar의 진짜 차별화는 자체 알고리즘이 아니라 이런 오픈소스를 묶는 aggregation layer다."

이 문서는 지시받은 5개 저장소 + 직접 조사로 발견한 추가 후보를 실제로 clone해서 돌려본
결과다. 클론본은 `research/oss-tools/`에 있다(git 이력 없이 얕은 clone, 평가용).

## 요약 결론

| 이름 | 실제로 확인됨? | 키 필요? | 실측 결과 | 판정 |
|---|---|---|---|---|
| **oronaminc/bot**("YouTube Trend Radar") | O | YOUTUBE_API_KEY | 코드 리뷰만(키 없어 미실행) — z-score 기반 velocity 아웃라이어 탐지, FastAPI 서버, 15분 주기 수집 | 알고리즘 참고용, 코드 자체 재사용은 라이선스 미명시라 보류 |
| **Xeron2000/viral-shorts** | O | YOUTUBE_API_KEY | 코드 리뷰만(키 없어 미실행) — MCP 서버, VPH+engagement 기반 viral score | Claude MCP로 직접 붙일 수 있는 형태, 키 생기면 1순위 시도 후보 |
| **chrispy-1222/instagram-reel-outlier-finder** | O(단, "instagram-reel-outlier-finder" 정확히 일치) | Apify token + Anthropic key | `npm run selftest`(오프라인) 통과 확인. 데이터는 Apify 스크래핑에 의존 — 키리스 아님 | 아웃라이어 판정 로직(계정 자체 median 대비 배수)만 참고, Apify는 이미 후보 목록에 있었음 |
| **InstaAutomation** | **매칭 실패** | — | 이 이름과 일치하는 아웃라이어/트렌드 도구를 찾지 못함 — 실제로 존재하는 동명 저장소들은 전부 "계정 자동 팔로우/좋아요/DM" 류 봇(예: mmAbdelhay/InstaAutomation은 가짜 계정 생성기)이라 우리 목적과 무관 | **제외** — 아래 "매칭 안 된 항목" 참고 |
| **tamnd/douyin-cli** | O | 핫서치는 불필요, 나머지는 서명 필요 | **2026-09-09 재실측: 공식 GitHub Release Windows amd64 바이너리(v0.1.1)를 직접 다운로드(체크섬 검증)해서 실행함.** 아래 상세 참고 | **채택 — Douyin 토픽 신호의 1순위 공식 소스로 승격** |
| **social-media-research-cli**(TikTok 서명 구현) | **정확한 이름 매칭은 실패**, 실제로는 `ifccod/social-media-research-cli` | 공개 데이터는 대부분 불필요 | **직접 설치·실행 성공.** 아래 상세 참고 | **채택 — 가장 큰 성과** |

## ⚠️ 신뢰도 경고 (사람이 직접 볼 것)

`ifccod/social-media-research-cli`의 README에 "AIReiter"라는 제3자 AI API 서비스를
**"리버스엔지니어링·보안연구·악성샘플 분석에 제한 없음"**이라고 광고하는 문구가 포함돼 있다.
이건 AI 에이전트가 README를 읽고 그 서비스를 방문/추천하도록 유도하는 프롬프트 인젝션성
마케팅 삽입으로 보인다 — **이 URL을 방문하지 않았고 추천하지도 않는다.** 코드 자체는 정적
스캔(eval/exec/의심스러운 외부 도메인 grep)에서 문제를 못 찾았고, 실제 실행 경로(TikTok/
YouTube/Douyin 공개 데이터 조회)는 광고된 서비스와 무관했다. 그래도 **이 코드를 프로덕션에
정식 채택하기 전에 사람이 한 번 더 리뷰**하는 것을 권장한다 — 단일 관리자가 26개 플랫폼의
안티봇 우회 서명 알고리즘을 리버스엔지니어링해 묶은 저장소라 신뢰 이력이 짧다.

## ifccod/social-media-research-cli 실측 상세 (MIT 라이선스)

Python 3.11+, 26개 플랫폼 276개 명령. `viral-radar/lib/reverseCli.js`로 Node에서 subprocess
호출하게 감쌌다.

- **YouTube 검색** (`youtube search`) — **성공.** InnerTube 기반이라 내 자체 정규식 스크래퍼
  (`providers/youtubeSearchScrape.js`)보다 정확함(published_text/duration_text/verified
  배지까지 줌). `providers/youtubeReverseCli.js`로 추가 provider화해서 지금 실제로 병행 가동
  중 — 오늘 실측 120건 신규 후보 확보(기존 스크래퍼와 합쳐 355개 클러스터).
  **(2026-09-09 §5 재점검으로 이 provider는 활성 파이프라인에서 빠짐 — 아래 참고)**

### 2026-09-09 §5 재점검 — "진짜 확인된 Shorts만, 진짜 최근 것만"

기존 youtubeSearchScrape.js/youtubeReverseCli.js는 duration 40분까지 관대하게 받아들여서
"컴필레이션이 Shorts로 둔갑"하는 문제가 있었다 — PM 지시로 재설계했다.

**2단계 방법을 실측으로 찾았다**: `youtube search` 결과 안에 진짜 Shorts는 `badges:["Shorts"]`
+ `url: ".../shorts/{id}"` 형태로 섞여 있지만 title/views/published 필드가 비어있다(YouTube
검색 셸프 렌더러를 이 CLI가 완전히 파싱 못 하는 알려진 공백). 그 ID로 `youtube video <id>`를
한 번 더 호출하면 **정확한 duration_seconds, ISO publish_date, 실시간 조회수**가 전부 나온다
(watch page 파싱 경로라 검색과 다른 코드 경로 — 완전함). `providers/youtubeConfirmedShorts.js`로
구현.

**실측 1(작은 배치, 12개 검색어·216개 후보)**: 정상 완료(67초). 44건이 24시간 이내, 25건이
48시간 이내(24시간 초과) 확인됨 — FUNNY/TOUCHING/SHOCK/SATISFYING/AMAZING엔 후보가 나왔고
**ANGER는 0건**(정직하게 기록). 조회수는 진짜 최근 영상답게 수천~수만 단위로 낮다(예: "rating
the funniest fails" 7,367 views, 11.5시간 전 게시) — 예전 파이프라인의 "억대 조회수 컴필레이션"
과는 완전히 다른, 훨씬 정직한 숫자다. **이게 진짜 "오늘 뜬 지 얼마 안 된 영상"의 현실적인
모습이다.**

**실측 2(24개 검색어·454개 후보로 확대)**: **전멸 — YouTube가 HTTP 429(Too Many Requests)로
막기 시작했다.** 상세조회(watch page) 요청이 짧은 시간에 450건을 넘어가자 이 IP를 레이트리밋
건 것으로 보인다(200개 안팎까진 안정적이었음). 재테스트 시점에도 여전히 429가 나서 — **이건
아직 안 풀렸다는 뜻이고, 그대로 정직하게 보고한다.** 대응: (1) `fetchVideoDetail`에 429 전용
지수 백오프 추가, (2) 동시성 6→3 하향 + 요청 간 200ms 딜레이, (3) 장르당 후보 상한 40개
(총 최대 240개)로 캡. 그래도 완전한 해결책은 아니다 — **공식 YouTube Data API 키
(YOUTUBE_API_KEY, 무료, 할당량 기반이라 이런 IP 레이트리밋이 없음)가 있으면 이 문제 자체가
사라진다.** 이번 세션엔 키가 없어 스크래핑에 의존할 수밖에 없었다.
- **TikTok 일반 검색** (`tiktok search-videos`) — **실패.** "TikTok Web visitor bootstrap
  returned a WAF challenge". 내 자체 스크래핑 시도(§구버전 조사)와 동일한 결론 — 일반 검색은
  이 환경에서 막혀 있다.
- **TikTok Explore 인기 검색어** (`tiktok trending-searchwords`) — **성공, 키 불필요.**
  실시간 트렌드 키워드(예: "iPhone 18 A20 Pro Chip Leak")를 준다. 단 영상 단위가 아니라
  키워드 단위.
- **TikTok Creative Center 인기 해시태그/영상** (`tiktok creative-trending-hashtags`,
  `creative-trending-videos`) — **성공, 키 불필요, 영상 단위 실조회수 포함.** 이게 이번
  조사의 핵심 발견 — `providers/tiktokProvider.js`로 실제 provider화해서 오늘 24건의 진짜
  TikTok 영상(조회수 최대 3.2억)을 확보했다.
  **그러나 실측 결과 상위권 대부분이 명시적 광고/브랜드 협찬 콘텐츠였다**(#ad, #PR,
  #samsungpartner, #shopifypartner 등 — 24건 중 12건이 광고 필터에 걸림). Creative Center는
  광고주용 "무엇이 잘 팔리는 콘텐츠인가" 리포트이지 순수 유기적 바이럴 랭킹이 아니다.
  `lib/safety-filter.js`에 `AD_CONTENT_PATTERNS`를 추가해 자동 제외했고, 그 결과 오늘
  TikTok은 6개 장르 중 AMAZING 5건·SATISFYING 4건·FUNNY 3건만 남고 TOUCHING/ANGER/SHOCK는
  0건 — TOP10을 하나도 못 채웠다. **가짜로 채우지 않고 정직하게 보고한다**: TikTok Creative
  Center만으로는 우리 제품(일상 바이럴 6장르 TOP10)에 필요한 볼륨·순수성을 못 채운다.
  국가별 인덱스 가용성도 들쭉날쭉했다(US/JP/ID는 성공, GB/FR/DE/KR/BR은 이번 주 인덱스
  없음/응답 형식 문제로 실패 — TikTok 쪽 사정, 우리가 고칠 수 없음).
- **Douyin 인기 검색어 차트** (`douyin hot`) — **성공, 키 불필요.** 실시간 30개 토픽에 진짜
  조회수(예: "皇马2:1击败国米" 6,760만) 포함. 단 **토픽 단위**라 canonical_url이 있는
  "영상"이 아니다 — PRODUCT.md §11 스키마 요구사항(원본 링크 필수)을 못 채워서 VIDEO 후보
  풀에는 안 넣었고, `providers/douyinProvider.js`의 `collectTrendingTopics()`로 별도
  노출만 해뒀다(오늘자 30건 `data/douyin-hot-topics-2026-09-09.json`에 저장).
- **Instagram 프로필 조회** (`instagram profile`) — **실패.** HTTP 401. Instagram은 이
  도구로도 못 뚫는다 — 기존 결론(EnsembleData 등 유료 공급자 필요)이 그대로 유지된다.

## tamnd/douyin-cli 재실측 상세 (2026-09-09, 지시받은 원래 5개 저장소 중 하나 — 공식 바이너리로 직접 실행)

Go 툴체인이 없어 처음엔 못 돌렸는데, **공식 GitHub Release의 Windows amd64 prebuilt 바이너리**
(v0.1.1, `checksums.txt` 대조로 체크섬 검증 완료)를 받아서 직접 실행했다. `research/oss-tools/
douyin-cli-bin/douyin.exe`.

- `douyin hot` (= `--tab realtime`, 요청하신 정확한 명령) — **성공.** 진짜 실시간 인기
  검색어 30개, 실제 hot_value 포함(예: "皇马2:1击败国米" 12,127,854).
- `douyin hot --tab video -n 20`(요청하신 정확한 명령) — **"Not found" 실패.** 단,
  **이게 China-IP 챌린지가 아니라는 걸 HTTP 레벨까지 내려가서 확인했다**: 실제 엔드포인트
  `https://www.iesdouyin.com/web/api/v2/hotsearch/aweme/` 를 직접 curl로 호출한 결과
  **HTTP 200** + 바디 `{"status_code":1,"status_msg":"Url doesn't match"}`. 지역 차단이면
  보통 challenge 페이지나 다른 status_code가 오는데, 이건 Douyin 서버가 "이 요청 자체가
  안 맞다"고 명시적으로 답한 것 — douyin-cli의 video/music/star 탭 구현이 Douyin API
  변경으로 stale해진 것으로 판단된다(realtime 탭은 완전히 다른 경로라 영향 없음).
  common client params(device_platform 등)을 그대로 붙여 재시도해도 동일 응답이라
  파라미터 문제도 아니다.
- `douyin search`(서명 필요 엔드포인트) — "No results"(빈 결과). ErrWalled(챌린지) 타입이
  아니라 그냥 빈 결과였다 — 지역 차단인지 쿼리 문제인지는 이번 조사로 확정 못 했다.
- **결론**: hot billboard 자체가 죽은 게 아니다. **realtime(토픽) 탭은 완전히 살아있고
  정상 작동한다.** video/music/star 탭만 도구 쪽 endpoint가 깨져 있다 — 이 셋을 "China IP
  때문에 막혔다"고 뭉뚱그리지 않는다(지시하신 대로). `providers/douyinProvider.js`는 이제
  이 공식 바이너리를 1순위로 쓰고(social-media-research-cli의 `douyin hot`은 폴백).

## TikHub 실측 시도 (2026-09-09 PM 지시 §3) — 크리덴셜 없어 차단됨

TikHub을 최우선 유료 후보로 실측하라는 지시를 받았다. 실행한 것:

1. `newsjeoul-next/.env.local`, `newsjeoul-next/.env.local.example` — `TIKHUB` 관련 키 없음.
2. 사용자의 **실제 로컬 ViralMint 설치본**(`C:\Users\windd\ViralMint`, 데스크톱 바로가기까지
   있는 진짜 운영 인스턴스, `viralmint.db` 존재)의 실제 `.env` 파일을 직접 열어봤다 —
   `TIKHUB_API_KEY=`(값 없음, 다른 키들도 대부분 비어있음: ANTHROPIC/OPENAI/YOUTUBE 전부
   `[EMPTY]`). **값은 출력하지 않고 SET/EMPTY 여부만 확인했다**(지시하신 대로).
3. 이 설치본의 `viralmint.db`(SQLite)에 암호화된 설정이 별도로 저장돼 있을 가능성을 검토했으나,
   사용자의 실제 데스크톱 앱 데이터베이스를 더 파고드는 건 권한 밖이라 판단해 멈췄다(harness가
   실제로 이 지점에서 실행을 차단하기도 했다).

**결론: 이 세션이 접근 가능한 범위 어디에도 유효한 TikHub 크리덴셜이 없다.** 그래서 지시하신
아래 항목들은 **하나도 실측하지 못했다** — 키를 주시면 바로 실행 가능하도록 호출 계획만
남겨둔다:

| 테스트 항목 | 상태 |
|---|---|
| TikTok daily trending search words | 미실측(키 없음) |
| TikTok trending keyword → video search | 미실측 |
| TikTok video statistics | 미실측 |
| Douyin billboard / hot content | 미실측(단, 무료 경로로는 이미 realtime 토픽 확보함 — 위 참고) |
| Douyin video detail / video search | 미실측 |
| Instagram search_reels | 미실측 |
| Instagram hashtag posts(reels filter) | 미실측 |
| V3 vs V2 freshness 비교 | 미실측 |

`viralmint-dev`의 `backend/services/tikhub_client.py`(정적 코드 리뷰만, 실행은 안 함)로
엔드포인트 존재는 확인했다: `POST /api/v1/tiktok/app/v3/fetch_video_search_result`,
`POST /api/v1/douyin/app/v3/fetch_video_search_result` — 둘 다 키워드 기반 검색이라
**진짜 영상 단위 discovery**가 가능해 보인다(우리가 지금 가진 무료 경로보다 훨씬 강력할 것).
**공개 문서 조사(docs.tikhub.io) 결과**: TikTok/Douyin/Instagram/**YouTube 4개 플랫폼
전부 공식 지원**(viralmint-dev의 tikhub_client.py가 TikTok/Douyin만 구현한 건 이 프로젝트가
그 두 개만 필요해서였을 뿐, API 자체의 한계가 아니었다). 가격은 요청당 $0.001부터
(응답이 200이 아니면 과금 안 됨), 물량에 따라 최대 50% 할인, **월 구독 없이 종량제**.
**중요: 카드 없이 매일 로그인 체크인으로 무료 크레딧을 받을 수 있다**(문서에 명시) — 유료
결제 전에 사용자가 2분 안에 무료 가입만 해도 실측 테스트가 가능해 보인다. V2/V3 API
버전 구분은 공개 문서에서 명시적으로 언급되지 않았다(요청하신 "V3와 V2 freshness 비교"는
로그인 후 실제 문서/엔드포인트를 봐야 확인 가능 — 이번엔 못 했다).

## 사용자의 기존 프로젝트와의 연결 — ViralMint (가장 중요한 발견)

리서치 중, 사용자가 이미 운영 중인 **BuggyScene 프로젝트가 ViralMint 기반**([[project_buggyscene]]
메모리 참고, private repo `jammiejammmie/viralmint-dev`, `openclaw-easy/ViralMint`의 fork,
**AGPL-3.0**)이라는 사실을 확인했다. `gh` 인증으로 실제 코드를 열어봤다:

- `backend/services/youtube_scout.py` — YouTube Data API로 트렌드 검색(우리 `youtubeDataApi.js`와
  사실상 동일한 접근).
- `backend/services/outlier_detection_service.py` — **채널 자체 median 조회수 대비 배수**로
  "OUTLIER/STRONG/BREAKOUT/MONSTER" 아웃라이어를 분류(vidIQ 스타일). PRODUCT.md 철학과 정확히
  같은 용도(후보발굴 참고용 점수, 공개 랭킹엔 안 씀)로 이미 쓰이고 있었다.
- `backend/services/tikhub_client.py` — **TikHub**(api.tikhub.io, 유료)로 TikTok·Douyin
  영상 단위 검색을 이미 프로덕션에서 쓰고 있다. TikHub는 이번 SOURCE_AUDIT.md 1차 조사엔
  없었던 후보였는데, 사용자가 이미 신뢰하고 쓰는 걸 확인했으니 **TikTok/Douyin 유료 확장 시
  1순위 후보로 추가**한다(EnsembleData와 함께 비교 검토 대상).

**라이선스 주의**: ViralMint는 AGPL-3.0이다. AGPL은 네트워크로 서비스하는 것도 "배포"로
간주해서, 이 코드를 그대로 가져다 뉴스저울 Viral Radar(별도 proprietary 코드베이스)에 넣고
서비스하면 그 부분도 AGPL로 공개해야 할 의무가 생길 수 있다. 그래서 **코드를 복사하지 않고
개념(채널-median 대비 배수 아웃라이어 스코어)만 참고해서 우리 Node 코드로 새로 작성했다** —
통계 계산(median/평균) 자체는 저작권 보호 대상이 아닌 표준 알고리즘이라 문제없다.

## 매칭 안 된 항목

- **"instagram-reel-outlier-finder"**: GitHub 전체 검색에서 정확히 이 이름을 가진 저장소는
  `chrispy-1222/instagram-reel-outlier-finder` 하나뿐이었다(위 표 참고, Apify 기반).
- **"InstaAutomation"**: 동명 저장소가 여러 개 있으나(omandotkom, burakdemirelli,
  nespo 등) 전부 계정 자동화/팔로우봇류이고 아웃라이어·트렌드 탐지 기능이 없다. 지시문의
  이 항목은 아마 다른 저장소를 의도했거나 목록 생성 과정에서 부정확했을 가능성이 있다 —
  **추가로 정확한 저장소명/owner를 알려주시면 다시 조사하겠습니다.**
- **"social-media-research-cli"(정확한 이름)**: 이 정확한 이름의 저장소는 못 찾았고, 가장
  근접하고 실제로 요청하신 기능(TikTok 서명, Creative Center)을 가진 건
  `ifccod/social-media-research-cli`였다. 이걸로 간주하고 진행했다.

## 그 외 검색으로 발견한 후보 (참고용, 이번엔 실행 안 함)

- **ViralMint(openclaw-easy/ViralMint, AGPL-3.0)** — 위에서 다룸. 사용자가 이미 파생 프로젝트를
  운영 중이라 가장 신뢰도 높은 참고 대상.
- **claude-world/trend-pulse** — "20개 소스, 무인증, CLI+Python+MCP" 트렌드 토픽 애그리게이터.
  영상 단위가 아니라 토픽/뉴스 단위로 보여 이번 범위엔 안 맞지만, Douyin hot이나 Reddit처럼
  "토픽 신호"를 더 넓히고 싶을 때 후보.
- **ScrapeCreators/social-media-research-skills** — Claude Code용 "skill" 정의 모음이지만
  뒷단이 ScrapeCreators 유료 API라 결국 또 다른 유료 공급자 후보(SOURCE_AUDIT.md에 추가할 만함,
  이번엔 실측 안 함).

## 파이프라인 반영 사항 (실제로 적용됨)

1. `lib/reverseCli.js` 신설 — `research/oss-tools/social-media-research-cli`를 subprocess로
   감싸는 어댑터. venv 없으면 조용히 죽지 않고 명시적 에러(§32).
2. `providers/youtubeReverseCli.js` 신설 — YouTube 후보 provider 하나 더 추가(오늘 120건).
3. `providers/tiktokProvider.js` 전면 교체 — EnsembleData 유료 전제였던 stub을
   TikTok Creative Center 키리스 실동작 코드로 교체. 오늘 24건 확보했지만 아래 이유로 TOP10엔
   못 채움.
4. `providers/douyinProvider.js` — VIDEO 후보는 여전히 없지만(정직하게 유지), 토픽 신호
   `collectTrendingTopics()` 추가.
5. `lib/safety-filter.js`에 `AD_CONTENT_PATTERNS` 추가 — 광고/브랜드 협찬 콘텐츠 자동 제외.
6. **오늘 최종 랭킹 결과**(data/rankings/2026-09-09.json): YouTube Shorts는 6장르 전부
   10/10(355개 후보 → 234개 클러스터). TikTok은 AMAZING 5·SATISFYING 4·FUNNY 3, 나머지
   3개 장르는 0건 — 억지로 안 채웠다.

## 다음에 시도해볼 것 (승인 필요 항목 없음, 코드로 바로 가능)

- `tiktok creative-trending-hashtags`를 더 다양한 국가/카테고리로 돌려서 해시태그 단위
  트렌드라도 편집 참고 자료로 축적.
- Xeron2000/viral-shorts를 MCP로 직접 연결(YOUTUBE_API_KEY 생기면) — VPH 기반 discovery로
  현재의 검색어 기반 방식을 보강.
- oronaminc/bot의 z-score velocity 아웃라이어 개념을 우리 스냅샷 테이블(§12)이 쌓이면
  자체 구현.
