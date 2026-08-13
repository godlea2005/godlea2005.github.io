import { useCallback, useEffect, useRef, useState } from 'react'
import '../guestbook/guestbook.css'
import { GuestbookComposer } from '../guestbook/GuestbookComposer'
import { GuestbookRulesDialog, GuestIdentityPanel } from '../guestbook/GuestbookDialogs'
import { GuestbookAuthProvider, useGuestbookAuth } from '../guestbook/GuestbookAuth'
import { MessageTimeline } from '../guestbook/MessageTimeline'
import { detectClientMeta, guestbookRepository } from '../guestbook/guestbookRepository'
import type { GuestIdentity, GuestbookMessage, MessageStatus } from '../guestbook/types'

const identityKey = 'wenhao-guestbook:identity'
const rulesKey = 'wenhao-guestbook:rules-seen'

const readIdentity = (): GuestIdentity => {
  try {
    const stored = window.localStorage.getItem(identityKey)
    return stored ? JSON.parse(stored) as GuestIdentity : { nickname: '', email: '', website: '' }
  } catch {
    return { nickname: '', email: '', website: '' }
  }
}

function GuestbookPageContent() {
  const auth = useGuestbookAuth()
  const [messages, setMessages] = useState<GuestbookMessage[]>([])
  const [identity, setIdentity] = useState<GuestIdentity>(readIdentity)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [sending, setSending] = useState(false)
  const [announcementOpen, setAnnouncementOpen] = useState(true)
  const [rulesOpen, setRulesOpen] = useState(() => window.sessionStorage.getItem(rulesKey) !== 'true')
  const [identityOpen, setIdentityOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<GuestbookMessage | null>(null)
  const [notice, setNotice] = useState('')
  const [syncedAt, setSyncedAt] = useState(new Date())
  const timelineRef = useRef<HTMLDivElement>(null)
  const noticeTimer = useRef<number | undefined>(undefined)

  const showNotice = useCallback((message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 2600)
  }, [])

  const loadMessages = useCallback(async () => {
    try {
      const nextMessages = await guestbookRepository.list()
      setMessages(nextMessages)
      setSyncedAt(new Date())
    } catch {
      if (guestbookRepository.mode === 'supabase') {
        try {
          await new Promise((resolve) => window.setTimeout(resolve, 280))
          setMessages(await guestbookRepository.list())
          setSyncedAt(new Date())
          return
        } catch { /* show the final connection error below */ }
      }
      showNotice(guestbookRepository.mode === 'supabase' ? '数据库尚未初始化或连接失败' : '留言载入失败，请稍后刷新')
    } finally {
      setLoading(false)
    }
  }, [showNotice])

  useEffect(() => {
    if (!auth.ready) return
    const loadTimer = window.setTimeout(() => void loadMessages(), guestbookRepository.mode === 'supabase' ? 360 : 0)
    return () => {
      window.clearTimeout(loadTimer)
      window.clearTimeout(noticeTimer.current)
    }
  }, [auth.ready, auth.userId, loadMessages])

  useEffect(() => {
    if (!auth.ready || !auth.userId) return
    let active = true
    void guestbookRepository.getProfile().then(async (profile) => {
      if (!active) return
      if (profile) {
        setIdentity(profile)
        window.localStorage.setItem(identityKey, JSON.stringify(profile))
        return
      }
      const local = readIdentity()
      if (local.nickname) await guestbookRepository.saveProfile(local)
    }).catch(() => { /* database setup notice is handled by message loading */ })
    return () => { active = false }
  }, [auth.ready, auth.userId])

  useEffect(() => {
    if (auth.error) showNotice(auth.error)
  }, [auth.error, showNotice])

  useEffect(() => {
    if (!loading) window.setTimeout(() => timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: messages.length > 4 ? 'smooth' : 'auto' }), 40)
  }, [loading, messages.length])

  const refresh = async () => {
    setSyncing(true)
    try {
      setMessages(await guestbookRepository.refresh())
      setSyncedAt(new Date())
      showNotice('频道已同步')
    } catch {
      showNotice('同步失败，请稍后重试')
    } finally {
      setSyncing(false)
    }
  }

  const send = async (content: string, image?: string) => {
    setSending(true)
    try {
      const created = await guestbookRepository.create({
        author: identity.nickname,
        emailHash: identity.nickname.slice(0, 2).toUpperCase(),
        website: identity.website,
        content: content || '分享了一张图片',
        image,
        replyTo: replyTo?.id,
        clientMeta: detectClientMeta(),
      })
      setMessages((value) => [...value, created])
      setReplyTo(null)
      setSyncedAt(new Date())
      showNotice(guestbookRepository.mode === 'supabase' ? '留言已同步到开放频道' : '留言已写入本地频道')
      return true
    } catch (error) {
      showNotice(error instanceof Error && error.message.includes('bucket') ? '请先创建留言图片存储空间' : '发送失败，请检查数据库连接')
      return false
    } finally {
      setSending(false)
    }
  }

  const closeRules = () => {
    setRulesOpen(false)
    window.sessionStorage.setItem(rulesKey, 'true')
  }

  const saveIdentity = async (value: GuestIdentity) => {
    setIdentity(value)
    try { window.localStorage.setItem(identityKey, JSON.stringify(value)) } catch { /* session state remains usable */ }
    try {
      await guestbookRepository.saveProfile(value)
      setIdentityOpen(false)
      showNotice(auth.isOwner ? '站长资料已保存' : '游客资料已保存')
      return true
    } catch {
      showNotice('资料已保存在本机，数据库同步失败')
      return false
    }
  }

  const updateMessage = async (id: string, content: string) => {
    try {
      await guestbookRepository.update(id, content)
      await loadMessages()
      showNotice('留言已更新')
      return true
    } catch { showNotice('无权编辑或更新失败'); return false }
  }

  const deleteMessage = async (id: string) => {
    try {
      await guestbookRepository.remove(id)
      await loadMessages()
      showNotice('留言已删除')
      return true
    } catch { showNotice('无权删除或操作失败'); return false }
  }

  const moderateMessage = async (id: string, status: MessageStatus) => {
    try {
      await guestbookRepository.moderate(id, status)
      await loadMessages()
      showNotice(status === 'approved' ? '留言已通过' : '留言已拒绝')
      return true
    } catch { showNotice('审核操作失败'); return false }
  }

  const disconnect = async () => {
    try { await auth.disconnect(); showNotice('已切换为匿名访客') } catch { showNotice('退出失败，请稍后重试') }
  }

  return <main className="guestbook-page" id="guestbook-top">
    <section className="guestbook-shell frame">
      <header className="guestbook-title-row">
        <div><p><span>04</span> OPEN CHANNEL</p></div>
        <div className="guestbook-signal"><i className={guestbookRepository.mode === 'supabase' ? 'is-live' : ''} /><span>{guestbookRepository.mode === 'supabase' ? 'DATABASE CHANNEL' : 'LOCAL PREVIEW'}</span><b>{auth.isOwner ? '站长在线' : auth.isAnonymous ? '匿名身份 · 无需登录' : '账号已连接'}</b></div>
      </header>

      <section className="guestbook-board" aria-label="留言板">
        <header className="guestbook-board-header">
          <div><h2>留言板</h2><span>· {messages.length} 条留言</span></div>
          <div><span>同步于 {syncedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><button type="button" onClick={() => void refresh()} disabled={syncing} aria-label="立即刷新消息">{syncing ? '同步中' : '↻'}</button></div>
        </header>

        {announcementOpen && <aside className="guestbook-announcement" aria-label="公告">
          <strong><i />公告</strong>
          <button type="button" onClick={() => setRulesOpen(true)}>评论及留言规则</button>
          <span>{guestbookRepository.mode === 'supabase' ? '匿名访客可直接留言，登录后可跨设备管理' : '当前为本地预览，配置数据库后开启共享留言'}</span>
          <button className="announcement-close" type="button" onClick={() => setAnnouncementOpen(false)} aria-label="关闭公告">×</button>
        </aside>}

        <div className="guestbook-channel" ref={timelineRef}>
          <MessageTimeline
            messages={messages}
            loading={loading || !auth.ready}
            viewerIsOwner={auth.isOwner}
            onReply={setReplyTo}
            onNotice={showNotice}
            onUpdate={updateMessage}
            onDelete={deleteMessage}
            onModerate={moderateMessage}
          />
        </div>

        <GuestbookComposer
          identity={identity}
          replyTo={replyTo}
          sending={sending}
          onOpenIdentity={() => setIdentityOpen(true)}
          onCancelReply={() => setReplyTo(null)}
          onSend={send}
          onNotice={showNotice}
        />
      </section>
      <footer className="guestbook-page-footer"><span>WENHAO / OPEN CHANNEL</span><span>{guestbookRepository.mode === 'supabase' ? 'SUPABASE / RLS' : 'LOCAL REPOSITORY V1'}</span><span>BE KIND</span></footer>
    </section>

    {notice && <div className="guestbook-toast" role="status">{notice}</div>}
    <GuestbookRulesDialog open={rulesOpen} onClose={closeRules} />
    <GuestIdentityPanel
      open={identityOpen}
      value={identity}
      auth={auth}
      onClose={() => setIdentityOpen(false)}
      onSave={saveIdentity}
      onConnect={auth.connect}
      onDisconnect={disconnect}
    />
  </main>
}

export function GuestbookPage() {
  return <GuestbookAuthProvider><GuestbookPageContent /></GuestbookAuthProvider>
}
