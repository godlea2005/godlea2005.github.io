import { useEffect, useState } from 'react'
import { experiments, notices, site } from './content/site'
import { ProjectArchive } from './components/ProjectArchive'
import { StatusScene } from './components/StatusScene'
import { StudioMap } from './components/StudioMap'
import { applyTheme, getInitialTheme, type Theme } from './lib/theme'

function App() {
  const [theme, setTheme] = useState<Theme>('dark')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const initial = getInitialTheme()
    setTheme(initial)
    applyTheme(initial)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  return (
    <div className="site-shell">
      <header className="site-header frame">
        <a href="#top" className="wordmark" aria-label="文昊，回到首页"><span>W</span>{site.name}<i>.</i></a>
        <button className="menu-button" type="button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-controls="main-nav">{menuOpen ? '关闭' : '目录'}<i aria-hidden="true" /></button>
        <nav className={menuOpen ? 'main-nav is-open' : 'main-nav'} id="main-nav" aria-label="主导航">
          <a href="#archive" onClick={() => setMenuOpen(false)}>作品档案</a>
          <a href="#notes" onClick={() => setMenuOpen(false)}>实验记录</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>关于我</a>
          <a href={`mailto:${site.contacts.email}`} onClick={() => setMenuOpen(false)}>联系</a>
        </nav>
        <button className="theme-button" type="button" onClick={toggleTheme} aria-label={`切换至${theme === 'dark' ? '浅色' : '深色'}模式`}><span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span><b>{theme === 'dark' ? 'LIGHT' : 'DARK'}</b></button>
      </header>

      <main id="top">
        <StatusScene />
        <section className="notice-bar" aria-label="站点动态"><div className="notice-flow">{[...notices, ...notices].map((notice, index) => <p key={`${notice}-${index}`}><i>✦</i>{notice}</p>)}</div></section>
        <StudioMap />
        <ProjectArchive />
        <section className="notes-section frame" id="notes" aria-labelledby="notes-title">
          <div className="section-kicker"><span>03</span><p>WORKING NOTES</p><i /></div>
          <div className="notes-title-row"><h2 id="notes-title">实验记录</h2><p>还在发生的学习、判断与小小的验证。</p></div>
          <div className="notes-list">{experiments.map(([number, title, category]) => <a href="#notes" className="note-link" key={number}><span>{number}</span><strong>{title}</strong><em>{category}</em><i>↗</i></a>)}</div>
        </section>
      </main>

      <footer className="site-footer frame" id="about">
        <div><p className="footer-label">NEXT SIGNAL / 04</p><h2>如果你也在<br />认真做点什么。</h2></div>
        <div className="footer-contact"><p>可以在这里找到我</p><a href={`mailto:${site.contacts.email}`}>{site.contacts.email}<span>↗</span></a></div>
        <div className="footer-bottom"><span>© 2026 WENHAO</span><span>A SMALL DIGITAL STUDIO</span><span>MADE WITH CARE</span></div>
      </footer>
    </div>
  )
}

export default App
