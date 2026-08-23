import { useEffect } from 'react'
import type { SocialProviderStatus } from '../lib/supabase'

export type SocialProvider = 'github' | 'google'

export function AuthDialog({
  open,
  providers,
  error,
  onClose,
  onSignIn,
}: {
  open: boolean
  providers: SocialProviderStatus
  error: string
  onClose: () => void
  onSignIn: (provider: SocialProvider) => Promise<void>
}) {
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  if (!open) return null

  const signIn = (provider: SocialProvider) => {
    void onSignIn(provider)
  }

  return <div className="auth-dialog-layer" role="presentation">
    <button className="auth-dialog-scrim" type="button" onClick={onClose} aria-label="关闭登录" />
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-login-title">
      <header>
        <div><small>WENHAO / ACCOUNT</small><h2 id="auth-login-title">登录后继续</h2></div>
        <button type="button" onClick={onClose} aria-label="关闭登录">×</button>
      </header>
      <p>连接账号后可使用 AI 电商工作台，并跨设备保存项目记录。</p>
      <div className="auth-provider-actions">
        <button type="button" disabled={!providers.github} onClick={() => signIn('github')}>GitHub 登录</button>
        <button type="button" disabled={!providers.google} onClick={() => signIn('google')}>{providers.google ? 'Google 登录' : 'Google 未启用'}</button>
      </div>
      {error && <p className="auth-dialog-error" role="status">{error}</p>}
      <footer><span>匿名留言仍无需登录</span></footer>
    </section>
  </div>
}
