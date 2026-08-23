import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import type { GuestbookAuthState } from './types'

type GuestbookAuthContextValue = GuestbookAuthState & {
  connect: (provider: 'github' | 'google') => Promise<void>
  disconnect: () => Promise<void>
}

const GuestbookAuthContext = createContext<GuestbookAuthContextValue | null>(null)

export function GuestbookAuthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth()
  const connect = useCallback((provider: 'github' | 'google') => auth.signIn(provider, '#guestbook'), [auth.signIn])
  const disconnect = useCallback(() => auth.signOut(), [auth.signOut])
  const value = useMemo<GuestbookAuthContextValue>(() => ({
    configured: auth.configured,
    ready: auth.ready,
    userId: auth.user?.id ?? null,
    isAnonymous: auth.isAnonymous,
    isOwner: auth.isAdmin,
    provider: auth.provider,
    providers: auth.providers,
    error: auth.error,
    connect,
    disconnect,
  }), [auth.configured, auth.error, auth.isAdmin, auth.isAnonymous, auth.provider, auth.providers, auth.ready, auth.user, connect, disconnect])

  return <GuestbookAuthContext.Provider value={value}>{children}</GuestbookAuthContext.Provider>
}

export function useGuestbookAuth() {
  const value = useContext(GuestbookAuthContext)
  if (!value) throw new Error('useGuestbookAuth must be used within GuestbookAuthProvider')
  return value
}
