// 토픽 허브 콘텐츠 스키마 — 노차장 개편 설계서 §3(4a 템플릿) 기준.
//
// 이 타입이 곧 "허브 하나를 만들려면 무엇을 채워야 하는가"의 정의다.
// 설계서 §3.3이 에버그린 4포맷을 전 카테고리 공통 골격으로 못 박았으므로,
// evergreen은 4개 키를 가진 고정 구조로 둔다 — 제품/제도/프로그램/의류가 같은 틀을 쓴다.
//
// 2026-08-05 일반화: 파일럿 5개가 제품(폴드8)·신차(Q9)·제도(청년월세·전기차 보조금)·
// 프로그램(엑셀) 네 유형으로 갈리면서, 유형별로 달라지는 지점을 타입에 명시했다.
//   · kind            → 구조화 데이터 타입과 섹션 문구가 갈린다
//   · affiliatePolicy → 신차·정책은 제휴 링크 금지다(§8.3). 코드가 막아야 한다
//   · trend           → 제품은 가격 추이가 있지만 프로그램엔 없다. 선택 항목
//   · verdict         → 추이가 없어도 에디터 판단 1문장은 항상 있어야 한다(§4.1-2)

/** 허브가 다루는 실체의 종류. 구조화 데이터 타입과 문구를 결정한다. */
export type HubKind = 'product' | 'car' | 'policy' | 'program'

/** 허브 헤더의 핵심 수치 4칸. 값이 바뀌는 것을 전면에 세우는 게 이 템플릿의 핵심이다(§4.1-1). */
export type HubStat = {
  label: string
  value: string
  /** 값 아래 보조 문구. 변동 방향·조건 등. */
  note?: string
  /** true면 강조색으로 표시 — D-day, 마감 임박 같은 "지금 봐야 하는" 값에만 쓴다. */
  emphasis?: boolean
}

/** 에버그린 4포맷 중 한 칸에 들어가는 문서 링크. */
export type HubGuide = {
  title: string
  /** 아직 문서를 쓰지 않았으면 비운다 — 링크 없이 제목만 노출된다(없는 URL로 보내지 않는다). */
  href?: string
  /** 'YYYY-MM-DD'. 있으면 "· M/D 갱신"으로 표시. */
  updatedAt?: string
  /** 표·계산기 같은 도구형 문서 배지. */
  badge?: '표' | '계산' | '도구'
}

/**
 * 설계서 §3.3 에버그린 4포맷. 키 이름은 카테고리와 무관하게 고정하고 라벨만 바꾼다:
 *   howto        제품 기능설정법 / 제도 신청서 작성법 / 프로그램 단축키·기능
 *   troubleshoot 제품 고장대처   / 제도 탈락사유별 대처 / 프로그램 오류코드별 해결
 *   compare      제품 A vs B     / 제도 유사제도 중복수급 / 프로그램 대체툴 비교
 *   buying       제품 물량오픈준비 / 제도 서류 체크리스트 / 프로그램 요금제 선택
 */
export type HubEvergreen = {
  howto: { label: string; items: HubGuide[] }
  troubleshoot: { label: string; items: HubGuide[] }
  compare: { label: string; items: HubGuide[] }
  buying: { label: string; items: HubGuide[] }
}

export type HubFaq = { q: string; a: string }

/**
 * 허브에 딸린 도구(계산기·비교표) 링크.
 * 설계서 §4.1-3이 계산기를 "AI 요약에 먹히지 않는" 3종 중 하나로 꼽는다 — 요약할 수 없는 것은
 * 사용자 입력을 받아 계산하는 상호작용이다.
 */
export type HubTool = {
  title: string
  href: string
  /** 무엇을 계산해 주는지 한 줄. 클릭 전에 알 수 있어야 한다. */
  description: string
}

export type HubTrendPoint = { date: string; value: number }

/**
 * 수치 추이 — 제품은 가격, 제도는 지원 단가처럼 유형마다 다르고, 프로그램처럼 추이가
 * 의미 없는 경우엔 아예 없다(선택 항목). 축 라벨을 설정으로 받는 이유가 그것이다.
 */
export type HubTrend = {
  /** 섹션 제목. 예: '가격 추이', '보조금 단가 추이' */
  title: string
  /** 무엇의 값인지. 예: '자급제 512GB', '국고보조금 상한' */
  label: string
  /** 값 뒤에 붙는 단위. 예: '만원' */
  unit: string
  /** 수집 주기 안내. 없으면 표시하지 않는다. */
  cadence?: string
  points: HubTrendPoint[]
}

/**
 * 제휴 링크 슬롯 — 설계서 §8.1 "상품 1개 = 링크 슬롯 1개".
 * 본문에 네트워크 URL을 직접 박지 않는다. 페이지는 /go/{slot}만 가리키고,
 * 실제 목적지는 이 설정에서 갈아끼운다(네트워크를 바꿔도 본문 수정 0).
 */
