import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
type OAuthCallbackResult = {
  handled: boolean
  navigating: boolean
  session: Session | null
  error: string
}

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
const oauthAccountConflictCodes = new Set(['email_exists', 'identity_already_exists'])
let anonymousSessionPromise: Promise<Session | null> | null = null
let oauthCallbackPromise: Promise<Session | null> | null = null
let oauthCallbackInitializationPromise: Promise<OAuthCallbackResult> | null = null

const getRedirectUrl = () => `${window.location.origin}${window.location.pathname}?auth=site`
const normalizeReturnHash = (value: string | null | undefined) => value?.startsWith('#') ? value : '#ai-commerce'
const canRetryOAuthAsSignIn = (
  code: string,
  intent: OAuthIntent | null,
): intent is OAuthIntent & { mode: 'link' } =>
  intent?.mode === 'link' && oauthAccountConflictCodes.has(code)

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
const clearReturnHash = () => window.sessionStorage.removeItem(returnHashKey)

const saveReturnHash = (returnHash?: string) => {
  window.sessionStorage.setItem(returnHashKey, normalizeReturnHash(returnHash))
}

const takeReturnHash = () => {
  const returnHash = normalizeReturnHash(window.sessionStorage.getItem(returnHashKey))
  clearReturnHash()
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
  if (code === 'email_exists') return '该邮箱已绑定其他账号，请重新选择登录方式'
  if (code === 'access_denied') return '登录已取消'
  if (code === 'identity_already_exists') return '这个账号已经绑定，将切换为账号登录'
  if (code === 'flow_state_not_found') return '登录已过期，请重新点击登录'
  if (code === 'bad_oauth_callback') return '登录回调无效，请重新尝试'
  return description || '第三方登录失败，请重新尝试'
}

