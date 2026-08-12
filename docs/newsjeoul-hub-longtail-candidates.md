# 허브 롱테일 문서 후보 (2026-08-12 발굴)

기존 허브 13개에 추가할 에버그린 문서 주제 **164개**(허브당 12~13개). 선정 기준은 "폴드8 3분할 설정법"과 같은
성격 — 검색량이 크지는 않지만 **의도가 명확하고 경쟁 문서가 얕은 작업 단위 질의**다.

## 왜 이 기준인가

- **경쟁이 얕은 곳은 "제품 리뷰"가 아니라 "작업 절차"다.** 대형 매체·유튜브는 출시 리뷰와
  벤치마크에 몰리고, 정작 "설정이 어디 있는지"는 커뮤니티 단편 글만 있다. 그 자리를 잡는다.
- **이미 문제를 겪는 사람이 찾는 글**이라 클릭 동기가 분명하다. 2026-08-12 배급 개편(DEC-009)에서
  `howto`·`troubleshoot` 포맷을 우선 배급하도록 정한 이유와 같다 — 아래 후보도 두 포맷에 무게를 뒀다.
- **기존 213건과 중복되지 않는다.** 발굴 전에 `hub_documents`의 published 213건 제목을 전수 대조했다.

## 적용 방법

1. `lib/hubs/{hub}.ts`의 `evergreen.{format}.items`에 `{ title, slug }`를 추가한다.
2. `slug`는 아래 표의 값을 그대로 쓴다 — 비워 두면 생성 함수가 한글 제목에서 해시 slug를 만들어
   `8-3-dw76cz` 같은 읽을 수 없는 URL이 된다(2026-08-12 커밋 `dbd370d`가 고친 문제).
3. `generate-hub-documents-background`가 다음 주기에 본문을 생성한다. 사람이 쓸 필요 없다.

**포맷 분포**: howto 64 · troubleshoot 54 · buying 24 · compare 22 — 배급 우선순위가 높은
`howto`+`troubleshoot`가 72%다.

---

## 1. galaxy-z-fold8 — 갤럭시 Z 폴드8 (13개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ DeX로 모니터에 연결해 PC처럼 쓰는 설정 | howto | `dex-monitor` |
| ★ 배터리 보호 85% 제한, 언제 켜고 언제 끄나 | howto | `battery-protect-85` |
| ★ 통화 녹음 자동 저장 설정과 저장 위치 | howto | `call-recording` |
| 보안 폴더에 앱·사진 숨기고 백업하는 법 | howto | `secure-folder` |
| eSIM으로 번호 두 개 쓰는 설정과 요금제 조합 | howto | `esim-dual-number` |
| 커버 화면에서 메신저 답장까지 되게 만들기 | howto | `cover-screen-reply` |
| 교통카드 등록과 잔액이 안 맞을 때 | troubleshoot | `transit-card` |
| 유튜브·넷플릭스가 검은 여백으로 나올 때 | troubleshoot | `app-aspect-ratio` |
| 접힘 감지가 헛돌아 화면이 안 켜질 때 | troubleshoot | `fold-sensor` |
| 워치·버즈 동시 연결이 자꾸 끊길 때 | troubleshoot | `multi-device-bluetooth` |
| 화면 자동 꺼짐·자동 회전이 제멋대로일 때 | troubleshoot | `screen-timeout-rotation` |
| 삼성케어+ 가입, 실제 수리비와 비교하면 | buying | `care-plus-vs-repair` |
| 알뜰폰 자급제 조합, 24개월 총액 | buying | `mvno-total-cost` |

## 2. audi-q9 — 아우디 Q9 (13개)

