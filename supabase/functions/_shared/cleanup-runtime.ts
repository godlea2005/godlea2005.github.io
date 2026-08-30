export type CleanupAssetState = 'uploading' | 'ready' | 'processing' | 'deleting' | 'deleted' | 'failed'

export type CleanupAsset = {
  id: string
  projectId: string
  storagePath: string
  sizeBytes: bigint
  expiresAt: string
  state: CleanupAssetState
  createdAt: string
  locked: boolean
}

export type CleanupReason = 'expired' | 'soft_limit'
export type CleanupCandidate = CleanupAsset & { reason: CleanupReason }
export type CleanupTriggerReason = 'scheduled' | 'soft_limit' | 'manual'

type LeaseResult = { acquired: false } | { acquired: true; token: string; runId: string }
type PublicInteger = number | string

export type CleanupSummary = {
  deletedAssets: number
  deletedBytes: PublicInteger
  beforeBytes: PublicInteger
  afterBytes: PublicInteger
  reasonCounts: { expired: number; softLimit: number }
}

type CleanupError = {
  stage: 'stale_fail' | 'stale_restore' | 'storage_delete' | 'row_reconcile' | 'snapshot' | 'finalize'
  code: string
  itemId?: string
}

export type CleanupRunRecord = {
  runId: string
  leaseToken: string
  status: 'completed' | 'partial' | 'failed'
  assetsExamined: number
  deletedAssets: number
  beforeBytes: string
  deletedBytes: string
  afterBytes: string
  details: {
    reason_counts: { expired: number; soft_limit: number }
    error_count: number
    errors: CleanupError[]
  }
}

export type CleanupStore = {
  acquireLease(triggerReason: CleanupTriggerReason): Promise<LeaseResult>
  listStaleGenerations(cutoff: string): Promise<Array<{ id: string }>>
  failGeneration(generationId: string): Promise<void>
  restoreGenerationAssets(generationId: string): Promise<void>
  getSettings(): Promise<{ softLimit: bigint; target: bigint }>
  listActiveAssets(): Promise<CleanupAsset[]>
  listClaimedAssets(runId: string, leaseToken: string): Promise<CleanupCandidate[]>
  claimAsset(runId: string, leaseToken: string, candidate: CleanupCandidate): Promise<boolean>
  deleteStorageObject(storagePath: string): Promise<void>
  releaseAssetClaim(runId: string, leaseToken: string, assetId: string): Promise<void>
  finalizeAssetDeletion(runId: string, leaseToken: string, assetId: string, deletedAt: string): Promise<void>
  finishRun(record: CleanupRunRecord): Promise<void>
}

type RpcResult = { data: unknown; error: unknown }
export type CleanupSupabaseClient = {
  from(table: string): any
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>
  storage: { from(bucket: string): any }
}

type SupabaseClientFactory = (
  url: string,
  key: string,
  options: Record<string, unknown>,
) => CleanupSupabaseClient

const ACTIVE_STATES = new Set<CleanupAssetState>(['uploading', 'ready', 'processing', 'deleting', 'failed'])
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_ERRORS = 25

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const toBigInt = (value: unknown, label: string): bigint => {
  if (typeof value === 'bigint') return value
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value)
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  throw new Error(`Invalid ${label}`)
}

const publicInteger = (value: bigint): PublicInteger =>
  value <= MAX_SAFE_BIGINT ? Number(value) : value.toString()

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0

const compareExpired = (left: CleanupAsset, right: CleanupAsset) =>
  compareText(left.expiresAt, right.expiresAt)
  || compareText(left.createdAt, right.createdAt)
  || compareText(left.id, right.id)

const compareOldest = (left: CleanupAsset, right: CleanupAsset) =>
  compareText(left.createdAt, right.createdAt) || compareText(left.id, right.id)

const activeAssets = (assets: CleanupAsset[]) => {
  const seen = new Set<string>()
  return assets.filter((asset) => {
    if (!ACTIVE_STATES.has(asset.state) || seen.has(asset.id)) return false
    seen.add(asset.id)
    return true
  })
}

