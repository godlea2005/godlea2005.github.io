import { resolveSupabaseRuntimeKey } from './commerce-runtime.ts'
import { corsForRequest, parseAllowedOrigins } from './cors.ts'

const MAX_IMAGE_BYTES = 8_388_608
export const MAX_IMAGE_PIXELS = 16_777_216
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ASSET_COLUMNS = 'id,project_id,user_id,storage_path,mime_type,size_bytes,expires_at,state,validation_attempt_id,validation_started_at,deleted_at,created_at'

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

export type TrustedImageMime = AssetRow['mime_type']
export type TrustedImageDimensions = { width: number; height: number }
export type TrustedImageDecoder = (
  bytes: Uint8Array,
  mimeType: TrustedImageMime,
) => Promise<TrustedImageDimensions>

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

const readU16Be = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] << 8) | bytes[offset + 1]

const readU32Be = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0

const readU32Le = (bytes: Uint8Array, offset: number) =>
  (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] * 0x1000000)) >>> 0

const bytesEqual = (bytes: Uint8Array, offset: number, expected: number[]) =>
  offset + expected.length <= bytes.length
  && expected.every((byte, index) => bytes[offset + index] === byte)

const validJpeg = (bytes: Uint8Array) => {
  if (!bytesEqual(bytes, 0, [0xff, 0xd8])) return false
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2
  let sawFrame = false
  let sawScan = false

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return false
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) return false
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9) return sawFrame && sawScan && offset === bytes.length
    if (marker === 0xd8 || marker === 0x00) return false
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) return false
    const segmentLength = readU16Be(bytes, offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return false
    const dataOffset = offset + 2
    const dataLength = segmentLength - 2

    if (frameMarkers.has(marker)) {
      if (dataLength < 6) return false
      const componentCount = bytes[dataOffset + 5]
      if (
        componentCount < 1 || componentCount > 4
        || segmentLength !== 8 + (3 * componentCount)
        || readU16Be(bytes, dataOffset + 1) === 0
        || readU16Be(bytes, dataOffset + 3) === 0
      ) return false
      sawFrame = true
    }

    offset += segmentLength
    if (marker !== 0xda) continue
    if (!sawFrame || dataLength < 4) return false
    const scanComponents = bytes[dataOffset]
    if (scanComponents < 1 || segmentLength !== 6 + (2 * scanComponents)) return false
    sawScan = true

    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1
        continue
      }
      if (offset + 1 >= bytes.length) return false
      const following = bytes[offset + 1]
      if (following === 0x00 || (following >= 0xd0 && following <= 0xd7)) {
        offset += 2
        continue
      }
      if (following === 0xff) {
        offset += 1
        continue
      }
      break
    }
  }
  return false
}

const crc32 = (bytes: Uint8Array, start: number, end: number) => {
  let crc = 0xffffffff
  for (let offset = start; offset < end; offset += 1) {
    crc ^= bytes[offset]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

const pngType = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])

const validPng = (bytes: Uint8Array) => {
  if (!bytesEqual(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return false
  const validDepths: Record<number, number[]> = {
    0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16],
  }
  let offset = 8
  let chunkIndex = 0
  let sawIdat = false

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return false
    const length = readU32Be(bytes, offset)
    const typeOffset = offset + 4
    const dataOffset = typeOffset + 4
    const dataEnd = dataOffset + length
    const chunkEnd = dataEnd + 4
    if (dataEnd < dataOffset || chunkEnd > bytes.length) return false
    const type = pngType(bytes, typeOffset)
    if (!/^[A-Za-z]{4}$/.test(type)) return false
    if (crc32(bytes, typeOffset, dataEnd) !== readU32Be(bytes, dataEnd)) return false

    if (chunkIndex === 0) {
      if (type !== 'IHDR' || length !== 13) return false
      const bitDepth = bytes[dataOffset + 8]
      const colorType = bytes[dataOffset + 9]
      if (
        readU32Be(bytes, dataOffset) === 0 || readU32Be(bytes, dataOffset + 4) === 0
        || !validDepths[colorType]?.includes(bitDepth)
        || bytes[dataOffset + 10] !== 0 || bytes[dataOffset + 11] !== 0
        || bytes[dataOffset + 12] > 1
      ) return false
    } else if (type === 'IHDR') {
      return false
    }

    if (type === 'IDAT') sawIdat = true
    if (type === 'IEND') return length === 0 && sawIdat && chunkEnd === bytes.length
    if ((bytes[typeOffset] & 0x20) === 0 && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type)) return false
    offset = chunkEnd
    chunkIndex += 1
  }
  return false
}

