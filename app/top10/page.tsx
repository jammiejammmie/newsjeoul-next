import { redirect } from 'next/navigation'

// 구브랜드("침묵지수 TOP10") 라우트 — 브랜드 Audit P1에 따라 사용 중지, 홈으로 redirect.
export default function Top10Page() {
  redirect('/')
}
