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
 const prompts:Record<string,[string,string]>={
 'buds4-body':['새 세트와 비용 비교','색상·구성과 현재 판매가를 한 번에 확인하세요.'],
 'gram26-body':['노트북 구매 전 확인','RAM·SSD·운영체제가 포함된 옵션인지 확인하세요.'],
 'rv26-roborock':['우리 집에 맞는 로보락','본문의 모델과 판매 모델명을 대조해 보세요.'],
 'rv26-dreame':['드리미 판매 모델 비교','도크 기능과 구성품을 확인한 뒤 선택하세요.'],
 'fold8-body':['큰 화면이 필요하다면','저장용량·색상별 판매 옵션을 비교하세요.'],
 'flip8-body':['휴대성을 먼저 본다면','제품 상태·색상·저장용량을 확인하세요.'],
 'book5-hub':['포트가 부족할 때','HDMI·USB·충전 포트 구성을 확인하세요.'],
 'buds4-case':['이어폰 케이스 보호','충전 케이스가 아닌 보호 커버 상품입니다.'],
 }
 return prompts[slot]??['내 기기와 맞는지 확인','모델명·호환 기종·구성품을 비교하세요.']
}