const sumBytes = (assets: CleanupAsset[]) =>
  assets.reduce((total, asset) => total + asset.sizeBytes, 0n)

const isExpired = (asset: CleanupAsset, nowMs: number) => {
  const expiresAt = Date.parse(asset.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt <= nowMs
}

export const selectCleanupCandidates = (
  assets: CleanupAsset[],
  options: { now: string; softLimit: bigint; target: bigint },
): CleanupCandidate[] => {
  const nowMs = Date.parse(options.now)
  if (!Number.isFinite(nowMs)) throw new Error('Invalid cleanup time')
  if (options.softLimit < 0n || options.target < 0n || options.target > options.softLimit) {
    throw new Error('Invalid cleanup limits')
  }

  const active = activeAssets(assets)
  const expired = active
    .filter((item) => item.state !== 'processing' && item.state !== 'uploading' && isExpired(item, nowMs))
    .sort(compareExpired)
    .map((item) => ({ ...item, reason: 'expired' as const }))
  const selectedIds = new Set(expired.map((item) => item.id))
  let projectedBytes = sumBytes(active) - sumBytes(expired)

  if (projectedBytes <= options.softLimit) return expired

  const early = active
    .filter((item) => item.state === 'ready' && !item.locked && !selectedIds.has(item.id))
    .sort(compareOldest)
  const selected: CleanupCandidate[] = [...expired]
  for (const item of early) {
    if (projectedBytes <= options.target) break
    selected.push({ ...item, reason: 'soft_limit' })
    projectedBytes -= item.sizeBytes
  }
  return selected
}

const addError = (errors: CleanupError[], error: CleanupError) => {
  if (errors.length < MAX_ERRORS) errors.push(error)
}

const errorCode = (stage: CleanupError['stage']) => ({
  stale_fail: 'STALE_GENERATION_FAIL_FAILED',
  stale_restore: 'STALE_ASSET_RESTORE_FAILED',
  storage_delete: 'STORAGE_DELETE_FAILED',
  row_reconcile: 'ASSET_ROW_RECONCILIATION_REQUIRED',
  snapshot: 'CLEANUP_SNAPSHOT_FAILED',
  finalize: 'CLEANUP_FINALIZE_FAILED',
}[stage])

const deleteCandidates = async (
  store: CleanupStore,
  candidates: CleanupCandidate[],
  runId: string,
  leaseToken: string,
  deletedAt: string,
  errors: CleanupError[],
  attempted: Set<string>,
  alreadyClaimed = false,
) => {
  let deletedAssets = 0
  let deletedBytes = 0n
  const reasonCounts = { expired: 0, softLimit: 0 }

  for (const candidate of candidates) {
    if (attempted.has(candidate.id)) continue
    attempted.add(candidate.id)
    let claimed = alreadyClaimed
    if (!alreadyClaimed) {
      try {
        claimed = await store.claimAsset(runId, leaseToken, candidate)
      } catch {
        addError(errors, { stage: 'row_reconcile', code: 'ASSET_CLAIM_FAILED', itemId: candidate.id })
        continue
      }
    }
    if (!claimed) continue
    try {
      await store.deleteStorageObject(candidate.storagePath)
    } catch {
      addError(errors, { stage: 'storage_delete', code: errorCode('storage_delete'), itemId: candidate.id })
      try {
        await store.releaseAssetClaim(runId, leaseToken, candidate.id)
      } catch {
        addError(errors, { stage: 'row_reconcile', code: 'ASSET_CLAIM_RELEASE_FAILED', itemId: candidate.id })
      }
      continue
    }
    try {
      await store.finalizeAssetDeletion(runId, leaseToken, candidate.id, deletedAt)
    } catch {
      addError(errors, { stage: 'row_reconcile', code: errorCode('row_reconcile'), itemId: candidate.id })
      continue
    }
    deletedAssets += 1
    deletedBytes += candidate.sizeBytes
    if (candidate.reason === 'expired') reasonCounts.expired += 1
    else reasonCounts.softLimit += 1
  }
  return { deletedAssets, deletedBytes, reasonCounts }
}

export const executeCommerceCleanup = async (
  store: CleanupStore,
  options: {
    now: string
    triggerReason: CleanupTriggerReason
    leaseToken?: string
    runId?: string
  },
): Promise<{ summary: CleanupSummary; status: CleanupRunRecord['status'] }> => {
  const errors: CleanupError[] = []
  const attempted = new Set<string>()
  const leaseToken = options.leaseToken ?? 'direct-test-lease'
  const runId = options.runId ?? 'direct-test-run'
  const nowMs = Date.parse(options.now)
  if (!Number.isFinite(nowMs)) throw new Error('Invalid cleanup time')

  let beforeBytes = 0n
  let afterBytes = 0n
  let deletedBytes = 0n
  let deletedAssets = 0
  let assetsExamined = 0
  const reasonCounts = { expired: 0, softLimit: 0 }
  let status: CleanupRunRecord['status'] = 'completed'

  try {
    const settings = await store.getSettings()
    const initial = activeAssets(await store.listActiveAssets())
    assetsExamined = initial.length
    beforeBytes = sumBytes(initial)

    // begin_commerce_cleanup adopts abandoned deleting rows before returning.
    // Replay those claims first: Storage removal is idempotent, while re-claiming
    // would incorrectly reject the already-deleting row.
    const adopted = await store.listClaimedAssets(runId, leaseToken)

    const cutoff = new Date(nowMs - 15 * 60 * 1000).toISOString()
    const stale = await store.listStaleGenerations(cutoff)
    for (const generation of stale) {
      try {
        await store.failGeneration(generation.id)
      } catch {
        addError(errors, { stage: 'stale_fail', code: errorCode('stale_fail'), itemId: generation.id })
        continue
      }
      try {
        await store.restoreGenerationAssets(generation.id)
      } catch {
        addError(errors, { stage: 'stale_restore', code: errorCode('stale_restore'), itemId: generation.id })
      }
    }

    const adoptedResult = await deleteCandidates(
      store, adopted, runId, leaseToken, options.now, errors, attempted, true,
    )
    deletedAssets += adoptedResult.deletedAssets
    deletedBytes += adoptedResult.deletedBytes
    reasonCounts.expired += adoptedResult.reasonCounts.expired
    reasonCounts.softLimit += adoptedResult.reasonCounts.softLimit

    const current = activeAssets(await store.listActiveAssets())

    const expired = selectCleanupCandidates(current, {
      now: options.now,
      softLimit: beforeBytes,
      target: beforeBytes,
    }).filter((item) => item.reason === 'expired')
    const expiredResult = await deleteCandidates(store, expired, runId, leaseToken, options.now, errors, attempted)
    deletedAssets += expiredResult.deletedAssets
    deletedBytes += expiredResult.deletedBytes
    reasonCounts.expired += expiredResult.reasonCounts.expired

    const afterExpiry = activeAssets(await store.listActiveAssets())
    const activeAfterExpiryBytes = sumBytes(afterExpiry)
    if (activeAfterExpiryBytes > settings.softLimit) {
      let projected = activeAfterExpiryBytes
      const early = afterExpiry
        .filter((item) => item.state === 'ready' && !item.locked && !attempted.has(item.id))
        .sort(compareOldest)
      const softCandidates: CleanupCandidate[] = []
      for (const item of early) {
        if (projected <= settings.target) break
        softCandidates.push({ ...item, reason: 'soft_limit' })
        projected -= item.sizeBytes
      }
      const softResult = await deleteCandidates(store, softCandidates, runId, leaseToken, options.now, errors, attempted)
      deletedAssets += softResult.deletedAssets
      deletedBytes += softResult.deletedBytes
      reasonCounts.softLimit += softResult.reasonCounts.softLimit
    }

    afterBytes = sumBytes(activeAssets(await store.listActiveAssets()))
    if (errors.length > 0) status = 'partial'
  } catch {
    status = 'failed'
    addError(errors, { stage: 'snapshot', code: errorCode('snapshot') })
    try {
      afterBytes = sumBytes(activeAssets(await store.listActiveAssets()))
    } catch {
      afterBytes = beforeBytes
    }
  }

  const record: CleanupRunRecord = {
    runId,
    leaseToken,
    status,
    assetsExamined,
    deletedAssets,
    beforeBytes: beforeBytes.toString(),
    deletedBytes: deletedBytes.toString(),
    afterBytes: afterBytes.toString(),
    details: {
      reason_counts: { expired: reasonCounts.expired, soft_limit: reasonCounts.softLimit },
      error_count: errors.length,
      errors,
    },
  }
  await store.finishRun(record)

  return {
    status,
    summary: {
      deletedAssets,
      deletedBytes: publicInteger(deletedBytes),
      beforeBytes: publicInteger(beforeBytes),
      afterBytes: publicInteger(afterBytes),
      reasonCounts,
    },
  }
}

const jsonResponse = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

const secretDigest = async (value: string) => new Uint8Array(await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(value),
))

