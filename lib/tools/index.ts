/**
 * 도구(계산기·비교표) 라우트 레지스트리.
 *
 * ★ 왜 레지스트리인가(2026-08-06): /tools/ev-subsidy는 WebApplication·FAQPage 구조화 데이터까지
 *   갖춘 검색 착륙지인데 sitemap.ts의 staticRoutes에 `/`와 `/topic` 둘만 하드코딩돼 있어서
 *   색인 대상에서 빠져 있었다. 도구를 추가할 때마다 sitemap을 같이 고치는 걸 기억해야 하는
 *   구조가 원인이므로, 목록을 한 곳에 두고 sitemap이 이걸 읽게 한다.
 *   (lib/hubs의 ALL_HUBS, lib/content-types의 ROUTABLE_CONTENT_TYPES와 같은 패턴)
 */
export type ToolRoute = {
  /** /tools/{slug} */
  slug: string
  title: string
  /** 내용이 바뀌는 빈도. 계산기는 제도 개정 때만 바뀐다. */
  changeFrequency: 'daily' | 'weekly' | 'monthly'
}

export const TOOL_ROUTES: ToolRoute[] = [
  { slug: 'ev-subsidy', title: '전기차 보조금 계산기', changeFrequency: 'monthly' },
]
