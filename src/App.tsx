import { lazy, Suspense, useEffect, useState } from 'react'
import { experiments, notices, site } from './content/site'
import { ProjectArchive } from './components/ProjectArchive'
import { StatusScene } from './components/StatusScene'
import { StudioMap } from './components/StudioMap'
import { FloatingHeader } from './components/FloatingHeader'
import { GlobalMusicDock } from './music/GlobalMusicDock'
import { applyTheme, getInitialTheme, type Theme } from './lib/theme'

const MusicPage = lazy(() => import('./components/MusicPage').then((module) => ({ default: module.MusicPage })))
const GuestbookPage = lazy(() => import('./components/GuestbookPage').then((module) => ({ default: module.GuestbookPage })))

const resolvePageHash = () => {
  const isGuestbookAuthReturn = new URLSearchParams(window.location.search).get('auth') === 'guestbook'
  return isGuestbookAuthReturn ? '#guestbook' : window.location.hash
}

function App() {
  const [theme, setTheme] = useState<Theme>('dark')
  const [pageHash, setPageHash] = useState(resolvePageHash)
  const musicPage = pageHash === '#music'
  const guestbookPage = pageHash === '#guestbook'

  useEffect(() => {
    const initial = getInitialTheme()
    setTheme(initial)
    applyTheme(initial)
  }, [])
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
    applyTheme(next)
  }

  return (
    <div className={`site-shell${!musicPage && !guestbookPage ? ' is-home' : ''}`}>
      <FloatingHeader theme={theme} pageHash={pageHash} onToggleTheme={toggleTheme} />

      {musicPage ? <Suspense fallback={<main className="music-loading">LOADING AUDIO FIELD</main>}><MusicPage /></Suspense> : guestbookPage ? <Suspense fallback={<main className="music-loading">CONNECTING OPEN CHANNEL</main>}><GuestbookPage /></Suspense> : <main id="top">
        <StatusScene />
        <section className="notice-bar" aria-label="站点动态"><div className="notice-flow">{[...notices, ...notices].map((notice, index) => <p key={`${notice}-${index}`}><i>✦</i>{notice}</p>)}</div></section>
        <StudioMap />
        <ProjectArchive />
        <section className="notes-section frame" id="notes" aria-labelledby="notes-title">
          <div className="section-kicker"><span>03</span><p>WORKING NOTES</p><i /></div>
          <div className="notes-title-row"><h2 id="notes-title">实验记录</h2><p>还在发生的学习、判断与小小的验证。</p></div>
          <div className="notes-list">{experiments.map(([number, title, category]) => <a href="#notes" className="note-link" key={number}><span>{number}</span><strong>{title}</strong><em>{category}</em><i>↗</i></a>)}</div>
        </section>
      </main>}

      {!musicPage && !guestbookPage && <footer className="site-footer frame" id="about">
        <div><p className="footer-label">NEXT SIGNAL / 04</p><h2>如果你也在<br />认真做点什么。</h2></div>
        <div className="footer-contact"><p>可以在这里找到我</p><a href={`mailto:${site.contacts.email}`}>{site.contacts.email}<span>↗</span></a></div>
        <div className="footer-bottom"><span>© 2026 WENHAO</span><span>A SMALL DIGITAL STUDIO</span><span>MADE WITH CARE</span></div>
      </footer>}
      {!musicPage && <GlobalMusicDock />}
    </div>
  )
}

export default App
