import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type {
  AssetUploadProgress,
  CommerceAdminDashboard,
  CommerceAdminGeneration,
  CommerceAdminOverview,
  CommerceAdminSettings,
  CommerceAdminUser,
  CommerceAsset,
  CommerceAssetState,
  CommerceEntitlement,
  CommerceGeneration,
  CommerceGenerationStatus,
  CommercePlatform,
  CommerceProject,
  CommerceProjectDetails,
  CommerceProjectInput,
  GenerationStartResult,
  SetUserEntitlementInput,
} from './types'
import { validateProductFile, validateProjectInput } from './validation'

const assetBucket = 'commerce-assets'
const adminPageSize = 50

type CommerceSupabaseClient = SupabaseClient<any>
type DatabaseRow = Record<string, unknown>

export type CommerceErrorCode =
  | 'AUTH_REQUIRED'
  | 'CREDITS_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'ASSETS_EXPIRED'
  | 'NETWORK'
  | 'VALIDATION'

export class CommerceRepositoryError extends Error {
  readonly name = 'CommerceRepositoryError'

  constructor(
    readonly code: CommerceErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message)
  }
}

const isRecord = (value: unknown): value is DatabaseRow =>
  typeof value === 'object' && value !== null

const asRecord = (value: unknown): DatabaseRow => isRecord(value) ? value : {}
const asArray = (value: unknown): DatabaseRow[] => Array.isArray(value) ? value.filter(isRecord) : []
const asString = (value: unknown): string => typeof value === 'string' ? value : ''
const asNullableString = (value: unknown): string | null => typeof value === 'string' ? value : null
const asNumber = (value: unknown): number => typeof value === 'number' ? value : 0
const asBoolean = (value: unknown): boolean => value === true

const errorDetails = (error: unknown) => {
  const record = asRecord(error)
  const context = asRecord(record.context)
  return {
    code: asString(record.code),
    message: asString(record.message),
    status: asNumber(record.status) || asNumber(context.status),
  }
}

const responseErrorDetails = async (error: unknown) => {
  const record = asRecord(error)
  const context = record.context
  let status = asNumber(record.status)
  let body: DatabaseRow = {}

  if (isRecord(context)) {
    status ||= asNumber(context.status)
    const clone = context.clone
    const text = context.text
    if (typeof text === 'function') {
      try {
        const readable = typeof clone === 'function' ? clone.call(context) : context
        const rawBody = await (readable as { text: () => Promise<string> }).text()
        if (rawBody) {
          try {
            body = asRecord(JSON.parse(rawBody))
          } catch {
            body = { message: rawBody }
          }
        }
      } catch {
        // The status still gives actionable meaning if a consumed body cannot be cloned.
      }
    }
  }

  return {
    code: asString(body.code) || asString(record.code),
    message: asString(body.message) || asString(body.error) || asString(record.message),
    status,
  }
}

/** Converts backend and transport failures to copy that tells a workspace user what to do next. */
export const mapCommerceError = (error: unknown): CommerceRepositoryError => {
  if (error instanceof CommerceRepositoryError) return error

  const { code, message, status } = errorDetails(error)
  const normalized = `${code} ${message}`.toLowerCase()

  if (code === '28000' || status === 401 || status === 403 || /auth|jwt|session|anonymous|login/.test(normalized)) {
    return new CommerceRepositoryError('AUTH_REQUIRED', '登录已失效，请重新登录后继续。', error)
  }
  if (status === 402 || /insufficient[ _-]credits|credits?[ _-]exhausted|次数不足|余额不足/.test(normalized)) {
    return new CommerceRepositoryError('CREDITS_EXHAUSTED', '可用次数不足，请稍后获取额度后再试。', error)
  }
  if (/daily generation limit|rate limit|too many|频率|限流/.test(normalized) || status === 429) {
    return new CommerceRepositoryError('RATE_LIMITED', '请求过于频繁，请稍后再试。', error)
  }
  if (status === 410 || /expired|expires|过期/.test(normalized)) {
    return new CommerceRepositoryError('ASSETS_EXPIRED', '图片已过期，请重新上传后再试。', error)
  }
  return new CommerceRepositoryError('NETWORK', '网络或服务暂时不可用，请检查连接后重试。', error)
}

