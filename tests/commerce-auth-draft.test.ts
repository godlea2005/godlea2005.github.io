import { afterEach, describe, expect, it } from 'vitest'
import {
  COMMERCE_AUTH_DRAFT_KEY,
  consumeCommerceAuthDraft,
  saveCommerceAuthDraft,
} from '../src/commerce/commerceAuthDraft'
import type { CommerceProjectInput } from '../src/commerce/types'

const input = (): CommerceProjectInput => ({
  mode: 'professional',
  name: '保温杯',
  platform: 'ozon',
  files: [new File(['binary'], 'secret.png', { type: 'image/png' })],
  category: '户外用品',
  notes: '只保留文字备注',
  accessToken: 'should-not-be-copied',
  data: 'data:image/png;base64,should-not-be-copied',
} as CommerceProjectInput)

describe('commerce OAuth draft storage', () => {
  afterEach(() => window.sessionStorage.clear())

  it('stores a versioned, expiring text-only payload without files or credential-shaped fields', () => {
    const storage = new Map<string, string>()
    const sessionStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
    }

    saveCommerceAuthDraft({ ownerId: 'user-1', input: input(), pendingCleanupProjectId: 'project-1' }, sessionStorage, 1_000)

    const raw = storage.get(COMMERCE_AUTH_DRAFT_KEY)!
    const saved = JSON.parse(raw)
    expect(saved).toMatchObject({ schema: 'commerce-auth-draft', version: 1, ownerId: 'user-1', expiresAt: 601_000, pendingCleanupProjectId: 'project-1' })
    expect(saved.input).toMatchObject({ name: '保温杯', category: '户外用品' })
    expect(saved.input).not.toHaveProperty('files')
    expect(raw).not.toMatch(/secret\.png|binary|base64|accessToken|access_token|refreshToken|refresh_token/i)
  })

  it('lets the same owner consume a valid draft only once and restores no files', () => {
    const storage = window.sessionStorage
    saveCommerceAuthDraft({ ownerId: 'user-1', input: input() }, storage, 1_000)

    expect(consumeCommerceAuthDraft('user-1', storage, 1_001)).toMatchObject({ input: { name: '保温杯', files: [] } })
    expect(consumeCommerceAuthDraft('user-1', storage, 1_002)).toBeNull()
  })

  it('rejects and clears expired drafts', () => {
    const storage = window.sessionStorage
    saveCommerceAuthDraft({ ownerId: 'user-1', input: input() }, storage, 1_000)

    expect(consumeCommerceAuthDraft('user-1', storage, 601_001)).toBeNull()
    expect(storage.getItem(COMMERCE_AUTH_DRAFT_KEY)).toBeNull()
  })

  it('rejects and clears drafts belonging to another authenticated user', () => {
    const storage = window.sessionStorage
    saveCommerceAuthDraft({ ownerId: 'user-1', input: input() }, storage, 1_000)

    expect(consumeCommerceAuthDraft('user-2', storage, 1_001)).toBeNull()
    expect(storage.getItem(COMMERCE_AUTH_DRAFT_KEY)).toBeNull()
  })
})
