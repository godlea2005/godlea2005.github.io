import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { SiteSettings } from '../src/components/SiteSettings'
import { getInitialPreference, resolveTheme } from '../src/lib/theme'
import { useThemePreference } from '../src/lib/useThemePreference'

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks() })
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

it('retains an inert closing panel, reverses a rapid reopen and cleans the exit timer', () => {
  vi.useFakeTimers()
  const props = { onOpenChange: vi.fn(), onSearch: vi.fn(), onAnnouncements: vi.fn(), preference: 'light' as const, onPreferenceChange: vi.fn() }
  const view = render(<SiteSettings {...props} open />)
  view.rerender(<SiteSettings {...props} open={false} />)
  expect(screen.queryByRole('region', { name: '站点设置' })).not.toBeInTheDocument()
  expect(view.container.querySelector('.settings-panel')).toHaveAttribute('inert')
  act(() => vi.advanceTimersByTime(100))
  view.rerender(<SiteSettings {...props} open />)
  act(() => vi.advanceTimersByTime(240))
  expect(screen.getByRole('region', { name: '站点设置' })).toBeInTheDocument()
  view.rerender(<SiteSettings {...props} open={false} />)
  act(() => vi.advanceTimersByTime(240))
  expect(view.container.querySelector('.settings-panel')).not.toBeInTheDocument()
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})

it('does not schedule an exit for a never-opened menu and closes immediately with reduced motion', () => {
  vi.useFakeTimers()
  vi.spyOn(window,'matchMedia').mockImplementation(query => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList)
  const props = { onOpenChange: vi.fn(), onSearch: vi.fn(), onAnnouncements: vi.fn(), preference: 'system' as const, onPreferenceChange: vi.fn() }
  const view = render(<SiteSettings {...props} open={false} />)
  expect(vi.getTimerCount()).toBe(0)
  view.rerender(<SiteSettings {...props} open />)
  expect(view.container.querySelector('.settings-theme-options')).toHaveStyle('--theme-index: 2')
  view.rerender(<SiteSettings {...props} open={false} />)
  expect(view.container.querySelector('.settings-panel')).not.toBeInTheDocument()
  expect(vi.getTimerCount()).toBe(0)
})
