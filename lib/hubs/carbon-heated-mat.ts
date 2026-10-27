import type { HubConfig } from './types'

export const carbonHeatedMat: HubConfig = {
  slug: 'carbon-heated-mat', kind: 'product', title: '탄소전기매트', breadcrumb: ['생활가전', '계절가전'], category: '생활가전',
  definition: '탄소전기매트를 표면온도·예열·발열 구역·세탁 조건·소비전력·인증으로 고르는 겨울 구매 가이드입니다.',
  trackingNote: '2026-10-27 공식 자료 확인 · 2025 시험과 현재 판매 조건 구분',
  stats: [{label:'시험 제품',value:'10개',note:'2025 소비자원'},{label:'최대 표면온도',value:'39~64℃',note:'최대 설정 시험'},{label:'예열',value:'12~49분',note:'20→35℃'},{label:'수면 안내',value:'37℃ 이하',note:'저온화상 예방'}],
  createdAt: '2026-10-27', updatedAtFallback: '2026-10-27T09:18:00+09:00', updateCountFallback: 0,
  newsKeywords: ['탄소매트', '전기매트', '카본매트'], newsExclude: ['주식', '탄소중립'],
  verdict: '탄소라는 이름보다 실제 발열 구역·온도편차·세탁 제한·정확한 인증 모델을 먼저 확인하세요.',
  evergreen: {
    howto: {label:'사용·세탁',items:[]}, troubleshoot: {label:'과열·고장',items:[]}, compare: {label:'종류 비교',items:[]},
    buying: {label:'겨울 구매 판단',items:[{title:'탄소매트 고르는 법: 최고온도·예열·세탁·전기료를 한 번에 비교하기',slug:'buying-temperature-wash-cost',badge:'표',updatedAt:'2026-10-27'}]}
  },
  specsTitle: '구매할 때 비교할 항목',
  specs: [{label:'온도',value:'최고온도와 위치별 편차'},{label:'설치',value:'발열 구역·머리 방향·전원선'},{label:'관리',value:'세탁 횟수·코스·건조 조건'},{label:'비용',value:'본체·별도 패드·사용 전력'}],
  faq: [{q:'탄소매트가 전기료가 더 적나요?',a:'재료명만으로는 판단할 수 없습니다. 같은 조건의 소비전력과 사용시간을 비교하세요.'},{q:'세탁 가능이면 건조기도 되나요?',a:'제품별로 다릅니다. 건조기 금지·세탁 횟수 제한이 있을 수 있어 설명서를 확인해야 합니다.'}],
  timelineTitle: '자료 확인 이력', timeline: [{date:'2025-12-11',text:'한국소비자원 탄소전기매트 10개 품질비교 발표'},{date:'2026-10-27',text:'공식 브리핑·인증 조회 경로 대조 및 구매 기준 작성'}],
  affiliate: {allowed:true,slots:[]},
  editor: {name:'뉴스저울 편집부',beat:'생활가전',statement:'한국소비자원 품질비교와 제품안전정보센터 인증 기준을 대조합니다.'},
  related: [{title:'가습기',slug:'humidifier'},{title:'에너지바우처',slug:'energy-voucher'}],
  tags: ['탄소매트','카본매트','전기매트','겨울난방','세탁','전기료'], schema:{collection:true},
}
