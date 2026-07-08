type WeightHeroProps = {
  heaviestLabel: string
  leftLabel: string
  rightLabel: string
  leftWeight: number
  rightWeight: number
  beamAngle: number
  leftOrbSize: number
  rightOrbSize: number
}

// 저울대 애니메이션 히어로 — v5(궁금증의 흐름) 디자인 소스를 그대로 코드화
export default function WeightHero({
  heaviestLabel, leftLabel, rightLabel, leftWeight, rightWeight, beamAngle, leftOrbSize, rightOrbSize,
}: WeightHeroProps) {
  return (
    <section style={{ position: 'relative', padding: '64px 32px 56px', overflow: 'hidden' }}>
      <div className="nj-hero-orb" />
      <div style={{ position: 'relative', maxWidth: 1440, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.22em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 20 }}>
          오늘의 무게
        </div>
        <h1 style={{ fontSize: 'clamp(30px,4.6vw,58px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.18, margin: '0 0 40px' }}>
          오늘 세상은{' '}
          <span style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontWeight: 400, color: 'var(--accent)' }}>
            {heaviestLabel}
          </span>{' '}
          쪽으로<br />기울어 있습니다
        </h1>

        <div style={{ maxWidth: 920, margin: '0 auto', position: 'relative', height: 220 }}>
          <div style={{ position: 'absolute', left: '50%', bottom: 0, width: 2, height: 120, background: 'linear-gradient(#5A5850,transparent)', transform: 'translateX(-50%)' }} />
          <div style={{ position: 'absolute', left: '50%', bottom: 112, width: 8, height: 8, borderRadius: '50%', background: 'var(--muted)', transform: 'translateX(-50%)' }} />
          <div className="nj-beam" style={{ transform: `translate(-50%,0) rotate(${beamAngle}deg)` }}>
            <div style={{ height: 2, background: 'rgba(243,239,230,0.35)', width: '100%', position: 'relative' }}>
              <div style={{ position: 'absolute', left: '2%', top: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: leftOrbSize, height: leftOrbSize, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, rgba(124,140,255,0.9), rgba(124,140,255,0.25))',
                  boxShadow: '0 0 40px rgba(124,140,255,0.35)',
                }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: '#B8B4A8' }}>{leftLabel}</div>
                <div style={{ fontSize: 11.5, color: '#605D54', fontWeight: 600 }}>무게 {leftWeight}</div>
              </div>
              <div style={{ position: 'absolute', right: '2%', top: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: rightOrbSize, height: rightOrbSize, borderRadius: '50%',
                  background: 'radial-gradient(circle at 35% 30%, rgba(217,164,65,0.95), rgba(217,164,65,0.3))',
                  boxShadow: '0 0 44px rgba(217,164,65,0.4)',
                }} />
                <div style={{ fontSize: 13, fontWeight: 700, color: '#B8B4A8' }}>{rightLabel}</div>
                <div style={{ fontSize: 11.5, color: '#605D54', fontWeight: 600 }}>무게 {rightWeight}</div>
              </div>
            </div>
          </div>
        </div>
        <p style={{ fontSize: 14, color: 'var(--muted)', margin: '12px 0 0' }}>무게는 오늘 중요도 · 관심도 점수로 계산됩니다</p>
      </div>
    </section>
  )
}