신차라 정보 자체가 희소하다 — 이 허브는 **경쟁이 가장 얕다**. 스펙 나열 대신 소유 이후 질문을 잡는다.

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 출고 대기 기간과 내 순번 확인하는 법 | howto | `delivery-wait` |
| ★ 트렁크 실측 — 유모차·골프백·캠핑 짐 기준 | howto | `cargo-space` |
| ★ 지하주차장 높이·폭 제한에 걸리는지 확인 | howto | `parking-clearance` |
| 카시트 3개를 실제로 물릴 수 있는 좌석 조합 | howto | `three-car-seats` |
| 순정 내비 업데이트와 스마트폰 미러링 | howto | `navigation-mirroring` |
| 아파트에서 PHEV 충전이 실제로 가능한가 | howto | `home-charging` |
| 겨울철 전기 주행거리가 줄어드는 폭 | troubleshoot | `winter-range` |
| 예상 보험료와 자동차세 계산 | buying | `insurance-and-tax` |
| 법인차 연두색 번호판 대상인지 판단 | buying | `corporate-plate` |
| 전용 타이어 규격과 교체 비용 | buying | `tire-cost` |
| 무상보증 연장 패키지, 살 만한가 | buying | `warranty-extension` |
| 3년 뒤 잔가 — 리스 승계와 중고 시세 | compare | `residual-value` |
| Q9 vs 볼보 EX90 vs 디펜더, 다른 선택지 | compare | `rival-alternatives` |

## 3. excel — 엑셀 (13개)

검색 수요가 가장 크고 의도가 가장 뾰족한 허브. **오류 코드·작업 단위 질의**가 핵심이다.

| 제목 | 포맷 | slug |
|---|---|---|
| ★ CSV 한글이 깨져서 열릴 때 되살리는 법 | troubleshoot | `csv-korean-encoding` |
| ★ 인쇄가 여러 장으로 쪼개질 때 한 장에 맞추기 | troubleshoot | `print-fit-one-page` |
| ★ 날짜가 숫자(45123)로 보일 때 되돌리기 | troubleshoot | `date-serial-number` |
| 시트 보호 비밀번호를 잊었을 때 할 수 있는 것 | troubleshoot | `sheet-password-lost` |
| 매크로가 차단됐다고 뜰 때(신뢰할 수 있는 위치) | troubleshoot | `macro-blocked` |
| 파일 용량이 비정상적으로 클 때 줄이기 | troubleshoot | `file-size-reduce` |
| 24시간이 넘는 시간 합계가 이상할 때 | troubleshoot | `time-over-24h` |
| 공동 편집 충돌과 이전 버전 복구 | troubleshoot | `coauthoring-conflict` |
| 텍스트 나누기로 한 셀에 뭉친 데이터 쪼개기 | howto | `text-to-columns` |
| 드롭다운 목록(데이터 유효성 검사) 만들기 | howto | `dropdown-list` |
| SUMIFS·COUNTIFS로 조건 여러 개 걸기 | howto | `sumifs-countifs` |
| 파워 쿼리로 매달 복사·붙여넣기 없애기 | howto | `power-query-basics` |
| 틀 고정·화면 분할로 큰 표 다루기 | howto | `freeze-panes` |

## 4. youth-monthly-rent — 청년월세 지원 (13개)

정책 허브의 롱테일은 **자격 경계 케이스**다. 공고문이 답하지 않는 질문만 모았다.

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 부모님 집에 전입돼 있으면 신청이 되나 | troubleshoot | `parents-address` |
| ★ 고시원·셰어하우스·오피스텔도 대상인가 | compare | `housing-type` |
| ★ 계약자 명의가 본인이 아닐 때 | troubleshoot | `contract-under-other-name` |
| 무상거주·전대차 계약의 인정 범위 | troubleshoot | `sublease-free-housing` |
| 군 복무·해외 체류 기간은 어떻게 처리되나 | troubleshoot | `military-overseas` |
| 부모 소득(원가구) 산정에서 빠지는 경우 | troubleshoot | `parent-income-exception` |
| 이사하면 끊기나 — 계속 받는 절차 | howto | `moving-continuation` |
| 프리랜서·아르바이트 소득 증빙 방법 | howto | `freelancer-income-proof` |
| 지급일과 입금 주기, 언제 들어오나 | howto | `payment-schedule` |
| 탈락 후 재신청, 언제부터 가능한가 | howto | `reapply-after-rejection` |
| 기숙사·사택 거주자의 예외 규정 | compare | `dormitory-company-housing` |
| 대학원생·휴학생 자격 판단 | compare | `student-status` |
| 지자체별 추가 지원과 신청 창구 정리 | compare | `local-programs` |

