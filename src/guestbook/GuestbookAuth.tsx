import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Provider, Session } from '@supabase/supabase-js'
import { getSocialProviderStatus, supabase, supabaseConfigured } from '../lib/supabase'
import type { GuestbookAuthState } from './types'

type GuestbookAuthContextValue = GuestbookAuthState & {
  connect: (provider: 'github' | 'google') => Promise<void>
  disconnect: () => Promise<void>
}

const initialState: GuestbookAuthState = {
  configured: supabaseConfigured,
  ready: !supabaseConfigured,
  userId: null,
  isAnonymous: true,
  isOwner: false,
  provider: null,
  providers: { github: false, google: false },
  error: '',
}

const GuestbookAuthContext = createContext<GuestbookAuthContextValue | null>(null)
let anonymousSessionPromise: Promise<Session | null> | null = null
let oauthCallbackPromise: Promise<Session | null> | null = null

type SocialProvider = 'github' | 'google'
type OAuthIntent = { provider: SocialProvider; mode: 'link' | 'sign-in' }

const oauthIntentKey = 'wenhao-guestbook:oauth-intent'
const oauthParameterNames = ['auth', 'code', 'sb_flow_id', 'error', 'error_code', 'error_description']

const getRedirectUrl = () => `${window.location.origin}${window.location.pathname}?auth=guestbook`

const readOAuthIntent = (): OAuthIntent | null => {
  try {
    const value = window.sessionStorage.getItem(oauthIntentKey)
    return value ? JSON.parse(value) as OAuthIntent : null
  } catch {
    return null
  }
}

const saveOAuthIntent = (intent: OAuthIntent) => {
  window.sessionStorage.setItem(oauthIntentKey, JSON.stringify(intent))
}

const clearOAuthIntent = () => window.sessionStorage.removeItem(oauthIntentKey)

const normalizeGuestbookUrl = () => {
  const url = new URL(window.location.href)
  oauthParameterNames.forEach((name) => url.searchParams.delete(name))
  url.hash = 'guestbook'
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}

const explainOAuthError = (code: string, description: string) => {
  if (code === 'access_denied') return '登录已取消'
  if (code === 'identity_already_exists') return '这个账号已经绑定，将切换为账号登录'
  if (code === 'flow_state_not_found') return '登录已过期，请重新点击登录'
  if (code === 'bad_oauth_callback') return '登录回调无效，请重新尝试'
  return description || '第三方登录失败，请重新尝试'
}

async function beginOAuth(provider: SocialProvider, mode: OAuthIntent['mode']) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  saveOAuthIntent({ provider, mode })
  const credentials = {
    provider: provider as Provider,
    options: { redirectTo: getRedirectUrl(), skipBrowserRedirect: true },
  }
  const result = mode === 'link'
    ? await supabase.auth.linkIdentity(credentials)
    : await supabase.auth.signInWithOAuth(credentials)
  if (result.error) {
    clearOAuthIntent()
    throw result.error
  }
  if (!result.data.url) {
    clearOAuthIntent()
    throw new Error('登录服务没有返回授权地址')
  }
  window.location.assign(result.data.url)
}

async function resolveOAuthCallback() {
  if (!supabase) return null
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  if (!code) return null
  if (!oauthCallbackPromise) {
    const flowId = url.searchParams.get('sb_flow_id')
    oauthCallbackPromise = supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
      .then(({ data, error }) => {
        if (error) throw error
        return data.session
      })
      .finally(() => { oauthCallbackPromise = null })
  }
  return oauthCallbackPromise
}

async function ensureAnonymousSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  if (data.session) return data.session
  if (!anonymousSessionPromise) {
    anonymousSessionPromise = supabase.auth.signInAnonymously()
      .then(({ data: result, error }) => {
        if (error) throw error
        return result.session
      })
      .finally(() => { anonymousSessionPromise = null })
  }
  return anonymousSessionPromise
}

