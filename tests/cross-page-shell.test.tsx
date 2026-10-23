import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AuthContextValue } from '../src/auth/AuthProvider'
import type { CommerceRepository } from '../src/commerce/commerceRepository'
import { AuthDialog } from '../src/auth/AuthDialog'
import { useAuth as mockedUseAuth } from '../src/auth/AuthProvider'
import '../src/styles.css'
import '../src/auth/auth.css'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  list: vi.fn(),
  getProfile: vi.fn(),
  requireLogin: vi.fn(),
}))

vi.mock('../src/auth/AuthProvider', () => ({ useAuth: mocks.useAuth }))

vi.mock('../src/guestbook/guestbookRepository', () => ({
  guestbookRepository: {
    mode: 'local', list: mocks.list, getProfile: mocks.getProfile,
    refresh: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(),
    remove: vi.fn(), moderate: vi.fn(), saveProfile: vi.fn().mockResolvedValue(undefined),
  },
  detectClientMeta: () => ({ browser: 'Test', platform: 'Test' }),
}))

vi.mock('../src/commerce/commerceRepository', () => ({ commerceRepository: {} }))

import { ToolNavigationPage } from '../src/components/ToolNavigationPage'
import { GuestbookPage } from '../src/components/GuestbookPage'
import { CommerceStudioPage } from '../src/commerce/CommerceStudioPage'
import { GuestbookComposer } from '../src/guestbook/GuestbookComposer'

