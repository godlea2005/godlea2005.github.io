import { test as nodeTest } from 'node:test'
import {
  createCommerceUploadHandler,
  createProductionCommerceUploadHandler,
  detectImageMime,
  type CommerceUploadServiceClient,
  type CommerceUploadUserClient,
} from '../_shared/commerce-upload-runtime.ts'

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

const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const ASSET_ID = '33333333-3333-4333-8333-333333333333'
const STORAGE_PATH = `${USER_ID}/${PROJECT_ID}/${ASSET_ID}.jpg`
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0x01])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])

const uploadingAsset = (overrides: Record<string, unknown> = {}) => ({
  id: ASSET_ID,
  project_id: PROJECT_ID,
  user_id: USER_ID,
  storage_path: STORAGE_PATH,
  mime_type: 'image/jpeg',
  size_bytes: JPEG.byteLength,
  expires_at: '2026-09-07T00:00:00.000Z',
  state: 'uploading',
  deleted_at: null,
  created_at: '2026-08-31T00:00:00.000Z',
  ...overrides,
})

const request = (body: unknown, init: RequestInit = {}) => new Request('https://function.invalid/commerce-upload', {
  method: 'POST',
  headers: {
    origin: 'https://geniusli.cn',
    authorization: 'Bearer user-token',
    'content-type': 'application/json',
    ...(init.headers ?? {}),
  },
  body: JSON.stringify(body),
  ...init,
})

type HarnessOptions = {
  userResult?: { data: { user: { id: string; is_anonymous?: boolean } | null }; error: unknown }
  ownedAsset?: Record<string, unknown> | null
  selectError?: unknown
  reserveResult?: { data: unknown; error: unknown }
  signedResult?: { data: unknown; error: unknown }
  downloadResult?: { data: Blob | null; error: unknown }
  finalizeResult?: { data: unknown; error: unknown }
  failResult?: { data: unknown; error: unknown }
  removeResult?: { data: unknown; error: unknown }
}

const createHarness = (options: HarnessOptions = {}) => {
  const events: string[] = []
  const userRpcCalls: Array<{ name: string; parameters: Record<string, unknown> }> = []
  const serviceRpcCalls: Array<{ name: string; parameters: Record<string, unknown> }> = []
  const storagePaths: string[] = []
  const selected = options.ownedAsset === undefined ? uploadingAsset() : options.ownedAsset

  const userClient: CommerceUploadUserClient = {
    auth: {
      getUser: async () => options.userResult ?? {
        data: { user: { id: USER_ID, is_anonymous: false } },
        error: null,
      },
    },
    rpc: async (name, parameters) => {
      events.push(`user-rpc:${name}`)
      userRpcCalls.push({ name, parameters })
      return options.reserveResult ?? { data: [uploadingAsset()], error: null }
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => {
                events.push('owned-select')
                return { data: selected, error: options.selectError ?? null }
              },
            }),
          }),
        }),
      }),
    }),
  }

  const serviceClient: CommerceUploadServiceClient = {
    rpc: async (name, parameters) => {
      events.push(`service-rpc:${name}`)
      serviceRpcCalls.push({ name, parameters })
      if (name === 'fail_commerce_asset_upload') {
        return options.failResult ?? { data: true, error: null }
      }
      return options.finalizeResult ?? {
        data: [{ ...uploadingAsset(), state: 'ready' }],
        error: null,
      }
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => {
          events.push('signed-upload')
          storagePaths.push(path)
          return options.signedResult ?? { data: { token: 'signed-upload-token' }, error: null }
        },
        download: async (path: string) => {
          events.push('download')
          storagePaths.push(path)
          return options.downloadResult ?? { data: new Blob([JPEG]), error: null }
        },
        remove: async (paths: string[]) => {
          events.push('remove')
          storagePaths.push(...paths)
          return options.removeResult ?? { data: [], error: null }
        },
      }),
    },
  }

  return {
    events,
    userRpcCalls,
    serviceRpcCalls,
    storagePaths,
    handler: createCommerceUploadHandler({
      allowedOrigins: new Set(['https://geniusli.cn']),
      createUserClient: () => userClient,
      serviceClient,
      logError: () => events.push('safe-log'),
    }),
  }
}

test('detectImageMime recognizes only trusted JPEG, PNG, and WebP signatures', () => {
  assertEquals(detectImageMime(JPEG), 'image/jpeg')
  assertEquals(detectImageMime(PNG), 'image/png')
  assertEquals(detectImageMime(WEBP), 'image/webp')
  assertEquals(detectImageMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')), null)
  assertEquals(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e])), null)
  assertEquals(detectImageMime(new Uint8Array([...JPEG, ...new TextEncoder().encode('<svg></svg>')])), null)
})

