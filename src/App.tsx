import { lazy, Suspense, useEffect, useLayoutEffect, useState } from 'react'
import { experiments, site } from './content/site'
import { CommerceHomeSection } from './components/CommerceHomeSection'
import { ProjectArchive } from './components/ProjectArchive'
import { StatusScene } from './components/StatusScene'
import { StudioMap } from './components/StudioMap'
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

      {musicPage ? <Suspense fallback={<main className="music-loading">LOADING AUDIO FIELD</main>}><MusicPage /></Suspense> : guestbookPage ? <Suspense fallback={<main className="music-loading">CONNECTING OPEN CHANNEL</main>}><GuestbookPage /></Suspense> : commercePage ? <Suspense fallback={<main className="commerce-loading">OPENING COMMERCE LAB</main>}><CommerceStudioPage /></Suspense> : commerceAdminPage ? <Suspense fallback={<main className="commerce-loading">OPENING OPERATOR CONSOLE</main>}><CommerceAdminPage /></Suspense> : toolsPage ? <Suspense fallback={<main className="music-loading">OPENING TOOL INDEX</main>}><ToolNavigationPage /></Suspense> : route.kind === 'static' && route.page === 'writing' ? <Suspense fallback={<main className="editorial-loading">载入文章索引</main>}><WritingIndexPage /></Suspense> : route.kind === 'article' ? <Suspense fallback={<main className="editorial-loading">载入文章</main>}><ArticlePage slug={route.slug} /></Suspense> : route.kind === 'static' && route.page === 'work' ? <Suspense fallback={<main className="editorial-loading">载入项目索引</main>}><WorkIndexPage /></Suspense> : route.kind === 'project' ? <Suspense fallback={<main className="editorial-loading">载入项目</main>}><ProjectPage slug={route.slug} /></Suspense> : <main id="top">
        <StatusScene theme={theme} />
        <CommerceHomeSection />
        <StudioMap />
        <ProjectArchive />
        <section className="notes-section frame" id="notes" aria-labelledby="notes-title">
          <div className="section-kicker"><span>04</span><p>WORKING NOTES</p><i /></div>
          <div className="notes-title-row"><h2 id="notes-title">实验记录</h2><p>更轻地记录仍在发生的学习、判断与验证。</p></div>
          <div className="notes-list">{experiments.map(([number, title, category]) => <a href="#notes" className="note-link" key={number}><span>{number}</span><strong>{title}</strong><em>{category}</em><i>↗</i></a>)}</div>
        </section>
      </main>}

      {!subpage && <footer className="site-footer frame" id="about">
        <div><p className="footer-label">NEXT SIGNAL / 04</p><h2>如果你也在<br />认真做点什么。</h2></div>
        <div className="footer-contact"><p>可以在这里找到我</p><a href={`mailto:${site.contacts.email}`}>{site.contacts.email}<span>↗</span></a></div>
        <div className="footer-bottom"><span>© 2026 WENHAO</span><span>A SMALL DIGITAL STUDIO</span><span>MADE WITH CARE</span></div>
      </footer>}
      {!musicPage && <GlobalMusicDock commerceMode={commercePage || commerceAdminPage} />}
    </div>
  )
}

export default App
