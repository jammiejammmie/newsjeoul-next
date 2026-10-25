'use client'
import { useState } from 'react'
export default function CostCompare() {
  const [repair,setRepair] = useState('')
  const [product,setProduct] = useState('')
  const [extra,setExtra] = useState('')
  const valid = repair.trim() !== '' && product.trim() !== '' && [repair,product,extra||'0'].every(v => Number.isFinite(Number(v)) && Number(v)>=0)
  const total = Number(product) + Number(extra||'0')
  const difference = total - Number(repair)
  const won = (n:number) => n.toLocaleString('ko-KR')+'원'
  return <section className="cost-panel" id="compare"><div><span className="eyebrow">DO THE MATH</span><h2>고칠까, 새로 살까?</h2><p>견적과 결제금액을 같은 기준으로 비교하세요.<br/>가격 외에 남은 수명과 보증도 함께 살펴보세요.</p></div><div className="cost-form">
    <label>수리·단품 구매 총비용 (원)<input type="number" inputMode="numeric" min="0" value={repair} onChange={e=>setRepair(e.target.value)} placeholder="받은 견적을 입력하세요" /></label>
    <label>새 제품 결제금액 (원)<input type="number" inputMode="numeric" min="0" value={product} onChange={e=>setProduct(e.target.value)} placeholder="실제 적용 할인 후 금액" /></label>
    <label>새 제품 추가 비용 (원)<input type="number" inputMode="numeric" min="0" value={extra} onChange={e=>setExtra(e.target.value)} placeholder="배송비 등 · 없으면 비워두세요" /></label>
    <div className="cost-result" aria-live="polite">{valid ? <><strong>{difference===0?'두 선택의 비용이 같습니다.':difference>0?`수리·단품 구매가 ${won(difference)} 적게 듭니다.`:`새 제품 구매가 ${won(-difference)} 적게 듭니다.`}</strong><span>수리·단품 {won(Number(repair))} / 새 제품 총액 {won(total)}</span><small>입력한 비용만 비교한 결과입니다. 품질·수명·보증의 우열이나 구매 추천을 뜻하지 않습니다.</small></> : <span>두 금액을 입력하면 차액을 계산합니다.</span>}</div>
  </div></section>
}
