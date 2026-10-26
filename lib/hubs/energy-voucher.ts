import type { HubConfig } from './types'

// Source-checked 2026 general energy voucher. No applicant data or paid API.
export const energyVoucher: HubConfig = {
  slug: 'energy-voucher', kind: 'policy', title: '에너지바우처',
  breadcrumb: ['생활 정책', '냉난방비'], category: '생활·지원 제도',
  definition: '2026년도 일반 에너지바우처의 지원 대상·연간 금액·동절기 사용 방식·이사 후 신청·잔액조회를 공식 원문으로 확인하는 가이드입니다.',
  trackingNote: '2026-10-26 공식 기준 확인 · 개인별 자격은 관할 기관에서 확인',
  stats: [
    {label:'신청 마감',value:'2026.12.31',note:'연말 일시 중단일 별도 확인'},
    {label:'동절기 사용 종료',value:'2027.05.31',note:'고지서 청구·작성 조건 확인'},
    {label:'연간 세대별 지원',value:'29.52만~70.13만원',note:'월 지급액 아님 · 사용액 차감'},
    {label:'신청 창구',value:'복지로·행정복지센터',note:'소득·세대원 특성 모두 확인'},
  ],
  createdAt:'2026-10-26',updatedAtFallback:'2026-10-26',updateCountFallback:0,
  newsKeywords:['에너지바우처'], newsExclude:['소상공인'],
  verdict:'연간 총액을 겨울에 새로 받는 돈으로 생각하지 마세요. 올해 신청 상태와 여름 사용액, 현재 난방 고지서 정보를 함께 확인하는 것이 먼저입니다.',
  evergreen: {
    howto:{label:'신청부터 사용까지',items:[{title:'2026 에너지바우처 동절기 신청, 대상·금액·잔액조회 한 번에 확인',slug:'winter-application-balance-2026',badge:'표',updatedAt:'2026-10-26'}]},
    troubleshoot:{label:'이사·잔액·미사용',items:[]},
    compare:{label:'사용 방식과 중복지원',items:[]},
    buying:{label:'신청 준비',items:[]},
  },
  specsTitle:'2026년도 일반 바우처의 확인 기준',
  specs:[
    {label:'소득 기준',value:'생계·의료·주거·교육급여 수급'},
    {label:'세대원 특성',value:'노인·영유아·장애인 등 공식 요건 중 하나 이상'},
    {label:'신청기간',value:'2026.06.15~12.31'},
    {label:'동절기 요금차감',value:'2026.10.01~2027.05.31'},
    {label:'동절기 실물카드',value:'2026.10.03~2027.05.31'},
    {label:'공식 문의',value:'1600-3190 / 주소지 행정복지센터'},
  ],
  faq:[
    {q:'작년에 받았으면 올해도 자동 신청되나요?',a:'정보변동이 없고 올해 자격도 유지해야 합니다. 이사·세대원 수 변동이 있으면 신규 신청이 필요하다는 공식 안내를 확인하세요.'},
    {q:'잔액은 어디서 확인하나요?',a:'현재 공식 안내는 복지로 로그인 후 복지지갑 → 나의 복지지갑에서 확인하는 경로입니다. 자세한 이용내역은 공식 챗봇이나 1600-3190으로 문의하세요.'},
  ],
  timelineTitle:'공식 발표와 실제 사용 일정',
  timeline:[
    {date:'2026-06-15',text:'2026년도 신청 접수 시작'},
    {date:'2026-09-30',text:'한국에너지공단 동절기 사용 안내 보도자료'},
    {date:'2026-10-01',text:'동절기 요금차감 시작 · 실물카드는 10월 3일'},
    {date:'2026-10-26',text:'일반 바우처 공식 안내·신청·사용·잔액조회 원문 확인'},
  ],
  affiliate:{allowed:false,reason:'지원 자격·신청·공식 확인을 위한 안내입니다. 상품 구매나 유료 대행이 필요하지 않습니다.'},
  editor:{name:'뉴스저울 편집부',beat:'생활 정책',statement:'한국에너지공단의 지원·신청·사용·잔액조회 안내와 사업 보도자료를 대조합니다.'},
  related:[],
  tags:['2026에너지바우처','에너지바우처신청','에너지바우처지원대상','에너지바우처지원금액','에너지바우처잔액조회','에너지바우처사용기간','동절기에너지바우처','난방비지원','기초생활수급자','다자녀에너지바우처','복지로신청','복지지갑','국민행복카드','도시가스요금차감','지역난방지원','에너지바우처재신청'],
  schema:{provider:'한국에너지공단'},
}
