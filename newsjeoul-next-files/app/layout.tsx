import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import BottomTab from '@/components/BottomTab'

export const metadata: Metadata = {
  title: '뉴스저울 — 같은 나라, 다른 뉴스',
  description: '조중동 vs 한경오. 같은 사건, 다른 시각. 대한민국 언론의 편향을 숫자로 보여줍니다.',
  openGraph: {
    title: '뉴스저울 — 같은 나라, 다른 뉴스',
    description: '조중동 vs 한경오. 같은 사건, 다른 시각.',
    url: 'https://newsjeoul.co.kr',
    siteName: '뉴스저울',
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: 'https://newsjeoul.co.kr/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '뉴스저울 — 같은 나라, 다른 뉴스',
    description: '조중동 vs 한경오. 같은 사건, 다른 시각.',
    images: ['https://newsjeoul.co.kr/og-image.png'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Bebas+Neue&family=Noto+Serif+KR:wght@600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <BottomTab />
      </body>
    </html>
  )
}
