import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../src/auth/AuthProvider'

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('../src/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/AuthProvider')>()
  return { ...actual, useAuth: authMock.useAuth }
})

import { FloatingHeader } from '../src/components/FloatingHeader'
import { VisualNotes } from '../src/editorial/VisualNotes'

const auth = (isAdmin = false): AuthContextValue => ({
  configured: true, ready: true, user: null, isAnonymous: true, isAdmin,
  provider: null, providers: { github: true, google: true }, error: '',
  signIn: vi.fn(), signOut: vi.fn(), requireLogin: vi.fn(() => false),
})

describe('editorial card navigation', () => {
  beforeEach(() => authMock.useAuth.mockReturnValue(auth()))
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it.each(['Control', 'Meta'])('blocks %s+K throughout route loading and restores search afterward', async (modifier) => {
    const header = <FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />
    const { rerender } = render(<div className="site-shell">{header}<div className="route-loading-screen" /></div>)
    document.body.focus()
    const before = document.activeElement
    for (const className of ['route-loading-screen', 'route-loading-screen is-leaving']) {
      rerender(<div className="site-shell">{header}<div className={className} /></div>)
      const event = new KeyboardEvent('keydown', { key: 'k', ctrlKey: modifier === 'Control', metaKey: modifier === 'Meta', bubbles: true, cancelable: true })
      act(() => { window.dispatchEvent(event) })
      expect(event.defaultPrevented).toBe(true)
      expect(screen.queryByRole('dialog', { name: '搜索本站', hidden: true })).not.toBeInTheDocument()
      expect(document.querySelector('.site-search-layer')).toBeNull()
      expect(document.activeElement).toBe(before)
    }
    rerender(<div className="site-shell">{header}</div>)
    await userEvent.keyboard(`{${modifier}>}k{/${modifier}}`)
    const dialog = screen.getByRole('dialog', { name: '搜索本站' })
    expect(within(dialog).getByRole('textbox', { name: '搜索作品、笔记或标签' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '打开搜索' })).toHaveFocus()
  })

  it('keeps search and theme controls in one vertically centered 44px capsule', () => {
    render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    const search = screen.getByRole('button', { name: '打开搜索' })
    const theme = screen.getByRole('button', { name: /切换至.+模式/ })
    expect(search.querySelector('[aria-hidden="true"]')).toHaveClass('floating-action-icon')
    expect(theme.querySelector('[aria-hidden="true"]')).toHaveClass('floating-action-icon')
    expect(search.closest('.floating-actions')).toContainElement(theme)
  })

  it.each(['Control', 'Meta'])('ignores %s+K while Visual Notes owns the modal and preserves both focus lifecycles', async (modifier) => {
    render(<><FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} /><VisualNotes /></>)
    const noteTrigger = screen.getByRole('button', { name: '查看：雨夜工作室窗口' })
    await userEvent.click(noteTrigger)
    const close = screen.getByRole('button', { name: '关闭视觉随记' })
    expect(close).toHaveFocus()
    await userEvent.keyboard(`{${modifier}>}k{/${modifier}}`)
    expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(1)
    expect(screen.queryByRole('dialog', { name: '搜索本站', hidden: true })).not.toBeInTheDocument()
    expect(close).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(noteTrigger).toHaveFocus()
    expect(noteTrigger.closest('[inert]')).toBeNull()
    await userEvent.keyboard(`{${modifier}>}k{/${modifier}}`)
    expect(screen.getByRole('dialog', { name: '搜索本站' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '打开搜索' })).toHaveFocus()
  })

  it('expands three labeled groups, highlights the exact current route, and restores trigger focus on Escape', async () => {
    render(<FloatingHeader theme="dark" pageHash="#tools" onToggleTheme={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '打开导航' })

    await userEvent.click(trigger)
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(nav).toHaveClass('is-expanded')
    expect(within(nav).getByRole('heading', { name: '阅读' })).toBeInTheDocument()
    expect(within(nav).getByRole('heading', { name: '探索' })).toBeInTheDocument()
    expect(within(nav).getByRole('heading', { name: '连接' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: '文章' })).toHaveAttribute('href', '#featured')
    expect(within(nav).getByRole('link', { name: '工具导航' })).toHaveAttribute('aria-current', 'page')

    await userEvent.keyboard('{Escape}')
    expect(nav).not.toHaveClass('is-expanded')
    expect(trigger).toHaveFocus()
  })

  it('closes on an outside pointer and exposes its mobile drawer state accessibly', async () => {
    const { container } = render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '打开导航' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(document.body)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(container.querySelector('nav')).toHaveAttribute('aria-label', '主导航')
  })

  it('moves keyboard focus to the stable trigger before closing on destination activation', async () => {
    render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: '打开导航' })
    await userEvent.click(trigger)
    const destination = screen.getByRole('link', { name: '文章' })
    destination.focus()

    await userEvent.keyboard('{Enter}')

    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(destination.closest('nav')).toHaveAttribute('inert')
  })

  it('restores search focus to its visible trigger after Ctrl+K from the expanded nav', async () => {
    render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '打开导航' }))
    screen.getByRole('link', { name: '文章' }).focus()

    await userEvent.keyboard('{Control>}k{/Control}')
    const dialog = screen.getByRole('dialog', { name: '搜索本站' })
    expect(within(dialog).getByRole('textbox', { name: '搜索作品、笔记或标签' })).toHaveFocus()
    await userEvent.keyboard('{Escape}')

    const searchTrigger = screen.getByRole('button', { name: '打开搜索' })
    expect(searchTrigger).toHaveFocus()
    expect(searchTrigger).toBeVisible()
    expect(screen.getByRole('button', { name: '打开导航' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the console link exclusive to administrators', async () => {
    const { rerender } = render(<FloatingHeader theme="dark" pageHash="#commerce-admin" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '打开导航' }))
    expect(screen.queryByRole('link', { name: '管理后台' })).not.toBeInTheDocument()

    authMock.useAuth.mockReturnValue(auth(true))
    rerender(<FloatingHeader theme="dark" pageHash="#commerce-admin" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '打开导航' }))
    expect(screen.getByRole('link', { name: '管理后台' })).toHaveAttribute('href', '#commerce-admin')
    expect(screen.getByRole('link', { name: '管理后台' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens search from the compact actions and renders search destinations without target-cursor opt-in', async () => {
    render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '打开搜索' }))
    const dialog = screen.getByRole('dialog', { name: '搜索本站' })
    expect(within(dialog).getByRole('textbox', { name: '搜索作品、笔记或标签' })).toHaveFocus()
    expect(within(dialog).getByRole('link', { name: /文章/ })).not.toHaveAttribute('data-target-cursor')
  })

  it('keeps the clear-search action outside the input label and preserves its accessible name', async () => {
    render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '打开搜索' }))
    const dialog = screen.getByRole('dialog', { name: '搜索本站' })
    const input = within(dialog).getByRole('textbox', { name: '搜索作品、笔记或标签' })
    await userEvent.type(input, 'not-a-match')
    const clear = within(dialog).getByRole('button', { name: '清除' })

    expect(clear.closest('label')).toBeNull()
    await userEvent.click(clear)
    expect(input).toHaveValue('')
  })
})
