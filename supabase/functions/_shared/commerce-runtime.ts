import { createOpenAiProvider, SafeProviderError, type AiProvider } from './ai-provider.ts'
import { buildCommercePrompt, type PlatformPreset, type PromptProject } from './commerce-prompt.ts'
import { corsForRequest, parseAllowedOrigins } from './cors.ts'
import { COMMERCE_RESULT_SCHEMA, validateCommerceResult } from './result-schema.ts'

type RpcResult = { data: unknown; error: unknown }
type AuthUser = { id: string; is_anonymous?: boolean }

export type UserClient = {
  auth: {
    getUser(token?: string): Promise<{ data: { user: AuthUser | null }; error: unknown }>
  }
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>
}

type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled'

type GenerationContext = {
  generation: {
    id: string
    projectId: string
    userId: string
    status: GenerationStatus
  }
  project: PromptProject
  assets: Array<{
    id: string
    storagePath: string
    expiresAt: string
    state: string
  }>
  preset: PlatformPreset
}

export type BackgroundStore = {
  loadContext(generationId: string): Promise<GenerationContext>
  createSignedUrls(paths: string[], expiresInSeconds: number): Promise<string[]>
  markAssetsState(generationId: string, assetIds: string[], state: 'processing' | 'ready'): Promise<void>
  completeGeneration(input: {
    generationId: string
    result: unknown
    provider: string
    model: string
    usage: Record<string, number>
  }): Promise<void>
  failGeneration(input: { generationId: string; code: string; message: string }): Promise<void>
}

export type ProcessGenerationInput = { generationId: string; userId: string }

class BackgroundError extends Error {
  override readonly name = 'BackgroundError'
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BEGIN_STATUSES = new Set<GenerationStatus>(['queued', 'processing', 'completed', 'failed', 'cancelled'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const safeMessage = (error: unknown): { code: string; message: string } => {
  if (error instanceof BackgroundError || error instanceof SafeProviderError) {
    return { code: error.code, message: error.message }
  }
  return { code: 'GENERATION_FAILED', message: '生成任务未能完成，本次额度已自动退回。' }
}

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'content-type': 'application/json; charset=utf-8' },
})

const errorResponse = (
  status: number,
  code: string,
  message: string,
  corsHeaders: Record<string, string>,
) => jsonResponse({ code, message }, status, corsHeaders)

const bearerFrom = (request: Request): string | null => {
  const authorization = request.headers.get('authorization')
  const match = authorization?.match(/^Bearer\s+([^\s]+)$/i)
  return match?.[1] ?? null
}

const validateBody = (value: unknown): { projectId: string; idempotencyKey: string } | null => {
  if (!isRecord(value)) return null
  if (typeof value.projectId !== 'string' || !UUID_PATTERN.test(value.projectId)) return null
  if (typeof value.idempotencyKey !== 'string') return null
  const idempotencyKey = value.idempotencyKey.trim()
  if (idempotencyKey.length < 1 || idempotencyKey.length > 200) return null
  return { projectId: value.projectId, idempotencyKey }
}

const beginError = (error: unknown) => {
  const value = isRecord(error) ? error : {}
  const code = typeof value.code === 'string' ? value.code : ''
  const message = typeof value.message === 'string' ? value.message.toLowerCase() : ''

  if (code === '28000' || code === '42501') {
    return { status: 401, code: 'AUTH_REQUIRED', message: '请登录后再开始分析。' }
  }
  if (/insufficient credits/.test(message)) {
    return { status: 402, code: 'CREDITS_EXHAUSTED', message: '可用次数不足。' }
  }
  if (code === '23505') {
    return { status: 409, code: 'IDEMPOTENCY_CONFLICT', message: '该请求标识已用于其他项目。' }
  }
  if (code === '22023' || code === 'P0002') {
    return { status: 422, code: 'VALIDATION_ERROR', message: '项目或请求参数无效。' }
  }
  if (/daily generation limit|rate limit|too many/.test(message)) {
    return { status: 429, code: 'RATE_LIMITED', message: '今日生成次数已达上限，请稍后再试。' }
  }
  return { status: 500, code: 'SERVICE_ERROR', message: '服务暂时不可用，请稍后重试。' }
}

const beginRow = (data: unknown) => {
  const candidate = Array.isArray(data) ? data[0] : data
  if (!isRecord(candidate)) return null
  const generationId = candidate.generation_id
  const status = candidate.status
  const charged = candidate.charged
  if (typeof generationId !== 'string' || !UUID_PATTERN.test(generationId)) return null
  if (typeof status !== 'string' || !BEGIN_STATUSES.has(status as GenerationStatus)) return null
  if (typeof charged !== 'boolean') return null
  return { generationId, status: status as GenerationStatus, charged }
}

