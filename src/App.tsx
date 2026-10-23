import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { HomePage } from './components/HomePage'
import { FloatingHeader } from './components/FloatingHeader'
import { TargetCursor } from './components/TargetCursor'
import { GlobalMusicDock } from './music/GlobalMusicDock'
import { isSiteSubpageRoute, parseSiteRoute } from './lib/siteRoutes'
import { applyTheme, getInitialTheme, type Theme } from './lib/theme'

const MusicPage = lazy(() => import('./components/MusicPage').then((module) => ({ default: module.MusicPage })))
const GuestbookPage = lazy(() => import('./components/GuestbookPage').then((module) => ({ default: module.GuestbookPage })))
const CommerceStudioPage = lazy(() => import('./commerce/CommerceStudioPage').then((module) => ({ default: module.CommerceStudioPage })))
const CommerceAdminPage = lazy(() => import('./commerce/CommerceAdminPage').then((module) => ({ default: module.CommerceAdminPage })))
const ToolNavigationPage = lazy(() => import('./components/ToolNavigationPage').then((module) => ({ default: module.ToolNavigationPage })))
const WritingIndexPage = lazy(() => import('./editorial/WritingIndexPage').then((module) => ({ default: module.WritingIndexPage })))
const ArticlePage = lazy(() => import('./editorial/ArticlePage').then((module) => ({ default: module.ArticlePage })))
const WorkIndexPage = lazy(() => import('./editorial/WorkIndexPage').then((module) => ({ default: module.WorkIndexPage })))
const ProjectPage = lazy(() => import('./editorial/ProjectPage').then((module) => ({ default: module.ProjectPage })))

const resolvePageHash = () => {
  const isGuestbookAuthReturn = new URLSearchParams(window.location.search).get('auth') === 'guestbook'
  return isGuestbookAuthReturn ? '#guestbook' : window.location.hash
}

function App() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme())
  const [pageHash, setPageHash] = useState(resolvePageHash)
  const route = parseSiteRoute(pageHash)
  const musicPage = route.kind === 'static' && route.page === 'music'
  const guestbookPage = route.kind === 'static' && route.page === 'guestbook'
  const commercePage = route.kind === 'static' && route.page === 'ai-commerce'
  const commerceAdminPage = route.kind === 'static' && route.page === 'commerce-admin'
  const toolsPage = route.kind === 'static' && route.page === 'tools'
  const subpage = isSiteSubpageRoute(route)

  useLayoutEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    const handleLocationChange = () => setPageHash(resolvePageHash())
    window.addEventListener('hashchange', handleLocationChange)
    window.addEventListener('popstate', handleLocationChange)
    return () => {
      window.removeEventListener('hashchange', handleLocationChange)
      window.removeEventListener('popstate', handleLocationChange)
    }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
  }

  return (
    <div className={`site-shell${!subpage ? ' is-home' : ''}${commercePage || commerceAdminPage ? ' is-commerce' : ''}`}>
      <FloatingHeader theme={theme} pageHash={pageHash} onToggleTheme={toggleTheme} />
      <TargetCursor />

      {musicPage ? <Suspense fallback={<main className="music-loading">LOADING AUDIO FIELD</main>}><MusicPage /></Suspense> : guestbookPage ? <Suspense fallback={<main className="music-loading">CONNECTING OPEN CHANNEL</main>}><GuestbookPage /></Suspense> : commercePage ? <Suspense fallback={<main className="commerce-loading">OPENING COMMERCE LAB</main>}><CommerceStudioPage /></Suspense> : commerceAdminPage ? <Suspense fallback={<main className="commerce-loading">OPENING OPERATOR CONSOLE</main>}><CommerceAdminPage /></Suspense> : toolsPage ? <Suspense fallback={<main className="music-loading">OPENING TOOL INDEX</main>}><ToolNavigationPage /></Suspense> : route.kind === 'static' && route.page === 'writing' ? <Suspense fallback={<main className="editorial-loading">载入文章索引</main>}><WritingIndexPage /></Suspense> : route.kind === 'article' ? <Suspense fallback={<main className="editorial-loading">载入文章</main>}><ArticlePage slug={route.slug} /></Suspense> : route.kind === 'static' && route.page === 'work' ? <Suspense fallback={<main className="editorial-loading">载入项目索引</main>}><WorkIndexPage /></Suspense> : route.kind === 'project' ? <Suspense fallback={<main className="editorial-loading">载入项目</main>}><ProjectPage slug={route.slug} /></Suspense> : <HomePage theme={theme} />}
      {!musicPage && <GlobalMusicDock commerceMode={commercePage || commerceAdminPage} guestbookMode={guestbookPage} />}
    </div>
  )
}

export default App