## 5. galaxy-z-flip8 — 갤럭시 Z 플립8 (12개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 세워두고 타임랩스·장노출 찍는 각도 설정 | howto | `flexcam-tripod` |
| ★ 화면 보호 필름, 붙여도 되는가 | buying | `screen-film-warning` |
| ★ 주머니에서 저절로 펼쳐질 때(힌지 장력) | troubleshoot | `hinge-tension` |
| 통화 녹음 자동 저장 설정 | howto | `call-recording` |
| 커버 화면에서 메신저 답장까지 되게 만들기 | howto | `cover-screen-reply` |
| 셀피가 커버로 찍을 때만 흐릴 때 | troubleshoot | `cover-camera-quality` |
| 방수 등급과 물에 빠뜨렸을 때 순서 | troubleshoot | `water-damage` |
| 워치·버즈 동시 연결이 끊길 때 | troubleshoot | `multi-device-bluetooth` |
| 교통카드 등록과 잔액 오류 | troubleshoot | `transit-card` |
| 배터리 보호 85%와 고속충전, 어느 쪽이 나은가 | compare | `battery-protect-vs-fast-charge` |
| 두께·무게로 케이스 고를 때 확인할 것 | buying | `case-thickness` |
| 알뜰폰 요금제로 옮길 때 확인할 것 | buying | `mvno-plan` |

## 6. ev-subsidy — 전기차 보조금 (12개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 아파트 충전기 설치 동의, 어디서 막히나 | troubleshoot | `apartment-charger-consent` |
| ★ 출고가 지연돼 연말을 넘기면 어떻게 되나 | troubleshoot | `year-end-delay` |
| ★ 지자체 예산 소진 시점 — 언제 신청해야 하나 | howto | `budget-timing` |
| 보조금 신청 후 차종을 바꿀 수 있나 | troubleshoot | `model-change` |
| 전기차 취득세·공채 감면 실제 계산 | howto | `tax-reduction` |
| 배터리 보증과 잔존 성능(SOH) 확인하는 법 | howto | `battery-warranty-soh` |
| 전기 이륜차 보조금 신청 절차 | howto | `electric-motorcycle` |
| 완속·급속 충전요금 계산과 회원카드 선택 | compare | `charging-cost` |
| 개인택시·화물차 보조금은 무엇이 다른가 | compare | `commercial-vehicle` |
| 고속도로 통행료·주차 감면은 어디까지 | compare | `toll-parking-discount` |
| 보조금과 카드 할인·제조사 프로모션 중복 | compare | `promotion-stacking` |
| 중고 전기차 살 때 보조금 이력 확인 | buying | `used-ev-history` |

## 7. galaxy-book5-pro — 갤럭시 북5 프로 (13개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 윈도우 클린 설치 후 삼성 드라이버 되살리기 | howto | `clean-install-drivers` |
| ★ 절전 모드에서 안 깨어날 때 | troubleshoot | `sleep-wake-failure` |
| ★ 소음·발열 잡는 전원 모드 설정 | howto | `power-mode-thermal` |
| 배터리 보호 85% 설정과 상시 전원 사용 | howto | `battery-protect` |
| 멀티 컨트롤로 폰·태블릿과 키보드 공유 | howto | `multi-control` |
| 썬더볼트 독으로 모니터 2대 연결하기 | howto | `thunderbolt-dock-dual` |
| 지문·윈도우 헬로가 인식되지 않을 때 | troubleshoot | `windows-hello` |
| 블루투스 마우스가 끊길 때 | troubleshoot | `bluetooth-drop` |
| 오피스 정품 인증이 풀렸을 때 | troubleshoot | `office-activation` |
| 학생·교직원 할인과 제휴몰, 어디가 싼가 | buying | `student-discount` |
| 리퍼·전시품 구매 시 확인할 것 | buying | `refurbished` |
| 액정 파손 수리비와 보증 범위 | buying | `screen-repair-cost` |
| 외장 SSD·SD카드로 용량 늘리기 | buying | `external-storage` |

