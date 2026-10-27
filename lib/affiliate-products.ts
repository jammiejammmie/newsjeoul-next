import snapshot from './hubs/coupang-snapshot.json'
import type { HubAffiliateSlot } from './hubs/types'
type Product = {key:string;name:string;price:number;image?:string;checkedAt?:string}
const products = snapshot as Record<string,Product>
export function affiliateProduct(slot:HubAffiliateSlot): Product | undefined {
 const p=products[slot.slot]; if(!p || !slot.targetUrl)return
 try {const q=new URL(slot.targetUrl).searchParams;const key=['pageKey','itemId','vendorItemId'].map(k=>q.get(k)||'').join('/');if(key!==p.key)return;return p}catch{return}
}
export function productImage(p?:Product) { return p?.image && /^https:\/\/(?:[^/]*\.coupangcdn\.com\/|ads-partners\.coupang\.com\/image1\/)/.test(p.image) ? p.image : undefined }
export function productPrompt(slot:string) {
 const prompts:Record<string,[string,string,string]>={
 's25u-spen':['S25 울트라용 모델·색상 선택이 맞을까?','필기 문제의 원인을 좁힌 뒤, 선택 옵션의 모델·펜촉 구성·보증 주체를 대조하세요.','S25 울트라용 구성·판매 조건 보기'],
 'buds4-body':['단품 복구 견적, 새 세트와 얼마나 차이 날까?','필요한 부품의 총견적과 비교할 새 세트 가격·색상·구성을 살펴보세요.','새 세트 가격·구성 보기'],
 'gram26-body':['윈도우까지 포함된 가격일까?','RAM·SSD만 보고 고르기 전에, 선택 옵션의 운영체제 포함 여부도 확인하세요.','RAM·SSD·윈도우 옵션 보기'],
 'gram26-hub':['HDMI만 있으면 모니터 두 대가 확장될까?','선택 옵션의 영상 포트·확장 방식·해상도·PD 전달 전력과 충전기 포함 여부를 확인하세요.','영상 출력·PD·구성 확인'],
 'rv26-roborock':['비슷한 이름, 같은 도크 기능일까?','이 상품은 S10 MaxV Ultra입니다. Slim과 혼동하지 말고 세척·건조 기능과 구성품을 확인하세요.','Ultra 도크·구성 확인'],
 'rv26-dreame':['청소기와 함께, 도크는 어디까지 해줄까?','이 상품은 L30s Plus입니다. 자동 먼지 비움 외에 필요한 기능과 관리할 부분을 비교하세요.','L30s Plus 구성 살펴보기'],
 'fold8-body':['내가 고른 용량·색상은 얼마일까?','사진 속 색상과 선택한 옵션이 같은지, 저장용량까지 함께 대조하세요.','용량·색상별 판매 옵션 보기'],
 'fold8-charger':['1.8m 케이블이 실제 구성에 포함될까?','EP-TA845 모델·PD PPS 표기와 케이블 길이·규격, 새 제품 여부·보증 주체를 확인하세요.','어댑터 모델·케이블 구성 확인'],
 'flip8-body':['같은 플립8, 새 제품인지도 확인했나요?','공기계라는 말만 보지 말고 제품 상태·저장용량·판매 조건을 살펴보세요.','제품 상태·판매 조건 보기'],
 'book5-hub':['모니터·충전·USB를 동시에 꽂을 수 있을까?','포트 수보다 중요한 건 연결할 기기의 조합. HDMI 출력과 PD 충전 조건을 확인하세요.','포트 구성·출력 조건 보기'],
 'buds4-case':['덮개를 씌운 채 충전할 수 있을까?','충전 케이스가 아닌 보호 커버입니다. 충전부 노출과 내 버즈 모델의 호환 여부를 살펴보세요.','커버 구조·호환 기종 보기'],
 }
 if(prompts[slot])return prompts[slot]
 if(/charger|hub/.test(slot))return ['단자는 맞는데, 출력도 충분할까?','내 기기의 입력 조건과 상품의 포트별 출력·케이블 포함 여부를 대조하세요.','출력·포트·구성 확인']
 if(/case|film|skin|pouch|tips|parts/.test(slot))return ['모양이 비슷해도 내 모델에 맞을까?','호환 모델명과 크기, 세트에 포함되는 수량을 확인하세요.','호환 모델·구성 확인']
 return ['선택한 옵션에 무엇이 포함될까?','사진 속 구성과 실제 선택 옵션의 모델명·구성품을 대조하세요.','상품 옵션·구성 확인']
}
