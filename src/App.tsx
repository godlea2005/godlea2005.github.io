import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { HomePage } from './components/HomePage'
import { FloatingHeader } from './components/FloatingHeader'
import { TargetCursor } from './components/TargetCursor'
import { RouteScrollBoundary } from './components/RouteScrollBoundary'
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
    // Hash routes own their scroll position; preserve the browser's setting on teardown.
    const previousRestoration = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    const handleLocationChange = () => setPageHash(resolvePageHash())
    window.addEventListener('hashchange', handleLocationChange)
    window.addEventListener('popstate', handleLocationChange)
    return () => {
      window.history.scrollRestoration = previousRestoration
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

      <Suspense fallback={<main className={commercePage || commerceAdminPage ? 'commerce-loading' : 'music-loading'}>
        {musicPage ? 'LOADING AUDIO FIELD' : guestbookPage ? 'CONNECTING OPEN CHANNEL' : commercePage ? 'OPENING COMMERCE LAB' : commerceAdminPage ? 'OPENING OPERATOR CONSOLE' : toolsPage ? 'OPENING TOOL INDEX' : '载入现场笔记'}
      </main>}>
        <RouteScrollBoundary pageHash={pageHash}>
          {musicPage ? <MusicPage /> : guestbookPage ? <GuestbookPage /> : commercePage ? <CommerceStudioPage /> : commerceAdminPage ? <CommerceAdminPage /> : toolsPage ? <ToolNavigationPage /> : route.kind === 'static' && route.page === 'writing' ? <WritingIndexPage /> : route.kind === 'article' ? <ArticlePage slug={route.slug} /> : route.kind === 'static' && route.page === 'work' ? <WorkIndexPage /> : route.kind === 'project' ? <ProjectPage slug={route.slug} /> : <HomePage theme={theme} />}
        </RouteScrollBoundary>
      </Suspense>
      {!musicPage && <GlobalMusicDock commerceMode={commercePage || commerceAdminPage} guestbookMode={guestbookPage} />}
    </div>
  )
}

export default App
