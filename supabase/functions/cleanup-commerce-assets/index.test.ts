import { test as nodeTest } from 'node:test'
import {
  createCleanupCommerceHandler,
  createProductionCleanupHandler,
  createSupabaseCleanupStore,
  executeCommerceCleanup,
  selectCleanupCandidates,
  type CleanupAsset,
  type CleanupStore,
} from '../_shared/cleanup-runtime.ts'

type TestFunction = (name: string, fn: () => void | Promise<void>) => unknown

const test: TestFunction = typeof Deno !== 'undefined'
  ? Deno.test
  : ((import.meta as ImportMeta & { vitest?: { test: TestFunction } }).vitest?.test ?? nodeTest)

const assert: (condition: unknown, message?: string) => asserts condition = (condition, message = 'assertion failed') => {
  if (!condition) throw new Error(message)
}

const assertEquals = (actual: unknown, expected: unknown, message = 'values differ') => {
  const stringify = (value: unknown) => JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? `${item.toString()}n` : item)
  const actualJson = stringify(actual)
  const expectedJson = stringify(expected)
  if (actualJson !== expectedJson) throw new Error(`${message}\nactual: ${actualJson}\nexpected: ${expectedJson}`)
}

const NOW = '2026-08-30T12:00:00.000Z'
const ASSET_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444'
const page = (prefix: string, count: number) => Array.from(
  { length: count },
  (_, index) => `${prefix}-${String(index).padStart(4, '0')}`,
)

const asset = (input: Partial<CleanupAsset> & Pick<CleanupAsset, 'id'>): CleanupAsset => ({
  id: input.id,
  projectId: input.projectId ?? 'project-1',
  storagePath: input.storagePath ?? `${input.id}.png`,
  sizeBytes: input.sizeBytes ?? 100n,
  expiresAt: input.expiresAt ?? '2026-09-01T00:00:00.000Z',
  state: input.state ?? 'ready',
  createdAt: input.createdAt ?? '2026-08-20T00:00:00.000Z',
  locked: input.locked ?? false,
})

const fixtures: CleanupAsset[] = [
  asset({ id: 'expired-ready', sizeBytes: 100n, expiresAt: '2026-08-29T00:00:00.000Z' }),
  asset({ id: 'oldest-unlocked', sizeBytes: 200n, createdAt: '2026-08-01T00:00:00.000Z' }),
  asset({ id: 'newer-unlocked', sizeBytes: 450n, createdAt: '2026-08-25T00:00:00.000Z' }),
  asset({ id: 'processing', sizeBytes: 100n, state: 'processing', expiresAt: '2026-08-29T00:00:00.000Z' }),
  asset({ id: 'locked-future', sizeBytes: 100n, locked: true, createdAt: '2026-07-01T00:00:00.000Z' }),
]

test('expired assets are deleted before soft-limit candidates', () => {
  const candidates = selectCleanupCandidates(fixtures, { now: NOW, softLimit: 800n, target: 650n })
  assertEquals(candidates.map((item) => item.id), ['expired-ready', 'oldest-unlocked'])
  assertEquals(candidates.map((item) => item.reason), ['expired', 'soft_limit'])
})

test('processing and locked non-expired assets are excluded from early cleanup', () => {
  const candidates = selectCleanupCandidates(fixtures, { now: NOW, softLimit: 800n, target: 650n })
  assert(!candidates.some((item) => item.id === 'processing'))
  assert(!candidates.some((item) => item.id === 'locked-future'))
})

test('candidate ordering is deterministic, deduplicated, and excludes invalid early-cleanup states', () => {
  const candidates = selectCleanupCandidates([
    asset({ id: 'z-expired', expiresAt: '2026-08-29T00:00:00.000Z', createdAt: '2026-08-02T00:00:00.000Z' }),
    asset({ id: 'a-expired', expiresAt: '2026-08-29T00:00:00.000Z', createdAt: '2026-08-02T00:00:00.000Z' }),
    asset({ id: 'a-expired', expiresAt: '2026-08-29T00:00:00.000Z', createdAt: '2026-08-02T00:00:00.000Z' }),
    asset({ id: 'uploading', state: 'uploading', sizeBytes: 900n }),
    asset({ id: 'validating', state: 'validating', sizeBytes: 900n }),
    asset({ id: 'failed', state: 'failed', sizeBytes: 900n }),
    asset({ id: 'deleted', state: 'deleted', sizeBytes: 900n }),
  ], { now: NOW, softLimit: 1n, target: 1n })
  assertEquals(candidates.map((item) => item.id), ['a-expired', 'z-expired'])
})

