/** Existing search-entry pages: URLs and article text remain untouched. */
export type AffiliatePlacement = { slots: string[]; context: string }
export function searchEntryPlacement(path: string): AffiliatePlacement | null {
  if (path === '/hub/melon-streaming' || path.startsWith('/hub/melon-streaming/')) {
    return { slots: ['buds4-body'], context: '음악 감상 기기 광고입니다. 멜론 이용권 판매나 계정 공유 서비스가 아닙니다.' }
  }
  const placements: Record<string, AffiliatePlacement> = {
    '/hub/youth-savings-account/job-change': {
      slots: ['buds4-body'], context: '본문과 별개인 쇼핑 광고입니다. 계좌 가입·지원금 신청·자격 확인과 무관하며 구매는 필요하지 않습니다.',
    },
    '/topic/yoo-jaesuk-son-jiho-update': {
      slots: ['buds4-body'], context: '기사와 별개인 쇼핑 광고입니다. 기사 속 인물의 사용·추천·협찬을 의미하지 않습니다.',
    },
    '/hub/galaxy-z-flip8/cover-widget-missing': {
      slots: ['flip8-case'], context: '관련 액세서리 광고입니다. 케이스 구매가 위젯 오류를 해결한다는 의미는 아닙니다.',
    },
    '/hub/galaxy-buds4/single-bud-replacement': {
      slots: ['buds4-body'], context: '새 제품과 수리 비용을 비교할 때 참고하세요. 한쪽 유닛 판매 링크가 아닙니다.',
    },
    '/hub/galaxy-s25-ultra/s-1xzjlx': {
      slots: ['s25u-spen'], context: '교체용 펜 비교 광고입니다. 자석 간섭·기능 미지원 여부를 먼저 확인하고, 정확한 지원 모델과 정품·호환품 구분을 판매 페이지에서 확인하세요.',
    },
  }
  return placements[path] ?? null
}