export type HubAffiliateSlot = {
  /** /go/{slot} 경로에 쓰이는 식별자. 영문 소문자·숫자·하이픈만. 전 허브에서 유일해야 한다. */
  slot: string
  label: string
  network: 'coupang'
  /**
   * 실제 제휴 URL. 비어 있으면 링크를 렌더링하지 않고 /go/{slot}도 404를 반환한다.
   * 검증되지 않은 추적 URL을 임의로 만들어 넣지 않기 위해 의도적으로 비워둔 상태로 시작한다.
   */
  targetUrl?: string
}

/**
 * 제휴 정책 — 설계서 §8.3이 카테고리별로 못 박았다.
 *   신차       : 없음 · 링크 금지 (판매 채널이 없다)
 *   정책·지원금 : 없음 · 링크 금지 (신뢰 훼손. 링크 금지를 지키는 것이 오히려 브랜드가 된다 §9.2-E)
 *
 * 타입을 유니온으로 둔 이유: forbidden인 허브에 슬롯을 넣는 것 자체가 불가능해야 한다.
 * 문서에만 적어두면 나중에 누군가 링크를 넣는다 — 그건 되돌리기 어려운 신뢰 손상이다.
 */
export type HubAffiliatePolicy =
  | { allowed: true; slots: HubAffiliateSlot[] }
  | { allowed: false; reason: string }

export type HubEditor = {
  name: string
  slug?: string
  beat: string
  years?: string
  /** 실사용·검증 원칙 선언(§5.1). E-E-A-T 신호의 핵심이라 필수로 둔다. */
  statement: string
  hubCount?: number
  articleCount?: number
}

export type HubSpec = { label: string; value: string }
export type HubTimelineEntry = { date: string; text: string }
export type HubRelated = { title: string; slug: string; guideCount?: number }

export type HubConfig = {
  slug: string
  kind: HubKind
  /** H1. 연도를 넣지 않는다 — URL과 마찬가지로 H1의 연도만 매년 교체한다(§6.1). */
  title: string
  breadcrumb: string[]
  category: string
  /** 검색 결과·OG에 쓰이는 한 문단 정의문. 이 페이지가 무엇을 모아둔 곳인지 먼저 말한다. */
  definition: string
  /** 헤더 상단의 추적 상태 문구. */
  trackingNote: string
  stats: HubStat[]

  /** 갱신 메타 폴백 — hubs 테이블이 없거나 조회 실패 시 이 값을 쓴다. */
  createdAt: string
  updatedAtFallback: string
  updateCountFallback: number

  /** 뉴스 섹션을 채울 기사 제목 검색어. 실제 articles 테이블을 조회한다. */
  newsKeywords: string[]
  /**
   * 오탐 제외어. 짧은 키워드는 부분매칭으로 엉뚱한 기사를 끌어온다 —
   * 실측: '엑셀'이 '큐엑셀(양자 시뮬레이터)'을 잡았다. 제목에 이 말이 있으면 버린다.
   */
  newsExclude?: string[]

  /** 수치 추이. 없으면 섹션과 목차 항목을 함께 숨긴다. */
  trend?: HubTrend

  /**
   * 이 허브에 딸린 계산기·비교표 도구. 없으면 섹션을 숨긴다.
   *
   * 왜 설정으로 받는가: 도구는 앞으로 허브마다 늘어난다(청년월세 지원금 계산, 자동차 취등록세 등).
   * 허브 템플릿에 특정 도구를 박으면 허브가 늘 때마다 템플릿을 고쳐야 한다.
   * 여기에 링크만 선언하면 템플릿은 그대로 두고 설정만 추가하면 된다.
   */
  tools?: HubTool[]
  /** 에디터 판단 1문장(§3.2). 추이가 없어도 항상 있어야 한다 — 없으면 AI 요약에 먹힌다(§4.1-2). */
  verdict: string

  evergreen: HubEvergreen
  /** 제품은 스펙표, 제도는 지원 조건표. 라벨/값 구조는 같다. */
  specsTitle: string
  specs: HubSpec[]
  faq: HubFaq[]
  timelineTitle: string
  timeline: HubTimelineEntry[]

  affiliate: HubAffiliatePolicy
  editor: HubEditor
  related: HubRelated[]
  tags: string[]

  /** 구조화 데이터 보강 필드. kind에 따라 쓰이는 항목이 다르다. */
  schema: {
    /** product·car */
    brand?: string
    price?: number
    currency?: 'KRW'
    releaseDate?: string
    /** policy — 제공 기관(GovernmentService.provider) */
    provider?: string
    /** program — SoftwareApplication */
    applicationCategory?: string
    operatingSystem?: string
  }
}