test('expired failed assets are retained from soft cleanup but selected for seven-day expiry', () => {
  const candidates = selectCleanupCandidates([
    asset({ id: 'failed-expired', state: 'failed', expiresAt: '2026-08-29T00:00:00.000Z' }),
    asset({ id: 'failed-future', state: 'failed', expiresAt: '2026-09-02T00:00:00.000Z', sizeBytes: 900n }),
  ], { now: NOW, softLimit: 100n, target: 50n })
  assertEquals(candidates.map(({ id, reason }) => ({ id, reason })), [
    { id: 'failed-expired', reason: 'expired' },
  ])
})

test('soft-limit selection continues oldest-first until projected bytes reach target', () => {
  const candidates = selectCleanupCandidates([
    asset({ id: 'oldest', sizeBytes: 200n, createdAt: '2026-08-01T00:00:00.000Z' }),
    asset({ id: 'middle', sizeBytes: 200n, createdAt: '2026-08-02T00:00:00.000Z' }),
    asset({ id: 'newest', sizeBytes: 500n, createdAt: '2026-08-03T00:00:00.000Z' }),
  ], { now: NOW, softLimit: 800n, target: 650n })
  assertEquals(candidates.map((item) => item.id), ['oldest', 'middle'])
})

const createStore = (overrides: Partial<CleanupStore> = {}) => {
  const events: string[] = []
  const runRecords: Array<Record<string, unknown>> = []
  let activeAssets: CleanupAsset[] = [
    asset({ id: 'expired-ok', sizeBytes: 200n, expiresAt: '2026-08-29T00:00:00.000Z' }),
    asset({ id: 'expired-storage-fail', sizeBytes: 100n, expiresAt: '2026-08-29T00:00:00.000Z' }),
    asset({ id: 'expired-row-fail', sizeBytes: 50n, expiresAt: '2026-08-29T00:00:00.000Z' }),
    asset({ id: 'soft-ok', sizeBytes: 300n, createdAt: '2026-08-01T00:00:00.000Z' }),
    asset({ id: 'kept', sizeBytes: 300n, createdAt: '2026-08-25T00:00:00.000Z' }),
  ]
  const store: CleanupStore = {
    acquireLease: async () => ({ acquired: true, token: 'lease-token', runId: 'run-1' }),
    reconcileTerminalAssets: async () => { events.push('reconcile-terminal') },
    listAbandonedUploads: async () => [],
    cleanupAbandonedUpload: async () => 'not_claimed',
    listOrphanStorageObjects: async () => [],
    listStaleGenerations: async () => [{ id: 'stale-1' }, { id: 'stale-2' }],
    failGeneration: async (id) => {
      events.push(`fail:${id}`)
      if (id === 'stale-2') throw new Error('raw database body')
    },
    restoreGenerationAssets: async (id) => { events.push(`restore:${id}`) },
    getSettings: async () => ({ softLimit: 700n, target: 600n }),
    listActiveAssets: async () => activeAssets,
    listClaimedAssets: async () => [],
    claimAsset: async (_runId, _leaseToken, candidate) => {
      events.push(`claim:${candidate.id}:${candidate.reason}`)
      return true
    },
    deleteStorageObject: async (path) => {
      const id = path.replace('.png', '')
      events.push(`storage:${id}`)
      if (id === 'expired-storage-fail') throw new Error('private bucket response')
    },
    releaseAssetClaim: async (_runId, _leaseToken, id) => { events.push(`release:${id}`) },
    finalizeAssetDeletion: async (_runId, _leaseToken, id) => {
      events.push(`row:${id}`)
      if (id === 'expired-row-fail') throw new Error('raw update body')
      activeAssets = activeAssets.filter((item) => item.id !== id)
    },
    finishRun: async (record) => { runRecords.push(record as unknown as Record<string, unknown>) },
    ...overrides,
  }
  return { store, events, runRecords, getAssets: () => activeAssets }
}