const authState = (signedIn = false): AuthContextValue => ({
  configured: true, ready: true,
  user: signedIn ? { id: 'shell-test-user' } as AuthContextValue['user'] : null,
  isAnonymous: !signedIn, isAdmin: false, provider: signedIn ? 'github' : null,
  providers: { github: true, google: true }, error: '',
  signIn: vi.fn(), signOut: vi.fn(), requireLogin: mocks.requireLogin,
})

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.sessionStorage.setItem('wenhao-guestbook:rules-seen', 'true')
  mocks.useAuth.mockReturnValue(authState())
  mocks.list.mockResolvedValue([])
  mocks.getProfile.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
  document.documentElement.removeAttribute('data-theme')
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('shared editorial page shells', () => {
  it('gives light editorial metadata and compact navigation text at least 4.5:1 contrast', () => {
    const editorialCss = readFileSync(resolve(process.cwd(), 'src/editorial/editorial-pages.css'), 'utf8')
    const navCss = readFileSync(resolve(process.cwd(), 'src/components/card-nav.css'), 'utf8')
    const luminance = (hex: string) => {
      const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }
    const paper = editorialCss.match(/--editorial-paper:\s*(#[0-9a-f]{6})/)![1]
    for (const token of ['muted', 'accent']) {
      const ink = editorialCss.match(new RegExp(`--editorial-${token}:\\s*(#[0-9a-f]{6})`))![1]
      expect((luminance(paper) + 0.05) / (luminance(ink) + 0.05)).toBeGreaterThanOrEqual(4.5)
    }
    expect(navCss).toMatch(/\.card-nav-destination-copy small\s*\{[^}]*color: var\(--muted\)/s)
    expect(navCss).toMatch(/\[data-theme="light"\] \.card-nav-wrap\s*\{\s*--card-nav-accent: #306235/s)
    expect((luminance('#e9e6df') + 0.05) / (luminance('#306235') + 0.05)).toBeGreaterThanOrEqual(4.5)
    expect((luminance('#e9e6df') + 0.05) / (luminance('#666771') + 0.05)).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps compact editorial, guestbook and music controls at least 44px', () => {
    const editorialCss = readFileSync(resolve(process.cwd(), 'src/editorial/editorial-pages.css'), 'utf8')
    const guestbookCss = readFileSync(resolve(process.cwd(), 'src/guestbook/guestbook.css'), 'utf8')
    const musicCss = readFileSync(resolve(process.cwd(), 'src/music/music-experience.css'), 'utf8')
    expect(editorialCss).toMatch(/\.editorial-filter button\s*\{[^}]*min-height:\s*44px/s)
    expect(editorialCss).toMatch(/\.editorial-return\s*\{[^}]*min-height:\s*44px/s)
    expect(guestbookCss).toMatch(/\.guestbook-page button,\s*\.guestbook-dialog button,\s*\.guestbook-dialog input\s*\{[^}]*min-width:\s*44px;\s*min-height:\s*44px/s)
    expect(musicCss).toMatch(/\.music-experience button,[\s\S]*?\.music-popover input\[type="range"\]\s*\{[^}]*min-width:\s*44px;\s*min-height:\s*44px/s)
    expect(musicCss).toMatch(/\.music-popover-controls\s*\{[^}]*grid-template-columns:\s*44px 48px 44px 1px 44px minmax\(44px,\s*1fr\) 44px/s)
  })
  it('keeps the cross-page auth hook fully isolated from its real provider', () => {
    expect(mockedUseAuth).toBe(mocks.useAuth)
  })

  it('does not apply compact eyebrow typography to full writing and work indexes', () => {
    const globalCss = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    expect(globalCss).toMatch(/p\.editorial-index\s*\{/)
    expect(globalCss).not.toMatch(/(?:^|\n)\.editorial-index\s*\{/)
  })

  it('keeps the light-theme login dialog readable with its own paired fallback colors', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    const { container } = render(<AuthDialog open ready providers={{ github: true, google: true }} error="" onClose={vi.fn()} onSignIn={vi.fn().mockResolvedValue(undefined)} />)
    expect(container.querySelector('.auth-dialog')).toBeInTheDocument()

    const globalCss = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    const authCss = readFileSync(resolve(process.cwd(), 'src/auth/auth.css'), 'utf8')
    expect(globalCss).not.toMatch(/--surface\s*:/)
    expect(globalCss).not.toMatch(/--text\s*:/)
    const background = authCss.match(/background:\s*var\(--surface,\s*(#[0-9a-f]{6})\)/i)?.[1]
    const foreground = authCss.match(/color:\s*var\(--text,\s*(#[0-9a-f]{6})\)/i)?.[1]
    expect(background).toBeDefined()
    expect(foreground).toBeDefined()
    const luminance = (hex: string) => {
      const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => parseInt(channel, 16) / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
    }
    const lightness = luminance(background!)
    const darkness = luminance(foreground!)
    expect((darkness + 0.05) / (lightness + 0.05)).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the tools index searchable, labeled and arranged as a shared editorial page', () => {
    const { container } = render(<ToolNavigationPage />)
    const main = container.querySelector('main')!
    expect(main).toHaveClass('editorial-page')
    const intro = main.querySelector('.editorial-page-intro')!
    expect(within(intro as HTMLElement).getByText('FIELD NOTES / TOOL INDEX')).toHaveClass('editorial-index')
    expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('searchbox', { name: '搜索工具' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '工具分类' })).toBeInTheDocument()
    expect(main.querySelectorAll('.tool-card.editorial-surface').length).toBeGreaterThan(0)
  })

  it('keeps OPEN CHANNEL visible while 留言 is the only screen-reader-only H1', async () => {
    vi.useFakeTimers()
    const { container } = render(<GuestbookPage />)
    await act(async () => { await vi.runAllTimersAsync() })
    const main = container.querySelector('main')!
    expect(main).toHaveClass('editorial-page')
    expect(within(main).getAllByRole('heading', { level: 1, hidden: true })).toHaveLength(1)
    expect(within(main).getByRole('heading', { name: '留言', level: 1, hidden: true })).toHaveClass('sr-only')
    expect(main.querySelector('.guestbook-title-row')).toHaveClass('editorial-page-intro')
    expect(screen.getByText('OPEN CHANNEL')).toBeVisible()
    expect(screen.getByRole('region', { name: '留言板' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '留言内容' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即刷新消息' })).toBeInTheDocument()
    expect(mocks.list).toHaveBeenCalledOnce()
    expect(mocks.getProfile).not.toHaveBeenCalled()
  })

  it('retains Enter-to-send and Shift+Enter drafting without repository access', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    render(<GuestbookComposer identity={{ nickname: '访客', email: '', website: '' }} replyTo={null} sending={false} onOpenIdentity={vi.fn()} onCancelReply={vi.fn()} onSend={onSend} onNotice={vi.fn()} />)
    const composer = screen.getByRole('textbox', { name: '留言内容' })
    fireEvent.change(composer, { target: { value: '编辑中的留言' } })
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(composer, { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('编辑中的留言', undefined))
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('keeps guestbook toolbar icons named when compact labels are hidden', () => {
    const { container } = render(<GuestbookComposer identity={{ nickname: '访客', email: '', website: '' }} replyTo={null} sending={false} onOpenIdentity={vi.fn()} onCancelReply={vi.fn()} onSend={vi.fn()} onNotice={vi.fn()} />)
    container.querySelectorAll<HTMLElement>('.composer-tools button span').forEach((label) => { label.style.display = 'none' })
    expect(screen.getByRole('button', { name: '表情', exact: true })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: '图片', exact: true })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '表情', exact: true }))
    expect(screen.getByLabelText('选择表情')).toBeInTheDocument()
  })

  it('keeps one visible commerce H1 and its authenticated workbench controls', async () => {
    mocks.useAuth.mockReturnValue(authState(true))
    const repository = {
      getEntitlement: vi.fn().mockResolvedValue({ credits: 3, unlimited: false }),
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as CommerceRepository
    const { container } = render(<CommerceStudioPage repository={repository} />)
    const main = container.querySelector('main')!
    expect(main).toHaveClass('editorial-page')
    const intro = main.querySelector('.editorial-page-intro')!
    expect(within(intro as HTMLElement).getByText('AI COMMERCE STUDIO')).toBeVisible()
    expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /历史项目/ })).toBeInTheDocument()
    expect(screen.getByLabelText('产品名称')).toBeInTheDocument()
    expect(screen.getByLabelText('上传产品图')).toBeInTheDocument()
    await waitFor(() => expect(repository.getEntitlement).toHaveBeenCalledOnce())
    expect(mocks.list).not.toHaveBeenCalled()
  })
})
