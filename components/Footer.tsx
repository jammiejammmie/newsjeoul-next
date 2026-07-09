export default function Footer() {
  return (
    <footer style={{ padding: '56px 32px 72px', borderTop: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>⚖ 뉴스저울</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>뉴스를 정렬하지 않습니다. 세상을 배치합니다.</div>
      </div>
    </footer>
  )
}