const mapFunctionInvokeError = async (error: unknown): Promise<CommerceRepositoryError> => {
  const mapped = mapCommerceError(await responseErrorDetails(error))
  return new CommerceRepositoryError(mapped.code, mapped.message, error)
}

const validationError = (messages: string[]) =>
  new CommerceRepositoryError('VALIDATION', messages.join('；'), messages)

const rowToAsset = (value: unknown): CommerceAsset => {
  const row = asRecord(value)
  return {
    id: asString(row.id),
    projectId: asString(row.project_id),
    userId: asString(row.user_id),
    storagePath: asString(row.storage_path),
    mimeType: asString(row.mime_type) as CommerceAsset['mimeType'],
    sizeBytes: asNumber(row.size_bytes),
    expiresAt: asString(row.expires_at),
    state: asString(row.state) as CommerceAssetState,
    deletedAt: asNullableString(row.deleted_at),
    createdAt: asString(row.created_at),
  }
}

const rowToProject = (value: unknown): CommerceProject => {
  const row = asRecord(value)
  return {
    id: asString(row.id),
    userId: asString(row.user_id),
    name: asString(row.name),
    platform: asString(row.platform) as CommercePlatform,
    mode: asString(row.mode) as CommerceProject['mode'],
    inputData: asRecord(row.input_data) as CommerceProjectDetails,
    locked: asBoolean(row.locked),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    assets: asArray(row.commerce_project_assets).map(rowToAsset),
  }
}

const rowToGeneration = (value: unknown): CommerceGeneration => {
  const row = asRecord(value)
  return {
    id: asString(row.id),
    projectId: asNullableString(row.project_id),
    userId: asString(row.user_id),
    idempotencyKey: asString(row.idempotency_key),
    status: asString(row.status) as CommerceGenerationStatus,
    resultData: (row.result_data ?? null) as CommerceGeneration['resultData'],
    provider: asNullableString(row.provider),
    model: asNullableString(row.model),
    usage: isRecord(row.usage) ? row.usage : null,
    errorCode: asNullableString(row.error_code),
    errorMessage: asNullableString(row.error_message),
    creditCharged: asBoolean(row.credit_charged),
    refundedAt: asNullableString(row.refunded_at),
    createdAt: asString(row.created_at),
    startedAt: asNullableString(row.started_at),
    completedAt: asNullableString(row.completed_at),
  }
}

const rowToEntitlement = (value: unknown): CommerceEntitlement => {
  const row = asRecord(value)
  return {
    userId: asString(row.user_id),
    credits: asNumber(row.credits),
    unlimited: asBoolean(row.unlimited),
    disabled: asBoolean(row.disabled),
    dailyLimit: asNumber(row.daily_limit),
    updatedAt: asString(row.updated_at),
  }
}

const rowToAdminOverview = (value: unknown): CommerceAdminOverview => {
  const row = asRecord(value)
  return {
    totalUsers: asNumber(row.total_users),
    todayGenerations: asNumber(row.today_generations),
    todayFailures: asNumber(row.today_failures),
    todayFailureRate: asNumber(row.today_failure_rate),
    creditsConsumed: asNumber(row.credits_consumed),
    storageBytes: asNumber(row.storage_bytes),
    latestCleanup: isRecord(row.latest_cleanup) ? row.latest_cleanup : null,
  }
}

const rowToAdminUser = (value: unknown): CommerceAdminUser => {
  const row = asRecord(value)
  return {
    userId: asString(row.user_id),
    email: asNullableString(row.email),
    provider: asString(row.provider),
    createdAt: asString(row.created_at),
    credits: asNumber(row.credits),
    unlimited: asBoolean(row.unlimited),
    disabled: asBoolean(row.disabled),
    dailyLimit: asNumber(row.daily_limit),
    generationCount: asNumber(row.generation_count),
    creditsUsed: asNumber(row.credits_used),
  }
}

const rowToAdminGeneration = (value: unknown): CommerceAdminGeneration => {
  const row = asRecord(value)
  return {
    generationId: asString(row.generation_id),
    projectId: asNullableString(row.project_id),
    projectName: asString(row.project_name),
    userId: asString(row.user_id),
    userEmail: asNullableString(row.user_email),
    platform: asNullableString(row.platform) as CommercePlatform | null,
    status: asString(row.status) as CommerceGenerationStatus,
    provider: asNullableString(row.provider),
    model: asNullableString(row.model),
    errorCode: asNullableString(row.error_code),
    errorMessage: asNullableString(row.error_message),
    creditCharged: asBoolean(row.credit_charged),
    refundedAt: asNullableString(row.refunded_at),
    createdAt: asString(row.created_at),
    startedAt: asNullableString(row.started_at),
    completedAt: asNullableString(row.completed_at),
  }
}

