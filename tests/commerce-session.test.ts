import { describe, expect, it, vi } from 'vitest'
import { getFreshAuthenticatedSession, invokeAuthenticatedFunction } from '../src/commerce/commerceSession'

const now = 1_000_000
const fixture = () => {
  const session = { access_token: 'fixture-current', expires_at: now / 1000 + 3600, user: { id: 'user-1' } }
  const refreshed = { ...session, access_token: 'fixture-refreshed' }
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      refreshSession: vi.fn().mockResolvedValue({ data: { session: refreshed }, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', is_anonymous: false } }, error: null }),
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }) },
  }
  return { client, session, refreshed }
}
const denied = (status: number, code?: string) => ({ context: new Response(JSON.stringify({ code }), { status }) })

describe('authenticated commerce requests', () => {
  it('validates a healthy session without refreshing', async () => {
    const { client, session } = fixture()
    const actual = await getFreshAuthenticatedSession(client as never, { now: () => now })
    expect(actual.userId).toBe('user-1')
    expect(actual.accessToken === session.access_token).toBe(true)
    expect(client.auth.getUser.mock.calls[0][0] === session.access_token).toBe(true)
    expect(client.auth.refreshSession).not.toHaveBeenCalled()
  })
  it('refreshes within sixty seconds of expiry', async () => {
    const { client, session, refreshed } = fixture()
    session.expires_at = now / 1000 + 20
    const actual = await getFreshAuthenticatedSession(client as never, { now: () => now })
    expect(actual.accessToken === refreshed.access_token).toBe(true)
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1)
  })
  it('rejects a missing session without an anonymous fallback', async () => {
    const { client } = fixture()
    client.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    await expect(getFreshAuthenticatedSession(client as never)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(client.auth.refreshSession).not.toHaveBeenCalled()
  })
  it('rejects anonymous users and mismatched account identity', async () => {
    const { client } = fixture()
    for (const user of [{ id: 'user-1', is_anonymous: true }, { id: 'another-user', is_anonymous: false }]) {
      client.auth.getUser.mockResolvedValue({ data: { user }, error: null })
      await expect(getFreshAuthenticatedSession(client as never, { now: () => now })).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    }
  })
  it('preserves a network failure during refresh as NETWORK', async () => {
    const { client } = fixture()
    client.auth.refreshSession.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(getFreshAuthenticatedSession(client as never, { forceRefresh: true })).rejects.toMatchObject({ code: 'NETWORK' })
  })
  it('sends the current session credential and replays only one rejected auth request', async () => {
    const { client, session, refreshed } = fixture()
    session.expires_at = Date.now() / 1000 + 3600
    client.functions.invoke.mockResolvedValueOnce({ data: null, error: denied(401) })
    await expect(invokeAuthenticatedFunction(client as never, 'commerce-upload', { action: 'reserve' })).resolves.toEqual({ ok: true })
    expect(client.functions.invoke).toHaveBeenCalledTimes(2)
    expect(client.functions.invoke.mock.calls.map(call => call[1].body)).toEqual([{ action: 'reserve' }, { action: 'reserve' }])
    expect(client.functions.invoke.mock.calls[0][1].headers.Authorization === `Bearer ${session.access_token}`).toBe(true)
    expect(client.functions.invoke.mock.calls[1][1].headers.Authorization === `Bearer ${refreshed.access_token}`).toBe(true)
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1)
  })
  it('stops after a second unauthorized response', async () => {
    const { client, session } = fixture()
    session.expires_at = Date.now() / 1000 + 3600
    client.functions.invoke.mockImplementation(async () => ({ data: null, error: denied(401) }))
    await expect(invokeAuthenticatedFunction(client as never, 'commerce-upload', {})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(client.functions.invoke).toHaveBeenCalledTimes(2)
    expect(client.auth.refreshSession).toHaveBeenCalledTimes(1)
  })
  it('never replays a write under a different account after refresh', async () => {
    const { client, session } = fixture()
    session.expires_at = Date.now() / 1000 + 3600
    client.functions.invoke.mockResolvedValueOnce({ data: null, error: denied(401) })
    client.auth.refreshSession.mockResolvedValue({ data: { session: { ...session, user: { id: 'user-2' } } }, error: null })
    client.auth.getUser.mockResolvedValueOnce({ data: { user: session.user }, error: null }).mockResolvedValue({ data: { user: { id: 'user-2' } }, error: null })
    await expect(invokeAuthenticatedFunction(client as never, 'analyze-commerce', {})).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(client.functions.invoke).toHaveBeenCalledTimes(1)
  })
  it.each([[403, 'ORIGIN_FORBIDDEN'], [429, 'RATE_LIMITED'], [503, 'SERVICE_ERROR']] as const)('does not replay HTTP %s', async (status, code) => {
    const { client, session } = fixture()
    session.expires_at = Date.now() / 1000 + 3600
    client.functions.invoke.mockResolvedValue({ data: null, error: denied(status, code) })
    await expect(invokeAuthenticatedFunction(client as never, 'commerce-upload', {})).rejects.toMatchObject({ code })
    expect(client.functions.invoke).toHaveBeenCalledTimes(1)
    expect(client.auth.refreshSession).not.toHaveBeenCalled()
  })
})