const safeSecretEqual = async (left: string, right: string) => {
  const [leftDigest, rightDigest] = await Promise.all([secretDigest(left), secretDigest(right)])
  let difference = 0
  for (let index = 0; index < leftDigest.length; index += 1) {
    difference |= leftDigest[index] ^ rightDigest[index]
  }
  return difference === 0
}

export const createCleanupCommerceHandler = (dependencies: {
  getSecret(): string | undefined
  store: CleanupStore
  now(): string
}) => async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return jsonResponse({ code: 'METHOD_NOT_ALLOWED', message: '仅支持 POST 请求。' }, 405)
  }
  const serverSecret = dependencies.getSecret()?.trim()
  if (!serverSecret) {
    return jsonResponse({ code: 'SERVICE_UNAVAILABLE', message: '清理服务未配置。' }, 503)
  }
  const requestSecret = request.headers.get('x-cleanup-secret') ?? ''
  if (!await safeSecretEqual(requestSecret, serverSecret)) {
    return jsonResponse({ code: 'UNAUTHORIZED', message: '无权执行清理任务。' }, 401)
  }

  let lease: LeaseResult
  try {
    const triggerReason: CleanupTriggerReason = request.headers.get('x-cleanup-trigger') === 'manual'
      ? 'manual'
      : 'scheduled'
    lease = await dependencies.store.acquireLease(triggerReason)
  } catch {
    return jsonResponse({ code: 'SERVICE_ERROR', message: '清理服务暂时不可用。' }, 500)
  }
  if (!lease.acquired) {
    return jsonResponse({ code: 'CLEANUP_ALREADY_RUNNING', message: '清理任务正在运行。' }, 409)
  }

  try {
    const result = await executeCommerceCleanup(dependencies.store, {
      now: dependencies.now(),
      triggerReason: request.headers.get('x-cleanup-trigger') === 'manual' ? 'manual' : 'scheduled',
      leaseToken: lease.token,
      runId: lease.runId,
    })
    return jsonResponse(result.summary as unknown as Record<string, unknown>, result.status === 'failed' ? 500 : 200)
  } catch {
    return jsonResponse({ code: 'SERVICE_ERROR', message: '清理任务未能完成。' }, 500)
  }
}

