import { redirect } from 'next/navigation'

// 구브랜드("언론사 편향 스펙트럼") 라우트 — 브랜드 Audit P1에 따라 사용 중지, 홈으로 redirect.
export default function Media101Page() {
  redirect('/')
}
