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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
        <link rel="stylesheet" as="style" crossOrigin="anonymous" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
      </head>
      <body>
        <Nav />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
