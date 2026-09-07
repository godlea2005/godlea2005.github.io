import type { SupabaseClient } from '@supabase/supabase-js'
import { CommerceRepositoryError, isCommerceAuthError, mapCommerceError, mapFunctionInvokeError } from './commerceErrors'

type CommerceSessionClient = Pick<SupabaseClient, 'auth' | 'functions'>
export type AuthenticatedCommerceSession = { userId: string; accessToken: string }

const authenticationRequired = () => mapCommerceError({ code: 'AUTH_REQUIRED' })

/** Validate the credential used by both database writes and Edge Function requests. */
export async function getFreshAuthenticatedSession(
  client: CommerceSessionClient,
  options: { forceRefresh?: boolean; now?: () => number } = {},
): Promise<AuthenticatedCommerceSession> {
  try {
    const initial = await client.auth.getSession()
    if (initial.error) throw initial.error
    let session = initial.data.session
    if (!session?.access_token) throw authenticationRequired()
    const now = options.now?.() ?? Date.now()
    if (options.forceRefresh || !session.expires_at || session.expires_at * 1000 - now <= 60_000) {
      const refreshed = await client.auth.refreshSession()
      if (refreshed.error) throw refreshed.error
      session = refreshed.data.session
      if (!session?.access_token) throw authenticationRequired()
    }
    const verified = await client.auth.getUser(session.access_token)
    if (verified.error) throw verified.error
    const user = verified.data.user
    if (!user?.id || user.is_anonymous || user.id !== session.user.id) throw authenticationRequired()
    return { userId: user.id, accessToken: session.access_token }
  } catch (error) {
    throw mapCommerceError(error)
  }
}

/** Only a rejected authentication request may replay; business/network failures do not. */
export async function invokeAuthenticatedFunction(
  client: CommerceSessionClient,
  name: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  let session = await getFreshAuthenticatedSession(client)
  const ownerId = session.userId
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await client.functions.invoke(name, {
        body,
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      if (response.error) throw await mapFunctionInvokeError(response.error)
      return response.data
    } catch (error) {
      const mapped = error instanceof CommerceRepositoryError ? error : await mapFunctionInvokeError(error)
      if (attempt !== 0 || !isCommerceAuthError(mapped)) throw mapped
      session = await getFreshAuthenticatedSession(client, { forceRefresh: true })
      // Account changes must never transfer an in-flight write to the new identity.
      if (session.userId !== ownerId) throw authenticationRequired()
    }
  }
  throw authenticationRequired()
}
