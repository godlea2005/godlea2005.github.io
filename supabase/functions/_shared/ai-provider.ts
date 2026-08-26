export interface AiProvider {
  generate(input: {
    prompt: string
    imageUrls: string[]
    schema: Record<string, unknown>
  }): Promise<{ result: unknown; model: string; usage: Record<string, number> }>
}

export class SafeProviderError extends Error {
  readonly name = 'SafeProviderError'
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

type ProviderDependencies = {
  fetchFn?: typeof fetch
  getEnv?: (name: string) => string | undefined
}

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

export const createOpenAiProvider = ({
  fetchFn = fetch,
  getEnv = denoEnv,
}: ProviderDependencies = {}): AiProvider => ({
  async generate({ prompt, imageUrls, schema }) {
    const apiKey = getEnv('OPENAI_API_KEY')?.trim()
    if (!apiKey) {
      throw new SafeProviderError('PROVIDER_NOT_CONFIGURED', 'AI 服务尚未配置。')
    }
    const configuredModel = getEnv('OPENAI_MODEL')?.trim()
    const model = configuredModel || 'gpt-5.4-mini'

    const content: Array<Record<string, unknown>> = [
      { type: 'input_text', text: prompt },
      ...imageUrls.map((imageUrl) => ({ type: 'input_image', image_url: imageUrl })),
    ]

    let response: Response
    try {
      response = await fetchFn('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          store: false,
          input: [{ role: 'user', content }],
          text: {
            format: {
              type: 'json_schema',
              name: 'commerce_result',
              strict: true,
              schema,
            },
          },
        }),
      })
    } catch {
      throw new SafeProviderError('PROVIDER_UNAVAILABLE', 'AI 服务暂时无法连接。')
    }

    if (!response.ok) {
      throw new SafeProviderError('PROVIDER_ERROR', 'AI 服务暂时无法完成分析。')
    }

    let body: Record<string, unknown>
    try {
      const parsed = await response.json()
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('invalid response')
      body = parsed as Record<string, unknown>
    } catch {
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
      model: typeof body.model === 'string' && body.model.trim() ? body.model : model,
      usage: numericUsage(body.usage),
    }
  },
})