export const createAnalyzeCommerceHandler = (dependencies: {
  allowedOrigins: ReadonlySet<string>
  createUserClient(authorization: string): UserClient | Promise<UserClient>
  processGeneration(input: ProcessGenerationInput): Promise<void>
  waitUntil(task: Promise<void>): void
}) => async (request: Request): Promise<Response> => {
  const cors = corsForRequest(request, dependencies.allowedOrigins)
  if (!cors.allowed) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '该请求来源不被允许。', cors.headers)
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers })
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', '仅支持 POST 请求。', cors.headers)
  }

  const token = bearerFrom(request)
  if (!token) return errorResponse(401, 'AUTH_REQUIRED', '请登录后再开始分析。', cors.headers)

  let client: UserClient
  try {
    client = await dependencies.createUserClient(`Bearer ${token}`)
  } catch {
    return errorResponse(500, 'SERVICE_ERROR', '服务暂时不可用，请稍后重试。', cors.headers)
  }

  const auth = await client.auth.getUser(token).catch(() => ({ data: { user: null }, error: true }))
  const user = auth.data.user
  if (auth.error || !user || user.is_anonymous) {
    return errorResponse(401, 'AUTH_REQUIRED', '请登录后再开始分析。', cors.headers)
  }

  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return errorResponse(422, 'VALIDATION_ERROR', '请求内容格式无效。', cors.headers)
  }
  const body = validateBody(parsed)
  if (!body) return errorResponse(422, 'VALIDATION_ERROR', '项目或请求参数无效。', cors.headers)

  let begin: RpcResult
  try {
    begin = await client.rpc('begin_commerce_generation', {
      p_project_id: body.projectId,
      p_idempotency_key: body.idempotencyKey,
    })
  } catch {
    return errorResponse(500, 'SERVICE_ERROR', '服务暂时不可用，请稍后重试。', cors.headers)
  }
  if (begin.error) {
    const mapped = beginError(begin.error)
    return errorResponse(mapped.status, mapped.code, mapped.message, cors.headers)
  }
  const generation = beginRow(begin.data)
  if (!generation) {
    return errorResponse(500, 'SERVICE_ERROR', '服务暂时不可用，请稍后重试。', cors.headers)
  }

  // The RPC returns charged=false for an idempotent replay. Reusing its status avoids a
  // second provider call and double charge while still returning the existing generation.
  if (generation.charged && generation.status === 'queued') {
    dependencies.waitUntil(dependencies.processGeneration({ generationId: generation.generationId, userId: user.id }))
  }

  return jsonResponse({ generationId: generation.generationId, status: generation.status }, 202, cors.headers)
}

