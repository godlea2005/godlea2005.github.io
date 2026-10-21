export type ArticleBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: string[] }

export type Article = {
  slug: string
  title: string
  excerpt: string
  date: string
  readingMinutes: number
  tags: string[]
  featured: boolean
  body: ArticleBlock[]
}

export type ArticleSummary = Omit<Article, 'body'>

export type Project = {
  slug: string
  title: string
  summary: string
  role: string
  period: string
  tags: string[]
  cover: string
  coverAlt: string
  kind: 'personal-experiment'
  challenge: string
  process: string[]
  outcome: string
}

export type ProjectSummary = Omit<Project, 'challenge' | 'process' | 'outcome'>

export type VisualNote = {
  id: string
  image: string
  alt: string
  caption: string
  date: string
  ratio: 'portrait' | 'landscape' | 'square'
}