## 8. galaxy-s25-ultra — 갤럭시 S25 울트라 (12개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 통화 녹음 자동 저장과 저장 위치 | howto | `call-recording` |
| ★ 알림이 늦게 오거나 아예 안 올 때 | troubleshoot | `delayed-notifications` |
| ★ 사진이 흐리게 나올 때 확인할 설정 | troubleshoot | `blurry-photos` |
| 카메라 어시스턴트로 셔터 지연 줄이기 | howto | `camera-assistant` |
| 보안 폴더 만들고 백업하는 법 | howto | `secure-folder` |
| eSIM으로 번호 두 개 쓰는 설정 | howto | `esim-dual-number` |
| DeX로 모니터에 연결해 쓰기 | howto | `dex-monitor` |
| 배터리 보호 85% 제한, 언제 켜나 | howto | `battery-protect-85` |
| 교통카드 등록과 잔액 오류 | troubleshoot | `transit-card` |
| 무선충전·역무선충전이 안 될 때 | troubleshoot | `wireless-charging` |
| 삼성케어+ 가입, 실제 수리비와 비교하면 | buying | `care-plus-vs-repair` |
| 알뜰폰 자급제 조합, 24개월 총액 | buying | `mvno-total-cost` |

## 9. iphone-17-pro — 아이폰 17 프로 (12개)

**한국 사용자 특유의 질문**(통화 녹음·교통카드)이 이 허브의 롱테일 핵심이다. 영어권 문서가 답하지 못한다.

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 통화 녹음, 한국에서 되는 것과 안 되는 것 | troubleshoot | `call-recording-korea` |
| ★ 교통카드(티머니·캐시비)를 애플페이로 쓸 수 있나 | troubleshoot | `transit-card-korea` |
| ★ 안드로이드에서 메신저 대화 옮기기 | howto | `messenger-transfer` |
| eSIM 전환과 번호 두 개 쓰기 | howto | `esim-dual-number` |
| 단축어로 자주 쓰는 동작 자동화하기 | howto | `shortcuts-automation` |
| 집중 모드로 알림 정리하기 | howto | `focus-mode` |
| 배터리 성능 상태와 충전 한도 80% | howto | `battery-health-limit` |
| 스팸 문자·전화 차단 설정 | howto | `spam-block` |
| iCloud 용량이 부족할 때 정리 순서 | troubleshoot | `icloud-storage` |
| 페이스ID가 자꾸 실패할 때 | troubleshoot | `faceid-failure` |
| 애플케어+와 사설 수리, 총액 비교 | buying | `applecare-vs-repair` |
| 해외판·정품 차이와 국내 AS 가능 여부 | buying | `overseas-model-as` |

## 10. lg-gram-2026 — LG 그램 2026 (13개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 윈도우 클린 설치 후 LG 드라이버 되살리기 | howto | `clean-install-drivers` |
| ★ 배터리 보호 충전 설정은 어디에 있나 | howto | `battery-care-setting` |
| ★ 절전에서 안 깨어날 때 | troubleshoot | `sleep-wake-failure` |
| 그램 링크로 폰과 파일 주고받기 | howto | `gram-link` |
| 팬 소음을 줄이는 전원 설정 | howto | `quiet-power-mode` |
| 지문·얼굴 인식이 안 될 때 | troubleshoot | `biometrics-failure` |
| 화면 밝기가 제멋대로 바뀔 때 | troubleshoot | `auto-brightness` |
| 화면 깜빡임·잔상이 보일 때 | troubleshoot | `screen-flicker` |
| RAM 온보드 여부와 업그레이드 가능 범위 | buying | `ram-upgrade-limit` |
| 액정 파손 수리비와 무상보증 범위 | buying | `screen-repair-cost` |
| 학생·제휴 할인과 사은품, 어디가 싼가 | buying | `student-discount` |
| 그램 프로·2in1과 일반형, 뭘 고를까 | compare | `lineup-compare` |
| 맥북 에어와 비교하면 무엇이 갈리나 | compare | `vs-macbook-air` |

## 11. robot-vacuum-2026 — 로봇청소기 (13개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 직배수·급수 설치, 우리 집에 되나 | howto | `plumbing-install` |
| ★ 야간 예약과 소음 dB — 아랫집 민원 피하기 | howto | `noise-schedule` |
| ★ 2층집에서 층 나눠 매핑하는 법 | howto | `multi-floor-mapping` |
| 스마트싱스·구글홈에 연결하는 순서 | howto | `smart-home-link` |
| 러그·매트에서 걸레를 자동으로 들어올리게 | howto | `carpet-mop-lift` |
| 필터·브러시 세척 주기와 교체 시점 | howto | `maintenance-cycle` |
| 물걸레가 마르지 않아 곰팡이가 필 때 | troubleshoot | `mop-drying` |
| 펌웨어 업데이트 후 지도가 사라졌을 때 | troubleshoot | `firmware-map-loss` |
| 카메라·라이다 영상은 어디로 가나(프라이버시) | troubleshoot | `camera-privacy` |
| 반려동물 배변 회피, 실제로 되는가 | compare | `pet-waste-avoidance` |
| 원룸·좁은 집에서 오히려 불편한 경우 | compare | `small-apartment` |
| 무선청소기와 병행 — 어디까지 대체되나 | compare | `vs-stick-vacuum` |
| 브랜드별 AS 부품값과 수리 기간 | buying | `repair-cost-by-brand` |