const webpType = (bytes: Uint8Array, offset: number) =>
  String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])

const validVp8 = (bytes: Uint8Array, offset: number, length: number) => length >= 11
  && bytesEqual(bytes, offset + 3, [0x9d, 0x01, 0x2a])
  && ((bytes[offset + 6] | (bytes[offset + 7] << 8)) & 0x3fff) > 0
  && ((bytes[offset + 8] | (bytes[offset + 9] << 8)) & 0x3fff) > 0

const validVp8l = (bytes: Uint8Array, offset: number, length: number) =>
  length >= 6 && bytes[offset] === 0x2f

const validVp8x = (bytes: Uint8Array, offset: number, length: number) => length === 10
  && (bytes[offset] & 0xc1) === 0
  && bytes[offset + 1] === 0 && bytes[offset + 2] === 0 && bytes[offset + 3] === 0

const validWebp = (bytes: Uint8Array) => {
  if (
    bytes.length < 20
    || !bytesEqual(bytes, 0, [0x52, 0x49, 0x46, 0x46])
    || !bytesEqual(bytes, 8, [0x57, 0x45, 0x42, 0x50])
    || readU32Le(bytes, 4) + 8 !== bytes.length
  ) return false
  let offset = 12
  let firstType = ''
  let sawImageData = false

  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false
    const type = webpType(bytes, offset)
    const length = readU32Le(bytes, offset + 4)
    const dataOffset = offset + 8
    const dataEnd = dataOffset + length
    const paddedEnd = dataEnd + (length & 1)
    if (!/^[A-Z0-9 ]{4}$/.test(type) || dataEnd < dataOffset || paddedEnd > bytes.length) return false
    if (!firstType) {
      firstType = type
      if (!['VP8 ', 'VP8L', 'VP8X'].includes(type)) return false
    }
    if (type === 'VP8 ') {
      if (!validVp8(bytes, dataOffset, length)) return false
      sawImageData = true
    } else if (type === 'VP8L') {
      if (!validVp8l(bytes, dataOffset, length)) return false
      sawImageData = true
    } else if (type === 'VP8X' && !validVp8x(bytes, dataOffset, length)) {
      return false
    } else if (type === 'ANMF') {
      if (length < 16) return false
      sawImageData = true
    }
    if ((length & 1) && bytes[dataEnd] !== 0) return false
    offset = paddedEnd
  }
  return offset === bytes.length && sawImageData
}

export const detectImageMime = (bytes: Uint8Array): AssetRow['mime_type'] | null => {
  if (validJpeg(bytes)) return 'image/jpeg'
  if (validPng(bytes)) return 'image/png'
  if (validWebp(bytes)) return 'image/webp'
  return null
}

const jpegDimensions = (bytes: Uint8Array): TrustedImageDimensions | null => {
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.length) return null
    const marker = bytes[offset++]
    if (marker === 0xd9 || marker === 0xda) return null
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > bytes.length) return null
    const length = readU16Be(bytes, offset)
    if (length < 2 || offset + length > bytes.length) return null
    if (frameMarkers.has(marker)) {
      return { width: readU16Be(bytes, offset + 5), height: readU16Be(bytes, offset + 3) }
    }
    offset += length
  }
  return null
}

