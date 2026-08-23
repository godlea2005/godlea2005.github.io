import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
  return { auth, rpc }
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
  return <p>{auth.isAdmin ? '站长' : '普通用户'}</p>
}

function OAuthProbe() {
  const auth = useAuth()
  return <>
    <p>{auth.user?.id ?? 'no-user'}</p>
    <button type="button" onClick={() => void auth.signIn('github', '#guestbook')}>连接 GitHub</button>
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
    mocks.auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
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

    expect(await screen.findByText('普通用户')).toBeInTheDocument()
    expect(mocks.rpc).toHaveBeenCalledWith('site_is_admin')
  })

  it('links an anonymous identity and retains the guestbook return hash', async () => {
    const user = userEvent.setup()
    render(<AuthProvider><OAuthProbe /></AuthProvider>)

    await screen.findByText('anonymous-user')
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

    await screen.findByText('member-user')
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

    await screen.findByText('member-user')
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
})