const jsonDefaultKey = (value: string | undefined): string | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!isRecord(parsed)) return null
    return typeof parsed.default === 'string' && parsed.default.trim() ? parsed.default.trim() : null
  } catch {
    return null
  }
}

const resolveSecretKey = (getEnv: (name: string) => string | undefined) =>
  jsonDefaultKey(getEnv('SUPABASE_SECRET_KEYS'))
  ?? getEnv('SUPABASE_SECRET_KEY')?.trim()
  ?? getEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim()
  ?? null

const rowRecord = (value: unknown): Record<string, unknown> | null => {
  const row = Array.isArray(value) ? value[0] : value
  return isRecord(row) ? row : null
}

const parseAsset = (row: Record<string, unknown>, lockedProjects: Set<string>): CleanupAsset => {
  const projectId = String(row.project_id ?? '')
  const state = String(row.state ?? '') as CleanupAssetState
  if (!ACTIVE_STATES.has(state)) throw new Error('Invalid asset state')
  return {
    id: String(row.id ?? ''),
    projectId,
    storagePath: String(row.storage_path ?? ''),
    sizeBytes: toBigInt(row.size_bytes, 'asset bytes'),
    expiresAt: String(row.expires_at ?? ''),
    state,
    createdAt: String(row.created_at ?? ''),
    locked: lockedProjects.has(projectId),
  }
}

