import type { HubConfig } from './types'

export const humidifier: HubConfig = {
 slug:'humidifier', kind:'product', title:'가습기', breadcrumb:['생활가전','계절가전'], category:'생활가전',
 definition:'겨울 가습기를 가습 방식·세척 구조·전력·필터 비용으로 고르는 구매 가이드입니다. 현재 판매 순위나 미확인 최저가를 제시하지 않습니다.',
 trackingNote:'2026-10-27 공식 자료 확인 · 과거 비교시험과 현재 판매 조건 구분',
 stats:[{label:'선택 기준',value:'공간·관리·유지비'},{label:'가습 성능',value:'mL/h와 면적',note:'물통 L와 구분'},{label:'비용 비교',value:'전기 + 소모품',note:'본체 가격과 별도'},{label:'시험 자료',value:'2025 소비자원',note:'현재 가격·순위 아님'}],
 createdAt:'2026-10-27',updatedAtFallback:'2026-10-27T08:38:01+09:00',updateCountFallback:0,
 newsKeywords:['가습기'],newsExclude:['가습기살균제','피해자'],
 verdict:'물통 크기와 광고 살균 수치보다, 내 방에서 필요한 가습량과 매일 관리할 수 있는 구조를 먼저 고르세요.',
 evergreen:{howto:{label:'급수·세척',items:[]},troubleshoot:{label:'설치·물때·결로',items:[{title:'가습기 켜면 공기청정기 빨간불, 필터부터 바꿔야 할까?',slug:'air-purifier-pm-spike',updatedAt:'2026-10-27'}]},compare:{label:'방식 비교',items:[]},buying:{label:'겨울 구매 판단',items:[{title:'겨울 가습기 고르는 법: 가열식·기화식·초음파식, 전기료와 세척 비교',slug:'winter-type-cleaning-running-cost',badge:'표',updatedAt:'2026-10-27'}]}},
 specsTitle:'구매할 때 비교할 항목',specs:[{label:'가습량',value:'시간당 mL와 사용할 공간'},{label:'물통',value:'용량과 분리·급수 방식'},{label:'관리',value:'물통·가습부·필터의 세척 범위'},{label:'유지비',value:'전력량·소모품 가격·교체 주기'}],
 faq:[{q:'큰 물통이면 더 넓은 공간에 쓸 수 있나요?',a:'물통 용량과 시간당 가습량은 다릅니다. 사용할 모드의 가습량과 면적을 확인하세요.'},{q:'가열식이면 청소가 필요 없나요?',a:'가열식도 세척·물때 관리가 필요합니다. 냉각 후 해당 모델의 안내를 따르세요.'}],
 timelineTitle:'자료 확인 이력',timeline:[{date:'2025-10-30',text:'한국소비자원 가습기 13개 품질비교 발표'},{date:'2026-10-27',text:'국내 제조사 자료 대조 및 겨울 구매 가이드 작성'}],
 affiliate:{allowed:true,slots:[
  { slot: 'humidifier-xiaomi', label: 'Xiaomi 스마트 기화식 가습기 CJSJSQ02XYKR 본체', network: 'coupang', kind: 'device' },
  { slot: 'humidifier-cuckoo', label: '쿠쿠 CH-GS301FW 초음파식 가습기 본체', network: 'coupang', kind: 'device' },
 ]},
 editor:{name:'뉴스저울 편집부',beat:'생활가전',statement:'한국소비자원의 비교시험과 국내 제조사 제품·관리 안내를 대조합니다.'},
 related:[{title:'로봇청소기',slug:'robot-vacuum-2026'},{title:'에너지바우처',slug:'energy-voucher'}],
 tags:['가습기','겨울가습기','가습기전기료','가습기세척','가열식','기화식'],schema:{collection:true},
}
