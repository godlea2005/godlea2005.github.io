import { resolveSupabaseRuntimeKey } from './commerce-runtime.ts'
import { corsForRequest, parseAllowedOrigins } from './cors.ts'

const MAX_IMAGE_BYTES = 8_388_608
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ASSET_COLUMNS = 'id,project_id,user_id,storage_path,mime_type,size_bytes,expires_at,state,deleted_at,created_at'

type RpcResult = { data: unknown; error: unknown }
type AuthUser = { id: string; is_anonymous?: boolean }
type ClientResult<T = unknown> = { data: T; error: unknown }

export type CommerceUploadUserClient = {
  auth: {
    getUser(token?: string): Promise<{ data: { user: AuthUser | null }; error: unknown }>
  }
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>
  from(table: string): any
}

export type CommerceUploadServiceClient = {
  rpc(name: string, parameters: Record<string, unknown>): Promise<RpcResult>
  storage: {
    from(bucket: string): {
      createSignedUploadUrl(path: string): Promise<ClientResult>
      download(path: string): Promise<ClientResult<Blob | null>>
      remove(paths: string[]): Promise<ClientResult>
    }
  }
}

type SupabaseClientFactory = (
  url: string,
  key: string,
  options: Record<string, unknown>,
) => CommerceUploadUserClient & CommerceUploadServiceClient

type AssetRow = Record<string, unknown> & {
  id: string
  project_id: string
  user_id: string
  storage_path: string
  mime_type: 'image/jpeg' | 'image/png' | 'image/webp'
  size_bytes: number
  state: string
}

type ReserveBody = {
  action: 'reserve'
  projectId: string
  fileName: string
  mimeType: AssetRow['mime_type']
  extension: 'jpg' | 'png' | 'webp'
  sizeBytes: number
}

type FinalizeBody = { action: 'finalize'; assetId: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
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

const normalizeMime = (value: unknown): ReserveBody['mimeType'] | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'image/jpeg' || normalized === 'image/png' || normalized === 'image/webp') {
    return normalized
  }
  return null
}

const parseBody = (value: unknown): ReserveBody | FinalizeBody | null => {
  if (!isRecord(value) || typeof value.action !== 'string') return null
  if (value.action === 'reserve') {
    if (!hasExactKeys(value, ['action', 'projectId', 'fileName', 'mimeType', 'sizeBytes'])) return null
    if (typeof value.projectId !== 'string' || !UUID_PATTERN.test(value.projectId)) return null
    if (typeof value.fileName !== 'string') return null
    const fileName = value.fileName.trim()
    if (!fileName || fileName.length > 255) return null
    const mimeType = normalizeMime(value.mimeType)
    if (!mimeType) return null
    if (!Number.isSafeInteger(value.sizeBytes) || Number(value.sizeBytes) < 1 || Number(value.sizeBytes) > MAX_IMAGE_BYTES) {
      return null
    }
    return {
      action: 'reserve',
      projectId: value.projectId,
      fileName,
      mimeType,
      extension: mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length) as 'png' | 'webp',
      sizeBytes: Number(value.sizeBytes),
    }
  }
  if (value.action === 'finalize') {
    if (!hasExactKeys(value, ['action', 'assetId'])) return null
    if (typeof value.assetId !== 'string' || !UUID_PATTERN.test(value.assetId)) return null
    return { action: 'finalize', assetId: value.assetId }
  }
  return null
}

const assetRow = (data: unknown): AssetRow | null => {
  const candidate = Array.isArray(data) ? data[0] : data
  if (!isRecord(candidate)) return null
  const mimeType = normalizeMime(candidate.mime_type)
  const sizeBytes = typeof candidate.size_bytes === 'number'
    ? candidate.size_bytes
    : typeof candidate.size_bytes === 'string'
      ? Number(candidate.size_bytes)
      : NaN
  if (
    typeof candidate.id !== 'string' || !UUID_PATTERN.test(candidate.id)
    || typeof candidate.project_id !== 'string' || !UUID_PATTERN.test(candidate.project_id)
    || typeof candidate.user_id !== 'string' || !UUID_PATTERN.test(candidate.user_id)
    || typeof candidate.storage_path !== 'string' || !candidate.storage_path
    || !mimeType || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1
    || typeof candidate.state !== 'string'
  ) return null
  return { ...candidate, mime_type: mimeType, size_bytes: sizeBytes } as AssetRow
}

const includesBytes = (bytes: Uint8Array, needle: number[]) => {
  outer: for (let offset = 0; offset <= bytes.length - needle.length; offset += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      const byte = bytes[offset + index]
      const lowered = byte >= 0x41 && byte <= 0x5a ? byte + 0x20 : byte
      if (lowered !== needle[index]) continue outer
    }
    return true
  }
  return false
}