## 12. youth-savings-account — 청년 적금·도약계좌 (13개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 매달 얼마 넣는 게 유리한가(기여금 구간) | howto | `contribution-tier` |
| ★ 이직·퇴사로 소득이 끊겼을 때 | troubleshoot | `job-change` |
| ★ 만기 5년이 부담될 때 쓸 수 있는 제도 | compare | `maturity-burden` |
| 만기 수령액 시뮬레이션 해보기 | howto | `payout-simulation` |
| 가입 후 앱에서 확인해야 할 항목 | howto | `account-checklist` |
| 자동이체 실패가 반복될 때 | troubleshoot | `auto-transfer-failure` |
| 결혼·출산으로 가구 기준이 바뀔 때 | troubleshoot | `household-change` |
| 부분 인출·담보대출이 되는지 | troubleshoot | `partial-withdrawal` |
| 군 장병·사회초년생의 가입 조건 | compare | `soldier-first-job` |
| 은행별 우대금리 조건 비교 | compare | `bank-rate-compare` |
| 청년주택드림청약과 함께 굴리기 | compare | `housing-subscription` |
| ISA·연금저축과 우선순위 정하기 | compare | `isa-pension-priority` |
| 소득 기준을 다시 확인해야 하는 시점 | howto | `income-recheck` |

## 13. galaxy-buds4 — 갤럭시 버즈4 (12개)

| 제목 | 포맷 | slug |
|---|---|---|
| ★ 한쪽을 잃어버렸을 때 한쪽만 사는 법 | buying | `single-bud-replacement` |
| ★ 세탁기에 돌렸을 때 살릴 수 있나 | troubleshoot | `washed-in-laundry` |
| ★ PC·노트북에 연결하고 마이크까지 쓰는 법 | howto | `pc-connect-mic` |
| TV·태블릿 연결에서 소리 지연 줄이기 | howto | `latency-tv-tablet` |
| 게임 모드로 입 모양과 소리 맞추기 | howto | `game-mode-latency` |
| 이어팁 사이즈 테스트로 ANC 살리기 | howto | `eartip-fit-test` |
| 분실했을 때 찾기 기능 설정 | howto | `find-my-buds` |
| 소리가 작아졌을 때 청소 순서 | troubleshoot | `volume-drop-cleaning` |
| 펌웨어 업데이트가 멈출 때 | troubleshoot | `firmware-stuck` |
| 러닝 중 자꾸 빠질 때 | troubleshoot | `running-fit` |
| 배터리가 줄었을 때 교체 비용과 조건 | buying | `battery-replacement` |
| 아이폰·윈도우에서 쓸 때 남는 기능 | compare | `cross-platform-limits` |

---

## 착수 순서 제안

1. **excel · youth-monthly-rent · ev-subsidy** — 검색 수요가 계절·기기 출시와 무관하게 상시이고,
   기존 문서가 총론에 몰려 있어 각론이 통째로 비어 있다.
2. **iphone-17-pro · galaxy-s25-ultra · galaxy-z-fold8** — 한국 특유 질문(통화 녹음·교통카드)은
   영어권 문서가 답하지 못한다. 국내 검색에서 경쟁이 얕다.
3. **audi-q9** — 신차라 문서 자체가 희소하다. 지금 선점하면 출고 시작 후 유입을 통째로 받는다.

## 주의

- 표의 제목은 **질의 형태**이지 사실 주장이 아니다. 본문 생성 시 기능·수치가 실제로 존재하는지
  확인하고, 확인되지 않으면 그 항목을 비운다(생성 프롬프트의 기존 규칙 그대로).
- `★`는 허브당 상위 3개 — 먼저 넣을 것.