const webpDimensions = (bytes: Uint8Array): TrustedImageDimensions | null => {
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = webpType(bytes, offset)
    const length = readU32Le(bytes, offset + 4)
    const dataOffset = offset + 8
    if (type === 'VP8 ' && length >= 10) {
      return {
        width: (bytes[dataOffset + 6] | (bytes[dataOffset + 7] << 8)) & 0x3fff,
        height: (bytes[dataOffset + 8] | (bytes[dataOffset + 9] << 8)) & 0x3fff,
      }
    }
    if (type === 'VP8L' && length >= 5) {
      const bits = readU32Le(bytes, dataOffset + 1)
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    if (type === 'VP8X' && length === 10) {
      return {
        width: bytes[dataOffset + 4] + (bytes[dataOffset + 5] << 8) + (bytes[dataOffset + 6] << 16) + 1,
        height: bytes[dataOffset + 7] + (bytes[dataOffset + 8] << 8) + (bytes[dataOffset + 9] << 16) + 1,
      }
    }
    offset = dataOffset + length + (length & 1)
  }
  return null
}

const containerDimensions = (
  bytes: Uint8Array,
  mimeType: TrustedImageMime,
): TrustedImageDimensions | null => {
  if (mimeType === 'image/jpeg') return jpegDimensions(bytes)
  if (mimeType === 'image/png') return bytes.length >= 24
    ? { width: readU32Be(bytes, 16), height: readU32Be(bytes, 20) }
    : null
  return webpDimensions(bytes)
}

const dimensionsAreSafe = (
  dimensions: TrustedImageDimensions | null,
): dimensions is TrustedImageDimensions => !!dimensions
  && Number.isSafeInteger(dimensions.width)
  && Number.isSafeInteger(dimensions.height)
  && dimensions.width > 0
  && dimensions.height > 0
  && dimensions.width * dimensions.height <= MAX_IMAGE_PIXELS

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

const rpcBoolean = (data: unknown) => data === true
  || (Array.isArray(data) && data[0] === true)
  || (isRecord(data) && (data.claimed === true || data.released === true || data.failed === true))

const claimValidation = async (
  serviceClient: CommerceUploadServiceClient,
  logError: (stage: string, context: Record<string, string>) => void,
  assetId: string,
  userId: string,
  attemptId: string,
) => {
  try {
    const result = await serviceClient.rpc('claim_commerce_asset_upload_validation', {
      p_asset_id: assetId,
      p_user_id: userId,
      p_attempt_id: attemptId,
    })
    if (result.error) {
      safeLog(logError, 'claim-validation', assetId, userId)
      return false
    }
    return rpcBoolean(result.data)
  } catch {
    safeLog(logError, 'claim-validation', assetId, userId)
    return false
  }
}

const releaseValidation = async (
  serviceClient: CommerceUploadServiceClient,
  logError: (stage: string, context: Record<string, string>) => void,
  assetId: string,
  userId: string,
  attemptId: string,
) => {
  try {
    const result = await serviceClient.rpc('release_commerce_asset_upload_validation', {
      p_asset_id: assetId,
      p_user_id: userId,
      p_attempt_id: attemptId,
    })
    if (result.error || !rpcBoolean(result.data)) {
      safeLog(logError, 'release-validation', assetId, userId)
      return false
    }
    return true
  } catch {
    safeLog(logError, 'release-validation', assetId, userId)
    return false
  }
}

const removeAndFailClaimedAsset = async (
  serviceClient: CommerceUploadServiceClient,
  logError: (stage: string, context: Record<string, string>) => void,
  asset: AssetRow,
  userId: string,
  attemptId: string,
) => {
  try {
    const removal = await serviceClient.storage.from('commerce-assets').remove([asset.storage_path])
    if (removal.error) throw new Error('storage removal failed')
  } catch {
    safeLog(logError, 'remove-object', asset.id, userId)
    await releaseValidation(serviceClient, logError, asset.id, userId, attemptId)
    return false
  }

  try {
    const result = await serviceClient.rpc('fail_commerce_asset_upload', {
      p_asset_id: asset.id,
      p_user_id: userId,
      p_attempt_id: attemptId,
    })
    if (result.error || !rpcBoolean(result.data)) throw new Error('asset failure transition failed')
    return true
  } catch {
    safeLog(logError, 'fail-asset', asset.id, userId)
    await releaseValidation(serviceClient, logError, asset.id, userId, attemptId)
    return false
  }
}

