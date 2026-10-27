/** Existing search-entry pages: URLs and article text remain untouched. */
export type AffiliatePlacement = { slots: string[]; context: string; productPrompts?: Record<string, [string, string, string]> }
export function searchEntryPlacement(path: string): AffiliatePlacement | null {
  if (path === '/hub/melon-streaming' || path.startsWith('/hub/melon-streaming/')) {
    return { slots: ['buds4-body'], context: '음악 감상 기기 광고입니다. 멜론 이용권 판매나 계정 공유 서비스가 아닙니다.' }
  }
  const placements: Record<string, AffiliatePlacement> = {
    '/hub/lg-gram-2026/howto-d3qn0e': {
      slots: ['gram26-hub'], context: '직결 연결로 해결되는지 먼저 확인한 뒤, 필요한 영상 출력·PD·USB 조건과 정확히 일치하는지 살펴보는 멀티허브 광고입니다. 특정 그램의 듀얼 모니터 확장을 보장하지 않습니다.',
    },
    '/hub/humidifier/winter-type-cleaning-running-cost': {
      slots:['humidifier-xiaomi','humidifier-cuckoo'], context:'관리 방식과 공간에 맞는 후보를 고른 뒤 본체 모델·구성·보증을 확인하는 광고입니다. 두 상품은 가열식이 아니며, 과거 시험가격을 현재 가격으로 보장하지 않습니다.',
      productPrompts:{
        'humidifier-xiaomi':['국내 모델 본체와 필터 공급을 확인했나요?','CJSJSQ02XYKR 본체·전원 구성·국내 보증을 확인하고, 교체 필터의 별도 비용도 합산하세요.','국내 모델·본체 구성·판매 조건 확인'],
        'humidifier-cuckoo':['작은 공간용 초음파식을 골랐다면?','CH-GS301FW 본체의 정확 모델·구성·현재 결제금액과 서비스 주체를 확인하세요.','본체 모델·구성·결제 조건 확인'],
      },
    },
    '/hub/galaxy-buds4/with-iphone': {
      slots: ['buds4-body'], context: '일반형 버즈4 판매 옵션 확인용 광고입니다. 프로 상품이 아니며, iOS 앱 지원 제한을 해결하는 제품이 아닙니다.',
      productPrompts: { 'buds4-body': ['일반형을 골랐다면, 판매 구성도 맞을까?', '아이폰에서 필요한 기능을 판단한 뒤, SM-R540 일반형의 색상·본체 구성·보증 주체를 확인하세요.', '일반형 색상·구성·판매 조건 보기'] },
    },
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
