import type { Metadata } from 'next'
import Link from 'next/link'
import EvSubsidyCalculator from '@/components/EvSubsidyCalculator'
import { NATIONAL_PRICE_TIERS, LOCAL_RATES, NATIONAL_BASE, ACQUISITION_TAX_CAP } from '@/lib/tools/ev-subsidy'
import '../../hub/hub.css'

const BASE = 'https://newsjeoul.co.kr'
const TITLE = '전기차 보조금 계산기 — 차량가·지역별 실부담액'
const DESC = '차량 가격과 거주 지역을 넣으면 국고·지자체 보조금과 취득세 감면을 반영한 실부담액을 계산합니다. 계산 근거를 한 줄씩 함께 보여줍니다.'

export const revalidate = 86400

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: `${BASE}/tools/ev-subsidy` },
  openGraph: { title: TITLE, description: DESC, url: `${BASE}/tools/ev-subsidy`, siteName: '뉴스저울', locale: 'ko_KR', type: 'website' },
}

// 도구 페이지 — 설계서 §4.1-3의 "계산기"가 AI 요약 시대에 살아남는 콘텐츠 유형이다.
// AI가 요약할 수 없는 것은 사용자 입력을 받아 계산하는 상호작용이다.
export default function EvSubsidyToolPage() {
  const faq = [
    {
      q: '차량 가격이 얼마를 넘으면 보조금이 줄어드나요?',
      a: `국고보조금은 차량가 구간에 따라 지급률이 달라집니다. ${NATIONAL_PRICE_TIERS.map((t) => t.label).join(' / ')} 구조입니다. 국고가 감액되면 지자체 보조금도 함께 줄어드는데, 대부분 지자체가 국고 대비 비율로 지급하기 때문입니다.`,
    },
    {
      q: '지역에 따라 얼마나 차이가 나나요?',
      a: `지자체 보조금은 국고 대비 비율로 정해지고 지역별로 크게 다릅니다. 현재 반영된 범위는 ${Math.round(Math.min(...Object.values(LOCAL_RATES)) * 100)}%(${Object.entries(LOCAL_RATES).sort((a, b) => a[1] - b[1])[0][0]})부터 ${Math.round(Math.max(...Object.values(LOCAL_RATES)) * 100)}%까지입니다. 같은 차량이라도 거주지에 따라 실부담액이 수백만원 차이 날 수 있습니다.`,
    },
    {
      q: '취득세는 얼마나 감면되나요?',
      a: `전기차는 취득세 감면 상한이 ${ACQUISITION_TAX_CAP.toLocaleString('ko-KR')}원입니다. 차량가가 높아 산출 취득세가 상한을 넘으면 초과분은 부담해야 합니다.`,
    },
    {
      q: '계산 결과대로 받을 수 있나요?',
      a: '아니요. 지자체 예산이 소진되면 공고가 남아 있어도 보조금을 받지 못하고 다음 차수를 기다려야 합니다. 국고 상한과 지자체 비율, 감면 상한도 공고마다 바뀝니다. 계약 전에 거주지 공고의 잔여 물량과 최신 단가를 확인해야 합니다.',
    },
  ]

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: '전기차 보조금 계산기',
        url: `${BASE}/tools/ev-subsidy`,
        applicationCategory: 'FinanceApplication',
        operatingSystem: 'Web',
        description: DESC,
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'KRW' },
        publisher: { '@type': 'Organization', name: '뉴스저울', url: BASE },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question', name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: '홈', item: BASE },
          { '@type': 'ListItem', position: 2, name: '계산기', item: `${BASE}/tools/ev-subsidy` },
        ],
      },
    ],
  }

  return (
    <div className="nj-hub">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 32px 80px' }}>
        <nav style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 14 }}>
          <Link href="/">홈</Link> <span style={{ opacity: .5 }}>›</span> 계산기
        </nav>

        <h1 style={{ margin: '0 0 8px', fontSize: 30, fontWeight: 800, letterSpacing: '-.025em', lineHeight: 1.25 }}>
          전기차 보조금 계산기
        </h1>
        <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.7, color: 'var(--text2)' }}>
          차량 가격과 거주 지역을 넣으면 국고·지자체 보조금과 취득세 감면을 반영한 실부담액이 나옵니다.
          결과와 함께 계산 과정을 한 줄씩 보여줍니다 — 검증할 수 없는 숫자는 쓸모가 없기 때문입니다.
        </p>

        <EvSubsidyCalculator />

        <section style={{ marginTop: 40 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 7 }}>자주 묻는 질문</h2>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {faq.map((f) => (
              <details key={f.q} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                <summary style={{ fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>{f.q}</summary>
                <p style={{ margin: '9px 0 0', fontSize: 13.5, lineHeight: 1.75, color: 'var(--text2)' }}>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 36 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, borderBottom: '2px solid var(--text)', paddingBottom: 7 }}>관련 이슈</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Link href="/hub/ev-subsidy" style={{ fontSize: 13.5, fontWeight: 600 }}>전기차 보조금 — 제도 정리와 최신 소식</Link>
            <Link href="/hub/audi-q9" style={{ fontSize: 13.5, fontWeight: 600 }}>아우디 Q9 — 출시·가격 정리</Link>
          </div>
        </section>
      </div>
    </div>
  )
}
