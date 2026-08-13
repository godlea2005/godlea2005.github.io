import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { GuestIdentity, GuestbookMessage } from './types'

const emojis = ['✦', '👋', '✨', '💡', '🎧', '🫶', '🚀', '🌙', '🧠', '🪄', '👏', '🙂']
const draftKey = 'wenhao-guestbook:draft'

export function GuestbookComposer({
  identity,
  replyTo,
  sending,
  onOpenIdentity,
  onCancelReply,
  onSend,
  onNotice,
}: {
  identity: GuestIdentity
  replyTo: GuestbookMessage | null
  sending: boolean
  onOpenIdentity: () => void
  onCancelReply: () => void
  onSend: (content: string, image?: string) => Promise<boolean>
  onNotice: (message: string) => void
}) {
  const [content, setContent] = useState(() => window.sessionStorage.getItem(draftKey) ?? '')
  const [image, setImage] = useState<string>()
  const [emojiOpen, setEmojiOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    window.sessionStorage.setItem(draftKey, content)
  }, [content])

  const chooseImage = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      onNotice('请选择图片文件')
      return
    }
    if (file.size > 600 * 1024) {
      onNotice('演示版图片不能超过 600 KB')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setImage(typeof reader.result === 'string' ? reader.result : undefined)
    reader.onerror = () => onNotice('图片读取失败')
    reader.readAsDataURL(file)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    const normalized = content.trim()
    if (!identity.nickname.trim()) {
      onNotice('请先填写游客昵称')
      onOpenIdentity()
      return
    }
    if (!normalized && !image) {
      onNotice('先写点什么再发送')
      return
    }
    const sent = await onSend(normalized, image)
    if (sent) {
      setContent('')
      setImage(undefined)
      window.sessionStorage.removeItem(draftKey)
    }
  }

  return <form className="guestbook-composer" onSubmit={(event) => void submit(event)}>
    {replyTo && <div className="composer-reply"><span>回复 @{replyTo.author}</span><p>{replyTo.content}</p><button type="button" onClick={onCancelReply}>×</button></div>}
    {image && <div className="composer-image"><img src={image} alt="待发送图片预览" /><button type="button" onClick={() => setImage(undefined)}>移除</button></div>}
    <textarea
      aria-label="留言内容"
      placeholder="说点什么…"
      maxLength={300}
      value={content}
      onChange={(event) => setContent(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
        event.preventDefault()
        if (!sending) event.currentTarget.form?.requestSubmit()
      }}
    />
    <div className="composer-toolbar">
      <div className="composer-tools">
        <button type="button" onClick={() => setEmojiOpen((value) => !value)} aria-expanded={emojiOpen}>☺ <span>表情</span></button>
        <button type="button" onClick={() => fileRef.current?.click()}>▧ <span>图片</span></button>
        <input ref={fileRef} hidden type="file" accept="image/*" onChange={(event) => chooseImage(event.target.files?.[0])} />
        {emojiOpen && <div className="emoji-panel" aria-label="选择表情">{emojis.map((emoji) => <button type="button" key={emoji} onClick={() => { setContent((value) => `${value}${emoji}`.slice(0, 300)); setEmojiOpen(false) }}>{emoji}</button>)}</div>}
      </div>
      <div className="composer-send">
        <span>{content.length}/300</span>
        <button className="identity-button" type="button" onClick={onOpenIdentity}><i>{identity.nickname ? identity.nickname.slice(0, 1).toUpperCase() : '?'}</i>{identity.nickname || '游客资料'}</button>
        <button className="send-button" type="submit" disabled={sending}>{sending ? '发送中' : '发送'}</button>
      </div>
    </div>
  </form>
}
