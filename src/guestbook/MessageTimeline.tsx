import { useState, type FormEvent } from 'react'
import type { GuestbookMessage, MessageStatus } from './types'

const formatDate = (date: string) => new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' }).format(new Date(date))
const formatTime = (date: string) => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(date))

const avatarText = (name: string) => name.replace(/\s/g, '').slice(0, 2).toUpperCase()

export function MessageTimeline({
  messages,
  loading,
  onReply,
  onNotice,
  viewerIsOwner,
  onUpdate,
  onDelete,
  onModerate,
}: {
  messages: GuestbookMessage[]
  loading: boolean
  onReply: (message: GuestbookMessage) => void
  onNotice: (message: string) => void
  viewerIsOwner: boolean
  onUpdate: (id: string, content: string) => Promise<boolean>
  onDelete: (id: string) => Promise<boolean>
  onModerate: (id: string, status: MessageStatus) => Promise<boolean>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const messageMap = new Map(messages.map((message) => [message.id, message]))

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      onNotice('留言已复制')
    } catch {
      onNotice('复制失败，请手动选择文字')
    }
  }

  const startEdit = (message: GuestbookMessage) => {
    setEditingId(message.id)
    setEditingContent(message.content)
  }

  const submitEdit = async (event: FormEvent, id: string) => {
    event.preventDefault()
    const content = editingContent.trim()
    if (!content) return onNotice('留言内容不能为空')
    if (await onUpdate(id, content)) setEditingId(null)
  }

  if (loading) return <div className="guestbook-loading"><i /><span>正在连接开放频道</span></div>

  return <div className="message-timeline" aria-live="polite">
    <div className="timeline-origin"><span />已经到最早一条消息<span /></div>
    {messages.map((message, index) => {
      const previous = messages[index - 1]
      const showDate = !previous || new Date(previous.createdAt).toDateString() !== new Date(message.createdAt).toDateString()
      const replied = message.replyTo ? messageMap.get(message.replyTo) : undefined
      return <div key={message.id}>
        {showDate && <div className="message-date"><span>{formatDate(message.createdAt)}</span></div>}
        <article className={message.isOwner ? 'message-row is-owner' : 'message-row'}>
          <div className="message-avatar" aria-hidden="true">{avatarText(message.author)}</div>
          <div className="message-body">
            <header>
              {message.website ? <a href={message.website} target="_blank" rel="noreferrer">{message.author}</a> : <strong>{message.author}</strong>}
              {message.isOwner && <em>站长</em>}
              {message.status === 'pending' && <em className="is-pending">审核中</em>}
              <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            </header>
            <div className="message-bubble">
              {replied && <button className="message-quote" type="button" onClick={() => document.getElementById(`message-${replied.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                <b>@{replied.author}</b><span>{replied.content}</span>
              </button>}
              {editingId === message.id
                ? <form className="message-editor" onSubmit={(event) => void submitEdit(event, message.id)}>
                    <textarea autoFocus maxLength={300} value={editingContent} onChange={(event) => setEditingContent(event.target.value)} />
                    <div><span>{editingContent.length}/300</span><button type="button" onClick={() => setEditingId(null)}>取消</button><button type="submit">保存</button></div>
                  </form>
                : <p id={`message-${message.id}`}>{message.content}</p>}
              {message.image && <img src={message.image} alt={`${message.author} 上传的图片`} />}
              <div className="message-actions" role="group" aria-label="留言操作">
                <button type="button" onClick={() => onReply(message)}>↩ 回复</button>
                <button type="button" onClick={() => void copyMessage(message.content)}>⧉ 复制</button>
                {message.canManage && <button type="button" onClick={() => startEdit(message)}>✎ 编辑</button>}
                {message.canManage && <button type="button" onClick={() => { if (window.confirm('确定删除这条留言吗？')) void onDelete(message.id) }}>⌫ 删除</button>}
                {viewerIsOwner && message.status === 'pending' && <button type="button" onClick={() => void onModerate(message.id, 'approved')}>✓ 通过</button>}
                {viewerIsOwner && message.status === 'pending' && <button type="button" onClick={() => void onModerate(message.id, 'rejected')}>× 拒绝</button>}
              </div>
            </div>
            <footer><span>{message.clientMeta.browser}</span><span>{message.clientMeta.platform}</span></footer>
          </div>
        </article>
      </div>
    })}
  </div>
}