async function ensureAnonymousSession() {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  if (data.session) return data.session
  if (!anonymousSessionPromise) {
    anonymousSessionPromise = supabase.auth.signInAnonymously()
      .then(({ data: result, error: signInError }) => {
        if (signInError) throw signInError
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

async function beginOAuth(provider: SocialProvider, mode: OAuthIntent['mode'], returnHash?: string) {
  if (!supabase) throw new Error('Supabase 尚未配置')
  saveOAuthIntent({ provider, mode })
  if (returnHash) saveReturnHash(returnHash)
  const credentials = {
    provider: provider as Provider,
    options: { redirectTo: getRedirectUrl(), skipBrowserRedirect: true },
  }
  try {
    const result = mode === 'link'
      ? await supabase.auth.linkIdentity(credentials)
      : await supabase.auth.signInWithOAuth(credentials)
    if (result.error) throw result.error
    if (!result.data.url) throw new Error('登录服务没有返回授权地址')
    window.location.assign(result.data.url)
  } catch (error) {
    clearOAuthIntent()
    clearReturnHash()
    throw error
  }
}

async function initializeOAuthCallback(): Promise<OAuthCallbackResult> {
  if (!supabase) return { handled: false, navigating: false, session: null, error: '' }
  const params = new URLSearchParams(window.location.search)
  const callbackErrorCode = params.get('error_code') ?? params.get('error') ?? ''
  const callbackErrorDescription = params.get('error_description') ?? ''
  const code = params.get('code')
  const isCallback = Boolean(callbackErrorCode || code || params.get('auth') === 'site')
  if (!isCallback) return { handled: false, navigating: false, session: null, error: '' }

  if (callbackErrorCode) {
    const intent = readOAuthIntent()
    if (canRetryOAuthAsSignIn(callbackErrorCode, intent)) {
      await beginOAuth(intent.provider, 'sign-in')
      return { handled: true, navigating: true, session: null, error: '' }
    }
    clearOAuthIntent()
    normalizeAuthUrl()
    return {
      handled: true,
      navigating: false,
      session: await ensureAnonymousSession(),
      error: explainOAuthError(callbackErrorCode, callbackErrorDescription),
    }
  }

  const oauthSession = await resolveOAuthCallback()
  const session = oauthSession ?? await ensureAnonymousSession()
  if (oauthSession) clearOAuthIntent()
  normalizeAuthUrl()
  return { handled: true, navigating: false, session, error: '' }
}

function getOAuthCallbackInitialization() {
  if (!oauthCallbackInitializationPromise) {
    oauthCallbackInitializationPromise = initializeOAuthCallback()
      .finally(() => { oauthCallbackInitializationPromise = null })
  }
  return oauthCallbackInitializationPromise
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState)
  const [dialogOpen, setDialogOpen] = useState(false)
  const sessionEpochRef = useRef(0)

  const enterResolvingState = useCallback(() => {
    const epoch = ++sessionEpochRef.current
    setState((value) => ({
      ...value,
      ready: false,
      user: null,
      isAnonymous: true,
      isAdmin: false,
      provider: null,
      error: '',
    }))
    return epoch
  }, [])

  const applySession = useCallback(async (initialSession: Session | null, epoch: number) => {
    const current = () => sessionEpochRef.current === epoch
    if (!supabase || !initialSession?.user) {
      if (current()) setState((value) => ({ ...value, ready: true, user: null, isAnonymous: true, isAdmin: false, provider: null }))
      return
    }

    let session = initialSession
    if (session.user.is_anonymous) {
      await new Promise((resolve) => window.setTimeout(resolve, 120))
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      if (!current()) return
      session = data.session ?? session
      if (session.user.is_anonymous) {
        if (current()) setState((value) => ({
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

    if (!current()) return
    let adminResult = await supabase.rpc('site_is_admin')
    if (!current()) return
    if (adminResult.error?.message.includes('JWT')) {
      const { data } = await supabase.auth.refreshSession()
      if (!current()) return
      session = data.session ?? session
      adminResult = await supabase.rpc('site_is_admin')
      if (!current()) return
    }
    if (current()) setState((value) => ({
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

  useEffect(() => {
    if (!supabase) return
    let active = true

    void getSocialProviderStatus()
      .then((providers) => { if (active) setState((value) => ({ ...value, providers })) })
      .catch(() => { /* provider buttons remain safely disabled */ })

    void (async () => {
      const callback = await getOAuthCallbackInitialization()
      if (!active || callback.navigating) return
      const session = callback.handled ? callback.session : await ensureAnonymousSession()
      if (!active) return
      const epoch = enterResolvingState()
      await applySession(session, epoch)
      if (callback.error && sessionEpochRef.current === epoch) setState((value) => ({ ...value, error: callback.error }))
    })()
      .catch(async (error: unknown) => {
        const params = new URLSearchParams(window.location.search)
        if (params.has('code') || params.get('auth') === 'site') normalizeAuthUrl()
        const session = await ensureAnonymousSession().catch(() => null)
        if (!active) return
        const epoch = enterResolvingState()
        await applySession(session, epoch)
        if (sessionEpochRef.current !== epoch) return
        const message = error instanceof Error ? error.message : '身份连接失败'
        setState((value) => ({ ...value, ready: true, error: message }))
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const epoch = enterResolvingState()
      window.setTimeout(() => {
        if (!active || sessionEpochRef.current !== epoch) return
        void (async () => {
          const resolvedSession = session ?? await ensureAnonymousSession()
          if (active && sessionEpochRef.current === epoch) await applySession(resolvedSession, epoch)
        })()
      }, 0)
    })
    return () => { active = false; sessionEpochRef.current += 1; listener.subscription.unsubscribe() }
  }, [applySession, enterResolvingState])

  const signIn = useCallback(async (provider: SocialProvider, returnHash?: string) => {
    if (!supabase) throw new Error('Supabase 尚未配置')
    if (!state.providers[provider]) throw new Error(`${provider === 'google' ? 'Google' : 'GitHub'} 登录尚未在 Supabase 保存生效`)
    setState((value) => ({ ...value, error: '' }))
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      const session = data.session ?? await ensureAnonymousSession()
      await beginOAuth(provider, session?.user.is_anonymous ? 'link' : 'sign-in', returnHash)
    } catch (error) {
      clearOAuthIntent()
      clearReturnHash()
      throw error
    }
  }, [state.providers])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const epoch = enterResolvingState()
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      const session = await ensureAnonymousSession()
      await applySession(session, epoch)
    } catch (error) {
      if (sessionEpochRef.current === epoch) {
        try {
          const { data, error: sessionError } = await supabase.auth.getSession()
          if (sessionError) throw sessionError
          await applySession(data.session, epoch)
        } catch {
          if (sessionEpochRef.current === epoch) {
            setState((value) => ({
              ...value,
              ready: true,
              user: null,
              isAnonymous: true,
              isAdmin: false,
              provider: null,
            }))
          }
        }
        if (sessionEpochRef.current === epoch) {
          const message = error instanceof Error ? error.message : '退出登录失败，请稍后重试'
          setState((value) => ({ ...value, ready: true, error: message }))
        }
      }
      throw error
    }
  }, [applySession, enterResolvingState])

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

  const closeDialog = useCallback(() => setDialogOpen(false), [])
  const value = useMemo<AuthContextValue>(() => ({ ...state, signIn, signOut, requireLogin }), [requireLogin, signIn, signOut, state])
  return <AuthContext.Provider value={value}>
    {children}
    <AuthDialog open={dialogOpen} ready={state.ready} providers={state.providers} error={state.error} onClose={closeDialog} onSignIn={signInFromDialog} />
  </AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
