type DatabaseRow = Record<string, unknown>

export type CommerceErrorCode =
  | 'AUTH_REQUIRED'
  | 'ORIGIN_FORBIDDEN'
  | 'CREDITS_EXHAUSTED'
  | 'RATE_LIMITED'
  | 'ASSETS_EXPIRED'
  | 'UPLOAD_INVALID'
  | 'UPLOAD_RETRY_REQUIRED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'SERVICE_ERROR'

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
const asString = (value: unknown): string => typeof value === 'string' ? value : ''
const asNumber = (value: unknown): number => typeof value === 'number' ? value : 0

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

const messages: Record<CommerceErrorCode, string> = {
  AUTH_REQUIRED: '登录状态需要恢复，请重新连接账户后继续。',
  ORIGIN_FORBIDDEN: '站点来源配置不允许此请求，请检查部署配置后重试。',
  CREDITS_EXHAUSTED: '可用次数不足，请稍后获取额度后再试。',
  RATE_LIMITED: '请求过于频繁，请稍后再试。',
  ASSETS_EXPIRED: '图片已过期，请重新上传后再试。',
  UPLOAD_INVALID: '图片内容校验失败，请重新上传。',
  UPLOAD_RETRY_REQUIRED: '上传暂时无法完成，请稍后重试。',
  VALIDATION: '请求参数或当前状态不符合要求，请检查后重试。',
  NETWORK: '网络或服务暂时不可用，请检查连接后重试。',
  SERVICE_ERROR: '服务权限或配置异常，请稍后重试。',
}

const mappedCode = (code: CommerceErrorCode, cause: unknown) =>
  new CommerceRepositoryError(code, messages[code], cause)

const isTransportError = (error: unknown) => {
  if (error instanceof TypeError) return true
  const record = asRecord(error)
  const name = asString(record.name)
  return name === 'FunctionsFetchError'
    || name === 'FunctionsRelayError'
    || name === 'StorageUnknownError'
    || name === 'AbortError'
    || (name === 'StorageError' && !asNumber(record.status) && record.originalError instanceof TypeError)
}

/** Converts backend and transport failures to copy that tells a workspace user what to do next. */
export const mapCommerceError = (error: unknown): CommerceRepositoryError => {
  if (error instanceof CommerceRepositoryError) return error

  const { code, message, status } = errorDetails(error)
  const normalized = `${code} ${message}`.toLowerCase()

  if (code === 'AUTH_REQUIRED') return mappedCode('AUTH_REQUIRED', error)
  if (code === 'ORIGIN_FORBIDDEN') return mappedCode('ORIGIN_FORBIDDEN', error)
  if (code === 'UPLOAD_INVALID') return mappedCode('UPLOAD_INVALID', error)
  if (code === 'UPLOAD_RETRY_REQUIRED') return mappedCode('UPLOAD_RETRY_REQUIRED', error)
  if (code === 'CREDITS_EXHAUSTED' || code === 'INSUFFICIENT_CREDITS') return mappedCode('CREDITS_EXHAUSTED', error)
  if (code === 'RATE_LIMITED' || code === 'DAILY_LIMIT_REACHED') return mappedCode('RATE_LIMITED', error)
  if (code === 'ASSETS_EXPIRED') return mappedCode('ASSETS_EXPIRED', error)

  if (code === '28000') return mappedCode('AUTH_REQUIRED', error)
  if (code === '42501') return mappedCode('SERVICE_ERROR', error)
  if (code === '55000' && /project has an active generation|active generation/.test(normalized)) {
    return new CommerceRepositoryError('VALIDATION', '项目仍在生成中，请等待任务完成或终止后再删除。', error)
  }
  if (code === '55000' || code === '22023' || code === 'P0002') return mappedCode('VALIDATION', error)

  if (status === 401) return mappedCode('AUTH_REQUIRED', error)
  if (status === 402 || /insufficient[ _-]credits|credits?[ _-]exhausted|次数不足|余额不足/.test(normalized)) {
    return mappedCode('CREDITS_EXHAUSTED', error)
  }
  if (status === 429 || /daily generation limit|rate limit|too many|频率|限流/.test(normalized)) {
    return mappedCode('RATE_LIMITED', error)
  }
  if (status === 410 || /expired|expires|过期/.test(normalized)) return mappedCode('ASSETS_EXPIRED', error)
  if (status >= 400) return mappedCode('SERVICE_ERROR', error)
  if (isTransportError(error) || /network|fetch failed|failed to fetch/.test(normalized)) {
    return mappedCode('NETWORK', error)
  }
  return mappedCode('SERVICE_ERROR', error)
}

export const mapFunctionInvokeError = async (error: unknown): Promise<CommerceRepositoryError> => {
  const mapped = mapCommerceError(await responseErrorDetails(error))
  return new CommerceRepositoryError(mapped.code, mapped.message, error)
}

export const isCommerceAuthError = (error: unknown) =>
  error instanceof CommerceRepositoryError && error.code === 'AUTH_REQUIRED'
