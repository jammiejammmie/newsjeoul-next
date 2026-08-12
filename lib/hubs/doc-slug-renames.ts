// 허브 문서 slug 교체 대장 — 2026-08-12.
//
// 무엇을 고치는가: 문서 URL이 '8-3-dw76cz'·'howto-ee02f'처럼 읽을 수 없는 문자열이었다.
// 생성 함수의 docSlug()가 한글 제목에서 ASCII만 남기고 해시를 붙였기 때문이다(그 함수도
// 함께 고쳐 앞으로는 config의 slug를 쓴다 — 여기만 고치면 다음 생성 때 재발한다).
//
// 왜 config가 아니라 별도 대장인가: config의 가이드 제목과 DB에 실재하는 문서가 이미
// 어긋나 있다. 예를 들어 '4차 물량 오픈, 실패 안 하는 준비 순서'는 확인되지 않은 물량
// 차수를 전제해 config에서는 제목이 교체됐지만 문서는 DB에 남아 있다. config만 기준으로
// 삼으면 그런 고아 문서의 URL은 영영 정리되지 않는다. 실재하는 문서를 기준으로 적는다.
//
// 이 대장은 두 곳이 함께 쓴다 — 어긋나면 링크가 죽으므로 정본을 하나로 둔다:
//   · app/hub/[slug]/[doc]/page.tsx        구 URL로 들어온 요청을 301로 넘긴다
//   · netlify/functions/rename-hub-doc-slugs.js  DB의 hub_documents.slug를 실제로 바꾼다
//
// ★ 한 번 옮긴 항목은 지우지 않는다. 지우는 순간 옛 URL이 404가 되고, 그때까지 쌓인
//   색인과 외부 링크가 통째로 끊긴다. 대장은 길어지는 게 정상이다.

export type DocSlugRename = {
  hub: string
  /** 옛 slug — 이미 색인·공유된 URL이다. */
  from: string
  /** 새 slug — 사람이 읽을 수 있는 키워드형. */
  to: string
  /** 어느 문서인지 사람이 알아보기 위한 기록. 코드는 쓰지 않는다. */
  title: string
  /**
   * 이름을 바꾼 것이 아니라 **다른 문서로 합친 것**(2026-08-12 추가).
   *
   * 차이가 중요하다: 보통 항목은 문서 하나가 새 URL로 이사한 것이라 DB의 slug를 바꾸면 되지만,
   * 병합은 목적지 문서가 이미 따로 존재하고 출발지 문서는 **없애야 하는 중복**이다. slug를
   * 바꾸려 들면 unique(hub_slug, slug)에 걸리고, 그대로 두면 같은 주제 페이지가 둘 남아
   * 서로 순위를 갉아먹는다. rename 함수는 이 표시를 보고 옮기는 대신 지운다.
   *
   * 리다이렉트 동작은 보통 항목과 똑같다 — 옛 URL은 계속 목적지로 넘어간다.
   */
  merged?: true
}

