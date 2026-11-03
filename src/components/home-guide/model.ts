import { articleSummaries } from '../../editorial'

export const guideCategories = ['设计实践', '电商内容'].map(name => ({
  name, articles: articleSummaries.filter(article => (article.tags.includes('电商内容') ? '电商内容' : '设计实践') === name),
})).filter(category => category.articles.length)
export const guideTags = [...new Set(articleSummaries.flatMap(article => article.tags))]
export const recentArticles = [...articleSummaries].sort((a, b) => b.date.localeCompare(a.date))
export const writingFilterHref = (kind: 'category' | 'tag', value: string) => `#writing?${new URLSearchParams({ [kind]: value })}`
