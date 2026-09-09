# NEWSJEOUL VIRAL RADAR — 제품 정의 & 운영 원칙

최종 갱신: 2026-09-09 (PoC 1일차, 플랫폼 분리 구조 개편 반영)

## 0. 이 프로젝트가 아닌 것

우리는 "어떤 영상이 바이럴될 것인가"를 예측하는 자체 Viral Algorithm을 만들지 않는다.
Viral Outliers, TikTok trend tracker, YouTube Shorts 검색 등 이미 존재하는 discovery 레이어를
데이터 공급망으로 쓰고, NEWSJEOUL은 **AGGREGATION → CLASSIFICATION → RANKING → EDITORIAL →
DISTRIBUTION**에만 집중한다.

## 1. 제품 정의

매일 인터넷에서 화제가 된 숏폼 영상을 **플랫폼별 · 장르별 조회수 TOP10**으로 집계해
NEWSJEOUL Instagram에 발표한다. "우리가 재미있다고 고른 10개"가 아니라 "그 플랫폼에서
실제로 공개 조회수가 높은 영상 TOP10"이라는 데이터 제품이다.

## 2. 데이터 제품의 원본 단위 (2026-09-09 개편)

> **DATE × PLATFORM × GENRE × RANK**

TikTok 10M과 YouTube Shorts 10M을 한 줄에 세워 절대 순위를 매기지 않는다. 플랫폼마다 view
정의·확산 구조가 다르기 때문이다. 공개 랭킹은 항상 "플랫폼 안에서" 비교한다.

MVP 핵심 플랫폼(중요도 순): **YouTube Shorts → TikTok → Instagram Reels → Douyin**.
(2026-09-09 기준: YouTube Shorts는 완전 동작. TikTok/Douyin은 키리스 접근 경로를 새로 찾았지만
TikTok은 광고 위주라 볼륨 부족, Douyin은 영상 단위 데이터가 아직 없음 — RESEARCH.md·
SOURCE_AUDIT.md §PHASE2 참고. Instagram Reels는 여전히 완전 막힘.)

각 플랫폼 안에서 6개 장르(FUNNY / TOUCHING / ANGER / SHOCK / SATISFYING / AMAZING) 각각 TOP10을
만든다. 데이터가 부족한 날엔 TOP7처럼 있는 만큼만 낸다 — 가짜 채움 금지.

## 3. 랭킹 철학

외부 provider의 outlier/viral score는 **후보 발굴에만** 쓴다. NEWSJEOUL 공개 순위는 그 플랫폼
안에서 **공개 조회수 내림차순**이 전부다. 플랫폼 간 조회수를 임의 계수로 보정하지 않는다
(TikTok×0.7 같은 정체불명 정규화 금지). 각 카드엔 플랫폼을 명확히 표기한다.

## 4. "오늘"의 정의 — CAPTURE_WINDOW 채택

두 후보를 실측 비교했다(PLATFORM.md 지시 §5):

- **A. 업로드 기준** — 최근 24시간 내 업로드된 영상만 후보로 인정.
- **B. 포착 기준** — Radar가 오늘 포착한 영상 중 마감 시점 조회수로 집계(업로드일 무관).

**B(포착 기준, `CAPTURE_WINDOW`)를 채택했다.** 실측 이유: 오늘 YouTube 검색 스크래핑으로 모은
178건 중 "24시간 내 업로드"만 남기면 대부분 탈락한다 — 진짜 바이럴 숏폼은 업로드 후 며칠~몇 주
지나 검색 알고리즘에 잡히기 시작하는 경우가 흔하고(예: AGT 클립은 몇 년 전 업로드분도 오늘
수백만 뷰가 계속 붙는다), 업로드 기준으로 자르면 장르당 TOP10을 채우지 못하는 날이 속출한다.
반대로 포착 기준은 "오늘 Radar에 잡힌 것 중 지금 조회수가 높은 것"이라는, 애초에 §3에서
정의한 문구와 그대로 일치한다. 대신 **정직하게 명시한다**: "오늘 업로드된 영상"이 아니라
"오늘 우리 레이더에 새로 잡힌 영상"이라는 뜻이며, 웹 상세페이지 methodology에 그대로 적는다.

## 5. DAILY CUTOFF

