# NEWSJEOUL VIRAL SOURCE AUDIT

조사일: 2026-09-09. POKKI 경쟁 분석 + 바이럴 데이터 공급자 비교 + Douyin/TikTok 키리스 접근성
실측 + PHASE 3 품질 감사 기록.

**2026-09-09 추가 지시로 방향 갱신**: "유료 API보다 검증된 OSS primitive를 먼저 clone·실행·
비교하라"는 지시에 따라 GitHub 공개 도구 5종 이상을 실제로 clone해서 돌려봤다. 그 결과
YouTube·TikTok(부분)·Douyin(부분)에서 **키 없이 실동작하는 경로를 새로 확보**했다. 상세
실측 로그와 결론은 **[`RESEARCH.md`](./RESEARCH.md)** 참고 — 이 문서의 §2 표는 "OSS로
못 뚫은 나머지 구간을 유료로 메운다면"이라는 관점으로 갱신했다.

---

## 1. POKKI 경쟁 분석

**조사 방법 고지**: pokki.xyz 홈/약관/개인정보처리방침을 WebFetch로 직접 읽었고, WebSearch로
"pokki.xyz", "pokki instagram" 등 10회 이상 검색했다. **외부 언론·리뷰·커뮤니티 언급, 공식 SNS
계정은 전혀 발견되지 않았다** — 웹사이트 자체 콘텐츠 외엔 흔적이 없는 초기 단계 서비스로 보인다.

| 항목 | 확인된 사실 |
|---|---|
| 수집 대상 | **Instagram Reels만.** TikTok/YouTube 언급 없음. "경쟁사의 어제 터뜨린 릴스가 매일 아침 도착" |
| 데이터 출처 | **불투명.** 랜딩페이지는 "인기 해시태그 Top Posts 자동 수집·경쟁 계정 릴스 포함"이라 홍보하지만, 개인정보처리방침엔 "Meta OAuth를 통해서만" 처리한다고만 명시 — 랜딩페이지 주장(타 계정 자동수집)과 약관(본인 계정 OAuth만) 사이에 명백한 모순이 있다 |
| Viral 정의 | "점수 85점 이상 = 바이럴". 산출 공식·가중치는 비공개 |
| Instagram 실제 게시물 | **재현 실패** — 공식 계정을 특정하지 못함(사이트 어디에도 자사 SNS 링크 없음) |
| 업데이트 빈도 | 트렌드 수집 "격일", 사용자 대시보드는 "매일"(모호) |
| 카테고리 체계 | 고정 리스트 없음, 사용자가 직접 카테고리 지정 |
| 랭킹 방식 | "Live Tracking"(팔로워/인게이지 매일 기록) + "Viral Radar"(도달 상위 1% 감지), 알고리즘 비공개 |
| UI | 42개국 스캔 지구본 비주얼 + 대시보드. **랜딩페이지 사용자 사례가 "가상 페르소나"라고 자체 명시**(실사용 후기 아님) |
| 수익모델 | 5단계 구독제: Free(무료, 3계정/7일보존) → Starter 9,900원 → Pro 29,000원 → Studio 49,000원 → Team 99,000원. 카드없이 7일 체험 |

**우리가 배울 점**: 임계값을 숫자로 명확히 제시하는 UX("85점=바이럴"), 계정수·보존기간·AI분석량
3축 가격설계, "가상 예시"를 라벨링하는 최소한의 정직성.

**우리가 다르게 갈 점**: (1) 데이터 출처를 약관과 실제 기능 설명이 일치하도록 투명하게 밝힌다
— POKKI의 모순이 반면교사. (2) Instagram 단일 플랫폼이 아니라 YouTube Shorts/TikTok/Reels/
Douyin 멀티플랫폼. (3) 블랙박스 AI 스코어가 아니라 "그 플랫폼 안에서의 공개 조회수"라는 설명
가능한 단순 기준. (4) 검증 가능한 실제 스냅샷·출처 링크를 앞세운다(POKKI는 실증 사례가 전무).

---

## 2. 데이터 공급자 비교 (일반 조사)

인증 없이 호출 가능한 진짜 public endpoint는 **어디에도 없었다** — YouTube Data API(공식,
완전 무료)를 빼면 전부 유료 가입/키가 필요하다.

