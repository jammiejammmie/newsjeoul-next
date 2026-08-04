'use client'

import { useState } from 'react'

// 이메일 구독 폼 — /api/subscribe로 보낸다.
// 홈(키워드 구독)과 허브(값 변동 알림)에서 같은 컴포넌트를 쓰고, source로 어디서 왔는지 구분한다.

type Props = {
  /** 구독 출처. 'home' | 'hub:{slug}' 등. 발송 대상을 나눌 때 쓴다. */
  source: string
  /** 키워드 입력을 함께 받을지. 홈의 "키워드로 새 뉴스 받기"에서 쓴다. */
  withKeyword?: boolean
  placeholder?: string
  buttonLabel?: string
}

export default function SubscribeForm({
  source,
  withKeyword = false,
  placeholder = '이메일 주소',
  buttonLabel = '알림 받기',
}: Props) {
  const [email, setEmail] = useState('')
  const [keyword, setKeyword] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'sending') return
    setState('sending')
    setMessage('')
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, keyword: withKeyword ? keyword : undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.ok) {
        setState('done')
        // 이미 구독 중인 경우도 성공으로 보여준다(구독 여부가 외부에 드러나지 않게).
        setMessage('등록됐습니다. 새 소식이 있을 때 메일로 보내드립니다.')
        setEmail('')
        setKeyword('')
      } else {
        setState('error')
        setMessage(data?.error || '잠시 후 다시 시도해 주세요.')
      }
    } catch {
      setState('error')
      setMessage('네트워크 오류입니다. 다시 시도해 주세요.')
    }
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)',
    padding: '8px 10px', fontSize: 12.5, fontFamily: 'inherit', width: '100%',
  }

  if (state === 'done') {
    return (
      <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--text2)' }}>{message}</p>
    )
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {withKeyword && (
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="관심 키워드 (예: 전기차 보조금)"
          style={inputStyle}
          maxLength={120}
        />
      )}
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
        maxLength={254}
      />
      <button
        type="submit"
        disabled={state === 'sending'}
        style={{
          background: 'var(--text)', color: 'var(--bg)', border: 'none',
          padding: '9px 10px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', opacity: state === 'sending' ? 0.6 : 1,
        }}
      >
        {state === 'sending' ? '등록 중…' : buttonLabel}
      </button>
      {state === 'error' && (
        <span style={{ fontSize: 11, color: 'var(--accent)', lineHeight: 1.5 }}>{message}</span>
      )}
    </form>
  )
}