test('terminal assets reconcile first and abandoned/orphan recovery pages deterministically beyond page one', async () => {
  const fixture = createStore()
  const abandonedCursors: Array<string | null> = []
  const orphanCursors: Array<string | null> = []
  const cleaned: string[] = []
  const takeoverAttempts: string[] = []
  const removedOrphans: string[] = []
  const firstAbandonedPage = page('abandoned', 100)
  const firstOrphanPage = page('orphan', 100).map((name) => `owner/project/${name}.png`)
  let activeSnapshotRead = false
  fixture.store.listActiveAssets = async () => {
    activeSnapshotRead = true
    return []
  }
  fixture.store.listStaleGenerations = async () => []
  fixture.store.reconcileTerminalAssets = async () => {
    assert(!activeSnapshotRead)
    fixture.events.push('reconcile-terminal')
  }
  fixture.store.listAbandonedUploads = async (cutoff, afterId, limit) => {
    assertEquals(cutoff, '2026-08-30T11:45:00.000Z')
    assertEquals(limit, 100)
    abandonedCursors.push(afterId)
    if (afterId === null) return firstAbandonedPage.map((id) => ({ id }))
    if (afterId === firstAbandonedPage.at(-1)) return [{ id: 'abandoned-page-two' }]
    return []
  }
  fixture.store.cleanupAbandonedUpload = async (id, cutoff, attemptId) => {
    assertEquals(cutoff, '2026-08-30T11:45:00.000Z')
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attemptId))
    cleaned.push(id)
    takeoverAttempts.push(attemptId)
    return 'cleaned'
  }
  fixture.store.listOrphanStorageObjects = async (afterPath, limit) => {
    assertEquals(limit, 100)
    orphanCursors.push(afterPath)
    if (afterPath === null) return firstOrphanPage
    if (afterPath === firstOrphanPage.at(-1)) return ['owner/project/orphan-page-two.png']
    return []
  }
  fixture.store.deleteStorageObject = async (path) => { removedOrphans.push(path) }

  await executeCommerceCleanup(fixture.store, { now: NOW, triggerReason: 'scheduled' })
  assertEquals(fixture.events[0], 'reconcile-terminal')
  assertEquals(abandonedCursors, [null, firstAbandonedPage.at(-1) ?? null])
  assertEquals(orphanCursors, [null, firstOrphanPage.at(-1) ?? null])
  assertEquals(cleaned.length, 101)
  assertEquals(new Set(takeoverAttempts).size, 101)
  assertEquals(cleaned.at(-1), 'abandoned-page-two')
  assertEquals(removedOrphans.length, 101)
  assertEquals(removedOrphans.at(-1), 'owner/project/orphan-page-two.png')
})

test('reconciliation has a strict 500-item per-kind bound even when every page is full', async () => {
  const fixture = createStore({ listStaleGenerations: async () => [], listActiveAssets: async () => [] })
  let abandonedPages = 0
  let orphanPages = 0
  let abandonedCleanups = 0
  let orphanRemovals = 0
  fixture.store.listAbandonedUploads = async (_cutoff, _afterId, limit) => {
    const pageIndex = abandonedPages
    abandonedPages += 1
    if (abandonedPages > 10) throw new Error('abandoned cleanup exceeded its run bound')
    return page(`abandoned-${pageIndex}`, limit).map((id) => ({ id }))
  }
  fixture.store.cleanupAbandonedUpload = async () => { abandonedCleanups += 1; return 'cleaned' }
  fixture.store.listOrphanStorageObjects = async (_afterPath, limit) => {
    const pageIndex = orphanPages
    orphanPages += 1
    if (orphanPages > 10) throw new Error('orphan cleanup exceeded its run bound')
    return page(`owner/project/orphan-${pageIndex}`, limit)
  }
  fixture.store.deleteStorageObject = async () => { orphanRemovals += 1 }

  await executeCommerceCleanup(fixture.store, { now: NOW, triggerReason: 'scheduled' })
  assertEquals(abandonedPages, 5)
  assertEquals(orphanPages, 5)
  assertEquals(abandonedCleanups, 500)
  assertEquals(orphanRemovals, 500)
})

