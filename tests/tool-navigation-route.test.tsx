import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../src/auth/AuthProvider'

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }))

vi.mock('../src/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/AuthProvider')>()
  return { ...actual, useAuth: authMock.useAuth }
})

vi.mock('../src/music/GlobalMusicDock', () => ({ GlobalMusicDock: ({ commerceMode = false, guestbookMode = false }: { commerceMode?: boolean; guestbookMode?: boolean }) => <div data-testid="music-dock-mode" data-mode={commerceMode ? 'commerce' : 'default'} data-guestbook={guestbookMode} /> }))
vi.mock('../src/components/StatusScene', () => ({ StatusScene: () => <section>HOME</section> }))

import App from '../src/App'
import { FloatingHeader } from '../src/components/FloatingHeader'
import { isSiteSubpageHash } from '../src/lib/siteRoutes'

const auth = (isAdmin = false): AuthContextValue => ({
  configured: true,
  ready: true,
  user: null,
  isAnonymous: true,
  isAdmin,
  provider: null,
  providers: { github: true, google: true },
  error: '',
  signIn: vi.fn(),
  signOut: vi.fn(),
  requireLogin: vi.fn(() => false),
})

describe('tools route and site navigation', () => {
  beforeEach(() => authMock.useAuth.mockReturnValue(auth()))
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    window.location.hash = ''
  })

  it('recognizes exact standalone hashes without treating homepage anchors as subpages', () => {
    expect(isSiteSubpageHash('#tools')).toBe(true)
    expect(isSiteSubpageHash('#writing')).toBe(true)
    expect(isSiteSubpageHash('#work')).toBe(true)
    expect(isSiteSubpageHash('#article/a-valid-slug')).toBe(true)
    expect(isSiteSubpageHash('#project/a-valid-slug')).toBe(true)
    expect(isSiteSubpageHash('#featured')).toBe(false)
    expect(isSiteSubpageHash('#tools/')).toBe(false)
    expect(isSiteSubpageHash('#article/Bad')).toBe(false)
    expect(isSiteSubpageHash('#top')).toBe(false)
  })

  it('marks tools current and sends global search to its standalone route', async () => {
    render(<FloatingHeader theme="dark" pageHash="#tools" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '打开导航' }))
    expect(screen.getByRole('link', { name: '工具导航' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '工具导航' })).toHaveAttribute('href', '#tools')
    await userEvent.click(screen.getByRole('button', { name: '打开搜索' }))
    const search = screen.getByRole('dialog', { name: '搜索本站' })
    expect(within(search).getByRole('link', { name: /工具导航/ })).toHaveAttribute('href', '#tools')
  })

  it('uses the three editorial card groups, child destinations, and admin-only entry', async () => {
    authMock.useAuth.mockReturnValue(auth(true))
    render(<FloatingHeader theme="dark" pageHash="#guestbook" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '打开导航' }))
    const nav = screen.getByRole('navigation', { name: '主导航' })
    expect(within(nav).getByRole('heading', { name: '阅读' })).toBeInTheDocument()
    expect(within(nav).getByRole('heading', { name: '探索' })).toBeInTheDocument()
    expect(within(nav).getByRole('heading', { name: '连接' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: '文章' })).toHaveAttribute('href', '#featured')
    expect(within(nav).getByRole('link', { name: '现场笔记' })).toHaveAttribute('href', '#visual-notes')
    expect(within(nav).getByRole('link', { name: '归档' })).toHaveAttribute('href', '#writing')
    expect(within(nav).getByRole('link', { name: 'AI 电商实验室' })).toHaveAttribute('href', '#ai-commerce')
    expect(within(nav).getByRole('link', { name: '作品' })).toHaveAttribute('href', '#work')
    expect(within(nav).getByRole('link', { name: '留言' })).toHaveAttribute('href', '#guestbook')
    expect(screen.getByRole('link', { name: /留言/ })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: /音乐/ })).toHaveAttribute('href', '#music')
    expect(within(nav).getByRole('link', { name: /关于与联系/ })).toHaveAttribute('href', '#about')
    expect(screen.getByRole('link', { name: /管理后台/ })).toHaveAttribute('href', '#commerce-admin')
  })

  it('mounts tools as a subpage with a default-mode music dock', async () => {
    window.location.hash = '#tools'
    const view = render(<App />)
    expect(await screen.findByRole('heading', { name: '工具导航' })).toBeInTheDocument()
    expect(view.container.querySelector('.site-shell')).not.toHaveClass('is-home', 'is-commerce')
    expect(screen.queryByText('HOME')).not.toBeInTheDocument()
    expect(screen.getByTestId('music-dock-mode')).toHaveAttribute('data-mode', 'default')
  })

  it('keeps #featured on the homepage and responds to later hash navigation', async () => {
    window.location.hash = '#featured'
    const view = render(<App />)
    expect(screen.getByText('HOME')).toBeInTheDocument()
    expect(view.container.querySelector('.site-shell')).toHaveClass('is-home')
    window.location.hash = '#tools'
    fireEvent(window, new Event('hashchange'))
    expect(await screen.findByRole('heading', { name: '工具导航' })).toBeInTheDocument()
    expect(view.container.querySelector('.site-shell')).not.toHaveClass('is-home')
  })

  it('routes writing and article pages as subpages while retaining the default music dock', async () => {
    window.location.hash = '#writing'
    const view = render(<App />)
    expect(await screen.findByRole('heading', { name: '文章与笔记' })).toBeInTheDocument()
    expect(view.container.querySelector('.site-shell')).not.toHaveClass('is-home')
    expect(screen.getByTestId('music-dock-mode')).toHaveAttribute('data-mode', 'default')

    window.location.hash = '#article/ai-speeds-up-judgment'
    fireEvent(window, new Event('hashchange'))
    expect(await screen.findByRole('heading', { level: 1, name: /AI 不替代设计/ })).toBeInTheDocument()
    expect(screen.getByTestId('music-dock-mode')).toHaveAttribute('data-mode', 'default')
  })

  it('preserves the guestbook OAuth-return override and music dock visibility rules', async () => {
    window.history.replaceState({}, '', '/?auth=guestbook#article/ai-speeds-up-judgment')
    const oauthReturn = render(<App />)
    expect(await screen.findByRole('heading', { name: '留言板' })).toBeInTheDocument()
    expect(screen.getByTestId('music-dock-mode')).toHaveAttribute('data-mode', 'default')
    expect(screen.getByTestId('music-dock-mode')).toHaveAttribute('data-guestbook', 'true')
    oauthReturn.unmount()

    window.history.replaceState({}, '', '/#music')
    const music = render(<App />)
    expect(await screen.findByText('LOADING AUDIO FIELD')).toBeInTheDocument()
    expect(screen.queryByTestId('music-dock-mode')).not.toBeInTheDocument()
    music.unmount()

    window.history.replaceState({}, '', '/#ai-commerce')
    const commerce = render(<App />)
    expect(screen.getByTestId('music-dock-mode')).toHaveAttribute('data-mode', 'commerce')
    commerce.unmount()

    window.history.replaceState({}, '', '/#commerce-admin')
    render(<App />)
    expect(screen.getByTestId('music-dock-mode')).toHaveAttribute('data-mode', 'commerce')
  })
})
