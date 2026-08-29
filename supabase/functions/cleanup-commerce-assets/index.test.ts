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
    asset({ id: 'failed', state: 'failed', sizeBytes: 900n }),
    asset({ id: 'deleted', state: 'deleted', sizeBytes: 900n }),
  ], { now: NOW, softLimit: 1n, target: 1n })
  assertEquals(candidates.map((item) => item.id), ['a-expired', 'z-expired'])
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
    listStaleGenerations: async () => [{ id: 'stale-1' }, { id: 'stale-2' }],
    failGeneration: async (id) => {
      events.push(`fail:${id}`)
      if (id === 'stale-2') throw new Error('raw database body')
    },
    restoreGenerationAssets: async (id) => { events.push(`restore:${id}`) },
    getSettings: async () => ({ softLimit: 700n, target: 600n }),
    listActiveAssets: async () => activeAssets,
    claimAsset: async (_runId, _leaseToken, candidate) => {
      events.push(`claim:${candidate.id}:${candidate.reason}`)
      return true
    },
    deleteStorageObject: async (path) => {
      const id = path.replace('.png', '')
      events.push(`storage:${id}`)
      if (id === 'expired-storage-fail') throw new Error('private bucket response')
    },
    releaseAssetClaim: async (_runId, id) => { events.push(`release:${id}`) },
    finalizeAssetDeletion: async (_runId, id) => {
      events.push(`row:${id}`)
      if (id === 'expired-row-fail') throw new Error('raw update body')
      activeAssets = activeAssets.filter((item) => item.id !== id)
    },
    finishRun: async (record) => { runRecords.push(record as unknown as Record<string, unknown>) },
    ...overrides,
  }
  return { store, events, runRecords, getAssets: () => activeAssets }
}

test('cleanup fails and refunds stale jobs independently, restores safe assets, and deletes Storage before rows', async () => {
  const fixture = createStore()
  const result = await executeCommerceCleanup(fixture.store, { now: NOW, triggerReason: 'scheduled' })
  assertEquals(fixture.events.slice(0, 3), ['fail:stale-1', 'restore:stale-1', 'fail:stale-2'])
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
  const tableCalls: Array<{ table: string; operation: string; payload?: unknown }> = []
  const client = {
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      rpcCalls.push({ name, parameters })
      if (name === 'begin_commerce_cleanup') {
        return { data: [{ acquired: true, lease_token: 'lease', run_id: 'run' }], error: null }
      }
      if (name === 'get_commerce_cleanup_settings') {
        return { data: [{ storage_soft_limit_bytes: '9007199254740993', storage_target_bytes: '800000000' }], error: null }
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
  await store.failGeneration('generation-1')
  await store.restoreGenerationAssets('generation-1')
  assertEquals(await store.getSettings(), { softLimit: 9_007_199_254_740_993n, target: 800_000_000n })
  assert(await store.claimAsset('run', 'lease', asset({ id: 'asset-1' }), 'expired'))
  await store.deleteStorageObject('owner/project/image.png')
  await store.releaseAssetClaim('run', 'asset-1')
  await store.finalizeAssetDeletion('run', 'asset-1', NOW)
  await store.finishRun({
    runId: 'run', leaseToken: 'lease', status: 'completed', assetsExamined: 1,
    deletedAssets: 1, beforeBytes: '100', deletedBytes: '100', afterBytes: '0',
    details: { reason_counts: { expired: 1, soft_limit: 0 }, error_count: 0, errors: [] },
  })
  assertEquals(rpcCalls.map((call) => call.name), [
    'begin_commerce_cleanup',
    'fail_commerce_generation',
    'restore_commerce_assets_after_stale_generation',
    'get_commerce_cleanup_settings',
    'claim_commerce_asset_for_cleanup',
    'release_commerce_asset_cleanup_claim',
    'finalize_commerce_asset_cleanup',
    'finish_commerce_cleanup',
  ])
  assertEquals(storageCalls, [['owner/project/image.png']])
  assertEquals(tableCalls.filter((call) => call.operation === 'update').length, 0)
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
