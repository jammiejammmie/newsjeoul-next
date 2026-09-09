# NEWSJEOUL Viral Radar

뉴스저울 Instagram 재활성화 프로젝트 — 외부에서 이미 포착된 바이럴 숏폼 영상을 플랫폼별·
장르별 조회수 TOP10으로 집계하는 독립 모듈. 기존 `newsjeoul-next` 프로덕션 파이프라인과
분리되어 있으며(§27), 아직 아무것도 프로덕션에 연결되지 않았다.

**먼저 읽을 문서**: [`NEWSJEOUL_VIRAL_RADAR_PRODUCT.md`](./NEWSJEOUL_VIRAL_RADAR_PRODUCT.md)
(제품 정의) → [`NEWSJEOUL_VIRAL_SOURCE_AUDIT.md`](./NEWSJEOUL_VIRAL_SOURCE_AUDIT.md)(공급자
조사+실데이터 감사) → [`RESEARCH.md`](./RESEARCH.md)(2026-09-09 추가 — GitHub OSS 바이럴탐지
도구 5종+α 실측 clone·실행 결과, TikTok/Douyin 키리스 경로 발견).

## 추가 설치(선택) — TikTok/Douyin 키리스 provider용

`providers/tiktokProvider.js`와 `providers/douyinProvider.js`(topic만)·
`providers/youtubeReverseCli.js`는 [ifccod/social-media-research-cli](https://github.com/ifccod/social-media-research-cli)
(MIT)를 subprocess로 감싼다. 이 저장소는 이미 `research/oss-tools/social-media-research-cli`에
clone돼 있고, venv만 만들면 된다(README §신뢰도 경고는 RESEARCH.md 참고):

```bash
cd research/oss-tools/social-media-research-cli
python3 -m venv .venv
.venv/Scripts/pip install -e .   # Windows. macOS/Linux는 .venv/bin/pip
```

venv가 없으면 이 provider들은 조용히 죽지 않고 "venv 미설치" 에러를 명시적으로 반환하며,
나머지 provider(기존 정규식 스크래퍼 등)는 그대로 동작한다.

## 빠른 실행

```bash
cd viral-radar
cp .env.example .env   # 전부 비워도 됨(§ provider별 자동 비활성)
node scripts/collect.js              # 1) 오늘자 후보 수집(YouTube Shorts 스크래핑, 키 불필요)
node scripts/export-for-classify.js  # 2) 분류 대상 목록 내보내기(ANTHROPIC_API_KEY 없을 때)
#   ↳ ANTHROPIC_API_KEY가 있으면 2)를 건너뛰고 scripts/daily-pipeline.js 하나로 collect+classify+rank가 다 됨
node scripts/rank-run.js             # 3) 플랫폼×장르 TOP10 생성 → data/rankings/YYYY-MM-DD.json
node scripts/prep-render-data.js     # 4) 프로토타입용 썸네일 base64 변환
node scripts/build-prototype.js      # 5) Carousel/Reel HTML 프로토타입 빌드 → render/carousel-reel-prototype.html
```

ANTHROPIC_API_KEY가 있으면 전체를 한 번에:
```bash
node scripts/daily-pipeline.js
```

## 폴더 구조

```
viral-radar/
  providers/       공급자 adapter(youtubeSearchScrape 실동작, 나머지는 키 발급 전 stub)
  lib/              schema/dedupe/cluster/classify/rank/safety-filter/db(로컬 JSON, Supabase 대체 예정)
  scripts/          collect/classify/rank/render/daily-pipeline 실행 스크립트
  data/             오늘자 후보·랭킹 로컬 저장(JSON) — Supabase 서비스키 확보 전 임시 저장소
  render/           Instagram Carousel/Reel 프로토타입(HTML, 실데이터 내장)
  supabase/         viral_radar_schema.sql(아직 미적용 — SUPABASE_SERVICE_KEY 없음)
  .github-workflow-viral-radar-daily.yml   스케줄러 초안(실제 위치로 옮기려면 README/워크플로 파일 주석 참고)
```

## 지금 상태 (2026-09-09 기준)

- 🟡 YouTube Shorts: **"성공 판정 보류"**(2026-09-09 §5 재검증 기준). 방법론(진짜 60초 이하
  Shorts만 + 24h/48h 시간창 확인)은 작은 배치(216건)에서 실측 검증됐지만, 큰 배치로 확대하자
  YouTube가 HTTP 429로 막았고 재시도해도 계속 막혀 있다 — 공식 YOUTUBE_API_KEY(무료)가
  근본 해결책. `providers/youtubeConfirmedShorts.js` 참고.
- 🟡 TikTok: 키리스로 실동작하지만(TikTok Creative Center) 광고 콘텐츠 위주라 FUNNY 3건
  외엔 TOP10을 못 채움 — **메인이 아니라 보조 Radar로 강등**(RESEARCH.md). TikHub이 메인
  후보지만 크리덴셜 없어 미실측.
- 🟡 Douyin: 공식 tamnd/douyin-cli 바이너리로 인기 검색어(토픽)는 실동작하지만, 영상 단위
  billboard는 Douyin 쪽 API 변경으로 깨져 있음(China IP 차단 아님, HTTP 200 "Url doesn't
  match" — RESEARCH.md).
- ⛔ Instagram Reels: 이번 세션의 모든 키리스 시도가 실패(HTTP 401) — TikHub도 지원하지만
  크리덴셜 없어 미실측.
- ⛔ 프로덕션 Supabase 미연결(서비스 키 없음) — 로컬 JSON 파일이 DB 역할.
- ⛔ Instagram 실게시 코드 없음(다음 단계) — 지금은 프로토타입 HTML까지만.

## 남은 외부 credential (실제로 필요해지면)

| 이름 | 어디서 | 왜 필요한가 | 없어도 되는가 |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | console.anthropic.com | AI 자동 장르분류 | 됨(수동 분류 스크립트로 대체 가능) |
| `YOUTUBE_API_KEY` | Google Cloud Console(무료) | 정확한 &lt;60초 Shorts 후보(현재 스크래핑보다 정확) | 됨(스크래핑 provider로 대체, 정확도만 낮음) |
| `SUPABASE_SERVICE_KEY` | 기존 뉴스저울 Supabase 프로젝트 | 로컬 JSON → 실 DB 전환 | 됨(로컬 파일로 계속 운영 가능, 규모 커지면 필요) |
| `ENSEMBLEDATA_TOKEN` | ensembledata.com | TikTok/Instagram Reels 데이터 확보 | 그 두 플랫폼 데이터 자체가 안 생김 |
| `INSTAGRAM_USER_ID`/`INSTAGRAM_ACCESS_TOKEN` | 기존 뉴스저울 Instagram 앱(이미 있다면 재사용 가능성 있음) | 실제 게시(다음 단계에서 필요) | 지금은 불필요(프로토타입까지만) |