const rowToAdminSettings = (value: unknown): CommerceAdminSettings => {
  const row = asRecord(value)
  return {
    newUserCredits: asNumber(row.new_user_credits),
    defaultDailyLimit: asNumber(row.default_daily_limit),
    maxProjectImages: asNumber(row.max_project_images),
    storageSoftLimitBytes: asNumber(row.storage_soft_limit_bytes),
    storageTargetBytes: asNumber(row.storage_target_bytes),
  }
}

const containsLongRawBase64 = (value: string): boolean => {
  if (/[a-z0-9+/]{256,}={0,2}/i.test(value)) return true

  const foldedCandidates = value.match(
    /(?:[a-z0-9+/]{32,}={0,2}[ \t\r\n]+)+[a-z0-9+/]{32,}={0,2}/gi,
  ) ?? []
  return foldedCandidates.some((candidate) =>
    candidate.replace(/[ \t\r\n]/g, '').length >= 256,
  )
}

const projectDetails = (input: CommerceProjectInput): CommerceProjectDetails => {
  const fields: Array<keyof CommerceProjectDetails> = [
    'category', 'specifications', 'priceRange', 'sellingPoints', 'audience', 'brandTone',
    'competitorLinks', 'prohibitedWords', 'desiredStyle', 'notes',
  ]
  return fields.reduce<CommerceProjectDetails>((details, field) => {
    const value = input[field]
    if (typeof value === 'string') {
      const containsTransientUrl = /blob:|data:[^,\s]*;base64,/i.test(value)
      if (containsTransientUrl || containsLongRawBase64(value)) {
        throw validationError([`${field} 不支持保存图片 URL 或 Base64 数据`])
      }
      details[field] = value
    }
    return details
  }, {})
}

const extensionForMime = (mimeType: File['type']) => {
  if (mimeType === 'image/jpeg') return 'jpg'
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  throw validationError(['仅支持 JPEG、PNG 或 WebP 图片'])
}

export interface CommerceRepository {
  getEntitlement(): Promise<CommerceEntitlement>
  createProject(input: CommerceProjectInput): Promise<CommerceProject>
  uploadAssets(projectId: string, files: File[], onProgress: (progress: AssetUploadProgress) => void): Promise<CommerceAsset[]>
  startGeneration(projectId: string, idempotencyKey: string): Promise<GenerationStartResult>
  getGeneration(id: string): Promise<CommerceGeneration>
  listProjects(): Promise<CommerceProject[]>
  deleteProject(id: string): Promise<void>
  setProjectLocked(id: string, locked: boolean): Promise<void>
  getAdminDashboard(): Promise<CommerceAdminDashboard>
  setUserEntitlement(input: SetUserEntitlementInput): Promise<void>
  updateAdminSettings(settings: CommerceAdminSettings, reason: string): Promise<void>
}

class SupabaseCommerceRepository implements CommerceRepository {
  constructor(private readonly configuredClient: CommerceSupabaseClient | null) {}

  private get client(): CommerceSupabaseClient {
    if (!this.configuredClient) {
      throw new CommerceRepositoryError('NETWORK', '网络或服务暂时不可用，请检查连接后重试。')
    }
    return this.configuredClient
  }

  private async requireAuthenticatedUser(): Promise<string> {
    const { data, error } = await this.client.auth.getUser()
    if (error) throw mapCommerceError(error)
    const user = data.user
    if (!user?.id || user.is_anonymous === true) {
      throw new CommerceRepositoryError('AUTH_REQUIRED', '登录已失效，请重新登录后继续。')
    }
    return user.id
  }

  async getEntitlement(): Promise<CommerceEntitlement> {
    await this.requireAuthenticatedUser()
    const { data, error } = await this.client.rpc('get_my_entitlement')
    if (error) throw mapCommerceError(error)
    const row = asArray(data)[0]
    if (!row) throw new CommerceRepositoryError('AUTH_REQUIRED', '登录已失效，请重新登录后继续。')
    return rowToEntitlement(row)
  }