export const createProcessGeneration = (dependencies: {
  store: BackgroundStore
  aiProvider: AiProvider
}) => async ({ generationId, userId }: ProcessGenerationInput): Promise<void> => {
  let processingAssetIds: string[] = []
  let failureInvoked = false
  let terminalCommitted = false

  const failOnce = async (error: unknown) => {
    if (failureInvoked) return
    failureInvoked = true
    const safe = safeMessage(error)
    try {
      await dependencies.store.failGeneration({ generationId, code: safe.code, message: safe.message })
      terminalCommitted = true
    } catch {
      console.error('commerce generation refund failed')
    }
  }

  try {
    const context = await dependencies.store.loadContext(generationId)
    if (context.generation.userId !== userId || context.project.userId !== userId) {
      throw new BackgroundError('OWNERSHIP_MISMATCH', '生成任务校验失败。')
    }
    if (context.generation.projectId !== context.project.id) {
      throw new BackgroundError('PROJECT_MISMATCH', '生成项目校验失败。')
    }
    if (context.generation.status === 'completed') return
    if (context.generation.status !== 'queued' && context.generation.status !== 'processing') {
      throw new BackgroundError('GENERATION_STATE_INVALID', '生成任务状态无效。')
    }
    if (context.assets.length < 1) {
      throw new BackgroundError('ASSETS_NOT_READY', '没有可用的产品图片。')
    }
    const now = Date.now()
    if (context.assets.some((asset) => asset.state !== 'ready' || Date.parse(asset.expiresAt) <= now)) {
      throw new BackgroundError('ASSETS_EXPIRED', '产品图片已过期，请重新上传。')
    }

    const imageUrls = await dependencies.store.createSignedUrls(
      context.assets.map((asset) => asset.storagePath),
      600,
    )
    if (imageUrls.length !== context.assets.length) {
      throw new BackgroundError('SIGNED_URL_FAILED', '产品图片暂时无法读取。')
    }

    processingAssetIds = context.assets.map((asset) => asset.id)
    await dependencies.store.markAssetsState(generationId, processingAssetIds, 'processing')

    const prompt = buildCommercePrompt({
      platform: context.project.platform,
      mode: context.project.mode,
      project: context.project,
      preset: context.preset,
    })
    let generated = await dependencies.aiProvider.generate({
      prompt,
      imageUrls,
      schema: COMMERCE_RESULT_SCHEMA as unknown as Record<string, unknown>,
    })
    let validation = validateCommerceResult(generated.result)

    if (!validation.ok) {
      generated = await dependencies.aiProvider.generate({
        prompt: `${prompt}\n\n上一次结果未通过 JSON 字段契约校验（${validation.errors.join(', ')}）。请重新生成一份完整结果，不得省略或增加字段。`,
        imageUrls,
        schema: COMMERCE_RESULT_SCHEMA as unknown as Record<string, unknown>,
      })
      validation = validateCommerceResult(generated.result)
    }
    if (!validation.ok) {
      throw new BackgroundError('RESULT_INVALID', 'AI 结果未通过结构校验。')
    }

    await dependencies.store.completeGeneration({
      generationId,
      result: generated.result,
      provider: 'openai',
      model: generated.model,
      usage: generated.usage,
    })
    terminalCommitted = true
  } catch (error) {
    await failOnce(error)
  } finally {
    // Successful terminal RPCs restore processing assets atomically. This guarded fallback
    // is only for a worker that marked assets processing but could not commit either terminal RPC.
    if (processingAssetIds.length > 0 && !terminalCommitted) {
      try {
        await dependencies.store.markAssetsState(generationId, processingAssetIds, 'ready')
      } catch {
        console.error('commerce asset state restoration failed')
      }
    }
  }
}

export type SupabaseLike = {
  from(table: string): any
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>
  storage: { from(bucket: string): any }
}

const requireData = (data: unknown, error: unknown, code: string, message: string) => {
  if (error || !data) throw new BackgroundError(code, message)
  return data
}

const mapProject = (row: Record<string, unknown>): PromptProject => ({
  id: String(row.id ?? ''),
  userId: String(row.user_id ?? ''),
  name: String(row.name ?? ''),
  platform: row.platform as PromptProject['platform'],
  mode: row.mode as PromptProject['mode'],
  inputData: isRecord(row.input_data) ? row.input_data : {},
})

export const createSupabaseBackgroundStore = (client: SupabaseLike): BackgroundStore => ({
  async loadContext(generationId) {
    const generationQuery = await client
      .from('commerce_generations')
      .select('id,project_id,user_id,status')
      .eq('id', generationId)
      .maybeSingle()
    const generationRow = requireData(
      generationQuery.data,
      generationQuery.error,
      'GENERATION_NOT_FOUND',
      '生成任务不存在。',
    ) as Record<string, unknown>
    const projectId = typeof generationRow.project_id === 'string' ? generationRow.project_id : ''
    const generationUserId = typeof generationRow.user_id === 'string' ? generationRow.user_id : ''
    if (!projectId || !generationUserId) {
      throw new BackgroundError('GENERATION_CONTEXT_INVALID', '生成任务缺少项目上下文。')
    }

    const projectQuery = await client
      .from('commerce_projects')
      .select('id,user_id,name,platform,mode,input_data')
      .eq('id', projectId)
      .eq('user_id', generationUserId)
      .maybeSingle()
    const projectRow = requireData(
      projectQuery.data,
      projectQuery.error,
      'PROJECT_NOT_FOUND',
      '生成项目不存在。',
    ) as Record<string, unknown>
    const project = mapProject(projectRow)

    const assetQuery = await client
      .from('commerce_project_assets')
      .select('id,storage_path,expires_at,state')
      .eq('project_id', projectId)
      .eq('user_id', generationUserId)
      .eq('state', 'ready')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (assetQuery.error) throw new BackgroundError('ASSET_LOAD_FAILED', '产品图片暂时无法读取。')
    const assetRows = Array.isArray(assetQuery.data) ? assetQuery.data.filter(isRecord) : []

    const presetQuery = await client
      .from('platform_presets')
      .select('display_name,config')
      .eq('platform', project.platform)
      .maybeSingle()
    const presetRow = requireData(
      presetQuery.data,
      presetQuery.error,
      'PRESET_NOT_FOUND',
      '平台策略预设暂时不可用。',
    ) as Record<string, unknown>

    return {
      generation: {
        id: String(generationRow.id ?? ''),
        projectId,
        userId: generationUserId,
        status: generationRow.status as GenerationStatus,
      },
      project,
      assets: assetRows.map((asset: Record<string, unknown>) => ({
        id: String(asset.id ?? ''),
        storagePath: String(asset.storage_path ?? ''),
        expiresAt: String(asset.expires_at ?? ''),
        state: String(asset.state ?? ''),
      })),
      preset: {
        displayName: String(presetRow.display_name ?? ''),
        config: isRecord(presetRow.config) ? presetRow.config : {},
      },
    }
  },

  async createSignedUrls(paths, expiresInSeconds) {
    return await Promise.all(paths.map(async (path) => {
      const response = await client.storage.from('commerce-assets').createSignedUrl(path, expiresInSeconds)
      const signedUrl = response?.data?.signedUrl
      if (response?.error || typeof signedUrl !== 'string' || !signedUrl) {
        throw new BackgroundError('SIGNED_URL_FAILED', '产品图片暂时无法读取。')
      }
      return signedUrl
    }))
  },

  async markAssetsState(generationId, assetIds, state) {
    if (assetIds.length === 0) return
    const { error } = await client.rpc('set_commerce_generation_assets_state', {
      p_generation_id: generationId,
      p_asset_ids: assetIds,
      p_state: state,
    })
    if (error) throw new BackgroundError('ASSET_STATE_FAILED', '产品图片状态更新失败。')
  },

  async completeGeneration(input) {
    const { error } = await client.rpc('complete_commerce_generation', {
      p_generation_id: input.generationId,
      p_result: input.result,
      p_provider: input.provider,
      p_model: input.model,
      p_usage: input.usage,
    })
    if (error) throw new BackgroundError('COMPLETE_FAILED', '生成结果保存失败。')
  },

  async failGeneration(input) {
    const { error } = await client.rpc('fail_commerce_generation', {
      p_generation_id: input.generationId,
      p_error_code: input.code,
      p_error_message: input.message,
    })
    if (error) throw new BackgroundError('REFUND_FAILED', '生成任务退款记录失败。')
  },
})

