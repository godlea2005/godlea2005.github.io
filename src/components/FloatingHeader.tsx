import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { navigationGroups } from '../content/navigation'
import type { Theme } from '../lib/theme'
import { CardNav } from './CardNav'
import { SiteSearchDialog } from './SiteSearchDialog'
import './floating-header.css'

type FloatingHeaderProps = {
  theme: Theme
  pageHash: string
  onToggleTheme: () => void
}

export function FloatingHeader({ theme, pageHash, onToggleTheme }: FloatingHeaderProps) {
  const { isAdmin } = useAuth()
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const groups = useMemo(() => isAdmin ? navigationGroups.map((group) => group.id === 'connect'
    ? { ...group, destinations: [...group.destinations, { title: '管理后台', href: '#commerce-admin', detail: '运营与服务管理' }] }
    : group) : navigationGroups, [isAdmin])
  const closeNavigation = useCallback(() => setNavigationOpen(false), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchTriggerRef.current?.focus()
        setNavigationOpen(false)
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])

  useEffect(() => {
    setNavigationOpen(false)
    setSearchOpen(false)
  }, [isAdmin, pageHash])

  return <>
    <header className="floating-header">
      <a className="floating-brand" href="#top" aria-label="文昊，回到首页">
        <span aria-hidden="true">W</span><strong>WENHAO</strong><i aria-hidden="true">.</i>
      </a>
      <CardNav groups={groups} currentHash={pageHash} open={navigationOpen} onOpenChange={setNavigationOpen} onNavigate={closeNavigation} />
      <div className="floating-actions">
        <button ref={searchTriggerRef} className="floating-search" type="button" onClick={() => setSearchOpen(true)} aria-label="打开搜索">
          <span aria-hidden="true">⌕</span><kbd>⌘ / Ctrl K</kbd>
        </button>
        <button className="floating-theme" type="button" onClick={onToggleTheme} aria-label={`切换至${theme === 'dark' ? '浅色' : '深色'}模式`}>
          <span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span>
        </button>
      </div>
    </header>
    <SiteSearchDialog open={searchOpen} onClose={closeSearch} includeAdmin={isAdmin} />
  </>
}
