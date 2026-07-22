import { permanentRedirect } from 'next/navigation'

// 구브랜드("침묵지수 TOP10") 라우트 — 브랜드 Audit P1에 따라 사용 중지, 홈으로 redirect.
// permanentRedirect(308) 사용 — 검색엔진이 이 URL을 색인에서 내리고 링크 가치를 홈으로
// 이전하도록 명확히 신호(PM 지시 2026-07-22 "canonical/중복 페이지 전수 점검").
export default function Top10Page() {
  permanentRedirect('/')
}
