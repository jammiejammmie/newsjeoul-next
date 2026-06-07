import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://newsjeoul.co.kr'
  const lastModified = new Date()

  return [
    { url: `${baseUrl}/`, lastModified, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/election`, lastModified, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/youtube`, lastModified, changeFrequency: 'daily', priority: 0.8 },
    { url: `${baseUrl}/media101`, lastModified, changeFrequency: 'daily', priority: 0.8 },
  ]
}
