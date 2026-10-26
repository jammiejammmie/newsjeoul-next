import { HUMIDIFIER_20261027 } from './humidifier-20261027'
import { FLIP_WIDGET_20261026 } from './flip-widget-20261026'
import { BUDS_RECOVERY_20261026 } from './buds-recovery-20261026'
import { ENERGY_VOUCHER_20261026 } from './energy-voucher-20261026'
import { HOT_ELECTRONICS_20261026 } from './hot-electronics-20261026'
import { REFRESH_20261026 } from './refresh-20261026'
import { PRACTICAL_GUIDES } from './practical-guides'
import type { MetadataRoute } from 'next'
import type { HubDocument } from '../index'
import type { HubAffiliateSlot } from '../types'

// Versioned, source-checked content. No generation request, credential or DB write.
export const EDITORIAL_DOCUMENTS: Record<string, HubDocument[]> = {
  'galaxy-buds4': [{
    slug: 'single-bud-replacement',
    format: 'buying',
    title: '한쪽을 잃어버렸을 때 한쪽만 사는 법',
    lead: '버즈4 한쪽을 잃었다고 새 세트부터 주문할 필요는 없습니다. 먼저 단품 견적을 받고, 남은 이어버드와 충전 케이스 상태까지 비교하세요.',
    generatedBy: 'ai-source-checked',
    updatedAt: '2026-10-26T00:00:00+09:00',
    affiliateSlotIds: ['buds4-body'],
    sourceNote: '삼성전자서비스 「이어버드 한쪽 구매 후 커플링 설정방법」(2026-04-03), https://www.samsungsvc.co.kr/solution/25084 — 2026-10-26 확인. 공식 안내를 바탕으로 AI가 작성했습니다. 직접 구매·사용한 후기가 아닙니다. 단품 가격·재고는 확인되지 않아 기재하지 않았습니다.',
    blocks: [
      { heading: '먼저 모델과 잃어버린 방향을 적으세요', content: '센터에 문의하기 전에 제품명, 모델 번호, 잃어버린 쪽(L/R)을 확인하세요. “버즈 한쪽”만으로는 필요한 부품을 특정하기 어렵습니다. 남은 이어버드와 충전 케이스도 준비해 두세요.\n\n문의할 항목은 단품 판매 가능 여부, 해당 방향의 재고, 총 구매 비용, 방문 시 커플링 지원 여부입니다. 이 글에는 실시간 재고나 확정 단품 가격이 없습니다. 방문 전에 확인하면 헛걸음을 줄일 수 있습니다.' },
      { heading: '단품과 새 세트, 같은 조건으로 비교하세요', content: '남은 이어버드와 케이스가 정상이고 단품 총비용이 새 세트보다 충분히 낮다면, 한쪽만 보충하는 선택부터 검토할 만합니다. 반대로 남은 쪽도 사용 시간이 짧아졌거나 케이스까지 문제가 있다면, 한쪽 가격만 비교하면 추가 지출을 놓칠 수 있습니다.\n\n- 단품: 해당 모델·방향의 구매 비용과 필요한 추가 조치\n- 새 세트: 배송비·실제 적용 가능한 할인까지 반영한 결제금액\n- 공통: 판매 구성, 반품 조건, 보증 적용 조건\n\n일정 금액 이상이면 무조건 새로 사라는 기준은 두지 않았습니다. 아래 제품 링크는 새 세트의 판매가와 구성을 비교하는 용도이며, 서비스센터 단품 구매 링크가 아닙니다. 보호용 케이스나 이어팁을 사도 없어진 이어버드가 대체되지는 않습니다.' },
      { heading: '새 한쪽을 받았다면: 버즈4 커플링 순서', content: '삼성전자서비스는 버즈4·버즈4 프로의 경우 새 이어버드와 기존 이어버드를 케이스의 좌우 자리에 넣고, 뚜껑을 연 상태에서 뒷면 연결 버튼을 7초 동안 누르도록 안내합니다. 파란 표시등이 깜박인 뒤 꺼지면 완료입니다.\n\n빨간 표시등이 깜박이면 이어버드를 꺼냈다가 다시 넣고 같은 절차를 진행합니다. 모델이 다른 버즈에 이 버튼 위치와 절차를 그대로 적용하지 마세요. 계속 실패하면 센터에 확인하세요.' },
      { heading: '구매 전 마지막 확인', content: '주문 화면의 상품명이 “버즈4”라고 해도 본체 세트인지, 한쪽 단품인지, 보호용 액세서리인지 구성표를 읽으세요. 중고 단품은 모델·방향·상태와 연결 실패 시 반품 조건을 확인하기 전에는 가격만으로 결정하지 않는 편이 좋습니다.\n\n단품 견적과 새 세트 결제금액을 메모해 두면, 같은 문제를 겪은 가족과도 비교 기준을 공유할 수 있습니다.' },
      { heading: '자주 묻는 질문', content: 'Q. 한쪽만 다시 구매한 뒤 연결할 수 있나요?\nA. 삼성전자서비스는 새 이어버드와 기존 이어버드를 연결하는 커플링 절차를 안내합니다. 모델과 방향에 맞는 단품 구매 가능 여부는 센터에 먼저 확인하세요.\n\nQ. 아래 쿠팡 링크에서 한쪽 단품을 파나요?\nA. 아래 링크는 기존에 등록된 버즈4 제품 비교 링크입니다. 단품 판매를 확인한 링크가 아니므로, 구성과 최종 결제금액을 반드시 확인하세요.' },
    ],
  }],
}

for (const [hub, docs] of Object.entries(PRACTICAL_GUIDES)) {
  EDITORIAL_DOCUMENTS[hub] = [...(EDITORIAL_DOCUMENTS[hub] ?? []), ...docs]
}

for (const [hub, docs] of [...Object.entries(REFRESH_20261026), ...Object.entries(HOT_ELECTRONICS_20261026), ...Object.entries(ENERGY_VOUCHER_20261026), ...Object.entries(BUDS_RECOVERY_20261026), ...Object.entries(FLIP_WIDGET_20261026), ...Object.entries(HUMIDIFIER_20261027)]) {
  const merged = new Map((EDITORIAL_DOCUMENTS[hub] ?? []).map(doc => [doc.slug, doc]))
  for (const doc of docs) merged.set(doc.slug, doc)
  EDITORIAL_DOCUMENTS[hub] = [...merged.values()]
}

export function mergeEditorialDocuments(hubSlug: string, database: HubDocument[]): HubDocument[] {
  const merged = new Map(database.map(doc => [doc.slug, doc]))
  for (const doc of EDITORIAL_DOCUMENTS[hubSlug] ?? []) merged.set(doc.slug, doc)
  return [...merged.values()]
}

export function editorialSlots(document: HubDocument, slots: HubAffiliateSlot[]): HubAffiliateSlot[] {
  return slots.filter(slot => slot.targetUrl && document.affiliateSlotIds?.includes(slot.slot))
}

export function mergeEditorialSitemap(existing: MetadataRoute.Sitemap): MetadataRoute.Sitemap {
  const merged = new Map(existing.map(entry => [entry.url, entry]))
  for (const [hub, docs] of Object.entries(EDITORIAL_DOCUMENTS)) {
    for (const doc of docs) {
      const url = `https://newsjeoul.co.kr/hub/${hub}/${doc.slug}`
      merged.set(url, { url, lastModified: doc.updatedAt, changeFrequency: 'monthly', priority: 0.7 })
    }
  }
  return [...merged.values()]
}