test('reconciliation failures are safe and bounded while later abandoned and orphan items continue', async () => {
  const fixture = createStore({ listStaleGenerations: async () => [], listActiveAssets: async () => [] })
  const laterEvents: string[] = []
  fixture.store.reconcileTerminalAssets = async () => { throw new Error('private terminal reconciliation detail') }
  fixture.store.listAbandonedUploads = async (_cutoff, afterId) => afterId === null
    ? Array.from({ length: 30 }, (_, index) => ({ id: `private-abandoned-${index}` }))
    : []
  fixture.store.cleanupAbandonedUpload = async (id) => {
    if (id === 'private-abandoned-29') laterEvents.push('later-abandoned')
    return 'retry'
  }
  fixture.store.listOrphanStorageObjects = async (_afterPath) => ['owner/project/later-orphan.png']
  fixture.store.deleteStorageObject = async (path) => { laterEvents.push(path) }

  const result = await executeCommerceCleanup(fixture.store, { now: NOW, triggerReason: 'scheduled' })
  assertEquals(result.status, 'partial')
  assertEquals(laterEvents, ['later-abandoned', 'owner/project/later-orphan.png'])
  const details = fixture.runRecords[0]?.details as { error_count: number; errors: unknown[] }
  assertEquals(details.error_count, 25)
  assertEquals(details.errors.length, 25)
  const serialized = JSON.stringify(details)
  assert(!serialized.includes('owner/project/later-orphan.png'))
  assert(!serialized.includes('private terminal reconciliation detail'))
})

test('cleanup fails and refunds stale jobs independently, restores safe assets, and deletes Storage before rows', async () => {
  const fixture = createStore()
  const result = await executeCommerceCleanup(fixture.store, { now: NOW, triggerReason: 'scheduled' })
  assertEquals(fixture.events.slice(0, 4), ['reconcile-terminal', 'fail:stale-1', 'restore:stale-1', 'fail:stale-2'])
  const storageIndex = fixture.events.indexOf('storage:expired-ok')
  const rowIndex = fixture.events.indexOf('row:expired-ok')
  const claimIndex = fixture.events.indexOf('claim:expired-ok:expired')
  assert(claimIndex >= 0 && storageIndex > claimIndex && rowIndex > storageIndex)
  assert(!fixture.events.includes('row:expired-storage-fail'))
  assert(fixture.events.includes('release:expired-storage-fail'))
  assert(fixture.getAssets().some((item) => item.id === 'expired-row-fail'))
  assertEquals(result.summary, {
    deletedAssets: 2,
    deletedBytes: 500,
    beforeBytes: 950,
    afterBytes: 450,
    reasonCounts: { expired: 1, softLimit: 1 },
  })
  assertEquals(result.status, 'partial')
  assertEquals(fixture.runRecords.length, 1)
  const serialized = JSON.stringify(fixture.runRecords[0])
  assert(!serialized.includes('raw database body'))
  assert(!serialized.includes('private bucket response'))
  assert(!serialized.includes('raw update body'))
  assert(!serialized.includes('expired-storage-fail.png'))
})

test('row reconciliation errors remain active and affect the soft-limit recalculation', async () => {
  const fixture = createStore({ listStaleGenerations: async () => [] })
  const result = await executeCommerceCleanup(fixture.store, { now: NOW, triggerReason: 'manual' })
  assertEquals(result.summary.beforeBytes, 950)
  assertEquals(result.summary.afterBytes, 450)
  assertEquals(result.summary.deletedBytes, 500)
  assertEquals(fixture.runRecords[0]?.status, 'partial')
})

test('a candidate rejected by the database claim is never sent to Storage', async () => {
  const fixture = createStore({
    listStaleGenerations: async () => [],
    claimAsset: async () => false,
  })
  const result = await executeCommerceCleanup(fixture.store, { now: NOW, triggerReason: 'scheduled' })
  assertEquals(result.summary.deletedAssets, 0)
  assert(!fixture.events.some((event) => event.startsWith('storage:')))
})

test('adopted claims replay before ordinary candidates and finalize idempotent Storage removal', async () => {
  let active = [
    asset({ id: 'adopted', state: 'deleting', sizeBytes: 80n, expiresAt: '2026-08-29T00:00:00.000Z' }),
    asset({ id: 'ordinary', sizeBytes: 40n, expiresAt: '2026-08-29T00:00:00.000Z' }),
  ]
  const fixture = createStore({
    listStaleGenerations: async () => [],
    getSettings: async () => ({ softLimit: 1000n, target: 900n }),
    listActiveAssets: async () => active,
    listClaimedAssets: async () => [{ ...active[0], reason: 'expired' }],
    claimAsset: async (_runId, _leaseToken, candidate) => {
      if (candidate.id === 'adopted') throw new Error('adopted claims must not be claimed twice')
      fixture.events.push(`claim:${candidate.id}`)
      return true
    },
    deleteStorageObject: async (path) => { fixture.events.push(`storage:${path}`) },
    finalizeAssetDeletion: async (_runId, _leaseToken, id) => { active = active.filter((item) => item.id !== id) },
  })
  const result = await executeCommerceCleanup(fixture.store, {
    now: NOW, triggerReason: 'scheduled', runId: 'new-run', leaseToken: 'new-lease',
  })
  assertEquals(fixture.events.slice(0, 4), [
    'reconcile-terminal', 'storage:adopted.png', 'claim:ordinary', 'storage:ordinary.png',
  ])
  assertEquals(result.summary.deletedAssets, 2)
  assertEquals(result.summary.beforeBytes, 120)
  assertEquals(result.summary.afterBytes, 0)
})

