export type Choice = { condition: string; option: string; benefit: string; tradeoff: string; href: string; action: string }
export type QuickChoices = { rows: Choice[]; notice?: string; adContext?: string; slots?: string[] }
const gram: QuickChoices = {
 notice: '본문의 16Z95U-GS5WK와 광고의 그램 AI 14는 다른 제품입니다. 화면 크기·RAM 증설 여부·OS 구성을 서로 옮겨 적용하지 마세요.',
 adContext: '다른 모델 비교 광고: 등록된 상품은 그램 AI 14입니다. 본문의 16Z95U-GS5WK 판매 링크가 아니며 같은 사양을 보장하지 않습니다.',
 rows: [
 {condition:'앱을 여러 개 켜고 오래 쓸 계획',option:'필요 메모리부터 결정',benefit:'현재 작업에서 부족한 메모리를 먼저 확인하면 CPU 이름만 보고 고르는 일을 줄입니다.',tradeoff:'큰 메모리가 모든 작업을 빠르게 하지는 않습니다. 실제 사용량과 예산을 함께 보세요.',href:'/hub/lg-gram-2026/ram-ssd-1sey4q',action:'RAM 선택 기준 읽기'},
 {condition:'설치 없이 바로 사용하고 싶다면',option:'Windows 포함 구성 검토',benefit:'기기값과 OS·설치 준비를 한 번에 비교할 수 있습니다.',tradeoff:'Home·Pro, 정품 사용권과 설치 서비스는 구분해야 합니다.',href:'/hub/lg-gram-2026/freedos-vs-windows-total-cost',action:'OS 포함 비용 비교'},
 {condition:'다른 크기의 그램도 비교한다면',option:'그램 AI 14 판매 옵션',benefit:'현재 등록된 다른 모델의 RAM·SSD·OS 조합과 판매가를 확인할 수 있습니다.',tradeoff:'본문의 16형 모델과 다릅니다. 크기와 전체 모델 코드를 먼저 대조하세요.',href:'/go/gram26-body',action:'다른 모델 · AI 14 옵션 보기'},
 ]
}
const fold: QuickChoices = { slots:['flip8-body','fold8-body'], rows:[
 {condition:'작은 가방에 넣는 것이 먼저',option:'플립8 비교',benefit:'접은 상태로 가방에 넣고 꺼내는 용도부터 검토할 수 있습니다.',tradeoff:'케이스를 끼운 크기와 커버 화면에서 쓸 앱을 따로 확인해야 합니다.',href:'/go/flip8-body',action:'플립8 상태·옵션 보기'},
 {condition:'이동 중 책과 문서를 자주 읽음',option:'일반 폴드8 비교',benefit:'펼친 화면에서 평소 읽는 콘텐츠를 확인할 후보입니다.',tradeoff:'PDF 작은 글씨와 영상 여백은 직접 확인하세요. 이 링크는 울트라가 아닙니다.',href:'/go/fold8-body',action:'일반 폴드8 옵션 보기'},
 {condition:'태블릿까지 없애려는 구매',option:'사용 앱·문서로 먼저 판단',benefit:'폰 가격 외에 실제로 줄일 수 있는 기기와 비용을 따져볼 수 있습니다.',tradeoff:'필기·긴 문서 작업·가족 공유는 한 대로 합치기 어려울 수 있습니다.',href:'/hub/galaxy-z-fold8/tablet-replacement-reading-pdf',action:'태블릿 대체 조건 읽기'},
 ]}
const robot: QuickChoices = {
 notice:'이 글의 S10 MaxV Slim과 아래 대안 광고의 S10 MaxV Ultra는 다른 모델입니다. Slim의 문턱 시험 조건을 Ultra에 적용하지 마세요.',
 adContext:'다른 모델 비교 광고: S10 MaxV Ultra입니다. 본문의 S10 MaxV Slim 구매 링크가 아니며 문턱 통과 성능을 대신 보증하지 않습니다.',
 rows:[
 {condition:'높은 문턱 통과가 구매 목적',option:'Slim 공식 조건부터 대조',benefit:'문턱의 첫 높이·중간 깊이·두 번째 높이를 제조사 조건과 비교합니다.',tradeoff:'최대 높이만으로 내 집 통과를 보장할 수 없습니다.',href:'https://kr.roborock.com/pages/roborock-s10-maxv-slim',action:'Slim 공식 조건 확인'},
 {condition:'기존 로봇이 도크에 못 돌아옴',option:'설치·복귀 점검 먼저',benefit:'구매 전에 도크 위치와 이동 경로 문제를 나눠 확인할 수 있습니다.',tradeoff:'부품 고장 여부는 이 점검만으로 확정할 수 없습니다.',href:'/hub/robot-vacuum-2026/troubleshoot-1k17we',action:'복귀 문제 점검하기'},
 {condition:'Slim 외 모델도 비교한다면',option:'S10 MaxV Ultra 대안',benefit:'다른 모델의 도크·구성품·판매가를 비교할 수 있습니다.',tradeoff:'Slim과 동일한 기능의 대체품이라는 뜻은 아닙니다.',href:'/go/rv26-roborock',action:'다른 모델 · Ultra 보기'},
 ]}
