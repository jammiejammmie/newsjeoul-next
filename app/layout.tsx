import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import Footer from '@/components/Footer'

const TAGLINE = '뉴스저울 — 3분이면 오늘 세상을 이해합니다'
const DESC = '오늘 세상이 가장 궁금해하는 것들. 뉴스를 정렬하지 않습니다. 세상을 배치합니다.'

export const metadata: Metadata = {
  title: TAGLINE,
  description: DESC,
  openGraph: {
    title: TAGLINE,
    description: DESC,
    url: 'https://newsjeoul.co.kr',
    siteName: '뉴스저울',
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: 'https://newsjeoul.co.kr/og?type=weight&title=%EB%89%B4%EC%8A%A4%EC%A0%80%EC%9A%B8', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: TAGLINE,
    description: DESC,
    images: ['https://newsjeoul.co.kr/og?type=weight&title=%EB%89%B4%EC%8A%A4%EC%A0%80%EC%9A%B8'],
  },
}

// 사이트 전체 1회성 스키마(Organization/WebSite+SearchAction) — 페이지별 NewsArticle/BreadcrumbList
// 등(lib/schema/*)과 별개로, 검색엔진이 "이 사이트 자체가 무엇인지" 이해하는 최상위 신호.
// PM 지시(2026-07-22 "Schema.org 강화") — 기존엔 페이지별 스키마만 있고 사이트 단위 스키마가 없었음.
const ORGANIZATION_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: '뉴스저울',
  url: 'https://newsjeoul.co.kr',
  logo: 'https://newsjeoul.co.kr/og?type=weight&title=%EB%89%B4%EC%8A%A4%EC%A0%80%EC%9A%B8',
}
const WEBSITE_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: '뉴스저울',
  url: 'https://newsjeoul.co.kr',
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: 'https://newsjeoul.co.kr/search?q={search_term_string}' },
    'query-input': 'required name=search_term_string',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
        <link rel="stylesheet" as="style" crossOrigin="anonymous" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_SCHEMA) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_SCHEMA) }} />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