type SupabaseClientFactory = (
  url: string,
  key: string,
  options: Record<string, unknown>,
) => SupabaseLike & UserClient

const jsonDefaultKey = (value: string | undefined): string | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!isRecord(parsed)) return null
    const defaultKey = parsed.default
    return typeof defaultKey === 'string' && defaultKey.trim() ? defaultKey.trim() : null
  } catch {
    return null
  }
}

const plainKey = (value: string | undefined): string | null => value?.trim() || null

export const resolveSupabaseRuntimeKey = (
  getEnv: (name: string) => string | undefined,
  kind: 'publishable' | 'secret',
): string | null => {
  if (kind === 'publishable') {
    return jsonDefaultKey(getEnv('SUPABASE_PUBLISHABLE_KEYS'))
      ?? plainKey(getEnv('SUPABASE_PUBLISHABLE_KEY'))
      ?? plainKey(getEnv('SUPABASE_ANON_KEY'))
  }
  return jsonDefaultKey(getEnv('SUPABASE_SECRET_KEYS'))
    ?? plainKey(getEnv('SUPABASE_SECRET_KEY'))
    ?? plainKey(getEnv('SUPABASE_SERVICE_ROLE_KEY'))
}

export const createProductionAnalyzeHandler = (dependencies: {
  getEnv(name: string): string | undefined
  createClient: SupabaseClientFactory
  aiProvider: AiProvider
  waitUntil(task: Promise<void>): void
}) => {
  const url = dependencies.getEnv('SUPABASE_URL')?.trim()
  const publishableKey = resolveSupabaseRuntimeKey(dependencies.getEnv, 'publishable')
  const secretKey = resolveSupabaseRuntimeKey(dependencies.getEnv, 'secret')
  if (!url || !publishableKey || !secretKey) {
    throw new Error('Supabase Edge runtime is not configured')
  }

  // Construct the privileged client before the server starts accepting requests. If this
  // bootstrap fails, begin_commerce_generation can never run and no credit can be charged.
  const serviceClient = dependencies.createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const store = createSupabaseBackgroundStore(serviceClient)
  const processGeneration = createProcessGeneration({ store, aiProvider: dependencies.aiProvider })

  return createAnalyzeCommerceHandler({
    allowedOrigins: parseAllowedOrigins(dependencies.getEnv('ALLOWED_ORIGINS')),
    createUserClient: (authorization) => dependencies.createClient(url, publishableKey, {
      global: { headers: { authorization } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    processGeneration,
    waitUntil: dependencies.waitUntil,
  })
}