const pets:QuickChoices={
 notice:'본문은 Matrix10 Ultra입니다. 등록된 쿠팡 상품 L30s Plus와 다르며, 물걸레 교체 도크 등 본문 기능을 광고 상품의 기능으로 읽지 마세요.',
 adContext:'다른 모델 비교 광고: L30s Plus입니다. Matrix10 Ultra 구매 링크가 아니며 자동 물걸레 교체 등 본문 기능을 보장하지 않습니다.',
 rows:[
 {condition:'구역별 물걸레 교체가 중요',option:'Matrix10 공식 기능 확인',benefit:'원하는 자동 교체 기능과 도크 구성을 제품별로 확인합니다.',tradeoff:'미국 공식 페이지입니다. 국내 유통·보증·패키지는 별도 확인이 필요합니다.',href:'https://www.dreametech.com/products/matrix10-ultra-robot-vacuum',action:'Matrix10 공식 기능 보기'},
 {condition:'털 청소 후 유지비가 걱정',option:'브러시·필터 호환성 먼저',benefit:'소모품을 잘못 주문하는 일을 줄이도록 본체·도크 모델을 대조합니다.',tradeoff:'브러시 관리와 바닥 정리를 전부 없애주는 방법은 아닙니다.',href:'/hub/robot-vacuum-2026/consumable-model-code-check',action:'소모품 확인 순서 읽기'},
 {condition:'다른 드리미 모델도 비교',option:'L30s Plus 판매 구성',benefit:'현재 등록된 다른 모델의 구성과 가격을 살펴볼 수 있습니다.',tradeoff:'Matrix10과 동일 성능으로 비교하면 안 됩니다. 필요한 도크 기능을 대조하세요.',href:'/go/rv26-dreame',action:'다른 모델 · L30s Plus 보기'},
 ]}
const buds:QuickChoices={ rows:[
 {condition:'한쪽만 잃었고 나머지는 정상',option:'센터 단품 견적 먼저',benefit:'정상인 이어버드와 케이스를 계속 사용할 선택지입니다.',tradeoff:'모델·좌우 방향·재고·커플링 지원을 센터에 확인해야 합니다.',href:'/hub/galaxy-buds4/single-bud-replacement',action:'단품 구매 확인 순서'},
 {condition:'남은 쪽과 케이스도 교체 고민',option:'새 세트 비용 비교',benefit:'단품 견적에 추가 수리비까지 더한 비용과 비교할 수 있습니다.',tradeoff:'한쪽 단품 링크가 아닙니다. 일반형·프로와 구성품을 확인하세요.',href:'/go/buds4-body',action:'새 세트 가격·구성 보기'},
 {condition:'충전 문제 때문에 새로 사려면',option:'케이스·이어버드 점검',benefit:'어느 부분이 충전되지 않는지 나누어 불필요한 구매를 줄입니다.',tradeoff:'점검으로 해결되지 않는 고장은 서비스가 필요할 수 있습니다.',href:'/hub/galaxy-buds4/case-not-charging',action:'충전 점검부터 보기'},
 ]}
export const QUICK_CHOICES:Record<string,QuickChoices>={
 '/hub/lg-gram-2026/ram-ssd-1sey4q':gram,
 '/hub/lg-gram-2026/freedos-vs-windows-total-cost':gram,
 '/hub/galaxy-z-flip8/flip8-vs-fold8':fold,
 '/hub/galaxy-z-fold8/fold8-vs-ultra-reading-camera':{...fold,slots:['fold8-body'],rows:[fold.rows[1],{condition:'울트라와 일반형 중 고민',option:'같은 용량·보증으로 비교',benefit:'화면과 카메라 차이에 얼마를 더 낼지 따져볼 수 있습니다.',tradeoff:'등록된 광고는 일반형입니다. 울트라 판매 링크로 오인하지 마세요.',href:'#article-details',action:'아래 모델 차이 읽기'},fold.rows[2]]},
 '/hub/galaxy-z-fold8/tablet-replacement-reading-pdf':{...fold,slots:['fold8-body']},
 '/hub/robot-vacuum-2026/troubleshoot-vtxdcs':robot,
 '/hub/robot-vacuum-2026/buying-v0bb18':pets,
 '/hub/galaxy-buds4/single-bud-replacement':buds,
}