export function GuestbookAuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuestbookAuthState>(initialState)

  const applySession = useCallback(async (session: Session | null) => {
    if (!supabase || !session?.user) {
      setState((value) => ({ ...value, ready: true, userId: null, isAnonymous: true, isOwner: false, provider: null }))
      return
    }
    if (session.user.is_anonymous) {
      await new Promise((resolve) => window.setTimeout(resolve, 120))
      const { data } = await supabase.auth.getSession()
      session = data.session ?? session
      if (session.user.is_anonymous) {
        setState((value) => ({
          ...value,
          configured: true,
          ready: true,
          userId: session!.user.id,
          isAnonymous: true,
          isOwner: false,
          provider: null,
          error: '',
        }))
        return
      }
    }
    let ownerResult = await supabase.rpc('guestbook_is_admin')
    if (ownerResult.error?.message.includes('JWT')) {
      const { data } = await supabase.auth.refreshSession()
      session = data.session ?? session
      ownerResult = await supabase.rpc('guestbook_is_admin')
    }
    setState((value) => ({
      ...value,
      configured: true,
      ready: true,
      userId: session.user.id,
      isAnonymous: session.user.is_anonymous === true,
      isOwner: ownerResult.error ? false : ownerResult.data === true,
      provider: session.user.app_metadata.provider ?? null,
      error: ownerResult.error ? '身份验证暂时失败，请刷新后重试' : '',
    }))
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    const params = new URLSearchParams(window.location.search)
    const callbackErrorCode = params.get('error_code') ?? params.get('error') ?? ''
    const callbackErrorDescription = params.get('error_description') ?? ''
    const intent = readOAuthIntent()

    void getSocialProviderStatus()
      .then((providers) => { if (active) setState((value) => ({ ...value, providers })) })
      .catch(() => { /* provider buttons remain safely disabled */ })

    void (async () => {
      if (callbackErrorCode) {
        if (callbackErrorCode === 'identity_already_exists' && intent?.mode === 'link') {
          setState((value) => ({ ...value, error: '账号已存在，正在切换为登录…' }))
          await beginOAuth(intent.provider, 'sign-in')
          return
        }
        clearOAuthIntent()
        normalizeGuestbookUrl()
        const session = await ensureAnonymousSession()
        if (active) {
          await applySession(session)
          setState((value) => ({ ...value, error: explainOAuthError(callbackErrorCode, callbackErrorDescription) }))
        }
        return
      }

      const oauthSession = await resolveOAuthCallback()
      const session = oauthSession ?? await ensureAnonymousSession()
      if (!active) return
      await applySession(session)
      if (oauthSession) clearOAuthIntent()
      if (params.get('auth') === 'guestbook') normalizeGuestbookUrl()
    })()
      .catch(async (error: unknown) => {
        clearOAuthIntent()
        if (params.has('code') || params.get('auth') === 'guestbook') normalizeGuestbookUrl()
        const session = await ensureAnonymousSession().catch(() => null)
        if (!active) return
        await applySession(session)
        const message = error instanceof Error ? error.message : '身份连接失败'
        setState((value) => ({ ...value, ready: true, error: message }))
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        if (!active) return
        void (async () => {
          const resolvedSession = session ?? await ensureAnonymousSession()
          if (active) await applySession(resolvedSession)
        })()
      }, 0)
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [applySession])

  const connect = useCallback(async (provider: 'github' | 'google') => {
    if (!supabase) throw new Error('Supabase 尚未配置')
    if (!state.providers[provider]) throw new Error(`${provider === 'google' ? 'Google' : 'GitHub'} 登录尚未在 Supabase 保存生效`)
    setState((value) => ({ ...value, error: '' }))
    await beginOAuth(provider, state.isAnonymous ? 'link' : 'sign-in')
  }, [state.isAnonymous, state.providers])

  const disconnect = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    const session = await ensureAnonymousSession()
    await applySession(session)
  }, [applySession])

  const value = useMemo(() => ({ ...state, connect, disconnect }), [connect, disconnect, state])
  return <GuestbookAuthContext.Provider value={value}>{children}</GuestbookAuthContext.Provider>
}

export function useGuestbookAuth() {
  const value = useContext(GuestbookAuthContext)
  if (!value) throw new Error('useGuestbookAuth must be used within GuestbookAuthProvider')
  return value
}
