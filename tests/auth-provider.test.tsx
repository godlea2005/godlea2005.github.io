import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'

const mocks = vi.hoisted(() => {
  const auth = {
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(),
    linkIdentity: vi.fn(),
    onAuthStateChange: vi.fn(),
    refreshSession: vi.fn(),
    signInAnonymously: vi.fn(),
    signInWithOAuth: vi.fn(),
    signOut: vi.fn(),
  }
  const rpc = vi.fn()
  const authEvents = { callback: null as null | ((event: string, session: typeof signedInSession | typeof anonymousSession | null) => void) }
  return { auth, rpc, authEvents }
})

vi.mock('../src/lib/supabase', () => ({
  getSocialProviderStatus: vi.fn().mockResolvedValue({ github: true, google: true }),
  supabaseConfigured: true,
  supabase: { auth: mocks.auth, rpc: mocks.rpc },
}))

import { AuthProvider, useAuth } from '../src/auth/AuthProvider'
import { GuestbookAuthProvider, useGuestbookAuth } from '../src/guestbook/GuestbookAuth'

const anonymousSession = {
  user: { id: 'anonymous-user', is_anonymous: true, app_metadata: {} },
}

const signedInSession = {
  user: { id: 'member-user', is_anonymous: false, app_metadata: { role: 'admin', provider: 'github' } },
}

function ProtectedProbe() {
  const auth = useAuth()
  return <button type="button" onClick={() => void auth.requireLogin('#ai-commerce')}>开始分析</button>
}

function AdminProbe() {
  const auth = useAuth()
  return <>
    <p>{`${auth.ready ? '就绪' : '解析中'}:${auth.user?.id ?? '无用户'}:${auth.isAdmin ? '站长' : '普通用户'}:${auth.error || '无错误'}`}</p>
    <button type="button" onClick={() => { void auth.signOut().catch(() => undefined) }}>退出登录</button>
  </>
}

function OAuthProbe() {
  const auth = useAuth()
  return <>
    <p>{`${auth.providers.github ? 'provider-ready' : 'provider-pending'}:${auth.user?.id ?? 'no-user'}`}</p>
    <button type="button" onClick={() => void auth.signIn('github', '#guestbook')}>连接 GitHub</button>
  </>
}

function FocusProbe() {
  const auth = useAuth()
  return <>
    <p>{auth.ready ? '认证就绪' : '认证中'}</p>
    <button type="button" onClick={() => void auth.requireLogin('#ai-commerce')}>开始分析</button>
  </>
}

function GuestbookProbe() {
  const auth = useGuestbookAuth()
  return <p>{`${auth.userId ?? 'no-user'}:${auth.isOwner ? 'owner' : 'visitor'}`}</p>
}

