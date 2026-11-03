import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { navigationGroups } from '../content/navigation'
import type { Theme, ThemePreference } from '../lib/theme'
import { CardNav } from './CardNav'
import { SiteSearchDialog } from './SiteSearchDialog'
import { SiteSettings } from './SiteSettings'
import { SiteAnnouncements } from './SiteAnnouncements'
import './floating-header.css'

type FloatingHeaderProps = {
  theme: Theme
  pageHash: string
  onToggleTheme: () => void
  themePreference?: ThemePreference
  onThemePreferenceChange?: (preference: ThemePreference) => void
}

export function FloatingHeader({ theme, pageHash, onToggleTheme, themePreference, onThemePreferenceChange }: FloatingHeaderProps) {
  const { isAdmin } = useAuth()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [announcementOpen, setAnnouncementOpen] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const groups = useMemo(() => isAdmin ? navigationGroups.map((group) => group.id === 'connect'
    ? { ...group, destinations: [...group.destinations, { title: '管理后台', href: '#commerce-admin', detail: '运营与服务管理' }] }
    : group) : navigationGroups, [isAdmin])
  const closeNavigation = useCallback(() => setNavigationOpen(false), [])
  const closeSearch = useCallback(() => setSearchOpen(false), [])
  const focusSettings = () => document.querySelector<HTMLButtonElement>('.settings-trigger')?.focus()
  const openSearch = () => { focusSettings(); setSettingsOpen(false); setNavigationOpen(false); setAnnouncementOpen(false); setSearchOpen(true) }

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (document.querySelector('.route-loading-screen')) return
        // A visible modal already owns the keyboard and focus lifecycle.
        if (document.querySelector('[aria-modal="true"]:not([aria-label="搜索本站"])')) return
        focusSettings()
        setNavigationOpen(false)
        setSettingsOpen(false)
        setSearchOpen(current => !current)
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])

  useEffect(() => {
    setNavigationOpen(false)
    setSearchOpen(false)
    setSettingsOpen(false)
    setAnnouncementOpen(false)
  }, [isAdmin, pageHash])

  return <>
    <header className="floating-header">
      <a className="floating-brand" href="#top" aria-label="文昊，回到首页">
        <img className="floating-brand-avatar" src="/wenhao-avatar.png" alt="" width="36" height="36" /><strong>WENHAO</strong><i aria-hidden="true">.</i>
      </a>
      <CardNav groups={groups} currentHash={pageHash} open={navigationOpen} onOpenChange={open => { setNavigationOpen(open); if (open) setSettingsOpen(false) }} onNavigate={closeNavigation} />
      <div className="floating-actions">
        <SiteSettings open={settingsOpen} onOpenChange={open => { setSettingsOpen(open); if (open) setNavigationOpen(false) }} onSearch={openSearch} onAnnouncements={() => { focusSettings(); setSettingsOpen(false); setNavigationOpen(false); setSearchOpen(false); setAnnouncementOpen(true) }} preference={themePreference ?? theme} onPreferenceChange={value => { if (onThemePreferenceChange) onThemePreferenceChange(value); else if (value !== theme) onToggleTheme() }} />
      </div>
    </header>
    <SiteSearchDialog open={searchOpen} onClose={closeSearch} includeAdmin={isAdmin} />
    {announcementOpen && <SiteAnnouncements onClose={() => setAnnouncementOpen(false)} />}
  </>
}
