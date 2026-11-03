import type { CommercePlatform, CommerceProjectInput, ProjectMode } from './types'

export const COMMERCE_AUTH_DRAFT_KEY = 'wenhao-site:commerce-auth-draft'
export const COMMERCE_AUTH_DRAFT_TTL_MS = 10 * 60 * 1000

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type TextInput = Omit<CommerceProjectInput, 'files'>

type StoredCommerceAuthDraft = {
  schema: 'commerce-auth-draft'
  version: 1
  ownerId: string
  expiresAt: number
  input: TextInput
  pendingCleanupProjectId?: string
}

export type CommerceAuthDraft = {
  input: CommerceProjectInput
  pendingCleanupProjectId?: string
}

const optionalTextKeys = [
  'category', 'specifications', 'priceRange', 'sellingPoints', 'audience',
  'brandTone', 'competitorLinks', 'prohibitedWords', 'desiredStyle', 'notes',
] as const
const modes = new Set<ProjectMode>(['quick', 'professional'])
const platforms = new Set<CommercePlatform>(['ozon', 'wildberries', 'douyin', 'taobao-tmall'])

const textOnlyInput = (input: CommerceProjectInput): TextInput => {
  const safe: TextInput = { mode: input.mode, name: input.name, platform: input.platform }
  optionalTextKeys.forEach((key) => {
    if (typeof input[key] === 'string') safe[key] = input[key]
  })
  return safe
}

const readTextInput = (value: unknown): TextInput | null => {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (!modes.has(input.mode as ProjectMode) || typeof input.name !== 'string' || !platforms.has(input.platform as CommercePlatform)) return null
  const safe: TextInput = { mode: input.mode as ProjectMode, name: input.name, platform: input.platform as CommercePlatform }
  optionalTextKeys.forEach((key) => {
    if (typeof input[key] === 'string') safe[key] = input[key] as string
  })
  return safe
}

export function saveCommerceAuthDraft(
  value: { ownerId: string; input: CommerceProjectInput; pendingCleanupProjectId?: string },
  storage: StorageLike = window.sessionStorage,
  now = Date.now(),
) {
  const payload: StoredCommerceAuthDraft = {
    schema: 'commerce-auth-draft',
    version: 1,
    ownerId: value.ownerId,
    expiresAt: now + COMMERCE_AUTH_DRAFT_TTL_MS,
    input: textOnlyInput(value.input),
    ...(value.pendingCleanupProjectId ? { pendingCleanupProjectId: value.pendingCleanupProjectId } : {}),
  }
  storage.setItem(COMMERCE_AUTH_DRAFT_KEY, JSON.stringify(payload))
}

export function consumeCommerceAuthDraft(
  ownerId: string,
  storage: StorageLike = window.sessionStorage,
  now = Date.now(),
): CommerceAuthDraft | null {
  try {
    const raw = storage.getItem(COMMERCE_AUTH_DRAFT_KEY)
    if (!raw) return null
    storage.removeItem(COMMERCE_AUTH_DRAFT_KEY)
    const value = JSON.parse(raw) as Partial<StoredCommerceAuthDraft>
    const input = readTextInput(value.input)
    if (value.schema !== 'commerce-auth-draft' || value.version !== 1 || value.ownerId !== ownerId || typeof value.expiresAt !== 'number' || value.expiresAt < now || !input) return null
    const pendingCleanupProjectId = typeof value.pendingCleanupProjectId === 'string' && value.pendingCleanupProjectId ? value.pendingCleanupProjectId : undefined
    return { input: { ...input, files: [] }, ...(pendingCleanupProjectId ? { pendingCleanupProjectId } : {}) }
  } catch {
    return null
  }
}
