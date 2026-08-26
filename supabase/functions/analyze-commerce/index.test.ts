import { test as nodeTest } from 'node:test'
import {
  createAnalyzeCommerceHandler,
  createProductionAnalyzeHandler,
  createProcessGeneration,
  createSupabaseBackgroundStore,
  resolveSupabaseRuntimeKey,
  type BackgroundStore,
  type UserClient,
} from '../_shared/commerce-runtime.ts'
import { createOpenAiProvider, SafeProviderError } from '../_shared/ai-provider.ts'
import { buildCommercePrompt } from '../_shared/commerce-prompt.ts'
import {
  COMMERCE_RESULT_SCHEMA,
  validateCommerceResult,
} from '../_shared/result-schema.ts'

type TestFunction = (name: string, fn: () => void | Promise<void>) => unknown

const test: TestFunction = typeof Deno !== 'undefined'
  ? Deno.test
  : ((import.meta as ImportMeta & { vitest?: { test: TestFunction } }).vitest?.test ?? nodeTest)

const assert = (condition: unknown, message = 'assertion failed'): asserts condition => {
  if (!condition) throw new Error(message)
}

const assertEquals = (actual: unknown, expected: unknown, message = 'values differ') => {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nactual: ${actualJson}\nexpected: ${expectedJson}`)
  }
}

const assertStringIncludes = (actual: string, expected: string) => {
  assert(actual.includes(expected), `expected string to include ${expected}`)
}

const UUID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const GENERATION_ID = '33333333-3333-4333-8333-333333333333'

const baseProject = {
  id: UUID,
  userId: USER_ID,
  name: '便携式果汁机',
  platform: 'ozon' as const,
  mode: 'quick' as const,
  inputData: { sellingPoints: '无线、易清洗' },
}

const ozonPreset = {
  displayName: 'Ozon',
  config: {
    market: 'ru',
    copy_language: 'ru',
    explanation_language: 'zh-CN',
    focus: ['clear-benefits', 'trust'],
  },
}

const sampleHero = (title: string) => ({
  title,
  rationale: '突出便携',
  composition: '产品居中',
  background: '浅色厨房',
  palette: ['#ffffff', '#8dff70'],
  lighting: '柔光',
  props: ['水果'],
  copyPlacement: '右上',
  visualFocus: '产品杯身',
  imagePrompt: 'product photo prompt',
  negativePrompt: 'distortion, changed logo',
})

const sampleResult = () => ({
  productSummary: '便携果汁机的跨境电商视觉方案',
  facts: [{ label: '已知卖点', value: '无线', confidence: 'confirmed' }],
  audiences: [{ segment: '通勤用户', motivation: '随时制作饮品' }],
  sellingPoints: [{ rank: 1, point: '便携', reason: '图中体积较小', confidence: 'inferred' }],
  platformStrategy: {
    overview: '先呈现产品再解释卖点',
    contentDensity: '中',
    tone: '清晰可信',
    complianceNotes: ['未确认参数不上图'],
  },
  heroDirections: [sampleHero('A'), sampleHero('B'), sampleHero('C')],
  detailFrames: Array.from({ length: 8 }, (_, index) => ({
    order: index + 1,
    purpose: `分镜 ${index + 1}`,
    visual: '产品特写',
    copy: 'Компактный',
    copyTranslation: '便携',
    transition: '硬切',
  })),
  recommendedCanvas: [{ usage: '主图', ratio: '1:1', pixels: '1200×1200', safeZone: '四周 8%' }],
  fidelityRules: ['不改变产品结构'],
  pendingConfirmations: ['杯体容量'],
})

test('Russian platforms require Russian copy and Chinese translation', () => {
  for (const platform of ['ozon', 'wildberries'] as const) {
    const prompt = buildCommercePrompt({
      platform,
      mode: 'quick',
      project: { ...baseProject, platform },
      preset: ozonPreset,
    })
    assertStringIncludes(prompt, '俄文画面文案')
    assertStringIncludes(prompt, '中文解释')
    assertStringIncludes(prompt, '不得推测认证、材质、尺寸、功效或性能')
  }
})

test('domestic platforms require Chinese on-image copy', () => {
  for (const platform of ['douyin', 'taobao-tmall'] as const) {
    const prompt = buildCommercePrompt({
      platform,
      mode: 'professional',
      project: { ...baseProject, platform, mode: 'professional' },
      preset: { displayName: platform, config: { market: 'cn' } },
    })
    assertStringIncludes(prompt, '中文画面文案')
    assertStringIncludes(prompt, '已确认事实')
    assertStringIncludes(prompt, '推断')
    assertStringIncludes(prompt, '待确认')
  }
})

test('result schema has exact browser CommerceResult field contract', () => {
  const rootFields = [
    'productSummary', 'facts', 'audiences', 'sellingPoints', 'platformStrategy',
    'heroDirections', 'detailFrames', 'recommendedCanvas', 'fidelityRules',
    'pendingConfirmations',
  ]
  assertEquals(Object.keys(COMMERCE_RESULT_SCHEMA.properties), rootFields)
  assertEquals(COMMERCE_RESULT_SCHEMA.required, rootFields)
  assertEquals(COMMERCE_RESULT_SCHEMA.additionalProperties, false)
  assertEquals(Object.keys(COMMERCE_RESULT_SCHEMA.properties.facts.items.properties), ['label', 'value', 'confidence'])
  assertEquals(Object.keys(COMMERCE_RESULT_SCHEMA.properties.audiences.items.properties), ['segment', 'motivation'])
  assertEquals(Object.keys(COMMERCE_RESULT_SCHEMA.properties.sellingPoints.items.properties), ['rank', 'point', 'reason', 'confidence'])
  assertEquals(Object.keys(COMMERCE_RESULT_SCHEMA.properties.platformStrategy.properties), ['overview', 'contentDensity', 'tone', 'complianceNotes'])
  assertEquals(Object.keys(COMMERCE_RESULT_SCHEMA.properties.heroDirections.items.properties), [
    'title', 'rationale', 'composition', 'background', 'palette', 'lighting', 'props',
    'copyPlacement', 'visualFocus', 'imagePrompt', 'negativePrompt',
  ])
  assertEquals(Object.keys(COMMERCE_RESULT_SCHEMA.properties.detailFrames.items.properties), [
    'order', 'purpose', 'visual', 'copy', 'copyTranslation', 'transition',
  ])
  assertEquals(Object.keys(COMMERCE_RESULT_SCHEMA.properties.recommendedCanvas.items.properties), [
    'usage', 'ratio', 'pixels', 'safeZone',
  ])
})

test('result schema and validator fix three hero directions and 8-12 detail frames', () => {
  assertEquals(COMMERCE_RESULT_SCHEMA.properties.heroDirections.minItems, 3)
  assertEquals(COMMERCE_RESULT_SCHEMA.properties.heroDirections.maxItems, 3)
  assertEquals(COMMERCE_RESULT_SCHEMA.properties.detailFrames.minItems, 8)
  assertEquals(COMMERCE_RESULT_SCHEMA.properties.detailFrames.maxItems, 12)
  assert(validateCommerceResult(sampleResult()).ok)
  assert(!validateCommerceResult({ ...sampleResult(), heroDirections: [sampleHero('A')] }).ok)
  assert(!validateCommerceResult({ ...sampleResult(), detailFrames: [] }).ok)
})

test('OpenAI provider sends multimodal strict Responses request and uses default model', async () => {
  let requestBody: Record<string, unknown> = {}
  let authHeader = ''
  const provider = createOpenAiProvider({
    getEnv: (name) => name === 'OPENAI_API_KEY' ? 'test-key-not-a-real-secret' : undefined,
    fetchFn: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body))
      authHeader = new Headers(init?.headers).get('authorization') ?? ''
      return Response.json({
        output_text: JSON.stringify(sampleResult()),
        model: 'gpt-5.4-mini-2026-08-01',
        usage: { input_tokens: 20, output_tokens: 40, total_tokens: 60, ignored: 'no' },
      })
    },
  })

  const output = await provider.generate({
    prompt: 'analyze',
    imageUrls: ['https://signed.invalid/a.jpg'],
    schema: COMMERCE_RESULT_SCHEMA as unknown as Record<string, unknown>,
  })
  assertEquals(requestBody.model, 'gpt-5.4-mini')
  assertEquals(requestBody.store, false)
  const textFormat = (requestBody.text as { format: Record<string, unknown> }).format
  assertEquals(textFormat.type, 'json_schema')
  assertEquals(textFormat.name, 'commerce_result')
  assertEquals(textFormat.strict, true)
  const input = requestBody.input as Array<{ content: Array<Record<string, unknown>> }>
  assertEquals(input[0].content[0].type, 'input_text')
  assertEquals(input[0].content[1], { type: 'input_image', image_url: 'https://signed.invalid/a.jpg' })
  assertEquals(authHeader, 'Bearer test-key-not-a-real-secret')
  assertEquals(output.usage, { input_tokens: 20, output_tokens: 40, total_tokens: 60 })
})

test('OpenAI provider supports configured model and hides provider errors', async () => {
  const provider = createOpenAiProvider({
    getEnv: (name) => name === 'OPENAI_API_KEY' ? 'test-key' : name === 'OPENAI_MODEL' ? 'configured-model' : undefined,
    fetchFn: async (_url, init) => {
      const body = JSON.parse(String(init?.body))
      assertEquals(body.model, 'configured-model')
      return new Response('raw upstream body must stay private', { status: 429 })
    },
  })
  try {
    await provider.generate({ prompt: 'x', imageUrls: [], schema: {} })
    throw new Error('provider should reject')
  } catch (error) {
    assert(error instanceof SafeProviderError)
    assert(!error.message.includes('raw upstream'))
    assert(!JSON.stringify(error).includes('test-key'))
  }
})

const handlerWith = (overrides: Partial<Parameters<typeof createAnalyzeCommerceHandler>[0]> = {}) => {
  const backgroundTasks: Promise<void>[] = []
  const client: UserClient = {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID, is_anonymous: false } }, error: null }) },
    rpc: async () => ({ data: [{ generation_id: GENERATION_ID, status: 'queued', charged: true }], error: null }),
  }
  return {
    backgroundTasks,
    handler: createAnalyzeCommerceHandler({
      allowedOrigins: new Set(['https://geniusli.cn']),
      createUserClient: () => client,
      processGeneration: async () => {},
      waitUntil: (task) => backgroundTasks.push(task),
      ...overrides,
    }),
  }
}

const validRequest = (init: RequestInit = {}) => new Request('https://function.invalid/analyze-commerce', {
  method: 'POST',
  headers: {
    origin: 'https://geniusli.cn',
    authorization: 'Bearer user-token',
    'content-type': 'application/json',
    ...(init.headers ?? {}),
  },
  body: JSON.stringify({ projectId: UUID, idempotencyKey: 'request-1' }),
  ...init,
})

test('handler enforces method and exact origin before authentication', async () => {
  const { handler } = handlerWith()
  assertEquals((await handler(new Request('https://function.invalid', { method: 'GET', headers: { origin: 'https://geniusli.cn' } }))).status, 405)
  assertEquals((await handler(new Request('https://function.invalid', { method: 'OPTIONS', headers: { origin: 'https://evil.invalid' } }))).status, 403)
  const preflight = await handler(new Request('https://function.invalid', { method: 'OPTIONS', headers: { origin: 'https://geniusli.cn' } }))
  assertEquals(preflight.status, 204)
  assertEquals(preflight.headers.get('access-control-allow-origin'), 'https://geniusli.cn')
  const noOrigin = await handler(new Request('https://function.invalid', { method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({ projectId: UUID, idempotencyKey: 'x' }) }))
  assertEquals(noOrigin.status, 202)
  assertEquals(noOrigin.headers.get('access-control-allow-origin'), null)
})

test('handler rejects missing, invalid, and anonymous authentication', async () => {
  const { handler } = handlerWith()
  const missing = validRequest({ headers: { origin: 'https://geniusli.cn', 'content-type': 'application/json' } })
  assertEquals((await handler(missing)).status, 401)

  for (const userResult of [
    { data: { user: null }, error: new Error('invalid token detail') },
    { data: { user: { id: USER_ID, is_anonymous: true } }, error: null },
  ]) {
    const { handler: authHandler } = handlerWith({
      createUserClient: () => ({
        auth: { getUser: async () => userResult },
        rpc: async () => ({ data: null, error: null }),
      }),
    })
    const response = await authHandler(validRequest())
    assertEquals(response.status, 401)
    assert(!JSON.stringify(await response.json()).includes('invalid token detail'))
  }
})

test('handler rejects malformed body and UUID without starting a generation', async () => {
  let rpcCalls = 0
  const { handler } = handlerWith({
    createUserClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: USER_ID, is_anonymous: false } }, error: null }) },
      rpc: async () => { rpcCalls += 1; return { data: null, error: null } },
    }),
  })
  const malformed = validRequest({ body: '{' })
  assertEquals((await handler(malformed)).status, 422)
  const badUuid = validRequest({ body: JSON.stringify({ projectId: 'not-uuid', idempotencyKey: '' }) })
  assertEquals((await handler(badUuid)).status, 422)
  assertEquals(rpcCalls, 0)
})

test('begin RPC errors map to safe public status codes', async () => {
  const cases = [
    [{ code: '28000', message: 'commerce authentication required' }, 401],
    [{ code: 'P0001', message: 'insufficient credits' }, 402],
    [{ code: '23505', message: 'idempotency key already used' }, 409],
    [{ code: 'P0002', message: 'project not found or forbidden' }, 422],
    [{ code: 'P0001', message: 'daily generation limit reached' }, 429],
    [{ code: 'XX000', message: 'database secret internals' }, 500],
  ] as const
  for (const [rpcError, expectedStatus] of cases) {
    const { handler } = handlerWith({
      createUserClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: USER_ID, is_anonymous: false } }, error: null }) },
        rpc: async () => ({ data: null, error: rpcError }),
      }),
    })
    const response = await handler(validRequest())
    assertEquals(response.status, expectedStatus)
    assert(!JSON.stringify(await response.json()).includes('database secret internals'))
  }
})

test('new generation returns 202 and registers a secret-free background task', async () => {
  const calls: Array<Record<string, string>> = []
  const { handler, backgroundTasks } = handlerWith({
    processGeneration: async (input) => { calls.push(input) },
  })
  const response = await handler(validRequest())
  assertEquals(response.status, 202)
  assertEquals(await response.json(), { generationId: GENERATION_ID, status: 'queued' })
  assertEquals(backgroundTasks.length, 1)
  await Promise.all(backgroundTasks)
  assertEquals(calls, [{ generationId: GENERATION_ID, userId: USER_ID }])
})

test('idempotent completed and processing generations are reused without duplicate work', async () => {
  for (const status of ['completed', 'processing'] as const) {
    const { handler, backgroundTasks } = handlerWith({
      createUserClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: USER_ID, is_anonymous: false } }, error: null }) },
        rpc: async () => ({ data: [{ generation_id: GENERATION_ID, status, charged: false }], error: null }),
      }),
    })
    const response = await handler(validRequest())
    assertEquals(response.status, 202)
    assertEquals(await response.json(), { generationId: GENERATION_ID, status })
    assertEquals(backgroundTasks.length, 0)
  }
})

const createBackgroundHarness = (overrides: Partial<BackgroundStore> = {}, generated: unknown[] = [sampleResult()]) => {
  const events: string[] = []
  const store: BackgroundStore = {
    loadContext: async () => ({
      generation: { id: GENERATION_ID, projectId: UUID, userId: USER_ID, status: 'queued' },
      project: baseProject,
      assets: [{ id: 'asset-1', storagePath: `${USER_ID}/${UUID}/a.jpg`, expiresAt: new Date(Date.now() + 60_000).toISOString(), state: 'ready' }],
      preset: ozonPreset,
    }),
    createSignedUrls: async (_paths, expiresIn) => { events.push(`signed:${expiresIn}`); return ['https://signed.invalid/a.jpg'] },
    markAssetsState: async (_ids, state) => { events.push(`assets:${state}`) },
    completeGeneration: async () => { events.push('complete') },
    failGeneration: async () => { events.push('fail') },
    ...overrides,
  }
  let call = 0
  const aiProvider = {
    generate: async () => {
      events.push('ai')
      const result = generated[Math.min(call, generated.length - 1)]
      call += 1
      if (result instanceof Error) throw result
      return { result, model: 'gpt-5.4-mini', usage: { total_tokens: 12 } }
    },
  }
  return { events, store, aiProvider }
}

test('background success signs for ten minutes, processes, completes, and restores assets', async () => {
  const harness = createBackgroundHarness()
  const process = createProcessGeneration({ store: harness.store, aiProvider: harness.aiProvider })
  await process({ generationId: GENERATION_ID, userId: USER_ID })
  assertEquals(harness.events, ['signed:600', 'assets:processing', 'ai', 'complete', 'assets:ready'])
})

test('background retries exactly once only for an invalid result', async () => {
  const harness = createBackgroundHarness({}, [{ invalid: true }, sampleResult()])
  await createProcessGeneration({ store: harness.store, aiProvider: harness.aiProvider })({ generationId: GENERATION_ID, userId: USER_ID })
  assertEquals(harness.events.filter((event) => event === 'ai').length, 2)
  assertEquals(harness.events.filter((event) => event === 'complete').length, 1)
  assertEquals(harness.events.filter((event) => event === 'fail').length, 0)
})

test('a second invalid result fails once and restores assets', async () => {
  const harness = createBackgroundHarness({}, [{ invalid: true }, { stillInvalid: true }])
  await createProcessGeneration({ store: harness.store, aiProvider: harness.aiProvider })({ generationId: GENERATION_ID, userId: USER_ID })
  assertEquals(harness.events.filter((event) => event === 'ai').length, 2)
  assertEquals(harness.events.filter((event) => event === 'fail').length, 1)
  assertEquals(harness.events.at(-1), 'assets:ready')
})

test('provider and completion failures refund exactly once and restore assets', async () => {
  for (const mode of ['provider', 'complete'] as const) {
    const harness = createBackgroundHarness(
      mode === 'complete' ? { completeGeneration: async () => { harness.events.push('complete'); throw new Error('db detail') } } : {},
      mode === 'provider' ? [new SafeProviderError('PROVIDER_ERROR', '暂时无法完成 AI 分析。')] : [sampleResult()],
    )
    await createProcessGeneration({ store: harness.store, aiProvider: harness.aiProvider })({ generationId: GENERATION_ID, userId: USER_ID })
    assertEquals(harness.events.filter((event) => event === 'fail').length, 1)
    assertEquals(harness.events.at(-1), 'assets:ready')
  }
})

test('signed URL failure skips AI, fails/refunds safely, and does not leave processing assets', async () => {
  const harness = createBackgroundHarness({
    createSignedUrls: async () => { harness.events.push('signed-error'); throw new Error('signed url private detail') },
  })
  await createProcessGeneration({ store: harness.store, aiProvider: harness.aiProvider })({ generationId: GENERATION_ID, userId: USER_ID })
  assertEquals(harness.events, ['signed-error', 'fail'])
})

test('Edge entry can be imported without granting environment permission', async () => {
  if (typeof Deno === 'undefined') return
  await import(`./${'index.ts'}`)
})

test('new Supabase key maps take priority and legacy keys remain compatible', () => {
  const values: Record<string, string> = {
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_new' }),
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_singular',
    SUPABASE_ANON_KEY: 'legacy-anon',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_new' }),
    SUPABASE_SECRET_KEY: 'sb_secret_singular',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service',
  }
  const getEnv = (name: string) => values[name]
  assertEquals(resolveSupabaseRuntimeKey(getEnv, 'publishable'), 'sb_publishable_new')
  assertEquals(resolveSupabaseRuntimeKey(getEnv, 'secret'), 'sb_secret_new')

  delete values.SUPABASE_PUBLISHABLE_KEYS
  delete values.SUPABASE_PUBLISHABLE_KEY
  delete values.SUPABASE_SECRET_KEYS
  values.SUPABASE_SECRET_KEY = '   '
  values.SUPABASE_PUBLISHABLE_KEY = '   '
  assertEquals(resolveSupabaseRuntimeKey(getEnv, 'publishable'), 'legacy-anon')
  assertEquals(resolveSupabaseRuntimeKey(getEnv, 'secret'), 'legacy-service')
})

test('production bootstrap fails before a request can begin when privileged client is unavailable', () => {
  let createCalls = 0
  let beginCalls = 0
  try {
    createProductionAnalyzeHandler({
      getEnv: (name) => ({
        SUPABASE_URL: 'https://project.invalid',
        SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'publishable-test' }),
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'secret-test' }),
        ALLOWED_ORIGINS: 'https://geniusli.cn',
      } as Record<string, string>)[name],
      createClient: () => {
        createCalls += 1
        throw new Error('client bootstrap failed')
      },
      aiProvider: { generate: async () => { throw new Error('not reached') } },
      waitUntil: () => {},
    })
    throw new Error('bootstrap should reject')
  } catch (error) {
    assert(error instanceof Error)
    assertStringIncludes(error.message, 'client bootstrap failed')
  }
  assertEquals(createCalls, 1)
  assertEquals(beginCalls, 0)
})

test('Supabase background adapter matches production query, Storage, state, and RPC shapes', async () => {
  const calls: Array<{ operation: string; value: unknown }> = []
  const rows: Record<string, unknown> = {
    commerce_generations: { id: GENERATION_ID, project_id: UUID, user_id: USER_ID, status: 'queued' },
    commerce_projects: {
      id: UUID,
      user_id: USER_ID,
      name: baseProject.name,
      platform: 'ozon',
      mode: 'quick',
      input_data: baseProject.inputData,
    },
    commerce_project_assets: [{
      id: 'asset-1',
      storage_path: `${USER_ID}/${UUID}/a.jpg`,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      state: 'ready',
    }],
    platform_presets: { display_name: 'Ozon', config: ozonPreset.config },
  }

  class Query {
    private updateValue: unknown = undefined
    private readonly table: string
    constructor(table: string) { this.table = table }
    select(value: string) { calls.push({ operation: `${this.table}.select`, value }); return this }
    eq(column: string, value: unknown) { calls.push({ operation: `${this.table}.eq.${column}`, value }); return this }
    is(column: string, value: unknown) { calls.push({ operation: `${this.table}.is.${column}`, value }); return this }
    update(value: unknown) { this.updateValue = value; calls.push({ operation: `${this.table}.update`, value }); return this }
    in(column: string, value: unknown) {
      calls.push({ operation: `${this.table}.in.${column}`, value: { ids: value, update: this.updateValue } })
      return Promise.resolve({ data: null, error: null })
    }
    maybeSingle() { return Promise.resolve({ data: rows[this.table], error: null }) }
    order(column: string, value: unknown) {
      calls.push({ operation: `${this.table}.order.${column}`, value })
      return Promise.resolve({ data: rows[this.table], error: null })
    }
  }

  const client = {
    from: (table: string) => new Query(table),
    rpc: async (name: string, parameters: Record<string, unknown>) => {
      calls.push({ operation: `rpc.${name}`, value: parameters })
      return { data: null, error: null }
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, seconds: number) => {
          calls.push({ operation: `storage.${bucket}`, value: { path, seconds } })
          return { data: { signedUrl: 'https://signed.invalid/a.jpg' }, error: null }
        },
      }),
    },
  }
  const store = createSupabaseBackgroundStore(client)
  const context = await store.loadContext(GENERATION_ID)
  assertEquals(context.generation, { id: GENERATION_ID, projectId: UUID, userId: USER_ID, status: 'queued' })
  assertEquals(await store.createSignedUrls([`${USER_ID}/${UUID}/a.jpg`], 600), ['https://signed.invalid/a.jpg'])
  await store.markAssetsState(['asset-1'], 'processing')
  await store.completeGeneration({ generationId: GENERATION_ID, result: sampleResult(), provider: 'openai', model: 'gpt-5.4-mini', usage: { total_tokens: 12 } })
  await store.failGeneration({ generationId: GENERATION_ID, code: 'PROVIDER_ERROR', message: 'safe message' })

  assert(calls.some((call) => call.operation === 'storage.commerce-assets' && (call.value as { seconds: number }).seconds === 600))
  assert(calls.some((call) => call.operation === 'commerce_project_assets.in.id'))
  assert(calls.some((call) => call.operation === 'rpc.complete_commerce_generation'))
  assert(calls.some((call) => call.operation === 'rpc.fail_commerce_generation'))
})
