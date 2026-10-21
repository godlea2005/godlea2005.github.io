import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../src/auth/AuthProvider'

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }))
vi.mock('../src/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/AuthProvider')>()
  return { ...actual, useAuth: authMock.useAuth }
})

import { FloatingHeader } from '../src/components/FloatingHeader'

const auth = (isAdmin = false): AuthContextValue => ({
  configured: true, ready: true, user: null, isAnonymous: true, isAdmin,
  provider: null, providers: { github: true, google: true }, error: '',
  signIn: vi.fn(), signOut: vi.fn(), requireLogin: vi.fn(() => false),
})

describe('editorial card navigation', () => {
  beforeEach(() => authMock.useAuth.mockReturnValue(auth()))
  afterEach(() => { cleanup(); vi.clearAllMocks() })

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
})
