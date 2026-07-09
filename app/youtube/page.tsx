import { redirect } from 'next/navigation'

// 구브랜드("보수 vs 진보 유튜브 비교") 라우트 — 브랜드 Audit P1에 따라 사용 중지, 홈으로 redirect.
export default function YoutubePage() {
  redirect('/')
}
