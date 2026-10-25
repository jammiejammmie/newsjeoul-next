export default function SourceNote({ text }: { text: string }) {
  return <p style={{ margin: 0, font: '500 12.5px/1.7 Pretendard', color: 'var(--body2)', overflowWrap: 'anywhere' }}>{text.split(/(https:\/\/[^\s<>]+)/g).map((part,index) => part.startsWith('https://') ? <a key={index} href={part} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>{part}</a> : part)}</p>
}
