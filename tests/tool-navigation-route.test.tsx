import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../src/auth/AuthProvider'

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }))

vi.mock('../src/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/AuthProvider')>()
  return { ...actual, useAuth: authMock.useAuth }
})

vi.mock('../src/music/GlobalMusicDock', () => ({ GlobalMusicDock: ({ commerceMode = false }: { commerceMode?: boolean }) => <div data-testid="music-dock-mode" data-mode={commerceMode ? 'commerce' : 'default'} /> }))
vi.mock('../src/components/StatusScene', () => ({ StatusScene: () => <section>HOME</section> }))
vi.mock('../src/components/StudioMap', () => ({ StudioMap: () => <section id="studio-map">STUDIO MAP</section> }))
vi.mock('../src/components/ProjectArchive', () => ({ ProjectArchive: () => null }))

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
    expect(isSiteSubpageHash('#studio-map')).toBe(false)
    expect(isSiteSubpageHash('#tools/')).toBe(false)
    expect(isSiteSubpageHash('#article/Bad')).toBe(false)
    expect(isSiteSubpageHash('#top')).toBe(false)
  })

  it('marks tools current and sends global search to its standalone route', async () => {
    render(<FloatingHeader theme="dark" pageHash="#tools" onToggleTheme={vi.fn()} />)
    expect(screen.getByRole('link', { name: '工具导航' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: '工具导航' })).toHaveAttribute('href', '#tools')
    expect(screen.getByRole('link', { name: '主页' })).not.toHaveAttribute('aria-current')
    await userEvent.click(screen.getByRole('button', { name: '打开搜索' }))
    const search = screen.getByRole('dialog', { name: '搜索本站' })
    expect(within(search).getByRole('link', { name: /工具导航/ })).toHaveAttribute('href', '#tools')
  })

  it('uses the approved dropdown groups, child destinations, and admin-only entry', async () => {
    authMock.useAuth.mockReturnValue(auth(true))
    render(<FloatingHeader theme="dark" pageHash="#guestbook" onToggleTheme={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'AI 电商' })).toHaveAttribute('href', '#ai-commerce')
    fireEvent.click(screen.getByRole('button', { name: '文章' }))
    expect(screen.getByRole('link', { name: /实验记录/ })).toHaveAttribute('href', '#notes')
    expect(screen.getByRole('link', { name: /作品归档/ })).toHaveAttribute('href', '#archive')
    fireEvent.click(screen.getByRole('button', { name: '联系' }))
    expect(screen.getByRole('button', { name: '联系' })).toHaveClass('is-current')
    expect(screen.getByRole('link', { name: /留言/ })).toHaveAttribute('href', '#guestbook')
    expect(screen.getByRole('link', { name: /留言/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /合作联系/ })).toHaveAttribute('href', 'mailto:hello@wenhao.studio')
    expect(screen.getByRole('link', { name: /合作联系/ })).not.toHaveAttribute('aria-current')
    fireEvent.click(screen.getByRole('button', { name: '更多' }))
    expect(screen.getByRole('link', { name: /音乐/ })).toHaveAttribute('href', '#music')
    expect(screen.getByRole('link', { name: /关于此站/ })).toHaveAttribute('href', '#about')
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

  it('keeps #studio-map on the homepage and responds to later hash navigation', async () => {
    window.location.hash = '#studio-map'
    const view = render(<App />)
    expect(screen.getByText('HOME')).toBeInTheDocument()
    expect(view.container.querySelector('.site-shell')).toHaveClass('is-home')
    window.location.hash = '#tools'
    fireEvent(window, new Event('hashchange'))
    expect(await screen.findByRole('heading', { name: '工具导航' })).toBeInTheDocument()
    expect(view.container.querySelector('.site-shell')).not.toHaveClass('is-home')
  })
})