test('handler rejects missing, invalid, and anonymous authentication with safe 401 errors', async () => {
  const missing = createHarness()
  const missingResponse = await missing.handler(request({ action: 'finalize', assetId: ASSET_ID }, {
    headers: { origin: 'https://geniusli.cn', 'content-type': 'application/json' },
  }))
  assertEquals(missingResponse.status, 401)

  for (const userResult of [
    { data: { user: null }, error: new Error('provider token detail') },
    { data: { user: { id: USER_ID, is_anonymous: true } }, error: null },
  ]) {
    const harness = createHarness({ userResult })
    const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
    assertEquals(response.status, 401)
    assert(!JSON.stringify(await response.json()).includes('provider token detail'))
  }
})

test('handler rejects invalid actions, malformed bodies, and caller-supplied paths with 400', async () => {
  const harness = createHarness()
  const invalidBodies = [
    { action: 'unknown' },
    { action: 'reserve', projectId: 'bad', fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 4 },
    { action: 'reserve', projectId: PROJECT_ID, fileName: 'a.jpg', mimeType: 'image/gif', sizeBytes: 4 },
    { action: 'reserve', projectId: PROJECT_ID, fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 0 },
    { action: 'reserve', projectId: PROJECT_ID, fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 4, path: 'attacker/path.jpg' },
    { action: 'finalize', assetId: 'bad' },
  ]
  for (const body of invalidBodies) {
    assertEquals((await harness.handler(request(body))).status, 400)
  }
  assertEquals((await harness.handler(request({}, { body: '{' }))).status, 400)
  assertEquals(harness.userRpcCalls, [])
})

test('reserve derives normalized MIME and extension, and signs only the RPC storage_path', async () => {
  const harness = createHarness()
  const response = await harness.handler(request({
    action: 'reserve',
    projectId: PROJECT_ID,
    fileName: 'misleading.svg',
    mimeType: ' IMAGE/JPEG ',
    sizeBytes: JPEG.byteLength,
  }))
  assertEquals(response.status, 200)
  assertEquals(harness.userRpcCalls, [{
    name: 'reserve_commerce_asset',
    parameters: {
      p_project_id: PROJECT_ID,
      p_extension: 'jpg',
      p_mime_type: 'image/jpeg',
      p_size_bytes: JPEG.byteLength,
    },
  }])
  assertEquals(harness.storagePaths, [STORAGE_PATH])
  assertEquals(await response.json(), {
    asset: uploadingAsset(),
    path: STORAGE_PATH,
    token: 'signed-upload-token',
  })
})

test('reserve marks the row failed when signed token creation fails and hides internals', async () => {
  const harness = createHarness({
    signedResult: { data: null, error: new Error('storage endpoint and secret internals') },
  })
  const response = await harness.handler(request({
    action: 'reserve',
    projectId: PROJECT_ID,
    fileName: 'a.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: JPEG.byteLength,
  }))
  assertEquals(response.status, 500)
  assertEquals(harness.serviceRpcCalls, [{
    name: 'fail_commerce_asset_upload',
    parameters: { p_asset_id: ASSET_ID, p_user_id: USER_ID },
  }])
  assert(!JSON.stringify(await response.json()).includes('storage endpoint'))
})

test('finalize checks ownership and never downloads an absent or foreign asset', async () => {
  const harness = createHarness({
    ownedAsset: null,
    selectError: new Error('database relation internals'),
  })
  const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
  assertEquals(response.status, 404)
  assert(!harness.events.includes('download'))
  assert(!JSON.stringify(await response.json()).includes('database relation'))
})

test('repeated finalize returns an owned ready asset without another download or RPC', async () => {
  const ready = uploadingAsset({ state: 'ready' })
  const harness = createHarness({ ownedAsset: ready })
  const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
  assertEquals(response.status, 200)
  assertEquals(await response.json(), { asset: ready })
  assert(!harness.events.includes('download'))
  assertEquals(harness.serviceRpcCalls, [])
})

test('finalize validates actual bytes and calls the exact service RPC once', async () => {
  const harness = createHarness()
  const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
  assertEquals(response.status, 200)
  assertEquals(harness.events, ['owned-select', 'download', 'service-rpc:finalize_commerce_asset_upload'])
  assertEquals(harness.serviceRpcCalls, [{
    name: 'finalize_commerce_asset_upload',
    parameters: {
      p_asset_id: ASSET_ID,
      p_user_id: USER_ID,
      p_actual_mime_type: 'image/jpeg',
      p_actual_size_bytes: JPEG.byteLength,
    },
  }])
  assertEquals(await response.json(), { asset: { ...uploadingAsset(), state: 'ready' } })
})

