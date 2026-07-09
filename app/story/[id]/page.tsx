import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getQuestionDetail } from '@/lib/question-detail'
import { categoryIcon } from '@/lib/icons'
import SignatureCard from '@/components/SignatureCard'
import QuestionGraph from '@/components/QuestionGraph'
import { generateArticleSchema } from '@/lib/schema/article'
import { generateBreadcrumbSchema } from '@/lib/schema/breadcrumb'
import { generateFaqSchema } from '@/lib/schema/faq'

export const dynamic = 'force-dynamic'

const BASE = 'https://newsjeoul.co.kr'

function ContextBlock({ icon, label, text }: { icon: string; label: string; text: string }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px' }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>{icon} {label}</p>
      <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>{text}</p>
    </div>
  )
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const data = await getQuestionDetail(id)
  if (!data) return { title: '뉴스저울' }

  const { topic } = data
  const desc = topic.summary || topic.description || `${topic.name}에 대한 근거와 맥락을 정리했습니다.`

  return {
    title: `${topic.name} — 뉴스저울`,
    description: desc,
    alternates: { canonical: `${BASE}/story/${data.story.id}` },
    openGraph: {
      title: topic.name, description: desc,
      images: [{ url: `${BASE}/og?type=topic&title=${encodeURIComponent(topic.name)}`, width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image', title: topic.name, description: desc },
  }
}

export default async function QuestionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getQuestionDetail(id)
  if (!data) notFound()

  const { topic, articles, connectedTopics, nextQuestions, graphNodes } = data
  const aiContext = topic.aiContext || {}

  const jsonLd = generateArticleSchema({
    headline: topic.name,
    description: topic.summary || topic.description,
    dateModified: topic.updatedAt || data.story.createdAt,
    datePublished: data.story.createdAt,
    url: `${BASE}/story/${data.story.id}`,
  })
  const breadcrumbLd = generateBreadcrumbSchema([
    { name: '뉴스저울', url: BASE },
    ...(topic.category ? [{ name: topic.category, url: `${BASE}/category/${encodeURIComponent(topic.category)}` }] : []),
    { name: topic.name, url: `${BASE}/story/${data.story.id}` },
  ])
  // 실제 topic_relations에서 나온 항목(explanation 있는 것)만 FAQ 스키마에 포함 — 패딩된 항목은 제외
  const faqLd = generateFaqSchema(
    nextQuestions
      .filter((q) => q.explanation)
      .map((q) => ({ question: `${topic.name}와(과) ${q.topicName}은(는) 어떤 관계가 있나요?`, answer: q.explanation! }))
  )

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

      {/* 보조 브레드크럼 — 탐험의 중심은 9/10번(다음 질문·Question Graph)이고, 이건 위치 확인용 */}
      <div style={{ padding: '16px 0 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', flexWrap: 'wrap' }}>
        <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>뉴스저울</Link>
        {topic.category && (
          <>
            <span>›</span>
            <Link href={`/category/${encodeURIComponent(topic.category)}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{topic.category}</Link>
          </>
        )}
        <span>›</span>
        <Link href={`/topic/${topic.slug}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{topic.name}</Link>
      </div>

      {/* 1. 질문 + 2. 오늘의 무게 */}
      <div style={{ padding: '16px 0 20px', borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          {topic.category && (
            <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }}>
              {categoryIcon(topic.category)} {topic.category}
            </div>
          )}
          <div style={{ fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: 'var(--accent-soft)', border: '1px solid rgba(217,164,65,.3)', color: 'var(--accent)' }}>
            오늘 무게 {topic.importanceScore}
          </div>
        </div>
        <h1 style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontWeight: 400, fontSize: 'clamp(24px,3.6vw,34px)', lineHeight: 1.4, marginBottom: 10, color: 'var(--text)' }}>
          {topic.name}
        </h1>
        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>오늘 사람들이 얼마나 주목하고 있는지를 보여주는 지표입니다</p>
      </div>

      {/* 3. 30초 이해 */}
      {topic.summary && (
        <div style={{ marginBottom: 28, background: 'var(--card)', border: '1px solid var(--border2)', borderRadius: 14, padding: '18px', borderLeft: '3px solid var(--accent)' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 8, letterSpacing: '.06em', textTransform: 'uppercase' }}>⏱ 30초 이해</p>
          <p style={{ fontSize: 14.5, color: 'var(--text)', lineHeight: 1.8 }}>{topic.summary}</p>
        </div>
      )}

      {/* 4. 왜 중요한가 (+ 다른 시각) */}
      {(topic.aiOutlook || topic.aiCounterView) && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            왜 중요한가
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topic.aiOutlook && <ContextBlock icon="🔮" label="지금 이게 왜 중요한가" text={topic.aiOutlook} />}
            {topic.aiCounterView && <ContextBlock icon="🔄" label="다른 시각" text={topic.aiCounterView} />}
          </div>
          <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 10 }}>뉴스저울 자동 분석 · 참고용</p>
        </div>
      )}

      {/* 5. 배경 설명 */}
      {(aiContext.historical_comparison || aiContext.international_response) && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            배경 설명
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {aiContext.historical_comparison && (
              <ContextBlock icon="🕰️" label="최근 유사 사례와 비교" text={aiContext.historical_comparison} />
            )}
            {aiContext.international_response && (
              <ContextBlock icon="🌐" label="해외는 어떻게 대응했는가" text={aiContext.international_response} />
            )}
          </div>
        </div>
      )}

      {/* 6. 우리에게 어떤 영향을 줄까? — 지금은 industry_impact 재사용, 향후 디지털 편집국에서 전용 필드 추가 예정 */}
      {aiContext.industry_impact && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            우리에게 어떤 영향을 줄까?
          </div>
          <ContextBlock icon="🏠" label="우리 삶에 미치는 영향" text={aiContext.industry_impact} />
          <p style={{ fontSize: 9, color: 'var(--muted)', marginTop: 10 }}>뉴스저울 자동 분석 · 참고용</p>
        </div>
      )}

      {/* 7. 관련 기사 및 공식 출처 */}
      {articles.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            관련 기사 및 출처 ({articles.length}개)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {articles.map((a) => (
              <a key={a.id} href={a.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{a.title}</span>
                  {a.outlet && <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>{a.outlet}</span>}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 8. 함께 연결된 Topic (최대 3개) */}
      {connectedTopics.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            함께 연결된 Topic
          </div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 6, WebkitOverflowScrolling: 'touch' }}>
            {connectedTopics.map((t) => (
              <div key={t.id} style={{ flexShrink: 0, width: 180 }}>
                <SignatureCard href={`/topic/${t.slug}`} seed={t.slug} icon={t.category ? categoryIcon(t.category) : '🔗'} badge={t.category || undefined} title={t.name} size="sm" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 9. 사람들이 이어서 가장 많이 본 질문 */}
      {nextQuestions.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
            사람들이 이어서 가장 많이 본 질문
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 8 }}>
            {nextQuestions.map((q) => (
              <Link key={q.storyId} href={`/story/${q.storyId}`} style={{ textDecoration: 'none' }}>
                <div style={{ border: '1px solid var(--border)', background: 'var(--card)', borderRadius: 14, padding: '14px 16px', height: '100%', display: 'flex', flexDirection: 'column', gap: 5, transition: 'border-color .15s' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', lineHeight: 1.5 }}>{q.topicName}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                    {q.explanation || '오늘 많은 사람이 함께 보고 있는 질문입니다'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 10. Question Graph — 패딩 없이 실제 연결만. 연결이 없으면 빈 영역 대신 안내 문구 */}
      <div style={{ marginBottom: 40 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
          Question Graph
        </div>
        {graphNodes.length > 0 ? (
          <QuestionGraph nodes={graphNodes} />
        ) : (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--border2)', borderRadius: 14, padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            아직 연결된 질문을 분석하는 중입니다.
          </div>
        )}
      </div>
    </div>
  )
}
