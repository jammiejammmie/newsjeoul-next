import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // 제휴 리다이렉트는 크롤링 대상이 아니다(설계서 §8.1). 본문 <a>에 rel="sponsored nofollow"를
      // 붙이는 것과 별개로, 경로 자체를 막아 크롤 예산을 낭비하지 않고 링크 자산이 새어나가지
      // 않게 한다. 라우트 응답에도 X-Robots-Tag: noindex,nofollow를 함께 넣는다.
      disallow: '/go/',
    },
    sitemap: 'https://newsjeoul.co.kr/sitemap.xml',
  }
}
