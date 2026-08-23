import { useEffect, useState, type FormEvent } from 'react'
import type { GuestIdentity, GuestbookAuthState } from './types'

export function GuestbookRulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose, open])

  if (!open) return null
  return <div className="guestbook-dialog-layer" role="presentation">
    <button className="dialog-scrim" type="button" onClick={onClose} aria-label="关闭规则" />
    <section className="guestbook-dialog rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <header><div><small>OPEN CHANNEL / RULES</small><h2 id="rules-title">留言规则</h2></div><button type="button" onClick={onClose}>×</button></header>
      <div className="rules-copy">
        <p>请在交流中保持友善、理性和尊重。</p>
        <p>请勿发布以下内容：</p>
        <ul>
          <li>违反法律法规或侵犯他人合法权益的内容。</li>
          <li>恶意攻击、骚扰、威胁、歧视或泄露隐私。</li>
          <li>垃圾广告、恶意推广、刷屏及重复灌水。</li>
          <li>诈骗、钓鱼、恶意软件或危害信息安全的内容。</li>
          <li>冒充他人或试图绕过审核与限流措施。</li>
        </ul>
      </div>
      <footer><span>BE KIND / STAY CURIOUS</span><button type="button" onClick={onClose}>我知道了</button></footer>
    </section>
  </div>
}

export function GuestIdentityPanel({ open, value, auth, onClose, onSave, onConnect, onDisconnect }: {
  open: boolean
  value: GuestIdentity
  auth: GuestbookAuthState
  onClose: () => void
  onSave: (value: GuestIdentity) => Promise<boolean>
  onConnect: (provider: 'github' | 'google') => Promise<void>
  onDisconnect: () => Promise<void>
}) {
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => { if (open) { setDraft(value); setError('') } }, [open, value])
  useEffect(() => { if (open && auth.error) setError(auth.error) }, [auth.error, open])
  if (!open) return null

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!draft.nickname.trim()) {
      setError('昵称不能为空')
      return
    }
    if (draft.website && !/^https?:\/\//i.test(draft.website)) {
      setError('个人网站需要以 http:// 或 https:// 开头')
      return
    }
    setWorking(true)
    const saved = await onSave({ nickname: draft.nickname.trim().slice(0, 24), email: draft.email.trim(), website: draft.website.trim() })
    setWorking(false)
    if (!saved) setError('资料保存失败，请稍后重试')
  }

  const connect = async (provider: 'github' | 'google') => {
    setWorking(true)
    setError('')
    try { await onConnect(provider) } catch (reason) { setError(reason instanceof Error ? reason.message : '登录连接失败'); setWorking(false) }
  }

  return <div className="guestbook-dialog-layer" role="presentation">
    <button className="dialog-scrim" type="button" onClick={onClose} aria-label="关闭游客资料" />
    <form className="guestbook-dialog identity-dialog" role="dialog" aria-modal="true" aria-labelledby="identity-title" onSubmit={(event) => void submit(event)}>
      <header><div><small>VISITOR IDENTITY</small><h2 id="identity-title">游客资料</h2></div><button type="button" onClick={onClose}>×</button></header>
      <div className="identity-session">
        <div><i className={auth.isOwner ? 'is-owner' : ''} /><span>{auth.isOwner ? '站长身份' : auth.isAnonymous ? '匿名访客' : '已连接账号'}</span><small>{auth.isAnonymous ? '当前浏览器可管理自己的留言' : `通过 ${auth.provider ?? 'OAuth'} 跨设备同步`}</small></div>
        {!auth.isAnonymous && <button type="button" disabled={working} onClick={() => void onDisconnect()}>退出</button>}
      </div>
      <label><span>昵称 *</span><input autoFocus maxLength={24} value={draft.nickname} onChange={(event) => setDraft({ ...draft, nickname: event.target.value })} placeholder="怎么称呼你" /></label>
      <label><span>邮箱</span><input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="不会公开展示" /></label>
      <label><span>个人网站</span><input type="url" value={draft.website} onChange={(event) => setDraft({ ...draft, website: event.target.value })} placeholder="https://" /></label>
      {auth.configured && auth.isAnonymous && <div className="identity-oauth">
        <p><span />连接账号后，可跨设备找回留言</p>
        <div>
          <button type="button" disabled={working || !auth.ready || !auth.providers.github} onClick={() => void connect('github')}>GitHub 登录</button>
          <button type="button" disabled={working || !auth.ready || !auth.providers.google} onClick={() => void connect('google')}>{auth.providers.google ? 'Google 登录' : 'Google 未启用'}</button>
        </div>
      </div>}
      {error && <p className="dialog-error">{error}</p>}
      <footer><span>{auth.configured ? '资料受数据库权限保护' : '资料只保存在当前浏览器'}</span><button type="submit" disabled={working}>{working ? '保存中' : '保存资料'}</button></footer>
    </form>
  </div>
}