test('invalid finalize objects are removed before the asset is marked failed', async () => {
  const oversized = new Uint8Array(8_388_609)
  oversized.set(JPEG)
  const invalidCases: Array<{ name: string; asset?: Record<string, unknown>; download: { data: Blob | null; error: unknown } }> = [
    { name: 'missing object', download: { data: null, error: new Error('bucket name detail') } },
    { name: 'size mismatch', asset: uploadingAsset({ size_bytes: 5 }), download: { data: new Blob([JPEG]), error: null } },
    { name: 'MIME mismatch', asset: uploadingAsset({ mime_type: 'image/jpeg', size_bytes: PNG.byteLength, storage_path: STORAGE_PATH }), download: { data: new Blob([PNG]), error: null } },
    { name: 'bad PNG magic', asset: uploadingAsset({ mime_type: 'image/png' }), download: { data: new Blob([new Uint8Array(JPEG.byteLength)]), error: null } },
    { name: 'bad JPEG magic', download: { data: new Blob([new Uint8Array(JPEG.byteLength)]), error: null } },
    { name: 'bad WebP magic', asset: uploadingAsset({ mime_type: 'image/webp' }), download: { data: new Blob([new Uint8Array(JPEG.byteLength)]), error: null } },
    { name: 'SVG polyglot', asset: uploadingAsset({ size_bytes: JPEG.byteLength + 11 }), download: { data: new Blob([JPEG, '<svg></svg>']), error: null } },
    { name: 'oversize object', asset: uploadingAsset({ size_bytes: oversized.byteLength }), download: { data: new Blob([oversized]), error: null } },
  ]

  for (const invalidCase of invalidCases) {
    const harness = createHarness({ ownedAsset: invalidCase.asset, downloadResult: invalidCase.download })
    const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
    assertEquals(response.status, 422, invalidCase.name)
    const removeIndex = harness.events.indexOf('remove')
    const failIndex = harness.events.indexOf('service-rpc:fail_commerce_asset_upload')
    assert(removeIndex >= 0 && failIndex > removeIndex, invalidCase.name)
    assert(!JSON.stringify(await response.json()).includes('bucket name detail'))
  }
})

test('cleanup failures are logged safely but do not expose internals or skip fail RPC', async () => {
  const harness = createHarness({
    downloadResult: { data: null, error: new Error('download provider internals') },
    removeResult: { data: null, error: new Error('remove provider internals') },
    failResult: { data: null, error: new Error('RPC provider internals') },
  })
  const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
  const publicBody = JSON.stringify(await response.json())
  assertEquals(response.status, 422)
  assert(harness.events.includes('safe-log'))
  assert(harness.events.includes('service-rpc:fail_commerce_asset_upload'))
  assert(!/provider internals/i.test(publicBody))
})

test('production bootstrap uses new-key priority and fails closed without a secret client', () => {
  const env: Record<string, string> = {
    SUPABASE_URL: 'https://project.invalid',
    SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'publishable-new' }),
    SUPABASE_PUBLISHABLE_KEY: 'publishable-single',
    SUPABASE_ANON_KEY: 'publishable-legacy',
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'secret-new' }),
    SUPABASE_SECRET_KEY: 'secret-single',
    SUPABASE_SERVICE_ROLE_KEY: 'secret-legacy',
  }
  const keys: string[] = []
  const client = createHarness()
  createProductionCommerceUploadHandler({
    getEnv: (name) => env[name],
    createClient: (_url, key) => {
      keys.push(key)
      return key.startsWith('secret')
        ? ({} as CommerceUploadServiceClient)
        : ({} as CommerceUploadUserClient)
    },
  })
  assertEquals(keys, ['secret-new'])

  let serviceBootstrapThrew = false
  try {
    createProductionCommerceUploadHandler({
      getEnv: (name) => env[name],
      createClient: (_url, key) => {
        if (key === 'secret-new') throw new Error('secret client cannot initialize')
        return client as never
      },
    })
  } catch {
    serviceBootstrapThrew = true
  }
  assert(serviceBootstrapThrew)

  let factoryCalls = 0
  let threw = false
  try {
    createProductionCommerceUploadHandler({
      getEnv: (name) => name === 'SUPABASE_URL' ? env.SUPABASE_URL : undefined,
      createClient: () => { factoryCalls += 1; return client as never },
    })
  } catch {
    threw = true
  }
  assert(threw)
  assertEquals(factoryCalls, 0)
})