export const cleanupAbandonedCommerceUpload = async (dependencies: {
  serviceClient: CommerceUploadServiceClient
  assetId: string
  cutoff: string
  attemptId: string
  logError?: (stage: string, context: Record<string, string>) => void
}): Promise<'cleaned' | 'not_claimed' | 'retry'> => {
  const logError = dependencies.logError ?? (() => {})
  if (
    !UUID_PATTERN.test(dependencies.assetId)
    || !UUID_PATTERN.test(dependencies.attemptId)
    || !Number.isFinite(Date.parse(dependencies.cutoff))
  ) return 'retry'

  let takeover: RpcResult
  try {
    takeover = await dependencies.serviceClient.rpc('takeover_abandoned_commerce_asset_upload', {
      p_asset_id: dependencies.assetId,
      p_cutoff: dependencies.cutoff,
      p_attempt_id: dependencies.attemptId,
    })
  } catch {
    return 'retry'
  }
  if (takeover.error) return 'retry'
  if (Array.isArray(takeover.data) && takeover.data.length === 0) return 'not_claimed'
  const asset = assetRow(takeover.data)
  if (
    !asset || asset.id !== dependencies.assetId || asset.state !== 'validating'
    || asset.validation_attempt_id !== dependencies.attemptId
  ) return 'retry'

  return await removeAndFailClaimedAsset(
    dependencies.serviceClient,
    logError,
    asset,
    asset.user_id,
    dependencies.attemptId,
  ) ? 'cleaned' : 'retry'
}

