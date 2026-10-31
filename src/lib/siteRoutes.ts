export type StaticPage =
  | 'music'
  | 'guestbook'
  | 'ai-commerce'
  | 'commerce-admin'
  | 'tools'
  | 'writing'
  | 'work'

export type SiteRoute =
  | { kind: 'home'; anchor: string }
  | { kind: 'static'; page: StaticPage }
  | { kind: 'article'; slug: string }
  | { kind: 'project'; slug: string }

const staticPageByHash: Record<string, StaticPage> = {
  '#music': 'music',
  '#guestbook': 'guestbook',
  '#ai-commerce': 'ai-commerce',
  '#commerce-admin': 'commerce-admin',
  '#tools': 'tools',
  '#writing': 'writing',
  '#work': 'work',
}

export const parseSiteRoute = (hash: string): SiteRoute => {
  if (hash.startsWith('#writing?')) return { kind: 'static', page: 'writing' }
  const article = hash.match(/^#article\/([a-z0-9]+(?:-[a-z0-9]+)*)$/)
  if (article) return { kind: 'article', slug: article[1] }

  const project = hash.match(/^#project\/([a-z0-9]+(?:-[a-z0-9]+)*)$/)
  if (project) return { kind: 'project', slug: project[1] }

  if (Object.hasOwn(staticPageByHash, hash)) return { kind: 'static', page: staticPageByHash[hash] }

  return { kind: 'home', anchor: hash.replace(/^#/, '') || 'top' }
}

export const isSiteSubpageRoute = (route: SiteRoute): boolean => route.kind !== 'home'

export const isRouteCurrent = (route: SiteRoute, destinationHash: string): boolean => {
  if (route.kind === 'static') return destinationHash === `#${route.page}`
  if (route.kind === 'article') return destinationHash === '#writing'
  if (route.kind === 'project') return destinationHash === '#work'
  return destinationHash === `#${route.anchor}`
}

export const isSiteSubpageHash = (hash: string): boolean => isSiteSubpageRoute(parseSiteRoute(hash))