const containsActiveMarkup = (bytes: Uint8Array) => [
  [0x3c, 0x73, 0x76, 0x67], // <svg
  [0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74], // <script
  [0x3c, 0x68, 0x74, 0x6d, 0x6c], // <html
  [0x3c, 0x21, 0x64, 0x6f, 0x63, 0x74, 0x79, 0x70, 0x65], // <!doctype
].some((needle) => includesBytes(bytes, needle))

export const detectImageMime = (bytes: Uint8Array): AssetRow['mime_type'] | null => {
  if (containsActiveMarkup(bytes)) return null
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length >= png.length && png.every((byte, index) => bytes[index] === byte)) {
    return 'image/png'
  }
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp'
  return null
}

const reserveError = (error: unknown) => {
  const value = isRecord(error) ? error : {}
  const code = typeof value.code === 'string' ? value.code : ''
  const message = typeof value.message === 'string' ? value.message.toLowerCase() : ''
  if (code === '28000' || code === '42501') {
    return { status: 401, code: 'AUTH_REQUIRED', message: '请登录后再上传图片。' }
  }
  if (code === '54000' || /image limit/.test(message)) {
    return { status: 409, code: 'IMAGE_LIMIT_REACHED', message: '该项目的图片数量已达上限。' }
  }
  if (code === '55000') {
    return { status: 409, code: 'ASSET_STATE_CONFLICT', message: '项目图片正在处理中，请稍后重试。' }
  }
  if (code === '22023' || code === 'P0002') {
    return { status: 400, code: 'VALIDATION_ERROR', message: '项目或图片参数无效。' }
  }
  return { status: 500, code: 'SERVICE_ERROR', message: '上传服务暂时不可用，请稍后重试。' }
}

const safeLog = (
  logError: (stage: string, context: Record<string, string>) => void,
  stage: string,
  assetId: string,
  userId: string,
) => {
  try {
    logError(stage, { assetId, userId })
  } catch {
    // Logging must never alter upload cleanup behavior.
  }
}

const failAsset = async (
  serviceClient: CommerceUploadServiceClient,
  logError: (stage: string, context: Record<string, string>) => void,
  assetId: string,
  userId: string,
) => {
  try {
    const result = await serviceClient.rpc('fail_commerce_asset_upload', {
      p_asset_id: assetId,
      p_user_id: userId,
    })
    if (result.error || result.data !== true) safeLog(logError, 'fail-asset', assetId, userId)
  } catch {
    safeLog(logError, 'fail-asset', assetId, userId)
  }
}