  async createProject(input: CommerceProjectInput): Promise<CommerceProject> {
    const validation = validateProjectInput(input)
    if (!validation.ok) throw validationError(validation.errors)

    const userId = await this.requireAuthenticatedUser()
    const { data, error } = await this.client
      .from('commerce_projects')
      .insert({
        user_id: userId,
        name: input.name.trim(),
        platform: input.platform,
        mode: input.mode,
        input_data: projectDetails(input),
      })
      .select('id,user_id,name,platform,mode,input_data,locked,created_at,updated_at')
      .single()
    if (error) throw mapCommerceError(error)
    if (!data) throw mapCommerceError(new Error('project response missing'))
    return rowToProject(data)
  }

  async uploadAssets(
    projectId: string,
    files: File[],
    onProgress: (progress: AssetUploadProgress) => void,
  ): Promise<CommerceAsset[]> {
    const validationErrors = files.flatMap((file, index) =>
      validateProductFile(file).errors.map((message) => `第 ${index + 1} 个文件：${message}`),
    )
    if (validationErrors.length > 0) throw validationError(validationErrors)

    const userId = await this.requireAuthenticatedUser()
    const uploaded: CommerceAsset[] = []

    for (const [index, file] of files.entries()) {
      const storagePath = `${userId}/${projectId}/${crypto.randomUUID()}.${extensionForMime(file.type)}`
      onProgress({
        completedFiles: uploaded.length,
        totalFiles: files.length,
        currentFile: { name: file.name, state: 'uploading' },
      })

      const { data: assetData, error: assetError } = await this.client
        .from('commerce_project_assets')
        .insert({
          project_id: projectId,
          user_id: userId,
          storage_path: storagePath,
          mime_type: file.type,
          size_bytes: file.size,
          state: 'uploading',
        })
        .select('id,project_id,user_id,storage_path,mime_type,size_bytes,expires_at,state,deleted_at,created_at')
        .single()
      if (assetError) throw mapCommerceError(assetError)
      if (!assetData) throw mapCommerceError(new Error('asset response missing'))

      const asset = rowToAsset(assetData)
      let uploadError: unknown = null
      try {
        const uploadResult = await this.client.storage
          .from(assetBucket)
          .upload(storagePath, file, { contentType: file.type, upsert: false })
        uploadError = uploadResult.error
      } catch (error) {
        uploadError = error
      }
      if (uploadError) {
        const failedStateError = await this.markAssetFailed(asset.id)
        onProgress({
          completedFiles: uploaded.length,
          totalFiles: files.length,
          currentFile: { name: file.name, state: 'failed' },
        })
        throw failedStateError ?? mapCommerceError(uploadError)
      }

      let readyError: unknown = null
      try {
        const readyResult = await this.client
          .from('commerce_project_assets')
          .update({ state: 'ready' })
          .eq('id', asset.id)
        readyError = readyResult.error
      } catch (error) {
        readyError = error
      }
      if (readyError) {
        const failedStateError = await this.markAssetFailed(asset.id)
        onProgress({
          completedFiles: uploaded.length,
          totalFiles: files.length,
          currentFile: { name: file.name, state: 'failed' },
        })
        throw failedStateError ?? mapCommerceError(readyError)
      }

      const readyAsset = { ...asset, state: 'ready' as const }
      uploaded.push(readyAsset)
      onProgress({
        completedFiles: index + 1,
        totalFiles: files.length,
        currentFile: { name: file.name, state: 'ready' },
      })
    }

    return uploaded
  }

  private async markAssetFailed(assetId: string): Promise<CommerceRepositoryError | null> {
    try {
      const { error } = await this.client
        .from('commerce_project_assets')
        .update({ state: 'failed' })
        .eq('id', assetId)
      return error ? mapCommerceError(error) : null
    } catch (error) {
      return mapCommerceError(error)
    }
  }

  async startGeneration(projectId: string, idempotencyKey: string): Promise<GenerationStartResult> {
    await this.requireAuthenticatedUser()
    const { data, error } = await this.client.functions.invoke('analyze-commerce', {
      body: { projectId, idempotencyKey },
    })
    if (error) throw await mapFunctionInvokeError(error)
    const response = asRecord(data)
    const generationId = asString(response.generationId)
    const status = asString(response.status) as CommerceGenerationStatus
    if (!generationId || !status) throw mapCommerceError(new Error('generation response missing'))
    return { generationId, status }
  }

