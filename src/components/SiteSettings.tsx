import { useEffect, useRef, type CSSProperties } from 'react'
import type { ThemePreference } from '../lib/theme'
import { useAnimatedPresence } from '../lib/useAnimatedPresence'
import { useMotionProfile } from '../lib/useMotionProfile'
import { SiteIcon } from './SiteIcon'
import './site-settings.css'

export function SiteSettings({ open, onOpenChange, onSearch, onAnnouncements, preference, onPreferenceChange }: {
  open: boolean; onOpenChange: (open: boolean) => void; onSearch: () => void; onAnnouncements: () => void;
  preference: ThemePreference; onPreferenceChange: (preference: ThemePreference) => void;
}) {
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const { reducedMotion } = useMotionProfile()
  const present = useAnimatedPresence(open, reducedMotion ? 0 : 240)
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) onOpenChange(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { onOpenChange(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
  }, [open, onOpenChange])
  return <div className="site-settings" ref={root} onBlur={event => { if (open && !event.currentTarget.contains(event.relatedTarget)) onOpenChange(false) }}>
    <button className="settings-trigger" ref={trigger} type="button" aria-label="打开设置" aria-expanded={open} aria-controls="site-settings-panel" onClick={() => onOpenChange(!open)}><SiteIcon name="settings" /></button>
    {present && <div className="settings-panel" id="site-settings-panel" role="region" aria-label="站点设置" data-open={open} aria-hidden={!open} inert={!open}>
      <button type="button" className="settings-row" onClick={() => { trigger.current?.focus(); onSearch() }}><SiteIcon name="search" /><span>搜索</span><kbd>Ctrl K</kbd></button>
      <button type="button" className="settings-row" onClick={() => { trigger.current?.focus(); onAnnouncements() }}><SiteIcon name="bell" /><span>公告</span><i className="settings-notice-dot" /></button>
      <div className="settings-row settings-theme-row"><SiteIcon name="sun" /><span>主题</span><div className="settings-theme-options" role="radiogroup" aria-label="主题模式" style={{ '--theme-index': ['light', 'dark', 'system'].indexOf(preference) } as CSSProperties}>
        <span className="settings-theme-indicator" aria-hidden="true" />
        {([{ value: 'light', label: '浅色', icon: 'sun' }, { value: 'dark', label: '深色', icon: 'moon' }, { value: 'system', label: '跟随系统', icon: 'system' }] as const).map(option => <button key={option.value} type="button" role="radio" aria-checked={preference === option.value} aria-label={option.label} title={option.label} onClick={() => onPreferenceChange(option.value)}><SiteIcon name={option.icon} /></button>)}
      </div></div>
    </div>}
  </div>
}
