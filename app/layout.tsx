import type { Metadata } from 'next'
import './globals.css'
import Nav from '@/components/Nav'
import BottomTab from '@/components/BottomTab'

export const metadata: Metadata = {
  title: '뉴스저울 — 당신이 못 본 절반',
  description: '오늘 언론사 90%가 침묵한 뉴스가 있습니다. 당신은 보셨나요?',
  openGraph: {
    title: '뉴스저울 — 당신이 못 본 절반',
    description: '오늘 언론사 90%가 침묵한 뉴스가 있습니다. 당신은 보셨나요?',
    url: 'https://newsjeoul.co.kr',
    siteName: '뉴스저울',
    locale: 'ko_KR',
    type: 'website',
    images: [{ url: 'https://newsjeoul.co.kr/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '뉴스저울 — 당신이 못 본 절반',
    description: '오늘 언론사 90%가 침묵한 뉴스가 있습니다. 당신은 보셨나요?',
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
