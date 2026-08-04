'use client'

import { useMemo, useState } from 'react'
import { calcEvSubsidy, EV_REGIONS } from '@/lib/tools/ev-subsidy'

// 전기차 보조금 계산기 — 설계서 §4.1-3이 "도구"를 AI 요약 시대에 살아남는 3종 중 하나로 꼽는다.
// 계산 근거를 함께 보여주는 이유: 숫자만 내놓으면 사용자가 검증할 수 없고, 검증할 수 없는
// 계산기는 신뢰받지 못한다(§6.3의 신뢰 장치와 같은 원리).

const won = (n: number) => n.toLocaleString('ko-KR')

export default function EvSubsidyCalculator() {
  const [priceManwon, setPriceManwon] = useState(5200) // 만원 단위로 입력받는다(한국 관행)
  const [region, setRegion] = useState('서울')
  const [perf, setPerf] = useState(100)
  const [taxCut, setTaxCut] = useState(true)

  const result = useMemo(
    () => calcEvSubsidy({
      vehiclePrice: priceManwon * 10_000,
      region,
      performanceRatio: perf / 100,
      applyTaxCut: taxCut,
    }),
    [priceManwon, region, perf, taxCut]
  )

  const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', letterSpacing: '.04em' }
  const field: React.CSSProperties = {
    border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)',
    padding: '9px 10px', fontSize: 14, fontFamily: 'inherit', width: '100%',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={label} htmlFor="ev-price">차량 가격 (만원)</label>
          <input
            id="ev-price" type="number" min={1000} max={30000} step={10} style={field}
            value={priceManwon}
            onChange={(e) => setPriceManwon(Math.max(0, Number(e.target.value) || 0))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={label} htmlFor="ev-region">거주 지역</label>
          <select id="ev-region" style={field} value={region} onChange={(e) => setRegion(e.target.value)}>
            {EV_REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={label} htmlFor="ev-perf">성능 계수 (%)</label>
          <input
            id="ev-perf" type="number" min={0} max={100} step={5} style={field}
            value={perf}
            onChange={(e) => setPerf(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, justifyContent: 'flex-end' }}>
          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
            <input type="checkbox" checked={taxCut} onChange={(e) => setTaxCut(e.target.checked)} />
            취득세 감면 적용
          </label>
        </div>
      </div>

      {/* 결과 */}
      <div style={{ border: '1px solid var(--text)', background: 'var(--card)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 1, background: 'var(--border)' }}>
          {[
            { k: '국고보조금', v: result.nationalSubsidy },
            { k: '지자체보조금', v: result.localSubsidy },
            { k: '취득세 절감', v: result.taxCut },
          ].map((x) => (
            <div key={x.k} style={{ background: 'var(--card)', padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>{x.k}</span>
              <b style={{ fontSize: 16, fontWeight: 800 }}>{won(x.v)}원</b>
            </div>
          ))}
          <div style={{ background: 'var(--accent-soft)', padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>실부담액</span>
            <b style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)' }}>{won(result.netPrice)}원</b>
          </div>
        </div>
        <div style={{ padding: '12px 13px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>계산 근거 · {result.tier}</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {result.breakdown.map((b, i) => (
              <li key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text2)' }}>{b}</li>
            ))}
          </ul>
        </div>
      </div>

      {result.notes.length > 0 && (
        <div style={{ borderLeft: '3px solid var(--accent)', background: 'var(--bg2)', padding: '11px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>알아둘 것</div>
          <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {result.notes.map((n, i) => (
              <li key={i} style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text2)' }}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, color: 'var(--muted)' }}>
        국고 상한·지자체 비율·감면 상한은 공고마다 바뀝니다. 계약 전 거주지 공고로 최종 확인하세요.
        이 계산기는 제도 구조를 반영하지만 공고 원문을 대체하지 않습니다.
      </p>
    </div>
  )
}