const PAGE_SIZE = 1000

const collectPages = async (
  createQuery: () => { range(start: number, end: number): Promise<{ data: unknown; error: unknown }> },
): Promise<unknown[]> => {
  const rows: unknown[] = []
  for (let start = 0; ; start += PAGE_SIZE) {
    const response = await createQuery().range(start, start + PAGE_SIZE - 1)
    if (response.error) throw new Error('Cleanup page query failed')
    const page: unknown[] = Array.isArray(response.data) ? response.data : []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

export const createSupabaseCleanupStore = (client: CleanupSupabaseClient): CleanupStore => ({
  async acquireLease(triggerReason) {
    const response = await client.rpc('begin_commerce_cleanup', { p_trigger_reason: triggerReason, p_lease_seconds: 900 })
    if (response.error) throw new Error('Cleanup lease unavailable')
    const row = rowRecord(response.data)
    if (!row || row.acquired !== true) return { acquired: false }
    const token = String(row.lease_token ?? '')
    const runId = String(row.run_id ?? '')
    if (!token || !runId) throw new Error('Cleanup lease malformed')
    return { acquired: true, token, runId }
  },

  async listStaleGenerations(cutoff) {
    const response = await client
      .from('commerce_generations')
      .select('id,created_at,started_at,status')
      .in('status', ['queued', 'processing'])
      .order('created_at', { ascending: true })
      .limit(1000)
    if (response.error) throw new Error('Stale generation query failed')
    const cutoffMs = Date.parse(cutoff)
    const rows: unknown[] = Array.isArray(response.data) ? response.data : []
    return rows
      .filter(isRecord)
      .filter((row) => Date.parse(String(row.started_at ?? row.created_at ?? '')) <= cutoffMs)
      .map((row) => ({ id: String(row.id ?? '') }))
      .filter((row) => row.id)
  },

  async failGeneration(generationId) {
    const response = await client.rpc('fail_commerce_generation', {
      p_generation_id: generationId,
      p_error_code: 'generation_timeout',
      p_error_message: 'Generation exceeded the 15 minute processing window.',
    })
    if (response.error) throw new Error('Stale generation refund failed')
  },

  async restoreGenerationAssets(generationId) {
    const response = await client.rpc('restore_commerce_assets_after_stale_generation', {
      p_generation_id: generationId,
    })
    if (response.error) throw new Error('Stale asset restoration failed')
  },

  async getSettings() {
    const response = await client.rpc('get_commerce_cleanup_settings', {})
    if (response.error) throw new Error('Cleanup settings unavailable')
    const row = rowRecord(response.data)
    if (!row) throw new Error('Cleanup settings malformed')
    const softLimit = toBigInt(row.storage_soft_limit_bytes, 'soft limit')
    const target = toBigInt(row.storage_target_bytes, 'target')
    if (softLimit < 1n || target < 1n || target >= softLimit) throw new Error('Cleanup settings invalid')
    return { softLimit, target }
  },

  async listActiveAssets() {
    const [assetRows, projectRows] = await Promise.all([
      collectPages(() => client.from('commerce_project_assets')
        .select('id,project_id,storage_path,size_bytes,expires_at,state,created_at')
        .neq('state', 'deleted')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })),
      collectPages(() => client.from('commerce_projects')
        .select('id,locked')
        .eq('locked', true)
        .order('id', { ascending: true })),
    ])
    const lockedProjects = new Set<string>(
      projectRows
        .filter(isRecord)
        .map((row) => String(row.id ?? ''))
        .filter(Boolean),
    )
    return assetRows
      .filter(isRecord)
      .map((row) => parseAsset(row, lockedProjects))
  },

  async listClaimedAssets(runId, leaseToken) {
    const response = await client.rpc('list_commerce_cleanup_claims', {
      p_run_id: runId,
      p_lease_token: leaseToken,
    })
    if (response.error) throw new Error('Cleanup claims unavailable')
    const rows: unknown[] = Array.isArray(response.data) ? response.data : []
    return rows
      .filter(isRecord)
      .map((row) => ({
        ...parseAsset(row, row.locked === true ? new Set([String(row.project_id ?? '')]) : new Set()),
        reason: String(row.cleanup_reason ?? '') as CleanupReason,
      }))
      .filter((item) => item.reason === 'expired' || item.reason === 'soft_limit')
  },

  async claimAsset(runId, leaseToken, candidate) {
    const response = await client.rpc('claim_commerce_asset_for_cleanup', {
      p_run_id: runId,
      p_lease_token: leaseToken,
      p_asset_id: candidate.id,
      p_reason: candidate.reason,
    })
    if (response.error) throw new Error('Asset cleanup claim failed')
    return response.data === true
      || (Array.isArray(response.data) && response.data[0] === true)
      || (isRecord(response.data) && response.data.claimed === true)
  },

  async deleteStorageObject(storagePath) {
    if (!storagePath) throw new Error('Storage path missing')
    const response = await client.storage.from('commerce-assets').remove([storagePath])
    if (response?.error) throw new Error('Storage removal failed')
  },

  async releaseAssetClaim(runId, leaseToken, assetId) {
    const response = await client.rpc('release_commerce_asset_cleanup_claim', {
      p_run_id: runId,
      p_lease_token: leaseToken,
      p_asset_id: assetId,
    })
    if (response.error || response.data !== true) throw new Error('Asset cleanup claim release failed')
  },

  async finalizeAssetDeletion(runId, leaseToken, assetId, deletedAt) {
    const response = await client.rpc('finalize_commerce_asset_cleanup', {
      p_run_id: runId,
      p_lease_token: leaseToken,
      p_asset_id: assetId,
      p_deleted_at: deletedAt,
    })
    if (response.error || response.data !== true) throw new Error('Asset row reconciliation failed')
  },

  async finishRun(record) {
    const response = await client.rpc('finish_commerce_cleanup', {
      p_run_id: record.runId,
      p_lease_token: record.leaseToken,
      p_status: record.status,
      p_assets_examined: record.assetsExamined,
      p_assets_deleted: record.deletedAssets,
      p_bytes_before: record.beforeBytes,
      p_bytes_deleted: record.deletedBytes,
      p_bytes_after: record.afterBytes,
      p_details: record.details,
    })
    if (response.error) throw new Error('Cleanup finalization failed')
  },
})

export const createProductionCleanupHandler = (dependencies: {
  getEnv(name: string): string | undefined
  createClient: SupabaseClientFactory
}) => {
  const url = dependencies.getEnv('SUPABASE_URL')?.trim()
  const secretKey = resolveSecretKey(dependencies.getEnv)
  const cleanupSecret = dependencies.getEnv('CLEANUP_SECRET')?.trim()
  if (!url || !secretKey || !cleanupSecret) throw new Error('Cleanup Edge runtime is not configured')
  const client = dependencies.createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const store = createSupabaseCleanupStore(client)
  return createCleanupCommerceHandler({
    getSecret: () => cleanupSecret,
    store,
    now: () => new Date().toISOString(),
  })
}