test('release failure remains adoptable and the next run can finalize the orphan claim', async () => {
  let phase: 'ready' | 'orphan' | 'deleted' = 'ready'
  const ready = asset({ id: 'recover-me', sizeBytes: 70n, expiresAt: '2026-08-29T00:00:00.000Z' })
  const runRecords: Array<Record<string, unknown>> = []
  const store: CleanupStore = {
    acquireLease: async () => ({ acquired: true, token: 'lease', runId: 'run' }),
    reconcileTerminalAssets: async () => {},
    listAbandonedUploads: async () => [],
    cleanupAbandonedUpload: async () => 'not_claimed',
    listOrphanStorageObjects: async () => [],
    listStaleGenerations: async () => [],
    failGeneration: async () => {},
    restoreGenerationAssets: async () => {},
    getSettings: async () => ({ softLimit: 1000n, target: 900n }),
    listActiveAssets: async () => phase === 'deleted' ? [] : [{ ...ready, state: phase === 'orphan' ? 'deleting' : 'ready' }],
    listClaimedAssets: async () => phase === 'orphan' ? [{ ...ready, state: 'deleting', reason: 'expired' }] : [],
    claimAsset: async () => { phase = 'orphan'; return true },
    deleteStorageObject: async () => { if (runRecords.length === 0) throw new Error('transient') },
    releaseAssetClaim: async () => { throw new Error('release failed') },
    finalizeAssetDeletion: async () => { phase = 'deleted' },
    finishRun: async (record) => { runRecords.push(record as unknown as Record<string, unknown>) },
  }
  const first = await executeCommerceCleanup(store, { now: NOW, triggerReason: 'scheduled', runId: 'old', leaseToken: 'old-token' })
  assertEquals(first.status, 'partial')
  assertEquals(phase, 'orphan')
  const second = await executeCommerceCleanup(store, { now: NOW, triggerReason: 'scheduled', runId: 'new', leaseToken: 'new-token' })
  assertEquals(second.summary.deletedAssets, 1)
  assertEquals(phase, 'deleted')
})

test('handler fails closed for method, missing server secret, and invalid secret', async () => {
  let acquisitions = 0
  const fixture = createStore({
    acquireLease: async () => {
      acquisitions += 1
      return { acquired: true, token: 'token', runId: 'run' }
    },
  })
  const methodHandler = createCleanupCommerceHandler({ getSecret: () => 'server', store: fixture.store, now: () => NOW })
  assertEquals((await methodHandler(new Request('https://cleanup.invalid', { method: 'GET' }))).status, 405)
  const missingHandler = createCleanupCommerceHandler({ getSecret: () => undefined, store: fixture.store, now: () => NOW })
  assertEquals((await missingHandler(new Request('https://cleanup.invalid', { method: 'POST', headers: { 'x-cleanup-secret': 'server' } }))).status, 503)
  assertEquals((await methodHandler(new Request('https://cleanup.invalid', { method: 'POST', headers: { 'x-cleanup-secret': 'wrong' } }))).status, 401)
  assertEquals(acquisitions, 0)
})

test('overlapping runs return a safe conflict without starting cleanup work', async () => {
  let listed = false
  const fixture = createStore({
    acquireLease: async () => ({ acquired: false }),
    listActiveAssets: async () => {
      listed = true
      return []
    },
  })
  const handler = createCleanupCommerceHandler({ getSecret: () => 'server', store: fixture.store, now: () => NOW })
  const response = await handler(new Request('https://cleanup.invalid', { method: 'POST', headers: { 'x-cleanup-secret': 'server' } }))
  assertEquals(response.status, 409)
  assertEquals(await response.json(), { code: 'CLEANUP_ALREADY_RUNNING', message: '清理任务正在运行。' })
  assert(!listed)
})

