// content_type 'guide' → HowTo

export function generateHowToSchema(params: {
  name: string
  description?: string | null
  steps: { name: string; text: string }[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: params.name,
    description: params.description || undefined,
    step: params.steps.length > 0
      ? params.steps.map((s) => ({ '@type': 'HowToStep', name: s.name, text: s.text }))
      : undefined,
  }
}
