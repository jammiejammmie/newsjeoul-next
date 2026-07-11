'use client'

import { useState } from 'react'

// 원문 og:image URL이 저장 시점엔 유효했어도 이후 원본이 내려가거나 언론사 CDN 인증서가 만료되는
// 경우가 실제로 있었다(2026-07-11, pressian.com CDN 사례) — 로드 실패 시 통째로 숨겨 빈 자리 없이 폴백한다.
export default function HeroImage({ src }: { src: string }) {
  const [broken, setBroken] = useState(false)
  if (broken) return null

  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', borderRadius: 16, marginBottom: 20 }}
    />
  )
}