test('manual trigger is bounded and only accepted after cleanup-secret authentication', async () => {
  const triggerReasons: string[] = []
  const fixture = createStore({
    acquireLease: async (reason) => {
      triggerReasons.push(reason)
      return { acquired: false }
    },
  })
  const handler = createCleanupCommerceHandler({ getSecret: () => 'server', store: fixture.store, now: () => NOW })
  await handler(new Request('https://cleanup.invalid', {
    method: 'POST', headers: { 'x-cleanup-secret': 'wrong', 'x-cleanup-trigger': 'manual' },
  }))
  await handler(new Request('https://cleanup.invalid', {
    method: 'POST', headers: { 'x-cleanup-secret': 'server', 'x-cleanup-trigger': 'manual' },
  }))
  await handler(new Request('https://cleanup.invalid', {
    method: 'POST', headers: { 'x-cleanup-secret': 'server', 'x-cleanup-trigger': 'attacker-value' },
  }))
  assertEquals(triggerReasons, ['manual', 'scheduled'])
})

test('authorized handler returns only the safe public summary', async () => {
  const fixture = createStore({ listStaleGenerations: async () => [], listActiveAssets: async () => [] })
  const handler = createCleanupCommerceHandler({ getSecret: () => 'server', store: fixture.store, now: () => NOW })
  const response = await handler(new Request('https://cleanup.invalid', { method: 'POST', headers: { 'x-cleanup-secret': 'server' } }))
  assertEquals(response.status, 200)
  assertEquals(await response.json(), {
    deletedAssets: 0,
    deletedBytes: 0,
    beforeBytes: 0,
    afterBytes: 0,
    reasonCounts: { expired: 0, softLimit: 0 },
  })
})

test('summary intentionally serializes byte counters beyond JavaScript safe integers', async () => {
  const huge = 9_007_199_254_740_993n
  const fixture = createStore({
    listStaleGenerations: async () => [],
    getSettings: async () => ({ softLimit: huge * 2n, target: huge }),
    listActiveAssets: async () => [asset({ id: 'huge', sizeBytes: huge })],
  })
  const result = await executeCommerceCleanup(fixture.store, { now: NOW, triggerReason: 'scheduled' })
  assertEquals(result.summary.beforeBytes, '9007199254740993')
  assertEquals(result.summary.afterBytes, '9007199254740993')
})

