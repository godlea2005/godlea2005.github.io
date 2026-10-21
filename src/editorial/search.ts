import { articleSearchContent, projectSearchContent, publicPageDestinations, toolSearchContent } from '../content/navigation'

export type SearchEntry = {
  id: string
  type: 'page' | 'article' | 'project' | 'tool'
  title: string
  detail: string
  href: string
  terms: string[]
  external: boolean
}

export type SearchGroup = { type: SearchEntry['type']; items: SearchEntry[] }

export function buildSiteSearchEntries({ includeAdmin = false }: { includeAdmin?: boolean } = {}): SearchEntry[] {
  const pages: SearchEntry[] = publicPageDestinations.map((page) => ({
    id: page.href,
    type: 'page',
    title: page.title,
    detail: page.detail,
    href: page.href,
    terms: [page.title, page.detail],
    external: false,
  }))
  if (includeAdmin) pages.push({
    id: '#commerce-admin', type: 'page', title: '管理后台', detail: '运营与服务管理',
    href: '#commerce-admin', terms: ['管理后台', '运营', '服务管理'], external: false,
  })

  const articles: SearchEntry[] = articleSearchContent.map((article) => ({
    id: article.slug,
    type: 'article',
    title: article.title,
    detail: article.excerpt,
    href: `#article/${article.slug}`,
    terms: [article.title, article.excerpt, ...article.tags],
    external: false,
  }))
  const projects: SearchEntry[] = projectSearchContent.map((project) => ({
    id: project.slug,
    type: 'project',
    title: project.title,
    detail: project.summary,
    href: `#project/${project.slug}`,
    terms: [project.title, project.summary, project.role, ...project.tags],
    external: false,
  }))
  const tools: SearchEntry[] = toolSearchContent.flatMap((category) => category.tools.map((tool) => ({
    id: tool.id,
    type: 'tool' as const,
    title: tool.name,
    detail: tool.description,
    href: tool.href,
    terms: [tool.name, tool.host, tool.description, tool.note, category.title, ...tool.tags],
    external: true,
  })))

  const unique = new Map<string, SearchEntry>()
  for (const entry of [...pages, ...articles, ...projects, ...tools]) {
    if (!unique.has(entry.href)) unique.set(entry.href, entry)
  }
  return [...unique.values()]
}

export function searchSite(entries: SearchEntry[], query: string): SearchGroup[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN')
  if (!normalized) {
    const shortcuts = entries.filter((entry) => entry.type === 'page').slice(0, 8)
    return shortcuts.length ? [{ type: 'page', items: shortcuts }] : []
  }
  const matches = entries.filter((entry) => [entry.title, entry.detail, ...entry.terms]
    .join(' ')
    .toLocaleLowerCase('zh-CN')
    .includes(normalized))
  const seen = new Set<string>()
  const groups: SearchGroup[] = []
  for (const entry of matches) {
    if (seen.has(entry.href)) continue
    seen.add(entry.href)
    const group = groups.find((candidate) => candidate.type === entry.type)
    if (group) group.items.push(entry)
    else groups.push({ type: entry.type, items: [entry] })
  }
  return groups
}