export const DOC_SLUG_RENAMES: DocSlugRename[] = [
  // ── 갤럭시 Z 폴드8 ──────────────────────────────────────────────
  // '폴드8 멀티윈도우 3분할 설정하는 법'(8-3-dw76cz)은 **일부러 두었다**.
  // 노출 337·클릭 40으로 이 허브에서 유일하게 검색 성과가 나는 페이지다. URL을 바꾸면
  // 301을 걸어도 순위가 재평가된다 — 성과가 확인된 URL은 건드리지 않는 편이 낫다.
  // ── 멀티태스킹 3중 중복 정리(2026-08-12) ────────────────────────
  // '화면분할 방법'·'멀티 앱 설정법'·'멀티태스킹 완전 정복' 세 문서를 같은 날 만들었는데,
  // 실제로 생성해 보니 셋이 앱 페어·분할 절차를 그대로 반복했다. 문서 범위를 코드로 못 박고
  // (HubGuide.intent) 두 번 재생성했지만 결과가 같았다 — 셋은 한 페이지의 다른 이름이라
  // 모델에게 아무리 경계를 줘도 같은 글로 수렴한다. 기존 '3분할 설정하는 법'까지 더하면
  // 네 페이지가 한 키워드를 나눠 갖는 꼴이라, '멀티태스킹 완전 정복' 하나로 합친다.
  { hub: 'galaxy-z-fold8', from: 'screen-split-guide', to: 'multitasking-guide', title: '폴드8 화면분할 방법', merged: true },
  { hub: 'galaxy-z-fold8', from: 'multi-app-setup', to: 'multitasking-guide', title: '폴드8 멀티 앱 설정법', merged: true },

  { hub: 'galaxy-z-fold8', from: 's-1pvbn7', to: 'note-apps-without-spen', title: 'S펜 없이 필기 앱 쓰는 최적 조합' },
  { hub: 'galaxy-z-fold8', from: '7-oga4ih', to: 'battery-all-day', title: '배터리 하루 버티게 만드는 설정 7가지' },
  { hub: 'galaxy-z-fold8', from: 'howto-ee02f', to: 'data-transfer', title: '전작에서 데이터 통째로 옮기는 순서' },
  { hub: 'galaxy-z-fold8', from: 'troubleshoot-x3lbpd', to: 'crease-touch-dead', title: '화면 중앙 주름에 터치가 안 될 때' },
  { hub: 'galaxy-z-fold8', from: '3-1ll9gm', to: 'wireless-charging-drops', title: '무선 충전이 갑자기 끊기는 3가지 원인' },
  { hub: 'galaxy-z-fold8', from: 'troubleshoot-1tthrs', to: 'app-crash-folded', title: '앱이 접힌 화면에서 강제 종료될 때' },
  { hub: 'galaxy-z-fold8', from: 'a-s-vpyx9t', to: 'self-check-before-service', title: 'A/S 접수 전에 확인할 자가진단 순서' },
  { hub: 'galaxy-z-fold8', from: '8-vs-7-fypixi', to: 'fold8-vs-fold7', title: '폴드8 vs 폴드7, 더 낼 가치가 있나' },
  { hub: 'galaxy-z-fold8', from: '3-1ok3f6', to: 'foldable-spec-table', title: '폴더블 3사 스펙 비교표' },
  { hub: 'galaxy-z-fold8', from: '3-1odmi2', to: 'carrier-price-compare', title: '통신사 3사 실구매가 계산기' },
  { hub: 'galaxy-z-fold8', from: 'compare-1wn241', to: 'resale-vs-tradein', title: '중고 시세와 보상판매, 뭐가 이득인가' },
  { hub: 'galaxy-z-fold8', from: '4-av68q5', to: 'restock-checklist', title: '4차 물량 오픈, 실패 안 하는 준비 순서' },
  { hub: 'galaxy-z-fold8', from: 'vs-24-1pg93d', to: 'subsidy-vs-contract', title: '지원금 vs 선택약정, 24개월 총액 비교' },
  { hub: 'galaxy-z-fold8', from: 'buying-2w2gdu', to: 'case-and-film-picks', title: '케이스·필름 실제로 쓸 만한 것만' },
  { hub: 'galaxy-z-fold8', from: '8-kzn4xb', to: 'first-day-setup', title: '개통 첫날 해두면 편한 8가지' },

  // ── 갤럭시 Z 플립8 ──────────────────────────────────────────────
  // from이 폴드8과 겹치는 항목들(7-oga4ih 등)은 제목이 같아 해시도 같아진 것이다.
  // 허브 경로가 달라 URL은 충돌하지 않는다.
  { hub: 'galaxy-z-flip8', from: 'howto-184i5s', to: 'cover-screen-apps', title: '커버 화면에서 앱 전체를 실행하는 설정' },
  { hub: 'galaxy-z-flip8', from: 'howto-1xqgwl', to: 'flex-mode-apps', title: '플렉스 모드에서 쓸 만한 앱과 각도 조합' },
  { hub: 'galaxy-z-flip8', from: '7-oga4ih', to: 'battery-all-day', title: '배터리 하루 버티게 만드는 설정 7가지' },
  { hub: 'galaxy-z-flip8', from: 'howto-ee02f', to: 'data-transfer', title: '전작에서 데이터 통째로 옮기는 순서' },
  { hub: 'galaxy-z-flip8', from: 'troubleshoot-b5qkda', to: 'crease-touch-lag', title: '접힌 부분 터치가 늦게 먹을 때 확인할 것' },
  { hub: 'galaxy-z-flip8', from: '3-1ll9gm', to: 'wireless-charging-drops', title: '무선 충전이 갑자기 끊기는 3가지 원인' },
  { hub: 'galaxy-z-flip8', from: 'troubleshoot-lc49ra', to: 'cover-widget-missing', title: '커버 화면 위젯이 사라졌을 때' },
  { hub: 'galaxy-z-flip8', from: 'a-s-vpyx9t', to: 'self-check-before-service', title: 'A/S 접수 전에 확인할 자가진단 순서' },
  { hub: 'galaxy-z-flip8', from: '8-vs-7-19-8-mgl36s', to: 'flip8-vs-flip7', title: '플립8 vs 플립7, 19.8만원 더 낼 가치가 있나' },
  { hub: 'galaxy-z-flip8', from: '8-vs-8-xnn6jo', to: 'flip8-vs-fold8', title: '플립8 vs 폴드8, 무엇을 기준으로 고를까' },
  { hub: 'galaxy-z-flip8', from: 'compare-160jxn', to: 'cover-screen-size-table', title: '폴더블 커버 화면 크기 비교표' },
  { hub: 'galaxy-z-flip8', from: 'compare-1wn241', to: 'resale-vs-tradein', title: '중고 시세와 보상판매, 뭐가 이득인가' },
  { hub: 'galaxy-z-flip8', from: '24-wl8m4y', to: 'unlocked-vs-carrier', title: '자급제와 통신사, 24개월 총액 비교' },
  { hub: 'galaxy-z-flip8', from: 'buying-1ujs5d', to: 'preorder-value', title: '사전예약 혜택이 실제로 남는지 계산하기' },
  { hub: 'galaxy-z-flip8', from: 'buying-2w2gdu', to: 'case-and-film-picks', title: '케이스·필름 실제로 쓸 만한 것만' },

  // ── 갤럭시 버즈4 ────────────────────────────────────────────────
  { hub: 'galaxy-buds4', from: 'anc-gcb6z', to: 'anc-settings', title: '지능형 ANC를 환경별로 길들이는 설정' },
  { hub: 'galaxy-buds4', from: 'howto-sbbxt1', to: 'pinch-controls', title: '핀치 컨트롤 제스처 바꿔 쓰는 법' },
  { hub: 'galaxy-buds4', from: 'howto-6a7fty', to: 'auto-switch', title: '여러 기기 사이에서 자동 전환 설정' },
  { hub: 'galaxy-buds4', from: 'howto-kbxghp', to: 'first-setup', title: '처음 연결하고 해두면 편한 설정' },
  { hub: 'galaxy-buds4', from: 'troubleshoot-1fojak', to: 'one-side-silent', title: '한쪽만 소리가 안 날 때 확인 순서' },
  { hub: 'galaxy-buds4', from: 'troubleshoot-1cdvs5', to: 'connection-drops', title: '자동 연결이 자꾸 끊길 때' },
  { hub: 'galaxy-buds4', from: 'troubleshoot-1bn29p', to: 'case-not-charging', title: '케이스에서 충전이 안 될 때' },
  { hub: 'galaxy-buds4', from: 'troubleshoot-f5t5bp', to: 'call-quality', title: '통화 음질이 나쁘다는 말을 들었다면' },
  { hub: 'galaxy-buds4', from: '4-4-rueemb', to: 'buds4-vs-buds4-pro', title: '버즈4와 버즈4 프로, 무엇이 다른가' },
  { hub: 'galaxy-buds4', from: '4-vs-3-1x4u99', to: 'buds4-vs-buds3', title: '버즈4 vs 버즈3, 넘어갈 만한가' },
  { hub: 'galaxy-buds4', from: 'anc-18w1j9', to: 'anc-comparison-table', title: '무선이어폰 ANC 성능 비교표' },
  { hub: 'galaxy-buds4', from: 'compare-2anw8x', to: 'with-iphone', title: '아이폰과 함께 쓸 때의 제약' },
  { hub: 'galaxy-buds4', from: 'buying-731yaa', to: 'warranty-and-battery', title: '보증과 배터리 교체 조건 확인하기' },
  { hub: 'galaxy-buds4', from: 'buying-s2z9v9', to: 'standard-or-pro', title: '일반형과 프로, 어느 쪽이 맞나' },
  { hub: 'galaxy-buds4', from: 'buying-1wtvly', to: 'eartip-fit', title: '귀 모양에 맞는 이어팁 고르는 법' },
]

/** 구 slug로 들어온 요청의 새 목적지. 없으면 undefined(그대로 404). */
export function findRenamedDocSlug(hub: string, from: string): string | undefined {
  return DOC_SLUG_RENAMES.find((r) => r.hub === hub && r.from === from)?.to
}