test('Supabase cleanup store uses exact privileged RPC, Storage, and reconciliation contracts', async () => {
  const rpcCalls: Array<{ name: string; parameters: Record<string, unknown> }> = []
  const storageCalls: string[][] = []
  const callSequence: string[] = []
  const tableCalls: Array<{ table: string; operation: string; payload?: unknown }> = []
  const client = {
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      rpcCalls.push({ name, parameters })
      callSequence.push(`rpc:${name}`)
      if (name === 'begin_commerce_cleanup') {
        return { data: [{ acquired: true, lease_token: 'lease', run_id: 'run' }], error: null }
      }
      if (name === 'get_commerce_cleanup_settings') {
        return { data: [{ storage_soft_limit_bytes: '9007199254740993', storage_target_bytes: '800000000' }], error: null }
      }
      if (name === 'reconcile_terminal_commerce_assets') return { data: 2, error: null }
      if (name === 'list_abandoned_commerce_uploads') return { data: [{ id: ASSET_ID }], error: null }
      if (name === 'takeover_abandoned_commerce_asset_upload') {
        return {
          data: [{
            id: ASSET_ID,
            project_id: PROJECT_ID,
            user_id: USER_ID,
            storage_path: `${USER_ID}/${PROJECT_ID}/${ASSET_ID}.png`,
            mime_type: 'image/png',
            size_bytes: 100,
            state: 'validating',
            validation_attempt_id: ATTEMPT_ID,
          }],
          error: null,
        }
      }
      if (name === 'fail_commerce_asset_upload') return { data: true, error: null }
      if (name === 'list_orphan_commerce_storage_objects') {
        return { data: [{ storage_path: 'owner/project/orphan.png' }], error: null }
      }
      if (name === 'claim_commerce_asset_for_cleanup') return { data: true, error: null }
      if (name === 'release_commerce_asset_cleanup_claim' || name === 'finalize_commerce_asset_cleanup') {
        return { data: true, error: null }
      }
      return { data: null, error: null }
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          assertEquals(bucket, 'commerce-assets')
          storageCalls.push(paths)
          callSequence.push(`storage:${paths[0]}`)
          return { data: [], error: null }
        },
      }),
    },
    from: (table: string) => {
      const state: { operation: string; payload?: unknown } = { operation: 'select' }
      const builder: Record<string, unknown> = {
        select: (_columns: string) => {
          state.operation = state.operation === 'update' ? 'update' : 'select'
          tableCalls.push({ table, ...state })
          if (state.operation === 'update') return Promise.resolve({ data: [{ id: 'asset-1' }], error: null })
          return builder
        },
        update: (payload: unknown) => {
          state.operation = 'update'
          state.payload = payload
          return builder
        },
        eq: () => builder,
        neq: () => builder,
        is: () => builder,
        in: () => builder,
        order: () => builder,
        limit: () => Promise.resolve({ data: [], error: null }),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: [], error: null }),
      }
      return builder
    },
  }
  const store = createSupabaseCleanupStore(client as never)
  assertEquals(await store.acquireLease('scheduled'), { acquired: true, token: 'lease', runId: 'run' })
  await store.reconcileTerminalAssets()
  assertEquals(await store.listAbandonedUploads(NOW, null, 100), [{ id: ASSET_ID }])
  assertEquals(await store.cleanupAbandonedUpload(ASSET_ID, NOW, ATTEMPT_ID), 'cleaned')
  assertEquals(await store.listOrphanStorageObjects(null, 100), ['owner/project/orphan.png'])
  await store.failGeneration('generation-1')
  await store.restoreGenerationAssets('generation-1')
  assertEquals(await store.getSettings(), { softLimit: 9_007_199_254_740_993n, target: 800_000_000n })
  assertEquals(await store.listClaimedAssets('run', 'lease'), [])
  assert(await store.claimAsset('run', 'lease', { ...asset({ id: 'asset-1' }), reason: 'expired' }))
  await store.deleteStorageObject('owner/project/image.png')
  await store.releaseAssetClaim('run', 'lease', 'asset-1')
  await store.finalizeAssetDeletion('run', 'lease', 'asset-1', NOW)
  await store.finishRun({
    runId: 'run', leaseToken: 'lease', status: 'completed', assetsExamined: 1,
    deletedAssets: 1, beforeBytes: '100', deletedBytes: '100', afterBytes: '0',
    details: { reason_counts: { expired: 1, soft_limit: 0 }, error_count: 0, errors: [] },
  })
  assertEquals(rpcCalls.map((call) => call.name), [
    'begin_commerce_cleanup',
    'reconcile_terminal_commerce_assets',
    'list_abandoned_commerce_uploads',
    'takeover_abandoned_commerce_asset_upload',
    'fail_commerce_asset_upload',
    'list_orphan_commerce_storage_objects',
    'fail_commerce_generation',
    'restore_commerce_assets_after_stale_generation',
    'get_commerce_cleanup_settings',
    'list_commerce_cleanup_claims',
    'claim_commerce_asset_for_cleanup',
    'release_commerce_asset_cleanup_claim',
    'finalize_commerce_asset_cleanup',
    'finish_commerce_cleanup',
  ])
  assertEquals(rpcCalls.find((call) => call.name === 'claim_commerce_asset_for_cleanup')?.parameters, {
    p_run_id: 'run', p_lease_token: 'lease', p_asset_id: 'asset-1', p_reason: 'expired',
  })
  assertEquals(rpcCalls.find((call) => call.name === 'release_commerce_asset_cleanup_claim')?.parameters, {
    p_run_id: 'run', p_lease_token: 'lease', p_asset_id: 'asset-1',
  })
  assertEquals(rpcCalls.find((call) => call.name === 'finalize_commerce_asset_cleanup')?.parameters, {
    p_run_id: 'run', p_lease_token: 'lease', p_asset_id: 'asset-1', p_deleted_at: NOW,
  })
  assertEquals(rpcCalls.find((call) => call.name === 'list_abandoned_commerce_uploads')?.parameters, {
    p_cutoff: NOW, p_after_id: null, p_limit: 100,
  })
  assertEquals(rpcCalls.find((call) => call.name === 'takeover_abandoned_commerce_asset_upload')?.parameters, {
    p_asset_id: ASSET_ID, p_cutoff: NOW, p_attempt_id: ATTEMPT_ID,
  })
  assertEquals(rpcCalls.find((call) => call.name === 'fail_commerce_asset_upload')?.parameters, {
    p_asset_id: ASSET_ID, p_user_id: USER_ID, p_attempt_id: ATTEMPT_ID,
  })
  assertEquals(rpcCalls.find((call) => call.name === 'list_orphan_commerce_storage_objects')?.parameters, {
    p_after_name: null, p_limit: 100,
  })
  assertEquals(storageCalls, [[`${USER_ID}/${PROJECT_ID}/${ASSET_ID}.png`], ['owner/project/image.png']])
  assert(
    callSequence.indexOf(`storage:${USER_ID}/${PROJECT_ID}/${ASSET_ID}.png`)
      < callSequence.indexOf('rpc:fail_commerce_asset_upload'),
    'abandoned object must be removed before the attempt-bound fail transition',
  )
  assertEquals(tableCalls.filter((call) => call.operation === 'update').length, 0)
})

