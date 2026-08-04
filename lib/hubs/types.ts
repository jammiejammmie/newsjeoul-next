// 토픽 허브 콘텐츠 스키마 — 노차장 개편 설계서 §3(4a 템플릿) 기준.
//
// 이 타입이 곧 "허브 하나를 만들려면 무엇을 채워야 하는가"의 정의다.
// 설계서 §3.3이 에버그린 4포맷을 전 카테고리 공통 골격으로 못 박았으므로,
// evergreen은 4개 키를 가진 고정 구조로 둔다 — 제품/제도/프로그램/의류가 같은 틀을 쓴다.
//
// 왜 DB가 아니라 코드인가는 supabase/hubs_migration.sql 상단 주석 참고.

/** 허브 헤더의 핵심 수치 4칸. 값이 바뀌는 것을 전면에 세우는 게 이 템플릿의 핵심이다(§4.1-1). */
export type HubStat = {
  label: string
  value: string
  /** 값 아래 보조 문구. 변동 방향·조건 등. */
  note?: string
  /** true면 강조색으로 표시 — D-day, 역대 최단 같은 "지금 봐야 하는" 값에만 쓴다. */
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

/** 설계서 §3.3 에버그린 4포맷. 키 이름은 카테고리와 무관하게 고정, 라벨만 카테고리별로 바뀐다. */
export type HubEvergreen = {
  howto: { label: string; items: HubGuide[] }
  troubleshoot: { label: string; items: HubGuide[] }
  compare: { label: string; items: HubGuide[] }
  buying: { label: string; items: HubGuide[] }
}

export type HubFaq = { q: string; a: string }

/** 가격 추이 한 점. 수집 파이프라인이 붙기 전까지는 설정값을 쓴다(§10.5의 정형 데이터 분리는 후속). */
export type HubPricePoint = { date: string; price: number }

/**
 * 제휴 링크 슬롯 — 설계서 §8.1 "상품 1개 = 링크 슬롯 1개".
 * 본문에 네트워크 URL을 직접 박지 않는다. 페이지는 /go/{slot}만 가리키고,
 * 실제 목적지는 이 설정에서 갈아끼운다(네트워크를 바꿔도 본문 수정 0).
 */
export type HubAffiliateSlot = {
  /** /go/{slot} 경로에 쓰이는 식별자. 영문 소문자·숫자·하이픈만. */
  slot: string
  label: string
  /** 어느 네트워크인지 — 표기 문구가 네트워크별로 달라야 한다(§8.1). */
  network: 'coupang'
  /**
   * 실제 제휴 URL. 비어 있으면 링크를 렌더링하지 않고 /go/{slot}도 404를 반환한다.
   * 검증되지 않은 추적 URL을 임의로 만들어 넣지 않기 위해 의도적으로 비워둔 상태로 시작한다.
   */
  targetUrl?: string
}

export type HubEditor = {
  name: string
  slug?: string
  beat: string
  /** 연차 등 자격 표시. Person 구조화 데이터의 jobTitle로도 쓰인다. */
  years?: string
  /** 실사용 원칙 선언(§5.1). E-E-A-T 신호의 핵심이라 필수로 둔다. */
  statement: string
  hubCount?: number
  articleCount?: number
}

export type HubSpec = { label: string; value: string }

export type HubTimelineEntry = { date: string; text: string }

export type HubRelated = { title: string; slug: string; guideCount?: number }

export type HubConfig = {
  slug: string
  /** H1. 연도를 넣지 않는다 — URL과 마찬가지로 H1의 연도만 매년 교체한다(§6.1). */
  title: string
  /** 브레드크럼 경로(홈 제외). */
  breadcrumb: string[]
  category: string
  /** 검색 결과·OG에 쓰이는 한 문단 정의문. 이 페이지가 무엇을 모아둔 곳인지 먼저 말한다. */
  definition: string
  /** 헤더 상단의 추적 상태 문구. */
  trackingNote: string
  stats: HubStat[]
  /** 갱신 메타 폴백 — hubs 테이블이 없거나 조회 실패 시 이 값을 쓴다. */
  createdAt: string
  updateCountFallback: number
  /** 뉴스 섹션을 채울 기사 제목 검색어. 실제 articles 테이블을 조회한다. */
  newsKeywords: string[]
  price: {
    label: string
    unit: string
    points: HubPricePoint[]
    /** 설계서 §3.2의 "에디터 판단 1문장" — 수치만 보여주고 판단을 빼면 AI 요약에 먹힌다(§4.1-2). */
    verdict: string
  }
  evergreen: HubEvergreen
  specs: HubSpec[]
  faq: HubFaq[]
  timeline: HubTimelineEntry[]
  affiliate: HubAffiliateSlot[]
  editor: HubEditor
  related: HubRelated[]
  tags: string[]
  /** Product 구조화 데이터용. */
  product: {
    brand: string
    /** 대표 가격(원). stats/price와 별개로 스키마에 넣을 값. */
    price: number
    currency: 'KRW'
    releaseDate?: string
  }
}