describe('site authentication provider', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/')
    window.sessionStorage.clear()
    mocks.auth.exchangeCodeForSession.mockReset()
    mocks.auth.getSession.mockReset()
    mocks.auth.linkIdentity.mockReset()
    mocks.auth.onAuthStateChange.mockReset()
    mocks.auth.refreshSession.mockReset()
    mocks.auth.signInAnonymously.mockReset()
    mocks.auth.signInWithOAuth.mockReset()
    mocks.auth.signOut.mockReset()
    mocks.rpc.mockReset()
    mocks.authEvents.callback = null
    mocks.auth.onAuthStateChange.mockImplementation((callback) => {
      mocks.authEvents.callback = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    mocks.auth.getSession.mockResolvedValue({ data: { session: anonymousSession } })
    mocks.auth.linkIdentity.mockResolvedValue({ data: { url: '#oauth' }, error: null })
    mocks.auth.signInWithOAuth.mockResolvedValue({ data: { url: '#oauth' }, error: null })
    mocks.rpc.mockResolvedValue({ data: false, error: null })
  })

  afterEach(() => cleanup())

  it('opens login when a protected action is requested by an anonymous visitor', async () => {
    const user = userEvent.setup()
    render(<AuthProvider><ProtectedProbe /></AuthProvider>)

    await user.click(screen.getByRole('button', { name: '开始分析' }))

    expect(await screen.findByRole('dialog', { name: '登录后继续' })).toBeInTheDocument()
  })

  it('does not trust app metadata for admin state', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: signedInSession } })
    mocks.rpc.mockResolvedValue({ data: false, error: null })

    render(<AuthProvider><AdminProbe /></AuthProvider>)

    expect(await screen.findByText('就绪:member-user:普通用户:无错误')).toBeInTheDocument()
    expect(mocks.rpc).toHaveBeenCalledWith('site_is_admin')
  })

  it('publishes a neutral state on every auth event and ignores an older administrator check', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: signedInSession } })
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null })
    render(<AuthProvider><AdminProbe /></AuthProvider>)
    expect(await screen.findByText('就绪:member-user:站长:无错误')).toBeInTheDocument()

    let resolveOldAdmin!: (value: { data: boolean; error: null }) => void
    const oldAdmin = new Promise<{ data: boolean; error: null }>((resolve) => { resolveOldAdmin = resolve })
    let resolveNewAdmin!: (value: { data: boolean; error: null }) => void
    const newAdmin = new Promise<{ data: boolean; error: null }>((resolve) => { resolveNewAdmin = resolve })
    mocks.rpc.mockReturnValueOnce(oldAdmin).mockReturnValueOnce(newAdmin)
    const nextAdminSession = { user: { id: 'admin-2', is_anonymous: false, app_metadata: { provider: 'github' } } }
    const normalSession = { user: { id: 'member-2', is_anonymous: false, app_metadata: { provider: 'google' } } }

    await act(async () => { mocks.authEvents.callback?.('SIGNED_IN', nextAdminSession as typeof signedInSession) })
    expect(screen.getByText('解析中:无用户:普通用户:无错误')).toBeInTheDocument()
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)) })
    expect(mocks.rpc).toHaveBeenCalledTimes(2)

    await act(async () => { mocks.authEvents.callback?.('SIGNED_IN', normalSession as typeof signedInSession) })
    expect(screen.getByText('解析中:无用户:普通用户:无错误')).toBeInTheDocument()
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)) })
    await act(async () => { resolveNewAdmin({ data: false, error: null }) })
    expect(await screen.findByText('就绪:member-2:普通用户:无错误')).toBeInTheDocument()

    await act(async () => { resolveOldAdmin({ data: true, error: null }) })
    expect(screen.getByText('就绪:member-2:普通用户:无错误')).toBeInTheDocument()
    expect(screen.queryByText(/admin-2:站长/)).not.toBeInTheDocument()
  })

  it('settles ready from the authoritative session when sign-out resolves with an error', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: signedInSession }, error: null })
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null })
    mocks.auth.signOut.mockResolvedValue({ error: new Error('logout unavailable') })
    render(<AuthProvider><AdminProbe /></AuthProvider>)
    expect(await screen.findByText('就绪:member-user:站长:无错误')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(screen.getByText('解析中:无用户:普通用户:无错误')).toBeInTheDocument()
    expect(await screen.findByText('就绪:member-user:普通用户:logout unavailable')).toBeInTheDocument()
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('settles ready without stale privilege when sign-out rejects', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: signedInSession }, error: null })
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null })
    mocks.auth.signOut.mockRejectedValue(new Error('logout network failure'))
    render(<AuthProvider><AdminProbe /></AuthProvider>)
    expect(await screen.findByText('就绪:member-user:站长:无错误')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(await screen.findByText('就绪:member-user:普通用户:logout network failure')).toBeInTheDocument()
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
  })

  it('does not let a failed sign-out recovery overwrite a concurrent auth event', async () => {
    mocks.auth.getSession.mockResolvedValue({ data: { session: signedInSession }, error: null })
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null })
    let rejectSignOut!: (reason?: unknown) => void
    mocks.auth.signOut.mockReturnValue(new Promise((_resolve, reject) => { rejectSignOut = reject }))
    render(<AuthProvider><AdminProbe /></AuthProvider>)
    expect(await screen.findByText('就绪:member-user:站长:无错误')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    const nextSession = { user: { id: 'member-after-event', is_anonymous: false, app_metadata: { provider: 'google' } } }
    await act(async () => { mocks.authEvents.callback?.('SIGNED_IN', nextSession as typeof signedInSession) })
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)) })
    await act(async () => { rejectSignOut(new Error('late logout failure')) })

    expect(await screen.findByText('就绪:member-after-event:普通用户:无错误')).toBeInTheDocument()
    expect(screen.queryByText(/member-user:站长/)).not.toBeInTheDocument()
    expect(mocks.auth.getSession).toHaveBeenCalledTimes(1)
  })

  it('links an anonymous identity and retains the guestbook return hash', async () => {
    const user = userEvent.setup()
    render(<AuthProvider><OAuthProbe /></AuthProvider>)

    await screen.findByText('provider-ready:anonymous-user')
    await user.click(screen.getByRole('button', { name: '连接 GitHub' }))

    expect(mocks.auth.linkIdentity).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'github',
      options: expect.objectContaining({ redirectTo: `${window.location.origin}/?auth=site` }),
    }))
    expect(window.sessionStorage.getItem('wenhao-site:oauth-intent')).toContain('"mode":"link"')
    expect(window.sessionStorage.getItem('wenhao-site:return-hash')).toBe('#guestbook')
  })

  it('uses sign-in rather than linking for an existing account', async () => {
    const user = userEvent.setup()
    mocks.auth.getSession.mockResolvedValue({ data: { session: signedInSession } })
    render(<AuthProvider><OAuthProbe /></AuthProvider>)

    await screen.findByText('provider-ready:member-user')
    await user.click(screen.getByRole('button', { name: '连接 GitHub' }))

    expect(mocks.auth.signInWithOAuth).toHaveBeenCalled()
    expect(mocks.auth.linkIdentity).not.toHaveBeenCalled()
  })

  it('exchanges one PKCE callback and returns to the stored hash without OAuth parameters', async () => {
    window.history.replaceState({}, '', '/?auth=site&code=code-1&sb_flow_id=flow-1#ignored')
    window.sessionStorage.setItem('wenhao-site:return-hash', '#guestbook')
    window.sessionStorage.setItem('wenhao-site:oauth-intent', JSON.stringify({ provider: 'github', mode: 'link' }))
    mocks.auth.exchangeCodeForSession.mockResolvedValue({ data: { session: signedInSession }, error: null })
    render(<AuthProvider><OAuthProbe /></AuthProvider>)

    await screen.findByText('provider-ready:member-user')
    await waitFor(() => expect(window.location.search).toBe(''))

    expect(mocks.auth.exchangeCodeForSession).toHaveBeenCalledWith('code-1', { flowId: 'flow-1' })
    expect(window.location.hash).toBe('#guestbook')
    expect(window.sessionStorage.getItem('wenhao-site:oauth-intent')).toBeNull()
    expect(window.sessionStorage.getItem('wenhao-site:return-hash')).toBeNull()
  })

  it('retries identity-already-exists callbacks as a sign-in without losing the return hash', async () => {
    window.history.replaceState({}, '', '/?auth=site&error_code=identity_already_exists#ignored')
    window.sessionStorage.setItem('wenhao-site:return-hash', '#guestbook')
    window.sessionStorage.setItem('wenhao-site:oauth-intent', JSON.stringify({ provider: 'github', mode: 'link' }))
    render(<AuthProvider><OAuthProbe /></AuthProvider>)

    await waitFor(() => expect(mocks.auth.signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ provider: 'github' })))

    expect(mocks.auth.linkIdentity).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('wenhao-site:oauth-intent')).toContain('"mode":"sign-in"')
    expect(window.sessionStorage.getItem('wenhao-site:return-hash')).toBe('#guestbook')
  })

  it('keeps the guestbook adapter on the single site authentication listener', async () => {
    render(<AuthProvider><GuestbookAuthProvider><GuestbookProbe /></GuestbookAuthProvider></AuthProvider>)

    expect(await screen.findByText('anonymous-user:visitor')).toBeInTheDocument()
    expect(mocks.auth.onAuthStateChange).toHaveBeenCalledTimes(1)
  })

  it('runs a normal OAuth error callback once in StrictMode and preserves its return hash', async () => {
    window.history.replaceState({}, '', '/?auth=site&error_code=access_denied#ignored')
    window.sessionStorage.setItem('wenhao-site:return-hash', '#guestbook')
    render(<StrictMode><AuthProvider><OAuthProbe /></AuthProvider></StrictMode>)

    await waitFor(() => expect(window.location.search).toBe(''))

    expect(window.location.hash).toBe('#guestbook')
  })

  it('runs an identity-already-exists callback retry once in StrictMode', async () => {
    window.history.replaceState({}, '', '/?auth=site&error_code=identity_already_exists#ignored')
    window.sessionStorage.setItem('wenhao-site:return-hash', '#guestbook')
    window.sessionStorage.setItem('wenhao-site:oauth-intent', JSON.stringify({ provider: 'github', mode: 'link' }))
    let resolveSignIn: ((value: { data: { url: string }; error: null }) => void) | undefined
    mocks.auth.signInWithOAuth.mockImplementation(() => new Promise((resolve) => { resolveSignIn = resolve }))
    render(<StrictMode><AuthProvider><OAuthProbe /></AuthProvider></StrictMode>)

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(mocks.auth.signInWithOAuth).toHaveBeenCalledTimes(1)

    expect(window.sessionStorage.getItem('wenhao-site:return-hash')).toBe('#guestbook')
    resolveSignIn?.({ data: { url: '#oauth' }, error: null })
  })

  it('uses the current anonymous Supabase session even before React state has a user', async () => {
    let resolveInitialSession: ((value: { data: { session: typeof anonymousSession } }) => void) | undefined
    mocks.auth.getSession.mockImplementationOnce(() => new Promise((resolve) => { resolveInitialSession = resolve }))
    const user = userEvent.setup()
    render(<AuthProvider><OAuthProbe /></AuthProvider>)

    await screen.findByText('provider-ready:no-user')
    await user.click(screen.getByRole('button', { name: '连接 GitHub' }))

    expect(mocks.auth.linkIdentity).toHaveBeenCalled()
    expect(mocks.auth.signInWithOAuth).not.toHaveBeenCalled()
    resolveInitialSession?.({ data: { session: anonymousSession } })
  })

  it('traps modal focus and restores the triggering control after closing', async () => {
    const user = userEvent.setup()
    render(<AuthProvider><FocusProbe /></AuthProvider>)
    await screen.findByText('认证就绪')
    const trigger = screen.getByRole('button', { name: '开始分析' })
    trigger.focus()

    await user.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: '登录后继续' })
    const github = screen.getByRole('button', { name: 'GitHub 登录' })
    const google = screen.getByRole('button', { name: 'Google 登录' })
    const close = screen.getByRole('button', { name: '关闭登录' })
    await waitFor(() => expect(github).toHaveFocus())

    await user.tab()
    expect(google).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    await user.tab()
    expect(github).toHaveFocus()
    await user.tab({ shift: true })
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(google).toHaveFocus()
    await user.keyboard('{Escape}')

    expect(dialog).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it.each([
    ['an OAuth response error', { data: { url: null }, error: new Error('provider failure') }],
    ['a missing OAuth authorization URL', { data: { url: null }, error: null }],
  ])('clears pending OAuth state after %s', async (_label, response) => {
    mocks.auth.linkIdentity.mockResolvedValue(response)
    const user = userEvent.setup()
    render(<AuthProvider><FocusProbe /></AuthProvider>)
    await screen.findByText('认证就绪')
    await user.click(screen.getByRole('button', { name: '开始分析' }))
    await user.click(await screen.findByRole('button', { name: 'GitHub 登录' }))

    await screen.findByRole('status')

    expect(window.sessionStorage.getItem('wenhao-site:oauth-intent')).toBeNull()
    expect(window.sessionStorage.getItem('wenhao-site:return-hash')).toBeNull()
  })
})