test('abandoned cleanup keeps the attempt retryable when Storage removal is not confirmed', async () => {
  const rpcNames: string[] = []
  const client = {
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      rpcNames.push(name)
      if (name === 'takeover_abandoned_commerce_asset_upload') {
        return {
          data: [{
            id: ASSET_ID,
            project_id: PROJECT_ID,
            user_id: USER_ID,
            storage_path: `${USER_ID}/${PROJECT_ID}/${ASSET_ID}.png`,
            mime_type: 'image/png',
            size_bytes: 100,
            state: 'validating',
            validation_attempt_id: parameters.p_attempt_id,
          }],
          error: null,
        }
      }
      if (name === 'release_commerce_asset_upload_validation') return { data: true, error: null }
      if (name === 'fail_commerce_asset_upload') throw new Error('must not fail the row before removal')
      return { data: null, error: null }
    },
    storage: { from: () => ({ remove: async () => ({ data: null, error: { message: 'private Storage detail' } }) }) },
    from: () => ({}),
  }
  const result = await createSupabaseCleanupStore(client as never)
    .cleanupAbandonedUpload(ASSET_ID, NOW, ATTEMPT_ID)
  assertEquals(result, 'retry')
  assert(rpcNames.includes('release_commerce_asset_upload_validation'))
  assert(!rpcNames.includes('fail_commerce_asset_upload'))
})

test('Supabase cleanup snapshots paginate assets and later locked projects deterministically', async () => {
  const assetRows = Array.from({ length: 1001 }, (_, index) => ({
    id: `asset-${String(index).padStart(4, '0')}`,
    project_id: `project-${String(index).padStart(4, '0')}`,
    storage_path: `owner/${index}.png`,
    size_bytes: '1',
    expires_at: '2026-09-01T00:00:00.000Z',
    state: 'ready',
    created_at: '2026-08-01T00:00:00.000Z',
  }))
  const projectRows = Array.from({ length: 1001 }, (_, index) => ({
    id: `project-${String(index).padStart(4, '0')}`,
    locked: true,
  }))
  const client = {
    rpc: async () => ({ data: null, error: null }),
    storage: { from: () => ({ remove: async () => ({ data: [], error: null }) }) },
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      for (const method of ['select', 'neq', 'is', 'eq', 'order']) {
        builder[method] = () => builder
      }
      builder.range = async (start: number, end: number) => ({
        data: (table === 'commerce_project_assets' ? assetRows : projectRows).slice(start, end + 1),
        error: null,
      })
      return builder
    },
  }
  const rows = await createSupabaseCleanupStore(client as never).listActiveAssets()
  assertEquals(rows.length, 1001)
  assertEquals(rows.at(-1)?.id, 'asset-1000')
  assertEquals(rows.at(-1)?.locked, true)
})

test('production bootstrap is lazy, requires runtime configuration, and constructs the privileged store first', () => {
  const reads: string[] = []
  let clients = 0
  const handler = createProductionCleanupHandler({
    getEnv: (name) => {
      reads.push(name)
      if (name === 'SUPABASE_URL') return 'https://project.invalid'
      if (name === 'SUPABASE_SECRET_KEY') return 'service-test-key'
      if (name === 'CLEANUP_SECRET') return 'cleanup-test-key'
      return undefined
    },
    createClient: () => {
      clients += 1
      return {} as never
    },
  })
  assert(typeof handler === 'function')
  assert(reads.includes('CLEANUP_SECRET'))
  assertEquals(clients, 1)
})
