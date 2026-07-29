import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getTopicBySlug } from '@/lib/topics'
import { generateArticleSchema } from '@/lib/schema/article'
import { generateBreadcrumbSchema } from '@/lib/schema/breadcrumb'
import { generateFaqSchema } from '@/lib/schema/faq'

export const revalidate = 600
const BASE = 'https://newsjeoul.co.kr'

// 내부링크 최소 3개 보장(PM 지시 2026-07-19) — 형제 앵글이 적거나 없어도 관련 Topic으로 채운다.
async function getRelatedTopicsForLink(topicId: string) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  const { data } = await supabase
    .from('topic_relations')
    .select('source_topic_id, target_topic_id, source:topics!topic_relations_source_topic_id_fkey(slug,name), target:topics!topic_relations_target_topic_id_fkey(slug,name)')
    .or(`source_topic_id.eq.${topicId},target_topic_id.eq.${topicId}`)
    .order('strength_score', { ascending: false })
    .limit(4)
  return (data || [])
    .map((row: any) => (row.source_topic_id === topicId ? row.target : row.source))
    .filter(Boolean)
}

// 문단 사이 빈 줄로 구분된 본문을 <p> 목록으로 변환 — 메인 Topic 페이지의 렌더링 관례와 통일.
function renderBody(body: string) {
  return body.split(/\n\s*\n/).filter(Boolean).map((para, i) => (
    <p key={i} style={{ fontSize: 16.5, color: 'var(--text)', lineHeight: 1.9, marginBottom: 20 }}>{para.trim()}</p>
  ))
}

async function getDraft(slug: string, angle: string) {
  const topic = await getTopicBySlug(slug)
  if (!topic) return null
  const drafts: any[] = topic.ai_context?.expansion_drafts || []
  const draft = drafts.find((d) => d.angle === angle)
  if (!draft) return null
  return { topic, draft, siblings: drafts.filter((d) => d.angle !== angle) }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; angle: string }> }): Promise<Metadata> {
  const { slug, angle } = await params
  const found = await getDraft(slug, angle)
  if (!found) return { title: '뉴스저울', robots: { index: false, follow: false } }
  const { topic, draft } = found
  const title = `${draft.title} — 뉴스저울`
  const desc = draft.lead || topic.summary || ''
  const url = `${BASE}/topic/${slug}/${angle}`
  return {
    title,
    description: desc,
    alternates: { canonical: url },
    openGraph: { title: draft.title, description: desc, url, images: [{ url: `${BASE}/og?type=topic&title=${encodeURIComponent(draft.title)}`, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: draft.title, description: desc },
  }
}

export default async function ExpansionDraftPage({ params }: { params: Promise<{ slug: string; angle: string }> }) {
  const { slug, angle } = await params
  const found = await getDraft(slug, angle)
  if (!found) notFound()
  const { topic, draft, siblings } = found
  // 형제 앵글이 2개 미만이면 관련 Topic으로 채워 항상 3개 이상 내부링크를 보장한다.
  const relatedTopics = siblings.length < 2 ? await getRelatedTopicsForLink(topic.id) : []

  const jsonLd = generateArticleSchema({
    headline: draft.title,
    description: draft.lead || topic.summary,
    dateModified: draft.generated_at,
    url: `${BASE}/topic/${slug}/${angle}`,
  })
  const breadcrumbLd = generateBreadcrumbSchema([
    { name: '뉴스저울', url: BASE },
    { name: topic.name, url: `${BASE}/topic/${topic.slug}` },
    { name: draft.label, url: `${BASE}/topic/${topic.slug}/${angle}` },
  ])
  // FAQ 앵글이고 구조화된 qa가 있을 때만 FAQPage 스키마 추가(PM 지시 2026-07-22 "FAQPage 가능한 경우 적용")
  const faqLd = draft.angle === 'faq' && Array.isArray(draft.qa) && draft.qa.length > 0
    ? generateFaqSchema(draft.qa)
    : null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 16px' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}

      <div style={{ padding: '16px 0 0', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
        <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>뉴스저울</Link>
        <span>›</span>
        <Link href={`/topic/${topic.slug}`} style={{ color: 'var(--muted)', textDecoration: 'none' }}>{topic.name}</Link>
        <span>›</span>
        <span>{draft.label}</span>
      </div>

      <div style={{ padding: '20px 0 36px' }}>
        {draft.display_keywords?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: 16 }}>
            {draft.display_keywords.slice(0, 4).map((kw: string, i: number) => (
              <span key={kw} style={{ fontSize: i === 0 ? 'clamp(18px,2.8vw,24px)' : 16, fontWeight: 800, color: i === 0 ? 'var(--accent)' : 'var(--text)' }}>{kw}</span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 14 }}>
          {draft.label.toUpperCase()}
        </div>
        <h1 style={{ fontSize: 'clamp(24px,3.6vw,36px)', fontWeight: 800, lineHeight: 1.28, marginBottom: 18 }}>{draft.title}</h1>
        {draft.editor && (
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 14 }}>{draft.editor.name} 에디터({draft.editor.perspective})가 정리했습니다</div>
        )}
        <p style={{ fontSize: 18, fontWeight: 500, color: 'var(--text)', lineHeight: 1.9, marginBottom: 24 }}>{draft.lead}</p>
        {renderBody(draft.body)}

        {/* FAQPage 구조화 데이터와 실제로 일치하는 화면상 Q&A(숨김 데이터만 있는 것 방지) */}
        {faqLd && (
          <div style={{ marginTop: 28 }}>
            {draft.qa.map((item: { question: string; answer: string }, i: number) => (
              <div key={i} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Q. {item.question}</div>
                <div style={{ fontSize: 15, color: 'var(--text2)', lineHeight: 1.8 }}>A. {item.answer}</div>
              </div>
            ))}
          </div>
        )}

        {/* 내부링크 — 원 Topic 및 다른 앵글로 연결(탐험 경로) */}
        <div style={{ marginTop: 36, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 12, textTransform: 'uppercase' }}>더 읽어보기</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link href={`/topic/${topic.slug}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
              → {topic.name} 전체 보기
            </Link>
            {siblings.map((s: any) => (
              <Link key={s.angle} href={`/topic/${topic.slug}/${s.angle}`} style={{ fontSize: 14, color: 'var(--text)', textDecoration: 'none' }}>
                → {s.title}
              </Link>
            ))}
            {relatedTopics.map((t: any) => (
              <Link key={t.slug} href={`/topic/${t.slug}`} style={{ fontSize: 14, color: 'var(--text)', textDecoration: 'none' }}>
                → {t.name}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
