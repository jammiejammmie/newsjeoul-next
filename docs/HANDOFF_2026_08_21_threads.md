# 스레드 배급 교착 해제 — 인수인계 (2026-08-21 08:2x KST 기준)

> 노트북에서 이어받을 때 **이 문서를 먼저 읽는다**. 데스크탑 세션은 종료됨.

## 1. 무슨 일이 있었나

8/17부터 스레드 게시가 계단식으로 무너져 8/20은 **24회 실행 전부 0건**이었다.
실패 사유는 전부 `distribution_threshold` — API/토큰 문제가 아니라 **후보 고사**였다.

원인 두 가지:

1. **후보 풀이 `importance_score` 상위 30건 고정.** 상위권은 사회/경제가 독점하는데
   채널 쿼터는 연예70/스포츠20/정치10이라, 쿼터가 원하는 후보가 창 밖에 있었다.
   게시가 0건이면 풀도 그대로라 같은 후보를 30분마다 다시 떨어뜨리는 교착이 된다.
2. **오늘 0건이면 `categoryAllocation` confidence가 0**이라 전원 중립 50점 → 점수가 깎여
   못 나가고, 못 나가서 다시 0인 자기강화 교착. 8/20 최고점 54 vs 문턱 55(1점 차).

## 2. 무엇을 고쳤나 (커밋 `20f705c`, master 배포 완료)

`netlify/functions/post-threads-background.js` 2곳만 수정:

- `CANDIDATE_POOL_SIZE` **30 → 150**
- `DISTRIBUTION_SCORE_STARVATION_FLOOR = 45` 신설 —
  `computeAdaptiveMinDistributionScore`에서 `postedToday <= 0`일 때만 적용(첫 1건 전용,
  1건 나가면 즉시 55 복귀)

**건드리지 않은 것**: 품질 게이트(`MIN_EDITORIAL_SCORE` 60), 실체 필터(`hasSubstance`),
쿼터 비율(편집 방향이라 대표 결정 영역).

검증: `node scripts/test-post-threads.js` 112/112, `node scripts/test-category-quota.js` 15/15.

## 3. 실측 결과 (8/20 UTC)

게시 재개됨 — 3일 만.

| 시각(UTC) | 게시 |
|---|---|
| 14:01 | 이강인 AT마드리드 데뷔골 (dist 61) |
| 16:31 | 거제·통영 호우 피해 |
| 16:35 | KBO 리그 순위 |
| 17:01 | 거제·통영 특별재난지역 검토 |

**수정이 효과가 있었다는 직접 증거**: 이강인 토픽의 `importance_score`는 270이고
이보다 높은 published 토픽이 100건이다 — **기존 30건 창에는 절대 들어올 수 없던 후보**다.

## 4. 남은 문제 (여기서부터 이어서 하면 됨)

### 4-1. 17:01 UTC 이후 12회 연속 0건 (= 02:00~08:00 KST)
- 오늘 누적 **4건 / 목표 20건**
- 사유는 전부 `distribution_threshold`
- 심야 시간대라 정상일 수도 있으나, 6시간 연속 0건은 확인이 필요하다

### 4-2. 로그 없이 실패하는 회차가 있다 (미해결)
14:30·15:00 UTC 두 회차는 `시도 1 / 성공 0 / skip 로그 0건`이었다.
코드상 skip 로그가 안 남는 경로는 **"쿼터 통과 후보 0건이라 점수 계산 대상 자체가 없을 때"**
하나뿐인데, 배포된 코드를 그대로 불러와 실제 DB로 재현하면 통과 후보가 나온다(58점 vs 문턱 55).
**재현과 운영이 어긋난다.** 이후 16:31에 정상 게시된 걸 보면 일시적 현상일 가능성이 크지만
원인은 미상이다.

확인 방법(함수 콘솔 로그 한 줄이면 판별됨):
```
SUBSTANCE_FILTER[threads] / BUZZ_FLOOR_APPLIED / CATEGORY_QUOTA_APPLIED
```

### 4-3. Netlify 토큰 계정 불일치 (주의)
이 데스크탑에 캐시된 Netlify 토큰은 **floweryarn@naver.com**(무관한 계정)이다.
사이트 조회는 되지만 `accounts/{id}/env` 는 404 — ADMIN_KEY를 못 읽는다.
`netlify login --new`로 winddungi@gmail.com 재로그인이 필요하다.
(→ 메모리 `feedback_netlify_access.md`에 기록된 그 함정이 실제로 재현됨)

## 5. 노트북에서 이어받는 절차

```bash
cd C:\newsjeoul-next          # 노트북 경로가 다르면 해당 경로
git pull                       # 20f705c 포함 확인

# 현재 배급 상태 실측 (anon 키만 있으면 됨, .env.local 필요)
node scripts/check-distribution-health.js
node scripts/check-threads-latest.js
node scripts/check-publish-throughput.js
```

### 판단 기준
- **오늘 누적이 계속 4~6건에서 멈춰 있으면** → 심야가 아니라 구조 문제.
  다음 후보는 `MIN_BUZZ_SCORE_FOR_POST`(현재 25) 완화 또는 쿼터 비율 재조정(=대표 결정 필요).
- **낮 시간대에 정상적으로 붙기 시작하면** → 이번 수정으로 충분. 4-1은 심야 특성으로 종결.
- **또 로그 없이 0건이 반복되면** → 4-2. Netlify 함수 로그를 봐야 한다(4-3 재로그인 선행).

### 진단용 dry 호출 (실제 게시 없음)
ADMIN_KEY를 얻은 뒤:
```
https://newsjeoul.co.kr/.netlify/functions/post-threads-background?dry=true
헤더: x-admin-key: <ADMIN_KEY>
```
"지금 이 시각에 무엇이 왜 선택되는가"를 JSON으로 돌려준다.

## 6. 함께 확인된 부수 사항

- 콘텐츠 **생산은 정상** — 일별 published 24~47건, 신규 토픽 50~76건, 수집 1,000건+/일
- 미게시 published 적체 **332건** (배급이 못 따라가는 것이지 소재가 없는 게 아니다)
- 인스타그램은 8/18 PM 지시로 **의도된 중단** 상태 (커밋 `a27c71a`)
- `silence_score` 컬럼 드롭 **완료 확인** (buzz 전환 미결 2건 중 1건 해소)
- `docs/grey-strategy.md`(8/19 작성, 인스타 아이돌 그레이 계정 전략) 미커밋 상태였음
- 풀 확대 부하 실측: 150건 응답 0.87MB / 949ms (30건은 0.20MB / 950ms) — 지연 차이 없음
