import { supabase, supabaseConfigured } from '../lib/supabase'
import type { CreateGuestbookMessage, GuestIdentity, GuestbookMessage, GuestbookRepository, MessageStatus } from './types'

const storageKey = 'wenhao-guestbook:v1'
const identityKey = 'wenhao-guestbook:identity'
const imageBucket = 'guestbook-images'

const seedMessages: GuestbookMessage[] = [
  {
    id: 'seed-01', author: '文昊', emailHash: 'WH', website: '',
    content: '这里是文昊的开放频道。作品、设计、运营或者前端上的想法，都欢迎留下来。',
    createdAt: '2026-08-08T12:12:00.000Z', isOwner: true, status: 'approved',
    clientMeta: { browser: 'Wenhao Studio', platform: 'Shanghai' },
  },
  {
    id: 'seed-02', author: '访客 07', emailHash: '07', website: '',
    content: '音乐页的氛围很特别，像是在一个持续变化的数字空间里听歌。',
    createdAt: '2026-08-09T03:46:00.000Z', isOwner: false, status: 'approved',
    clientMeta: { browser: 'Chrome', platform: 'Windows' },
  },
  {
    id: 'seed-03', author: '文昊', emailHash: 'WH', website: '',
    content: '谢谢。这个站会一直更新，留言板也会在接入数据库后变成真正的长期档案。',
    createdAt: '2026-08-09T05:08:00.000Z', replyTo: 'seed-02', isOwner: true, status: 'approved',
    clientMeta: { browser: 'Wenhao Studio', platform: 'Shanghai' },
  },
  {
    id: 'seed-04', author: 'Signal 12', emailHash: 'S12', website: '',
    content: '期待看到更多 AI 设计和电商运营结合的案例。',
    createdAt: '2026-08-10T09:25:00.000Z', isOwner: false, status: 'approved',
    clientMeta: { browser: 'Safari', platform: 'macOS' },
  },
]

const cloneSeeds = () => seedMessages.map((message) => ({ ...message, clientMeta: { ...message.clientMeta } }))

class LocalGuestbookRepository implements GuestbookRepository {
  readonly mode = 'local' as const
  private memory = cloneSeeds()
  private persistent = true

  constructor() {
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) this.memory = JSON.parse(stored) as GuestbookMessage[]
      else this.persist()
    } catch {
      this.persistent = false
    }
  }

  private persist() {
    if (!this.persistent) return
    try { window.localStorage.setItem(storageKey, JSON.stringify(this.memory)) } catch { this.persistent = false }
  }

  private async delay() { await new Promise((resolve) => window.setTimeout(resolve, 140)) }

  async list() {
    await this.delay()
    return [...this.memory].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async refresh() {
    await this.delay()
    if (this.persistent) {
      try {
        const stored = window.localStorage.getItem(storageKey)
        if (stored) this.memory = JSON.parse(stored) as GuestbookMessage[]
      } catch { this.persistent = false }
    }
    return this.list()
  }

  async create(input: CreateGuestbookMessage) {
    await this.delay()
    const message: GuestbookMessage = {
      ...input,
      id: globalThis.crypto?.randomUUID?.() ?? `message-${Date.now()}`,
      createdAt: new Date().toISOString(),
      isOwner: false,
      status: 'approved',
      canManage: true,
    }
    this.memory.push(message)
    this.persist()
    return message
  }

  async update(id: string, content: string) {
    const message = this.memory.find((item) => item.id === id && item.canManage)
    if (!message) throw new Error('forbidden')
    message.content = content
    this.persist()
  }

  async remove(id: string) {
    const index = this.memory.findIndex((item) => item.id === id && item.canManage)
    if (index < 0) throw new Error('forbidden')
    this.memory.splice(index, 1)
    this.persist()
  }

  async moderate(id: string, status: MessageStatus) {
    const message = this.memory.find((item) => item.id === id && item.canManage)
    if (!message) throw new Error('forbidden')
    message.status = status
    this.persist()
  }

  async getProfile() {
    try {
      const stored = window.localStorage.getItem(identityKey)
      return stored ? JSON.parse(stored) as GuestIdentity : null
    } catch { return null }
  }

  async saveProfile(identity: GuestIdentity) {
    window.localStorage.setItem(identityKey, JSON.stringify(identity))
  }
}

