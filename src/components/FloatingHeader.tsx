import { useEffect, useRef, useState } from 'react'
import { site } from '../content/site'
import type { Theme } from '../lib/theme'
import './floating-header.css'

type FloatingHeaderProps = {
  theme: Theme
  pageHash: string
  onToggleTheme: () => void
}

const menuGroups = [
  { label: '文章', items: [['归档', '#archive'], ['标签图谱', '#notes'], ['文章列表', '#notes']] },
  { label: '联系我', items: [['友链', '#about'], ['留言', '#guestbook'], ['社群', '#about']] },
  { label: '我的', items: [['日历', '#notes'], ['相册', '#archive'], ['赞助', '#about'], ['音乐', '#music'], ['关于', '#about']] },
]

export function FloatingHeader({ theme, pageHash, onToggleTheme }: FloatingHeaderProps) {
  const rootRef = useRef<HTMLElement>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const homeActive = pageHash !== '#music' && pageHash !== '#guestbook' && pageHash !== '#ai-commerce'

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setActiveMenu(null)
        setMobileOpen(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setActiveMenu(null)
      setMobileOpen(false)
      setSearchOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    setActiveMenu(null)
    setMobileOpen(false)
  }, [pageHash])

  const closeNavigation = () => {
    setActiveMenu(null)
    setMobileOpen(false)
  }

  return (
    <>
      <header className="floating-header" ref={rootRef}>
        <a className="floating-brand glass-pill" href="#top" onClick={closeNavigation} aria-label="文昊，回到首页">
          <span>W</span><strong>{site.name}</strong><i>.</i>
        </a>

        <nav className={`floating-nav glass-pill${mobileOpen ? ' is-mobile-open' : ''}`} id="floating-nav" aria-label="主导航">
          <div className="floating-nav-primary">
            <a className={homeActive ? 'is-current' : ''} href="#top" onClick={closeNavigation}><span aria-hidden="true">⌂</span>主页</a>
            <a className={pageHash === '#ai-commerce' ? 'is-current' : ''} href="#ai-commerce" onClick={closeNavigation}>AI 电商设计</a>
            <a href="#archive" onClick={closeNavigation}>个人主站 <sup>↗</sup></a>
            <a href="#notes" onClick={closeNavigation}>工具导航</a>
            {menuGroups.map((group) => (
              <div className={`floating-nav-group${activeMenu === group.label ? ' is-open' : ''}`} key={group.label}>
                <button
                  type="button"
                  onClick={() => setActiveMenu((current) => current === group.label ? null : group.label)}
                  aria-expanded={activeMenu === group.label}
                >
                  {group.label}<i aria-hidden="true">⌄</i>
                </button>
                <div className="floating-dropdown" aria-hidden={activeMenu !== group.label}>
                  {group.items.map(([name, href]) => <a href={href} key={name} onClick={closeNavigation}>{name}<span>↗</span></a>)}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="floating-actions glass-pill">
          <button className="floating-search" type="button" onClick={() => setSearchOpen(true)} aria-label="打开搜索">
            <kbd>Ctrl K</kbd><span aria-hidden="true">⌕</span>
          </button>
          <button className="floating-theme" type="button" onClick={onToggleTheme} aria-label={`切换至${theme === 'dark' ? '浅色' : '深色'}模式`}>
            <span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span>
          </button>
          <button
            className="floating-menu-toggle"
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-controls="floating-nav"
          >
            {mobileOpen ? '关闭' : '目录'}<i aria-hidden="true" />
          </button>
        </div>
      </header>

      {searchOpen && (
        <div className="search-layer" role="dialog" aria-modal="true" aria-label="搜索">
          <div>
            <button type="button" onClick={() => setSearchOpen(false)} aria-label="关闭搜索">×</button>
            <p>SEARCH / WENHAO</p>
            <input autoFocus placeholder="搜索作品、笔记或标签" onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false) }} />
            <small>首版搜索入口已就绪，内容索引将在接入 CMS 后启用。</small>
          </div>
        </div>
      )}
    </>
  )
}