| PROVIDER | 커버리지 | SEARCH | TRENDING | VIEWS | LIKES/COMMENTS | THUMBNAIL | TRANSCRIPT | FRESHNESS | API | FREE TEST | PRICE | STABILITY |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **YouTube Data API v3(공식)** | YouTube만 | O(order=viewCount) | X(정렬로 대체) | O(videos.list 2차호출) | O | O | X | 실시간 | O | 완전무료 | **무료**(유닛 매입 불가, 10,000유닛/일=검색 최대 100회) | 최고 |
| **Viral Outliers** | TikTok/IG/YouTube | O | O(무료조회 일부) | 불명확 | 불명확 | 불명확 | O | 시간단위(주장) | O(REST+MCP) | 7일 체험 | $17~$149/월 | 신생, 리뷰無 |
| **EnsembleData** | TikTok/IG/YouTube+5개 | O(해시태그/키워드) | X | O | O | O(다중해상도) | X | 실시간 | O(성숙) | 50유닛/일 무카드 | $100~$1,400/월 | **양호(Trustpilot 검증)** |
| **Virlo** | TikTok/IG Reels/YT Shorts | O | O(digest/hooks) | O | O | 불명확 | **O(43필드)** | 지속모니터링 | O(MCP지원) | 스타터크레딧 | 종량제 $0.25~$1/호출 | 신생 |
| **Exolyt** | TikTok만 | X | X | 불명확 | 불명확 | 불명확 | 부분 | 대시보드 | **X(API없음)** | 무카드 | 무료~₩1.4M/월 | 대시보드 안정 |
| **Pentos** | TikTok만 | O(대시보드) | O(#discover) | O | O | O | X | 대시보드 | **X(이메일 커스텀)** | X | $99~$999/월 | 안정 |
| **SocialKit** | YT/TT/IG/FB/X/LI | O | X | O | O | 불명확 | O | 실시간 | O | 20크레딧 | $13~$210+/월 | 리뷰 적음 |
| **Apify(Actor마켓)** | TT/IG/YT 분산 | O | X | O | O | O | 일부 | 요청시점 | O | $5크레딧 | $0.30~$2.70/1,000건 | **차단·구조변경 리스크** |
| **Bright Data** | TT/IG/YT/FB | O | X | O | O | O | X | 일/주/월 또는 실시간 | O | 5K레코드 | $250/10만~, $500+/월 | 양호, 진입장벽↑ |
| **TikHub**(2026-09-09 추가, RESEARCH.md) | TikTok+Douyin(app v3 API, 동일 파서로 둘 다 처리) | O(키워드) | 불명확 | O | O | O | X | 실시간 | O | 불명확 | 불명확(가입 필요) | **사용자의 기존 ViralMint/BuggyScene 프로젝트가 프로덕션에서 이미 사용 중** — 실사용으로 간접 검증됨 |

**공통 주의**: TikTok/Instagram은 공식 discovery API가 사실상 없다(Pentos 스스로 "TikTok
doesn't share organic content data via API"라고 인정).

### 2-1. Douyin 전용 조사 (2026-09-09 추가지시 반영)

공개 API를 제공하는 Douyin 전문 discovery 서비스는 이번 조사로 **발견하지 못했다**. TikTok보다도
더 폐쇄적 — Douyin은 자체 서명 알고리즘(요청마다 바뀌는 서명 파라미터)으로 비공식 접근을
막고 있고, 중국 현지 데이터 벤더 정도가 실전 옵션으로 보이나 계약/실명인증 요건이 있을 가능성이
높아 이번 조사로는 구체적 업체를 특정하지 못했다. Bright Data의 범용 소셜 데이터셋에 Douyin
커버리지가 있는지는 별도 확인이 필요하다(문서상 명시 안 됨).

**이 세션에서 직접 실측**: `douyin.com/hot`을 키 없이 GET했을 때 HTTP 200은 오지만 페이지가
72KB뿐이고 실제 트렌딩 리스트는 서명된 XHR로 클라이언트에서 로드된다 — 서명을 재현하지 못해
키 없는 데이터 확보에 실패했다. 조사 결과와 실측이 정확히 일치한다.

---

## 3. TikTok/YouTube 키리스(무료) 접근성 실측 (2026-09-09)

문서만 읽지 않고 실제로 호출해봤다(§본 지시 원칙).

| 대상 | 방법 | 결과 |
|---|---|---|
| Reddit `.json` 리스팅(대안 검토) | `old.reddit.com/r/.../top.json` | **HTTP 403 차단**(봇 감지) |
| YouTube 검색결과 페이지 | `youtube.com/results?search_query=...` → `ytInitialData` 파싱 | **성공.** 실제 title/조회수/썸네일/채널/길이 확보. 단 진짜 &lt;60초 Shorts 셸프(`reelItemRenderer`)는 이 방식으로 노출되지 않음(로그인/모바일 클라이언트 컨텍스트 필요로 추정) — 실제 반환되는 건 대부분 5~30분 컴필레이션 영상. `videoDuration=short`가 지원되는 공식 API로 전환하면 즉시 해결됨 |
| YouTube `/feed/trending` | ytInitialData 파싱 | **빈 리스트**(0건) — region/consent 게이팅 추정, 신뢰 불가 |
| TikTok 해시태그 페이지 | `tiktok.com/tag/funny` → `__UNIVERSAL_DATA_FOR_REHYDRATION__` 파싱 | **빈 shell만 반환**(captcha/verify 마커 확인, 봇 탐지). 실제 영상 목록 없음 |
| TikTok oEmbed | `tiktok.com/oembed?url=...` | 성공하지만 **known URL 1건 조회용**(discovery 아님), view count도 없음 |
| Instagram oEmbed | `api.instagram.com/oembed` | HTTP 500(앱 토큰 필요) |
| Douyin `/hot` | 직접 GET | 200이지만 실콘텐츠는 서명된 XHR — 재현 실패 |

**결론**: 4개 핵심 플랫폼 중 **YouTube Shorts만 이번 세션에서 실제로 키 없이 데이터를 확보할 수
있었다.** TikTok/Instagram Reels/Douyin은 문서 조사와 실측이 모두 "유료 공급자 계약 없이는 불가"로
일치한다. 아래 PHASE 2 실데이터는 전부 YouTube Shorts 기준이다.

---

## 4. MVP 추천 조합 (2026-09-09 개정 — OSS primitive 우선)

**1순위: 무료/키리스 OSS 조합** — YouTube Data API(공식, 무료) + `youtube search`(reverse CLI,
InnerTube 기반, RESEARCH.md) + TikTok Creative Center(키리스, RESEARCH.md) + Douyin 인기
검색어(키리스, 토픽 레벨). 지금 코드가 실제로 이 조합으로 돌아가고 있다. 비용은 사실상 $0.

**한계**: 이 조합만으로는 TikTok/Douyin의 **영상 단위** 후보를 우리 제품 볼륨(장르당 TOP10)
만큼 채울 수 없다(오늘 실측: TikTok 24건 중 광고 아닌 순수 유기적 후보는 한 자릿수, Douyin은
영상 링크 자체가 없음). 볼륨이 필요해지면:

**2순위(유료 확장): TikHub(TikTok+Douyin 통합, 사용자의 기존 ViralMint 프로젝트로 간접 검증됨) +
EnsembleData(Instagram Reels)** — Instagram은 이 세션의 어떤 키리스 방법으로도 뚫지 못했으므로
(§3, HTTP 401) 여전히 유료 공급자가 유일한 경로다.

## 5. 확장 추천 조합

1순위 조합 + TikHub/EnsembleData + **Virlo**(종량제 애드온, transcript/훅분석 필요한 콘텐츠
기획용) + **Bright Data**(장애 백업/대량 히스토리 백필용).

---

## 6. PHASE 2 — 실 데이터 POC 결과

### 6-0. 2026-09-09 §5 재검증(가장 최신, 최종 판정 기준) — YouTube는 "성공 판정 보류"

이전 회차(§6-1)의 YouTube 결과는 duration 40분까지 관대하게 받아들인 **구방식**이라 PM
지시로 폐기하고, "진짜 확인된 Shorts(&le;60초)만, 진짜 최근(24h/48h)것만"으로 다시 만들었다
(`providers/youtubeConfirmedShorts.js`, RESEARCH.md 상세).

- **작은 배치 실측(성공)**: 12개 검색어 → 216개 Shorts뱃지 후보 → 상세조회 재검증 →
  196건 확인된 진짜 Shorts → **24시간 이내 44건, 48시간 이내(24h 초과) 25건**. FUNNY(16+7)/
  TOUCHING(8+2)/SHOCK(5+3)/SATISFYING(5+8)/AMAZING(10+5)엔 후보가 나왔고 **ANGER는 0건**.
  조회수는 진짜 최근 영상이라 수천~수만 단위(예: 7,367뷰·11.5시간 전) — 예전의 억대 뷰
  컴필레이션과는 질적으로 다른, 훨씬 정직한 숫자다.
- **큰 배치 확대 시도(실패)**: 검색어를 24개로 늘리자(454개 후보) **YouTube가 HTTP 429로
  전부 막았다** — IP 레이트리밋으로 판단(200개 안팎까진 안정적이었음). 재시도 로직·동시성
  하향·장르당 상한(40개)을 코드에 반영했지만, **이 문서 작성 시점까지도 재시도가 계속
  429로 막혀 있어 오늘자 정식 재수집을 완료하지 못했다.**
- **최종 판정: YouTube는 아직 "성공"으로 판정하지 않는다.** 방법론은 실측으로 검증됐지만
  (작은 배치에서 정상 동작 확인), 오늘 이 시점 기준으로 §5 요구사항(original URL/published_at/
  age_hours/duration/confirmed_short/current_view_count 전부 포함한 24시간 우선 후보)을
  만족하는 완전한 오늘자 데이터셋은 레이트리밋 때문에 아직 없다. **공식 YOUTUBE_API_KEY
  (무료, 할당량 기반이라 이 IP 레이트리밋 자체가 없음)가 이 문제의 근본 해결책이다.**

### 6-1. (구방식, 참고용— §5 기준 미달로 폐기됨) 이전 회차 YouTube 결과

duration 40분까지 관대하게 받아들인 구버전 파이프라인(`youtubeSearchScrape.js`+
`youtubeReverseCli.js`)으로는 355건 고유 클러스터를 모아 6개 장르 전부 TOP10을 채웠었다
(234개 최종 클러스터, 위 Carousel/Reel 프로토타입이 이 데이터로 만들어져 있다 — **§5
재검증 이전 데이터라는 점을 명시**). 이 결과는 "오래된 누적 고조회수 영상"이 섞여 있어
PM 지시로 폐기했고, 최신 판정은 위 §6-0을 따른다.

**TikTok** (Creative Center, 키리스 — 2026-09-09 §4로 "보조 Radar" 강등, RESEARCH.md)
- 수집: 24건(미국/일본/인도네시아 인덱스만 성공, 영국/프랑스/독일/한국/브라질은 이번 주
  TikTok 쪽 인덱스 문제로 실패) → 유효(조회수&gt;0) 18건 → 검토대기(광고/정치 등) 12건 →
  최종 12건(클러스터).
- **결과**: AMAZING 5/10, SATISFYING 4/10, **FUNNY 3/10**, **TOUCHING 0/10**, ANGER 0/10,
  SHOCK 0/10. §7 최소요건(FUNNY/TOUCHING 실데이터)은 FUNNY만 충족, TOUCHING은 0건 그대로
  보고한다. Creative Center는 메인 공급원이 아니라 보조 신호로만 쓴다(§4) — TikHub이
  메인 후보이나 이번 세션엔 크리덴셜이 없어 테스트하지 못했다(RESEARCH.md TikHub 섹션).

**Douyin**
- 인기 검색어 30건(진짜 실시간 조회수 포함, 예: "皇马2:1击败国米" 6,760만) 확보했지만
  **토픽 단위**라 canonical_url이 없어 VIDEO 후보 풀에는 못 넣었다(스키마 §11 위반 방지).
  `data/douyin-hot-topics-2026-09-09.json`에 별도 보존.
- **결과: 영상 단위 TOP10 0건.** PLATFORM.md §13이 요구한 "플랫폼별 비교"는 이번 PoC에선
  YouTube Shorts만 완전한 비교가 가능했다.

## 7. PHASE 3 — 품질 감사

- **FUNNY / TOUCHING**: 품질 양호. 컴필레이션 채널(FailArmy류, "Faith In Humanity Restored"류)
  중심이라 장르 정체성이 뚜렷하고 오분류 위험이 낮다.
- **ANGER**: "Entitled Karen" 소재 쏠림이 심하다(TOP10 중 다수가 유사 포맷). 검색어를 더
  다양화하거나("공분" 성격의 뉴스성 소재 추가) 상위 몇 개만 Karen류로 제한하는 다양성 룰이
  필요해 보인다.
- **SHOCK**: 상대적으로 **얕다** — TOP10 채우긴 했지만 하위권(#7~10)은 조회수가 수만~십만
  단위로 다른 장르 대비 약하다. "shocking/wtf/unbelievable" 검색어가 실제로는 SHOCK보다
  AMAZING/FUNNY에 가까운 결과를 더 많이 반환하는 경향이 있었다(그래서 §4 override 테이블에서
  여러 건을 AMAZING/FUNNY로 재분류했다). SHOCK 장르는 검색어 재설계가 필요한 최우선 후보.
- **AMAZING**: America's Got Talent류 공식 채널 클립이 최상위를 독점(1위 1.4억뷰) — 소스
  다양성이 낮다. 장기적으로 AGT 의존도를 낮출 검색어가 필요.
- **discovery_genre_hint 정확도**: 178건 중 약 45건(25%)을 재분류했다 — 검색어만으로 장르를
  가정하면 안 된다는 근거. 특히 "카렌이 벌 받는" 소재는 검색어가 ANGER여도 실제 정서는
  SATISFYING(사이다)에 가까운 경우가 많았다.
- **오분류 원인 정리**: (1) 검색어 자체가 이미 감정 프레임을 담고 있어(예: "entitled customer")
  실제 톤(웃김 vs 분노 vs 사이다)이 제목 뉘앙스에 따라 갈리는데 힌트만으론 구분 안 됨.
  (2) "shocking/unbelievable/wtf" 같은 강조어가 SHOCK 전용이 아니라 여러 장르에서 범용
  클릭베이트로 쓰임. → 프로덕션에서 ANTHROPIC_API_KEY로 실제 LLM 분류를 돌리면 이 정도
  뉘앙스는 정확히 잡을 수 있을 것으로 판단(이번엔 사람이 직접 읽고 그 판단을 재현했다).

---

## 8. 비용 추정

| 시나리오 | 구성 | 하루 예상 records | API 호출/일 | LLM 호출/일 | 월 예상 비용 |
|---|---|---|---|---|---|
| **MVP**(2026-09-09 개정) | YouTube(공식 API+reverse CLI 병행) + TikTok Creative Center(키리스, 볼륨 낮음) + Douyin 토픽(키리스) — 전부 무료 | ~350~450(YouTube) + ~10~30(TikTok, 광고제외 후) | ~144회(YouTube) + ~10회(TikTok CC) | ~350~450회(Claude Haiku) | **API 비용 $0 + Claude Haiku 분류 약 $8~12** |
| **NORMAL** | + TikHub(TikTok+Douyin 통합, ViralMint로 간접검증) 또는 EnsembleData(IG Reels) | ~700~1,000 | +TikHub/EnsembleData ~50~100유닛/일 | ~700~1,000회 | **TikHub/EnsembleData $100/월~ + Claude $20~30 ≈ $120~150** |
| **SCALE** | + Instagram Reels(EnsembleData) + Virlo 애드온(transcript) + 2시간 폴링 | ~1,500~2,000 | 배 이상 | ~1,500~2,000회 | **$100~200(TikHub+EnsembleData) + Virlo $30~80 + Claude $40~60 ≈ $170~340** |

목표는 비용 최저가 아니라 **Coverage/안정성/운영비의 균형**이다. MVP는 사실상 YouTube 무료
티어만으로 검증 가능하므로, 실제 유료 결제는 "TikTok/Reels/Douyin까지 붙일 결정을 내릴 때"
사용자 승인 후 진행한다.