type MessageRow = {
  id: string
  author: string
  website: string | null
  content: string
  image_path: string | null
  created_at: string
  reply_to: string | null
  status: MessageStatus
  client_browser: string
  client_platform: string
  is_owner: boolean
  can_manage: boolean
}

const dataUrlToBlob = async (dataUrl: string) => {
  const response = await fetch(dataUrl)
  return response.blob()
}

class SupabaseGuestbookRepository implements GuestbookRepository {
  readonly mode = 'supabase' as const

  private get client() {
    if (!supabase) throw new Error('Supabase is not configured')
    return supabase
  }

  private mapRow(row: MessageRow): GuestbookMessage {
    const image = row.image_path
      ? this.client.storage.from(imageBucket).getPublicUrl(row.image_path).data.publicUrl
      : undefined
    return {
      id: row.id,
      author: row.author,
      emailHash: row.author.replace(/\s/g, '').slice(0, 2).toUpperCase(),
      website: row.website ?? '',
      content: row.content,
      image,
      createdAt: row.created_at,
      replyTo: row.reply_to ?? undefined,
      isOwner: row.is_owner,
      status: row.status,
      canManage: row.can_manage,
      clientMeta: { browser: row.client_browser, platform: row.client_platform },
    }
  }

  async list() {
    const { data, error } = await this.client.rpc('list_guestbook_messages')
    if (error) throw error
    return ((data ?? []) as MessageRow[]).map((row) => this.mapRow(row))
  }

  async refresh() { return this.list() }

  private async uploadImage(dataUrl: string) {
    const { data: userData, error: userError } = await this.client.auth.getUser()
    if (userError || !userData.user) throw userError ?? new Error('No active user')
    const blob = await dataUrlToBlob(dataUrl)
    const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'webp'
    const path = `${userData.user.id}/${crypto.randomUUID()}.${extension}`
    const { error } = await this.client.storage.from(imageBucket).upload(path, blob, { contentType: blob.type, upsert: false })
    if (error) throw error
    return path
  }

  async create(input: CreateGuestbookMessage) {
    const imagePath = input.image ? await this.uploadImage(input.image) : null
    const { data, error } = await this.client.rpc('create_guestbook_message', {
      p_author: input.author,
      p_website: input.website || '',
      p_content: input.content,
      p_image_path: imagePath,
      p_reply_to: input.replyTo ?? null,
      p_client_browser: input.clientMeta.browser,
      p_client_platform: input.clientMeta.platform,
    })
    if (error) {
      if (imagePath) await this.client.storage.from(imageBucket).remove([imagePath])
      throw error
    }
    const messages = await this.list()
    const created = messages.find((message) => message.id === data)
    if (!created) throw new Error('Created message could not be loaded')
    return created
  }

  async update(id: string, content: string) {
    const { error } = await this.client.rpc('update_guestbook_message', { p_id: id, p_content: content })
    if (error) throw error
  }

  async remove(id: string) {
    const { error } = await this.client.rpc('delete_guestbook_message', { p_id: id })
    if (error) throw error
  }

  async moderate(id: string, status: MessageStatus) {
    const { error } = await this.client.rpc('moderate_guestbook_message', { p_id: id, p_status: status })
    if (error) throw error
  }

  async getProfile() {
    const { data: userData, error: userError } = await this.client.auth.getUser()
    if (userError || !userData.user) return null
    const { data, error } = await this.client.from('guestbook_profiles').select('nickname,email,website').eq('user_id', userData.user.id).maybeSingle()
    if (error) throw error
    return data ? { nickname: data.nickname, email: data.email ?? '', website: data.website ?? '' } : null
  }

  async saveProfile(identity: GuestIdentity) {
    const { data: userData, error: userError } = await this.client.auth.getUser()
    if (userError || !userData.user) throw userError ?? new Error('No active user')
    const { error } = await this.client.from('guestbook_profiles').upsert({
      user_id: userData.user.id,
      nickname: identity.nickname,
      email: identity.email || null,
      website: identity.website || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) throw error
  }
}

export const guestbookRepository: GuestbookRepository = supabaseConfigured
  ? new SupabaseGuestbookRepository()
  : new LocalGuestbookRepository()

export function detectClientMeta() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const platform = /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : 'Web'
  return { browser, platform }
}