export const createCommerceUploadHandler = (dependencies: {
  allowedOrigins: ReadonlySet<string>
  createUserClient(authorization: string): CommerceUploadUserClient | Promise<CommerceUploadUserClient>
  serviceClient: CommerceUploadServiceClient
  logError?: (stage: string, context: Record<string, string>) => void
  createAttemptId?: () => string
  decodeImage: TrustedImageDecoder
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
      const attemptId = (dependencies.createAttemptId ?? (() => crypto.randomUUID()))()
      if (UUID_PATTERN.test(attemptId)) {
        const claimed = await claimValidation(
          dependencies.serviceClient, logError, asset.id, user.id, attemptId,
        )
        if (claimed) {
          await removeAndFailClaimedAsset(
            dependencies.serviceClient, logError, asset, user.id, attemptId,
          )
        }
      }
      return errorResponse(500, 'SERVICE_ERROR', '上传凭证创建失败，请重试。', cors.headers)
    }
  }

  const loadOwnedAsset = async (): Promise<AssetRow | null> => {
    try {
      const result: ClientResult = await client
        .from('commerce_project_assets')
        .select(ASSET_COLUMNS)
        .eq('id', body.assetId)
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (result.error) return null
      const asset = assetRow(result.data)
      return asset?.id === body.assetId && asset.user_id === user.id ? asset : null
    } catch {
      return null
    }
  }

  const ownedAsset = await loadOwnedAsset()
  if (!ownedAsset) {
    return errorResponse(404, 'ASSET_NOT_FOUND', '找不到可完成的上传。', cors.headers)
  }
  if (ownedAsset.state === 'ready') return jsonResponse({ asset: ownedAsset }, 200, cors.headers)
  if (ownedAsset.state !== 'uploading') {
    return errorResponse(409, 'ASSET_STATE_CONFLICT', '该上传当前无法完成。', cors.headers)
  }

  const attemptId = (dependencies.createAttemptId ?? (() => crypto.randomUUID()))()
  if (!UUID_PATTERN.test(attemptId)) {
    return errorResponse(500, 'SERVICE_ERROR', '上传暂时无法完成，请稍后重试。', cors.headers)
  }
  const claimed = await claimValidation(
    dependencies.serviceClient, logError, ownedAsset.id, user.id, attemptId,
  )
  if (!claimed) {
    const currentAsset = await loadOwnedAsset()
    if (currentAsset?.state === 'ready') return jsonResponse({ asset: currentAsset }, 200, cors.headers)
    return errorResponse(409, 'ASSET_STATE_CONFLICT', '该上传正在校验，请稍后重试。', cors.headers)
  }

  let invalid = false
  let bytes: Uint8Array | null = null
  let storedMime: AssetRow['mime_type'] | null = null
  try {
    const download = await dependencies.serviceClient.storage.from('commerce-assets').download(ownedAsset.storage_path)
    if (download.error || !download.data || typeof download.data.arrayBuffer !== 'function') {
      invalid = true
    } else if (
      !(storedMime = normalizeMime(download.data.type))
      || storedMime !== ownedAsset.mime_type
      || download.data.size > MAX_IMAGE_BYTES
      || download.data.size !== ownedAsset.size_bytes
    ) {
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
    || !storedMime || !actualMime
    || storedMime !== ownedAsset.mime_type || actualMime !== ownedAsset.mime_type
  ) {
    const failed = await removeAndFailClaimedAsset(
      dependencies.serviceClient, logError, ownedAsset, user.id, attemptId,
    )
    return failed
      ? errorResponse(422, 'UPLOAD_INVALID', '图片内容校验失败，请重新上传。', cors.headers)
      : errorResponse(503, 'UPLOAD_RETRY_REQUIRED', '图片清理暂未完成，请稍后重试。', cors.headers)
  }

  const expectedDimensions = containerDimensions(bytes, actualMime)
  let decodedDimensions: TrustedImageDimensions | null = null
  if (dimensionsAreSafe(expectedDimensions)) {
    try {
      decodedDimensions = await dependencies.decodeImage(bytes, actualMime)
    } catch {
      decodedDimensions = null
    }
  }
  if (
    !dimensionsAreSafe(expectedDimensions)
    || !dimensionsAreSafe(decodedDimensions)
    || decodedDimensions.width !== expectedDimensions.width
    || decodedDimensions.height !== expectedDimensions.height
  ) {
    const failed = await removeAndFailClaimedAsset(
      dependencies.serviceClient, logError, ownedAsset, user.id, attemptId,
    )
    return failed
      ? errorResponse(422, 'UPLOAD_INVALID', '图片内容校验失败，请重新上传。', cors.headers)
      : errorResponse(503, 'UPLOAD_RETRY_REQUIRED', '图片清理暂未完成，请稍后重试。', cors.headers)
  }

  let finalized: RpcResult
  try {
    finalized = await dependencies.serviceClient.rpc('finalize_commerce_asset_upload', {
      p_asset_id: ownedAsset.id,
      p_user_id: user.id,
      p_attempt_id: attemptId,
      p_actual_mime_type: actualMime,
      p_actual_size_bytes: bytes.byteLength,
    })
  } catch {
    await releaseValidation(dependencies.serviceClient, logError, ownedAsset.id, user.id, attemptId)
    return errorResponse(503, 'UPLOAD_RETRY_REQUIRED', '上传暂时无法完成，请稍后重试。', cors.headers)
  }
  const readyAsset = assetRow(finalized.data)
  if (finalized.error || !readyAsset || readyAsset.id !== ownedAsset.id || readyAsset.user_id !== user.id || readyAsset.state !== 'ready') {
    await releaseValidation(dependencies.serviceClient, logError, ownedAsset.id, user.id, attemptId)
    return errorResponse(503, 'UPLOAD_RETRY_REQUIRED', '上传暂时无法完成，请稍后重试。', cors.headers)
  }
  return jsonResponse({ asset: readyAsset }, 200, cors.headers)
}

export const createProductionCommerceUploadHandler = (dependencies: {
  getEnv(name: string): string | undefined
  createClient: SupabaseClientFactory
  decodeImage: TrustedImageDecoder
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
    decodeImage: dependencies.decodeImage,
  })
}
