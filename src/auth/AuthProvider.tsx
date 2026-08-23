import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Provider, Session, User } from '@supabase/supabase-js'
import { getSocialProviderStatus, supabase, supabaseConfigured, type SocialProviderStatus } from '../lib/supabase'
import { AuthDialog, type SocialProvider } from './AuthDialog'
import './auth.css'

export type AuthState = {
  configured: boolean
  ready: boolean
  user: User | null
  isAnonymous: boolean
  isAdmin: boolean
  provider: string | null
  providers: SocialProviderStatus
  error: string
}

export type AuthContextValue = AuthState & {
  signIn: (provider: SocialProvider, returnHash?: string) => Promise<void>
  signOut: () => Promise<void>
  requireLogin: (returnHash?: string) => boolean
}

type OAuthIntent = { provider: SocialProvider; mode: 'link' | 'sign-in' }

const initialState: AuthState = {
  configured: supabaseConfigured,
  ready: !supabaseConfigured,
  user: null,
  isAnonymous: true,
  isAdmin: false,
  provider: null,
  providers: { github: false, google: false },
  error: '',
}

const AuthContext = createContext<AuthContextValue | null>(null)
const oauthIntentKey = 'wenhao-site:oauth-intent'
const returnHashKey = 'wenhao-site:return-hash'
const oauthParameterNames = ['auth', 'code', 'sb_flow_id', 'error', 'error_code', 'error_description']
let anonymousSessionPromise: Promise<Session | null> | null = null
let oauthCallbackPromise: Promise<Session | null> | null = null

const getRedirectUrl = () => `${window.location.origin}${window.location.pathname}?auth=site`
const normalizeReturnHash = (value: string | null | undefined) => value?.startsWith('#') ? value : '#ai-commerce'

const readOAuthIntent = (): OAuthIntent | null => {
  try {
    const value = window.sessionStorage.getItem(oauthIntentKey)
    return value ? JSON.parse(value) as OAuthIntent : null
  } catch {
    return null
  }
}

const saveOAuthIntent = (intent: OAuthIntent) => window.sessionStorage.setItem(oauthIntentKey, JSON.stringify(intent))
const clearOAuthIntent = () => window.sessionStorage.removeItem(oauthIntentKey)

const saveReturnHash = (returnHash?: string) => {
  window.sessionStorage.setItem(returnHashKey, normalizeReturnHash(returnHash))
}

const takeReturnHash = () => {
  const returnHash = normalizeReturnHash(window.sessionStorage.getItem(returnHashKey))
  window.sessionStorage.removeItem(returnHashKey)
  return returnHash
}

const normalizeAuthUrl = () => {
  const url = new URL(window.location.href)
  oauthParameterNames.forEach((name) => url.searchParams.delete(name))
  url.hash = takeReturnHash().slice(1)
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)
  const [dialogOpen, setDialogOpen] = useState(false)

  const applySession = useCallback(async (initialSession: Session | null) => {
    if (!supabase || !initialSession?.user) {
      setState((value) => ({ ...value, ready: true, user: null, isAnonymous: true, isAdmin: false, provider: null }))
      return
    }

    let session = initialSession
    if (session.user.is_anonymous) {
      await new Promise((resolve) => window.setTimeout(resolve, 120))
      const { data } = await supabase.auth.getSession()
      session = data.session ?? session
      if (session.user.is_anonymous) {
        setState((value) => ({
          ...value,
          configured: true,
          ready: true,
          user: session.user,
          isAnonymous: true,
          isAdmin: false,
          provider: null,
          error: '',
        }))
        return
      }
    }

    let adminResult = await supabase.rpc('site_is_admin')
    if (adminResult.error?.message.includes('JWT')) {
      const { data } = await supabase.auth.refreshSession()
      session = data.session ?? session
      adminResult = await supabase.rpc('site_is_admin')
    }
    setState((value) => ({
      ...value,
      configured: true,
      ready: true,
      user: session.user,
      isAnonymous: session.user.is_anonymous === true,
      isAdmin: adminResult.error ? false : adminResult.data === true,
      provider: session.user.app_metadata.provider ?? null,
      error: adminResult.error ? '身份验证暂时失败，请刷新后重试' : '',
    }))
  }, [])

  const beginOAuth = useCallback(async (provider: SocialProvider, mode: OAuthIntent['mode'], returnHash?: string) => {
    if (!supabase) throw new Error('Supabase 尚未配置')
    saveOAuthIntent({ provider, mode })
    if (returnHash) saveReturnHash(returnHash)
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
        normalizeAuthUrl()
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
      if (params.has('code') || params.get('auth') === 'site') normalizeAuthUrl()
    })()
      .catch(async (error: unknown) => {
        clearOAuthIntent()
        if (params.has('code') || params.get('auth') === 'site') normalizeAuthUrl()
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
  }, [applySession, beginOAuth])

  const signIn = useCallback(async (provider: SocialProvider, returnHash?: string) => {
    if (!supabase) throw new Error('Supabase 尚未配置')
    if (!state.providers[provider]) throw new Error(`${provider === 'google' ? 'Google' : 'GitHub'} 登录尚未在 Supabase 保存生效`)
    setState((value) => ({ ...value, error: '' }))
    if (returnHash) saveReturnHash(returnHash)
    await beginOAuth(provider, state.user && state.isAnonymous ? 'link' : 'sign-in')
  }, [beginOAuth, state.isAnonymous, state.providers, state.user])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    const session = await ensureAnonymousSession()
    await applySession(session)
  }, [applySession])

  const requireLogin = useCallback((returnHash = '#ai-commerce') => {
    if (state.user && !state.isAnonymous) return true
    saveReturnHash(returnHash)
    setDialogOpen(true)
    return false
  }, [state.isAnonymous, state.user])

  const signInFromDialog = useCallback(async (provider: SocialProvider) => {
    try {
      await signIn(provider)
    } catch (error) {
      const message = error instanceof Error ? error.message : '登录连接失败'
      setState((value) => ({ ...value, error: message }))
    }
  }, [signIn])

  const value = useMemo<AuthContextValue>(() => ({ ...state, signIn, signOut, requireLogin }), [requireLogin, signIn, signOut, state])
  return <AuthContext.Provider value={value}>
    {children}
    <AuthDialog open={dialogOpen} providers={state.providers} error={state.error} onClose={() => setDialogOpen(false)} onSignIn={signInFromDialog} />
  </AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