**20:00 KST 데이터 마감 → 21:00 결과물 생성**을 기본값으로 제안한다(수집 자체는 하루 종일
계속). 근거: 기존 뉴스저울 Threads/Instagram 자동포스팅은 이슈 발생 즉시형이라 고정 시각이
없었지만, Viral Radar는 "하루 한 번의 발표"형 제품이라 습관형 접속 시간대가 필요하다. 저녁
8~9시는 국내 Instagram 이용자 활동이 몰리는 대표적 시간대(뉴스저울 기존 운영 인사이트에서
저녁 시간대 카드뉴스 반응이 상대적으로 높았던 패턴과도 일치)이며, 하루치 아침~저녁 수집
분량이 이미 충분히 쌓인 시점이라 후보 pool도 가장 두텁다. 실제 운영 데이터가 쌓이면 재조정.

## 6. 장르 (MVP 6종, 확정 아님)

FUNNY / TOUCHING / ANGER / SHOCK / SATISFYING / AMAZING. 오늘 1일치 실데이터(YouTube Shorts)
기준 커버리지는 QUALITY_AUDIT 섹션(SOURCE_AUDIT.md) 참고 — SHOCK가 상대적으로 얕고 ANGER는
"Karen/entitled" 소재에 쏠림이 심하다. 며칠 더 수집해보고 5~7개로 최적화할 것.

## 7. Multi-label + Primary Genre

내부적으로 secondary_genres를 허용한다(예: "카렌이 응징당하는 영상"은 SATISFYING이 primary,
ANGER가 secondary). 공개 랭킹엔 primary 하나만 쓴다.

## 8. 안전/브랜드 필터

하드 블록(§18): 노골적 성적/폭력적 소재, 명백한 허위조작, 개인정보 노출. 리뷰 필터: 사고·사망·
폭행·위협 키워드. **이번 세션에서 추가로 발견한 리뷰 대상**: 정치인 실명 등장, "woke ~ owned"류
문화전쟁 소재, 인종 관련 갈등, 미성년자+공권력 물리력 소재 — 오늘 178건 중 20건이 이 사유로
needs_review 처리됐다(자동 승인 안 함, TOP10 랭킹에서 제외됨). 상세는 SOURCE_AUDIT.md
"PHASE 3 품질 감사" 참고.

## 9. 크로스플랫폼 콘텐츠 클러스터 (GLOBAL은 별도 파생상품)

같은 클립이 여러 플랫폼에서 동시에 돌면 `viral_content_clusters`로 내부적으로 묶되(lib/cluster.js),
플랫폼별 TOP10엔 각 플랫폼 실적을 그대로 남긴다. GLOBAL VIRAL INDEX(퍼센타일/성장률/creator
baseline 정규화)는 지금 만들지 않는다 — 여러 플랫폼 실데이터가 쌓인 뒤의 파생상품.

## 10. Instagram 제품 형태

플랫폼 자체가 콘텐츠 축이 된다 — "오늘 YouTube Shorts에서 가장 많이 본 웃긴 영상 TOP10"처럼
제목 레벨에서 플랫폼을 명확히 밝힌다. 두 프로토타입(Carousel/Reel) 실데이터로 제작 완료
(Deliverables 참고). 4 platforms × 6 genres = 24개를 매일 다 올리지 않는다 — §11 운영 리듬 참고.

## 11. 운영 리듬 (초안, 실데이터로 재검토 예정)

지금 실제로 있는 데이터는 YouTube Shorts뿐이라 이 결정은 시기상조지만, 후보안을 남겨둔다:
- **방식 B(요일별 아님, 장르 하나를 여러 플랫폼으로 비교)**를 1순위로 제안 — "오늘 FUNNY:
  플랫폼별 1위 비교" 카드 1세트가 "플랫폼 하나를 통째로 로테이션"보다 여러 플랫폼 데이터가
  갖춰졌을 때 더 흥미로운 콘텐츠가 된다(§9 크로스플랫폼 스토리와도 연결됨).
- TikTok/Reels/Douyin 실데이터가 확보되기 전까진 이 결정 자체가 확정 불가 — PHASE 6 재논의.

## 12. 장기 자산

플랫폼×장르×날짜로 검증된 랭킹이 쌓이면 이번 주 TOP10 / 이번 달 TOP100 / 24시간 급성장 /
100M Club / 국가별·플랫폼별 바이럴 / NYOM 소재 Radar로 재사용 가능(§25-26). Snapshot 테이블을
지금부터 남기는 이유가 이것.

## 13. NYOM 연결

Data layer에서만 연결 가능하게 열어둔다(공통 VIDEO 스키마, cluster). 파이프라인은 지금
합치지 않는다.
