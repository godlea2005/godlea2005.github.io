import { useEffect, useRef } from 'react'
import type { SocialProviderStatus } from '../lib/supabase'

export type SocialProvider = 'github' | 'google'

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function AuthDialog({
  open,
  ready,
  providers,
  error,
  onClose,
  onSignIn,
}: {
  open: boolean
  ready: boolean
  providers: SocialProviderStatus
  error: string
  onClose: () => void
  onSignIn: (provider: SocialProvider) => Promise<void>
}) {
  const dialogRef = useRef<HTMLElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    return () => {
      const opener = openerRef.current
      openerRef.current = null
      if (opener?.isConnected) opener.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const primaryProvider = dialog?.querySelector<HTMLButtonElement>('.auth-provider-actions button:not([disabled])')
    const closeButton = dialog?.querySelector<HTMLButtonElement>('header button')
    ;(primaryProvider ?? closeButton)?.focus()
  }, [open, providers.github, providers.google, ready])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
      if (!focusable.length) return
      const index = focusable.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && (index <= 0 || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        focusable.at(-1)?.focus()
      } else if (!event.shiftKey && (index === focusable.length - 1 || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        focusable[0].focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  const signIn = (provider: SocialProvider) => {
    void onSignIn(provider)
  }

  return <div className="auth-dialog-layer" role="presentation">
    <div className="auth-dialog-scrim" aria-hidden="true" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }} />
    <section className="auth-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="auth-login-title">
      <header>
        <div><small>WENHAO / ACCOUNT</small><h2 id="auth-login-title">登录后继续</h2></div>
        <button type="button" onClick={onClose} aria-label="关闭登录">×</button>
      </header>
      <p>连接账号后可使用 AI 电商工作台，并跨设备保存项目记录。</p>
      <div className="auth-provider-actions">
        <button type="button" disabled={!ready || !providers.github} onClick={() => signIn('github')}>GitHub 登录</button>
        <button type="button" disabled={!ready || !providers.google} onClick={() => signIn('google')}>{providers.google ? 'Google 登录' : 'Google 未启用'}</button>
      </div>
      {error && <p className="auth-dialog-error" role="status">{error}</p>}
      <footer><span>匿名留言仍无需登录</span></footer>
    </section>
  </div>
}
