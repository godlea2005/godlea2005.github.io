import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { SiteSettings } from '../src/components/SiteSettings'
import { getInitialPreference, resolveTheme } from '../src/lib/theme'
import { useThemePreference } from '../src/lib/useThemePreference'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
it('exposes search, announcements and three explicit theme choices', () => {
  const search = vi.fn(), notice = vi.fn(), setPreference = vi.fn(), setOpen = vi.fn()
  render(<SiteSettings open onOpenChange={setOpen} onSearch={search} onAnnouncements={notice} preference="dark" onPreferenceChange={setPreference} />)
  fireEvent.click(screen.getByRole('button', { name: /搜索/ }))
  expect(search).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: /公告/ }))
  expect(notice).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('radio', { name: '跟随系统' }))
  expect(setPreference).toHaveBeenCalledWith('system')
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(setOpen).toHaveBeenCalledWith(false)
})
it('keeps legacy manual preferences and resolves system separately', () => {
  localStorage.setItem('wenhao-theme', 'light')
  expect(getInitialPreference()).toBe('light')
  localStorage.setItem('wenhao-theme', 'system')
  expect(getInitialPreference()).toBe('system')
  expect(['dark','light']).toContain(resolveTheme('system'))
})
it('tracks system changes without replacing the saved system preference', () => {
  let dark = false
  const listeners = new Set<() => void>()
  vi.spyOn(window, 'matchMedia').mockImplementation(() => ({ get matches() { return dark }, addEventListener: (_event: string, callback: () => void) => listeners.add(callback), removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback) }) as MediaQueryList)
  localStorage.setItem('wenhao-theme','system')
  const view = renderHook(useThemePreference)
  expect(view.result.current.theme).toBe('light')
  act(() => { dark = true; listeners.forEach(callback => callback()) })
  expect(view.result.current.theme).toBe('dark')
  expect(localStorage.getItem('wenhao-theme')).toBe('system')
  act(() => view.result.current.setPreference('light'))
  expect(view.result.current.theme).toBe('light')
  expect(localStorage.getItem('wenhao-theme')).toBe('light')
  view.unmount()
  expect(listeners.size).toBe(0)
})
it('closes the nonmodal settings when keyboard focus leaves its root', async () => {
  const close = vi.fn()
  render(<><SiteSettings open onOpenChange={close} onSearch={vi.fn()} onAnnouncements={vi.fn()} preference="dark" onPreferenceChange={vi.fn()} /><button>背景入口</button></>)
  screen.getByRole('radio',{name:'跟随系统'}).focus()
  await userEvent.tab()
  expect(screen.getByRole('button',{name:'背景入口'})).toHaveFocus()
  expect(close).toHaveBeenCalledWith(false)
})
