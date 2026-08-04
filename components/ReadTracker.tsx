'use client'

import { useEffect } from 'react'

// 조회 기록 비콘 — 홈 "많이 본 이슈 24시간"의 데이터를 만드는 장치.
//
// 왜 클라이언트에서 보내는가: 서버 렌더 시점에 세면 크롤러·프리렌더·ISR 재생성이 전부
// 조회로 잡힌다. 그러면 "많이 본"이 실제 독자가 아니라 봇 방문 순위가 된다.
// 브라우저에서 한 번 보내는 편이 실제 사람의 조회에 훨씬 가깝다.
//
// 중복 방지: 같은 세션에서 같은 토픽을 여러 번 열어도 1회만 센다(sessionStorage).
// 새로고침마다 카운트가 오르면 순위가 체류가 아니라 새로고침 횟수를 반영하게 된다.
export default function ReadTracker({ topicId }: { topicId: string }) {
  useEffect(() => {
    if (!topicId) return
    const key = `nj-read:${topicId}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {
      // 사생활 보호 모드 등에서 sessionStorage가 막히면 중복 방지만 포기하고 기록은 계속한다.
    }

    // keepalive: 사용자가 곧바로 페이지를 떠나도 요청이 취소되지 않게 한다.
    fetch('/api/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicId }),
      keepalive: true,
    }).catch(() => {
      // 집계 실패가 사용자에게 보일 이유가 없다. 조용히 넘긴다.
    })
  }, [topicId])

  return null
}
