export interface AiProvider {
  generate(input: {
    prompt: string
    imageUrls: string[]
    schema: Record<string, unknown>
  }): Promise<{
    result: unknown
    provider: 'openai' | 'deepseek'
    model: string
    usage: Record<string, number>
  }>
}

export class SafeProviderError extends Error {
  override readonly name = 'SafeProviderError'
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

type ProviderDependencies = {
  fetchFn?: typeof fetch
  getEnv?: (name: string) => string | undefined
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

type ResponsesProviderConfig = {
  provider: 'openai' | 'deepseek'
  endpoint: string
  apiKeyEnv: 'OPENAI_API_KEY' | 'DEEPSEEK_API_KEY'
  modelEnv: 'OPENAI_MODEL' | 'DEEPSEEK_MODEL'
  defaultModel: string
  allowedModels?: ReadonlySet<string>
  includeStore: boolean
  strictSchema: boolean
  reasoning?: { effort: 'none' }
}

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const DEEPSEEK_RESPONSES_URL = 'https://api.deepseek.com/responses'
const DEEPSEEK_VISION_MODEL = 'deepseek-v4-flash-vision-exp'
const DEEPSEEK_MODEL_ALLOWLIST = new Set([DEEPSEEK_VISION_MODEL])

const DEFAULT_TIMEOUT_MS = 60_000
const MIN_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 90_000

const denoEnv = (name: string): string | undefined => {
  const runtime = globalThis as unknown as { Deno?: { env?: { get(name: string): string | undefined } } }
  return runtime.Deno?.env?.get(name)
}

const outputTextFrom = (body: Record<string, unknown>): string | null => {
  if (typeof body.output_text === 'string') return body.output_text
  if (!Array.isArray(body.output)) return null

  for (const output of body.output) {
    if (typeof output !== 'object' || output === null) continue
    const content = (output as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const item of content) {
      if (typeof item !== 'object' || item === null) continue
      const text = (item as { text?: unknown }).text
      if (typeof text === 'string') return text
    }
  }
  return null
}

const numericUsage = (value: unknown): Record<string, number> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] =>
      typeof entry[1] === 'number' && Number.isFinite(entry[1]),
    ),
  )
}

const providerTimeoutMs = (getEnv: (name: string) => string | undefined) => {
  const preferred = getEnv('AI_TIMEOUT_MS')?.trim()
  const raw = preferred || getEnv('OPENAI_TIMEOUT_MS')?.trim()
  const configured = Number(raw)
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_TIMEOUT_MS
  return Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, configured))
}

const timeoutError = () => new SafeProviderError(
  'PROVIDER_TIMEOUT',
  'AI 服务响应超时，请稍后重试。',
)

const notConfiguredError = () => new SafeProviderError(
  'PROVIDER_NOT_CONFIGURED',
  'AI 服务尚未配置。',
)

const createResponsesProvider = (
  config: ResponsesProviderConfig,
  {
    fetchFn = fetch,
    getEnv = denoEnv,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
  }: ProviderDependencies = {},
): AiProvider => ({
  async generate({ prompt, imageUrls, schema }) {
    const apiKey = getEnv(config.apiKeyEnv)?.trim()
    if (!apiKey) throw notConfiguredError()

    const configuredModel = getEnv(config.modelEnv)?.trim()
    const model = configuredModel || config.defaultModel
    if (config.allowedModels && !config.allowedModels.has(model)) throw notConfiguredError()

    const content: Array<Record<string, unknown>> = [
      { type: 'input_text', text: prompt },
      ...imageUrls.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
    ]
    const format: Record<string, unknown> = {
      type: 'json_schema',
      name: 'commerce_result',
      schema,
    }
    if (config.strictSchema) format.strict = true

    const requestBody: Record<string, unknown> = {
      model,
      input: [{ role: 'user', content }],
      text: { format },
    }
    if (config.includeStore) requestBody.store = false
    if (config.reasoning) requestBody.reasoning = config.reasoning

    const controller = new AbortController()
    const timer = setTimeoutFn(() => controller.abort(), providerTimeoutMs(getEnv))
    try {
      let response: Response
      try {
        response = await fetchFn(config.endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        })
      } catch {
        if (controller.signal.aborted) throw timeoutError()
        throw new SafeProviderError('PROVIDER_UNAVAILABLE', 'AI 服务暂时无法连接。')
      }
      if (controller.signal.aborted) throw timeoutError()

      if (!response.ok) {
        throw new SafeProviderError('PROVIDER_ERROR', 'AI 服务暂时无法完成分析。')
      }

      let body: Record<string, unknown>
      try {
        const parsed = await response.json()
        if (controller.signal.aborted) throw timeoutError()
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid response')
        body = parsed as Record<string, unknown>
      } catch (error) {
        if (controller.signal.aborted) throw timeoutError()
        if (error instanceof SafeProviderError) throw error
        throw new SafeProviderError('PROVIDER_RESPONSE_INVALID', 'AI 返回了无法读取的结果。')
      }

      const outputText = outputTextFrom(body)
      if (!outputText) {
        throw new SafeProviderError('PROVIDER_RESPONSE_INVALID', 'AI 返回了无法读取的结果。')
      }

      let result: unknown
      try {
        result = JSON.parse(outputText)
      } catch {
        throw new SafeProviderError('PROVIDER_RESPONSE_INVALID', 'AI 返回了无法读取的结果。')
      }

      return {
        result,
        provider: config.provider,
        model: typeof body.model === 'string' && body.model.trim() ? body.model : model,
        usage: numericUsage(body.usage),
      }
    } finally {
      clearTimeoutFn(timer)
    }
  },
})

export const createOpenAiProvider = (dependencies: ProviderDependencies = {}): AiProvider =>
  createResponsesProvider({
    provider: 'openai',
    endpoint: OPENAI_RESPONSES_URL,
    apiKeyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL',
    defaultModel: 'gpt-5.4-mini',
    includeStore: true,
    strictSchema: true,
  }, dependencies)

export const createDeepSeekProvider = (dependencies: ProviderDependencies = {}): AiProvider =>
  createResponsesProvider({
    provider: 'deepseek',
    endpoint: DEEPSEEK_RESPONSES_URL,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_MODEL',
    defaultModel: DEEPSEEK_VISION_MODEL,
    allowedModels: DEEPSEEK_MODEL_ALLOWLIST,
    includeStore: false,
    strictSchema: false,
    reasoning: { effort: 'none' },
  }, dependencies)

const createUnconfiguredProvider = (): AiProvider => ({
  async generate() {
    throw notConfiguredError()
  },
})

export const createAiProvider = (dependencies: ProviderDependencies = {}): AiProvider => {
  const getEnv = dependencies.getEnv ?? denoEnv
  const provider = getEnv('AI_PROVIDER')?.trim().toLowerCase()
  if (provider === 'openai') return createOpenAiProvider({ ...dependencies, getEnv })
  if (provider === 'deepseek') return createDeepSeekProvider({ ...dependencies, getEnv })
  return createUnconfiguredProvider()
}
