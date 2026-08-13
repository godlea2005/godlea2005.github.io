export type MessageStatus = 'pending' | 'approved' | 'rejected'

export type GuestIdentity = {
  nickname: string
  email: string
  website: string
}

export type ClientMeta = {
  browser: string
  platform: string
}

export type GuestbookMessage = {
  id: string
  author: string
  emailHash: string
  website: string
  content: string
  image?: string
  createdAt: string
  replyTo?: string
  isOwner: boolean
  status: MessageStatus
  clientMeta: ClientMeta
  canManage?: boolean
}

export type CreateGuestbookMessage = Pick<GuestbookMessage, 'author' | 'emailHash' | 'website' | 'content' | 'image' | 'replyTo' | 'clientMeta'>

export interface GuestbookRepository {
  readonly mode: 'local' | 'supabase'
  list(): Promise<GuestbookMessage[]>
  create(input: CreateGuestbookMessage): Promise<GuestbookMessage>
  refresh(): Promise<GuestbookMessage[]>
  update(id: string, content: string): Promise<void>
  remove(id: string): Promise<void>
  moderate(id: string, status: MessageStatus): Promise<void>
  getProfile(): Promise<GuestIdentity | null>
  saveProfile(identity: GuestIdentity): Promise<void>
}

export type GuestbookAuthState = {
  configured: boolean
  ready: boolean
  userId: string | null
  isAnonymous: boolean
  isOwner: boolean
  provider: string | null
  providers: {
    github: boolean
    google: boolean
  }
  error: string
}
