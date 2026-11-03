import { lazy, Suspense, useEffect, useState } from 'react'
import { HomePage } from './components/HomePage'
import { FloatingHeader } from './components/FloatingHeader'
import { TargetCursor } from './components/TargetCursor'
import { RouteScrollBoundary } from './components/RouteScrollBoundary'
import { GlobalMusicDock } from './music/GlobalMusicDock'
import { isSiteSubpageRoute, parseSiteRoute } from './lib/siteRoutes'
import { useThemePreference } from './lib/useThemePreference'
import { createHeavyLazyRoute, isHeavyRouteId } from './lib/heavyRouteLoading'
import { RouteLoadingScreen } from './components/RouteLoadingScreen'

const MusicPage = createHeavyLazyRoute('music', () => import('./components/MusicPage').then((module) => ({ default: module.MusicPage })))
const GuestbookPage = createHeavyLazyRoute('guestbook', () => import('./components/GuestbookPage').then((module) => ({ default: module.GuestbookPage })))
const CommerceStudioPage = createHeavyLazyRoute('ai-commerce', () => import('./commerce/CommerceStudioPage').then((module) => ({ default: module.CommerceStudioPage })))
const CommerceAdminPage = createHeavyLazyRoute('commerce-admin', () => import('./commerce/CommerceAdminPage').then((module) => ({ default: module.CommerceAdminPage })))
const ToolNavigationPage = createHeavyLazyRoute('tools', () => import('./components/ToolNavigationPage').then((module) => ({ default: module.ToolNavigationPage })))
const WritingIndexPage = lazy(() => import('./editorial/WritingIndexPage').then((module) => ({ default: module.WritingIndexPage })))
const ArticlePage = lazy(() => import('./editorial/ArticlePage').then((module) => ({ default: module.ArticlePage })))
const WorkIndexPage = lazy(() => import('./editorial/WorkIndexPage').then((module) => ({ default: module.WorkIndexPage })))
const ProjectPage = lazy(() => import('./editorial/ProjectPage').then((module) => ({ default: module.ProjectPage })))

const resolvePageHash = () => {
  const isGuestbookAuthReturn = new URLSearchParams(window.location.search).get('auth') === 'guestbook'
  return isGuestbookAuthReturn ? '#guestbook' : window.location.hash
}

function App() {
  const { theme, preference, setPreference } = useThemePreference()
  const [pageHash, setPageHash] = useState(resolvePageHash)
  const route = parseSiteRoute(pageHash)
  const musicPage = route.kind === 'static' && route.page === 'music'
  const guestbookPage = route.kind === 'static' && route.page === 'guestbook'
  const commercePage = route.kind === 'static' && route.page === 'ai-commerce'
  const commerceAdminPage = route.kind === 'static' && route.page === 'commerce-admin'
  const toolsPage = route.kind === 'static' && route.page === 'tools'
  const subpage = isSiteSubpageRoute(route)
  const heavyRoute = route.kind === 'static' && isHeavyRouteId(route.page) ? route.page : null

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
    setPreference(next)
  }

  return (
    <div className={`site-shell${!subpage ? ' is-home' : ''}${commercePage || commerceAdminPage ? ' is-commerce' : ''}`}>
      <FloatingHeader theme={theme} themePreference={preference} onThemePreferenceChange={setPreference} pageHash={pageHash} onToggleTheme={toggleTheme} />
      <TargetCursor />

      <RouteLoadingScreen key={heavyRoute ?? 'non-heavy'} route={heavyRoute} />
      <Suspense fallback={heavyRoute ? null : <main className="route-loading-inline" role="status" aria-live="polite">载入现场笔记</main>}>
        <RouteScrollBoundary pageHash={pageHash}>
          {musicPage ? <MusicPage /> : guestbookPage ? <GuestbookPage /> : commercePage ? <CommerceStudioPage /> : commerceAdminPage ? <CommerceAdminPage /> : toolsPage ? <ToolNavigationPage /> : route.kind === 'static' && route.page === 'writing' ? <WritingIndexPage /> : route.kind === 'article' ? <ArticlePage slug={route.slug} /> : route.kind === 'static' && route.page === 'work' ? <WorkIndexPage /> : route.kind === 'project' ? <ProjectPage slug={route.slug} /> : <HomePage theme={theme} />}
        </RouteScrollBoundary>
      </Suspense>
      {!musicPage && <GlobalMusicDock commerceMode={commercePage || commerceAdminPage} guestbookMode={guestbookPage} />}
    </div>
  )
}

export default App