  async getGeneration(id: string): Promise<CommerceGeneration> {
    await this.requireAuthenticatedUser()
    const { data, error } = await this.client
      .from('commerce_generations')
      .select('id,project_id,user_id,idempotency_key,status,result_data,provider,model,usage,error_code,error_message,credit_charged,refunded_at,created_at,started_at,completed_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw mapCommerceError(error)
    if (!data) throw mapCommerceError(new Error('generation not found'))
    return rowToGeneration(data)
  }

  async listProjects(): Promise<CommerceProject[]> {
    await this.requireAuthenticatedUser()
    const { data, error } = await this.client
      .from('commerce_projects')
      .select('id,user_id,name,platform,mode,input_data,locked,created_at,updated_at,commerce_project_assets!commerce_project_assets_project_owner_fkey(id,project_id,user_id,storage_path,mime_type,size_bytes,expires_at,state,deleted_at,created_at)')
      .order('created_at', { ascending: false })
    if (error) throw mapCommerceError(error)
    return asArray(data).map(rowToProject)
  }

  async deleteProject(id: string): Promise<void> {
    const userId = await this.requireAuthenticatedUser()
    const { data, error } = await this.client
      .from('commerce_project_assets')
      .select('storage_path')
      .eq('project_id', id)
      .eq('user_id', userId)
    if (error) throw mapCommerceError(error)

    const paths = asArray(data)
      .map((asset) => asString(asset.storage_path))
      .filter(Boolean)
    if (paths.length > 0) {
      const { error: storageError } = await this.client.storage.from(assetBucket).remove(paths)
      if (storageError) throw mapCommerceError(storageError)
    }

    const { error: deleteError } = await this.client.rpc('delete_commerce_project', { p_project_id: id })
    if (deleteError && errorDetails(deleteError).code !== 'P0002') throw mapCommerceError(deleteError)
  }

  async setProjectLocked(id: string, locked: boolean): Promise<void> {
    await this.requireAuthenticatedUser()
    const { error } = await this.client.from('commerce_projects').update({ locked }).eq('id', id)
    if (error) throw mapCommerceError(error)
  }

  async getAdminDashboard(): Promise<CommerceAdminDashboard> {
    await this.requireAuthenticatedUser()
    const [overview, users, generations, settings] = await Promise.all([
      this.client.rpc('admin_commerce_overview'),
      this.client.rpc('admin_list_users', { p_search: '', p_limit: adminPageSize, p_offset: 0 }),
      this.client.rpc('admin_list_generations', { p_search: '', p_limit: adminPageSize, p_offset: 0 }),
      this.client.rpc('admin_get_settings'),
    ])
    if (overview.error) throw mapCommerceError(overview.error)
    if (users.error) throw mapCommerceError(users.error)
    if (generations.error) throw mapCommerceError(generations.error)
    if (settings.error) throw mapCommerceError(settings.error)
    return {
      overview: rowToAdminOverview(overview.data),
      users: asArray(users.data).map(rowToAdminUser),
      generations: asArray(generations.data).map(rowToAdminGeneration),
      settings: rowToAdminSettings(settings.data),
    }
  }

  async setUserEntitlement(input: SetUserEntitlementInput): Promise<void> {
    await this.requireAuthenticatedUser()
    const { error } = await this.client.rpc('admin_set_entitlement', {
      p_user_id: input.userId,
      p_credits: input.credits,
      p_unlimited: input.unlimited,
      p_disabled: input.disabled,
      p_reason: input.reason,
    })
    if (error) throw mapCommerceError(error)
  }

  async updateAdminSettings(settings: CommerceAdminSettings, reason: string): Promise<void> {
    await this.requireAuthenticatedUser()
    const { error } = await this.client.rpc('admin_update_settings', {
      p_settings: {
        new_user_credits: settings.newUserCredits,
        default_daily_limit: settings.defaultDailyLimit,
        max_project_images: settings.maxProjectImages,
        storage_soft_limit_bytes: settings.storageSoftLimitBytes,
        storage_target_bytes: settings.storageTargetBytes,
      },
      p_reason: reason,
    })
    if (error) throw mapCommerceError(error)
  }
}

export const createCommerceRepository = (client: CommerceSupabaseClient | null = supabase as CommerceSupabaseClient | null): CommerceRepository =>
  new SupabaseCommerceRepository(client)

export const commerceRepository = createCommerceRepository()