export const createCommerceUploadHandler = (dependencies: {
  allowedOrigins: ReadonlySet<string>
  createUserClient(authorization: string): CommerceUploadUserClient | Promise<CommerceUploadUserClient>
  serviceClient: CommerceUploadServiceClient
  logError?: (stage: string, context: Record<string, string>) => void
}) => async (request: Request): Promise<Response> => {
  const logError = dependencies.logError ?? ((stage, context) => console.error({ stage, ...context }))
  const cors = corsForRequest(request, dependencies.allowedOrigins)
  if (!cors.allowed) {
    return errorResponse(403, 'ORIGIN_FORBIDDEN', '该请求来源不被允许。', cors.headers)
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors.headers })
  if (request.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', '仅支持 POST 请求。', cors.headers)
  }

  const token = bearerFrom(request)
  if (!token) return errorResponse(401, 'AUTH_REQUIRED', '请登录后再上传图片。', cors.headers)

  let client: CommerceUploadUserClient
  try {
    client = await dependencies.createUserClient(`Bearer ${token}`)
  } catch {
    return errorResponse(500, 'SERVICE_ERROR', '上传服务暂时不可用，请稍后重试。', cors.headers)
  }
  const auth = await client.auth.getUser(token).catch(() => ({ data: { user: null }, error: true }))
  const user = auth.data.user
  if (auth.error || !user || user.is_anonymous) {
    return errorResponse(401, 'AUTH_REQUIRED', '请登录后再上传图片。', cors.headers)
  }

  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return errorResponse(400, 'VALIDATION_ERROR', '请求内容格式无效。', cors.headers)
  }
  const body = parseBody(parsed)
  if (!body) return errorResponse(400, 'VALIDATION_ERROR', '上传请求参数无效。', cors.headers)

  if (body.action === 'reserve') {
    let reservation: RpcResult
    try {
      reservation = await client.rpc('reserve_commerce_asset', {
        p_project_id: body.projectId,
        p_extension: body.extension,
        p_mime_type: body.mimeType,
        p_size_bytes: body.sizeBytes,
      })
    } catch {
      return errorResponse(500, 'SERVICE_ERROR', '上传服务暂时不可用，请稍后重试。', cors.headers)
    }
    if (reservation.error) {
      const mapped = reserveError(reservation.error)
      return errorResponse(mapped.status, mapped.code, mapped.message, cors.headers)
    }
    const asset = assetRow(reservation.data)
    if (!asset || asset.user_id !== user.id || asset.project_id !== body.projectId || asset.state !== 'uploading') {
      return errorResponse(500, 'SERVICE_ERROR', '上传服务暂时不可用，请稍后重试。', cors.headers)
    }

    try {
      const signed = await dependencies.serviceClient.storage
        .from('commerce-assets')
        .createSignedUploadUrl(asset.storage_path)
      const signedData = isRecord(signed.data) ? signed.data : {}
      const uploadToken = typeof signedData.token === 'string' ? signedData.token : ''
      if (signed.error || !uploadToken) throw new Error('signed upload unavailable')
      return jsonResponse({ asset, path: asset.storage_path, token: uploadToken }, 200, cors.headers)
    } catch {
      await failAsset(dependencies.serviceClient, logError, asset.id, user.id)
      return errorResponse(500, 'SERVICE_ERROR', '上传凭证创建失败，请重试。', cors.headers)
    }
  }

  let ownedResult: ClientResult
  try {
    ownedResult = await client
      .from('commerce_project_assets')
      .select(ASSET_COLUMNS)
      .eq('id', body.assetId)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .maybeSingle()
  } catch {
    ownedResult = { data: null, error: true }
  }
  const ownedAsset = assetRow(ownedResult.data)
  if (ownedResult.error || !ownedAsset || ownedAsset.id !== body.assetId || ownedAsset.user_id !== user.id) {
    return errorResponse(404, 'ASSET_NOT_FOUND', '找不到可完成的上传。', cors.headers)
  }
  if (ownedAsset.state === 'ready') return jsonResponse({ asset: ownedAsset }, 200, cors.headers)
  if (ownedAsset.state !== 'uploading') {
    return errorResponse(409, 'ASSET_STATE_CONFLICT', '该上传当前无法完成。', cors.headers)
  }

  let invalid = false
  let bytes: Uint8Array | null = null
  try {
    const download = await dependencies.serviceClient.storage.from('commerce-assets').download(ownedAsset.storage_path)
    if (download.error || !download.data || typeof download.data.arrayBuffer !== 'function') {
      invalid = true
    } else if (download.data.size > MAX_IMAGE_BYTES || download.data.size !== ownedAsset.size_bytes) {
      invalid = true
    } else {
      bytes = new Uint8Array(await download.data.arrayBuffer())
    }
  } catch {
    invalid = true
  }

  const actualMime = bytes ? detectImageMime(bytes) : null
  if (
    invalid || !bytes || bytes.byteLength > MAX_IMAGE_BYTES
    || bytes.byteLength !== ownedAsset.size_bytes
    || !actualMime || actualMime !== ownedAsset.mime_type
  ) {
    try {
      const removal = await dependencies.serviceClient.storage.from('commerce-assets').remove([ownedAsset.storage_path])
      if (removal.error) safeLog(logError, 'remove-object', ownedAsset.id, user.id)
    } catch {
      safeLog(logError, 'remove-object', ownedAsset.id, user.id)
    }
    await failAsset(dependencies.serviceClient, logError, ownedAsset.id, user.id)
    return errorResponse(422, 'UPLOAD_INVALID', '图片内容校验失败，请重新上传。', cors.headers)
  }

  let finalized: RpcResult
  try {
    finalized = await dependencies.serviceClient.rpc('finalize_commerce_asset_upload', {
      p_asset_id: ownedAsset.id,
      p_user_id: user.id,
      p_actual_mime_type: actualMime,
      p_actual_size_bytes: bytes.byteLength,
    })
  } catch {
    return errorResponse(500, 'SERVICE_ERROR', '上传暂时无法完成，请稍后重试。', cors.headers)
  }
  const readyAsset = assetRow(finalized.data)
  if (finalized.error || !readyAsset || readyAsset.id !== ownedAsset.id || readyAsset.user_id !== user.id || readyAsset.state !== 'ready') {
    return errorResponse(500, 'SERVICE_ERROR', '上传暂时无法完成，请稍后重试。', cors.headers)
  }
  return jsonResponse({ asset: readyAsset }, 200, cors.headers)
}

export const createProductionCommerceUploadHandler = (dependencies: {
  getEnv(name: string): string | undefined
  createClient: SupabaseClientFactory
}) => {
  const url = dependencies.getEnv('SUPABASE_URL')?.trim()
  const publishableKey = resolveSupabaseRuntimeKey(dependencies.getEnv, 'publishable')
  const secretKey = resolveSupabaseRuntimeKey(dependencies.getEnv, 'secret')
  if (!url || !publishableKey || !secretKey) {
    throw new Error('Supabase Edge runtime is not configured')
  }

  // Bootstrap the privileged dependency before accepting traffic. A missing or invalid
  // secret therefore cannot leave reservations behind without a signer/finalizer.
  const serviceClient = dependencies.createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

  return createCommerceUploadHandler({
    allowedOrigins: parseAllowedOrigins(dependencies.getEnv('ALLOWED_ORIGINS')),
    createUserClient: (authorization) => dependencies.createClient(url, publishableKey, {
      global: { headers: { authorization } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }),
    serviceClient,
  })
}
