import { test as nodeTest } from 'node:test'
import {
  createCommerceUploadHandler,
  createProductionCommerceUploadHandler,
  cleanupAbandonedCommerceUpload,
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
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444'
const STORAGE_PATH = `${USER_ID}/${PROJECT_ID}/${ASSET_ID}.jpg`

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0))

// Real 1x1 image containers, not magic-only test doubles.
const JPEG = fromBase64('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7LooooA//2Q==')
const PNG = fromBase64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
const WEBP = fromBase64('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=')

const webpContainer = (type: string, payload: Uint8Array) => {
  const paddedLength = payload.byteLength + (payload.byteLength & 1)
  const bytes = new Uint8Array(20 + paddedLength)
  bytes.set(new TextEncoder().encode('RIFF'), 0)
  new DataView(bytes.buffer).setUint32(4, bytes.byteLength - 8, true)
  bytes.set(new TextEncoder().encode('WEBP'), 8)
  bytes.set(new TextEncoder().encode(type), 12)
  new DataView(bytes.buffer).setUint32(16, payload.byteLength, true)
  bytes.set(payload, 20)
  return bytes
}

const pngChunk = (type: string, payload: Uint8Array) => {
  const result = new Uint8Array(12 + payload.byteLength)
  const view = new DataView(result.buffer)
  view.setUint32(0, payload.byteLength)
  result.set(new TextEncoder().encode(type), 4)
  result.set(payload, 8)
  let crc = 0xffffffff
  for (let offset = 4; offset < 8 + payload.byteLength; offset += 1) {
    crc ^= result[offset]
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  view.setUint32(8 + payload.byteLength, (crc ^ 0xffffffff) >>> 0)
  return result
}

const concatBytes = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.byteLength
  }
  return result
}

const pngWithDimensions = (width: number, height: number, idat = new Uint8Array()) => {
  const ihdr = new Uint8Array(13)
  const view = new DataView(ihdr.buffer)
  view.setUint32(0, width)
  view.setUint32(4, height)
  ihdr.set([8, 6, 0, 0, 0], 8)
  return concatBytes(
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', new Uint8Array()),
  )
}

const EMPTY_ENTROPY_JPEG = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0xff, 0xd9,
])
const EMPTY_IDAT_PNG = pngWithDimensions(1, 1)
const FRAMELESS_ANIMATED_WEBP = (() => {
  const vp8x = webpContainer('VP8X', new Uint8Array(10))
  const anmfPayload = new Uint8Array(16)
  const anmf = webpContainer('ANMF', anmfPayload).slice(12)
  const result = concatBytes(vp8x, anmf)
  new DataView(result.buffer).setUint32(4, result.byteLength - 8, true)
  return result
})()

const uploadingAsset = (overrides: Record<string, unknown> = {}) => ({
  id: ASSET_ID,
  project_id: PROJECT_ID,
  user_id: USER_ID,
  storage_path: STORAGE_PATH,
  mime_type: 'image/jpeg',
  size_bytes: JPEG.byteLength,
  expires_at: '2026-09-07T00:00:00.000Z',
  state: 'uploading',
  validation_attempt_id: null,
  validation_started_at: null,
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
  claimResult?: { data: unknown; error: unknown }
  releaseResult?: { data: unknown; error: unknown }
  removeResult?: { data: unknown; error: unknown }
  decodeImage?: (bytes: Uint8Array, mimeType: 'image/jpeg' | 'image/png' | 'image/webp') => Promise<{ width: number; height: number }>
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
      if (name === 'claim_commerce_asset_upload_validation') {
        return options.claimResult ?? { data: true, error: null }
      }
      if (name === 'fail_commerce_asset_upload') {
        return options.failResult ?? { data: true, error: null }
      }
      if (name === 'release_commerce_asset_upload_validation') {
        return options.releaseResult ?? { data: true, error: null }
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
          return options.downloadResult ?? { data: new Blob([JPEG], { type: 'image/jpeg' }), error: null }
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
      createAttemptId: () => ATTEMPT_ID,
      decodeImage: options.decodeImage ?? (async () => ({ width: 1, height: 1 })),
    }),
  }
}

test('detectImageMime accepts structurally valid JPEG, PNG, and WebP containers', () => {
  assertEquals(detectImageMime(JPEG), 'image/jpeg')
  assertEquals(detectImageMime(PNG), 'image/png')
  assertEquals(detectImageMime(WEBP), 'image/webp')
})

test('detectImageMime rejects malformed lengths, chunks, termination, and trailing text polyglots', () => {
  const riffLengthMismatch = WEBP.slice()
  riffLengthMismatch[4] ^= 1
  const missingWebpChunk = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x04, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
  const unknownWebpChunk = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x0c, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x4a, 0x55, 0x4e, 0x4b, 0, 0, 0, 0])
  const truncatedWebp = WEBP.slice(0, -1)
  const headerOnlyVp8 = webpContainer('VP8 ', WEBP.slice(20, 30))
  const headerOnlyVp8l = webpContainer('VP8L', new Uint8Array([0x2f, 0, 0, 0, 0]))
  const headerOnlyVp8x = webpContainer('VP8X', new Uint8Array(10))
  const textPayloads = ['<iframe src=x></iframe>', '<?xml version="1.0"?>', '<html><body>x</body></html>', 'plain trailing text']

  for (const bytes of [
    new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    new Uint8Array([0x89, 0x50, 0x4e]),
    JPEG.slice(0, -2),
    PNG.slice(0, -4),
    riffLengthMismatch,
    missingWebpChunk,
    unknownWebpChunk,
    truncatedWebp,
    headerOnlyVp8,
    headerOnlyVp8l,
    headerOnlyVp8x,
  ]) assertEquals(detectImageMime(bytes), null)

  for (const payload of textPayloads) {
    const suffix = new TextEncoder().encode(payload)
    assertEquals(detectImageMime(new Uint8Array([...JPEG, ...suffix])), null)
    assertEquals(detectImageMime(new Uint8Array([...PNG, ...suffix])), null)
    assertEquals(detectImageMime(new Uint8Array([...WEBP, ...suffix])), null)
  }
})

test('finalize rejects structurally plausible containers that a trusted decoder cannot decode', async () => {
  for (const [name, bytes, mimeType] of [
    ['empty entropy JPEG', EMPTY_ENTROPY_JPEG, 'image/jpeg'],
    ['empty IDAT PNG', EMPTY_IDAT_PNG, 'image/png'],
    ['VP8X/ANMF without a frame', FRAMELESS_ANIMATED_WEBP, 'image/webp'],
  ] as const) {
    assertEquals(detectImageMime(bytes), mimeType, `${name} must reach the trusted decoder`)
    let decodeCalls = 0
    const harness = createHarness({
      ownedAsset: uploadingAsset({ mime_type: mimeType, size_bytes: bytes.byteLength }),
      downloadResult: { data: new Blob([bytes], { type: mimeType }), error: null },
      decodeImage: async () => {
        decodeCalls += 1
        throw new Error('decoder internals must stay private')
      },
    })
    const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
    assertEquals(response.status, 422, name)
    assertEquals(decodeCalls, 1, name)
    assert(!JSON.stringify(await response.json()).includes('decoder internals'))
  }
})

test('trusted decode dimensions must be positive and remain within the pixel budget', async () => {
  for (const [name, bytes, decoded] of [
    ['zero decoded width', JPEG, { width: 0, height: 1 }],
    ['decoded pixel bomb', JPEG, { width: 100_000, height: 100_000 }],
    ['container pixel bomb', pngWithDimensions(10_000, 10_000, new Uint8Array([1])), { width: 1, height: 1 }],
  ] as const) {
    let decodeCalls = 0
    const mimeType = name === 'container pixel bomb' ? 'image/png' : 'image/jpeg'
    const harness = createHarness({
      ownedAsset: uploadingAsset({ mime_type: mimeType, size_bytes: bytes.byteLength }),
      downloadResult: { data: new Blob([bytes], { type: mimeType }), error: null },
      decodeImage: async () => { decodeCalls += 1; return decoded },
    })
    const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
    assertEquals(response.status, 422, name)
    assertEquals(decodeCalls, name === 'container pixel bomb' ? 0 : 1, name)
  }
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
  assertEquals(harness.serviceRpcCalls, [
    {
      name: 'claim_commerce_asset_upload_validation',
      parameters: { p_asset_id: ASSET_ID, p_user_id: USER_ID, p_attempt_id: ATTEMPT_ID },
    },
    {
      name: 'fail_commerce_asset_upload',
      parameters: { p_asset_id: ASSET_ID, p_user_id: USER_ID, p_attempt_id: ATTEMPT_ID },
    },
  ])
  assert(harness.events.indexOf('remove') < harness.events.indexOf('service-rpc:fail_commerce_asset_upload'))
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
  assertEquals(harness.events, [
    'owned-select',
    'service-rpc:claim_commerce_asset_upload_validation',
    'download',
    'service-rpc:finalize_commerce_asset_upload',
  ])
  assertEquals(harness.serviceRpcCalls, [
    {
      name: 'claim_commerce_asset_upload_validation',
      parameters: { p_asset_id: ASSET_ID, p_user_id: USER_ID, p_attempt_id: ATTEMPT_ID },
    },
    {
      name: 'finalize_commerce_asset_upload',
      parameters: {
        p_asset_id: ASSET_ID,
        p_user_id: USER_ID,
        p_attempt_id: ATTEMPT_ID,
        p_actual_mime_type: 'image/jpeg',
        p_actual_size_bytes: JPEG.byteLength,
      },
    },
  ])
  assertEquals(await response.json(), { asset: { ...uploadingAsset(), state: 'ready' } })
})

test('finalize rejects an empty or mismatched stored Blob MIME before terminal failure', async () => {
  for (const blobType of ['', 'image/png', 'text/html']) {
    const harness = createHarness({
      downloadResult: { data: new Blob([JPEG], { type: blobType }), error: null },
    })
    const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
    assertEquals(response.status, 422, blobType || 'empty MIME')
    assert(harness.events.indexOf('remove') < harness.events.indexOf('service-rpc:fail_commerce_asset_upload'))
  }
})

test('invalid finalize objects are removed before the asset is marked failed', async () => {
  const oversized = new Uint8Array(8_388_609)
  oversized.set(JPEG)
  const htmlPolyglot = new Uint8Array([...JPEG, ...new TextEncoder().encode('<iframe src=x></iframe>')])
  const invalidCases: Array<{ name: string; asset?: Record<string, unknown>; download: { data: Blob | null; error: unknown } }> = [
    { name: 'missing object', download: { data: null, error: new Error('bucket name detail') } },
    { name: 'size mismatch', asset: uploadingAsset({ size_bytes: JPEG.byteLength + 1 }), download: { data: new Blob([JPEG], { type: 'image/jpeg' }), error: null } },
    { name: 'MIME mismatch', asset: uploadingAsset({ mime_type: 'image/jpeg', size_bytes: PNG.byteLength, storage_path: STORAGE_PATH }), download: { data: new Blob([PNG], { type: 'image/png' }), error: null } },
    { name: 'bad PNG magic', asset: uploadingAsset({ mime_type: 'image/png', size_bytes: 8 }), download: { data: new Blob([new Uint8Array(8)], { type: 'image/png' }), error: null } },
    { name: 'bad JPEG magic', asset: uploadingAsset({ size_bytes: 4 }), download: { data: new Blob([new Uint8Array(4)], { type: 'image/jpeg' }), error: null } },
    { name: 'bad WebP magic', asset: uploadingAsset({ mime_type: 'image/webp', size_bytes: 12 }), download: { data: new Blob([new Uint8Array(12)], { type: 'image/webp' }), error: null } },
    { name: 'HTML polyglot', asset: uploadingAsset({ size_bytes: htmlPolyglot.byteLength }), download: { data: new Blob([htmlPolyglot], { type: 'image/jpeg' }), error: null } },
    { name: 'oversize object', asset: uploadingAsset({ size_bytes: oversized.byteLength }), download: { data: new Blob([oversized], { type: 'image/jpeg' }), error: null } },
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

test('removal failure releases the validation claim without terminal failure', async () => {
  const harness = createHarness({
    downloadResult: { data: null, error: new Error('download provider internals') },
    removeResult: { data: null, error: new Error('remove provider internals') },
  })
  const response = await harness.handler(request({ action: 'finalize', assetId: ASSET_ID }))
  const publicBody = JSON.stringify(await response.json())
  assertEquals(response.status, 503)
  assert(harness.events.includes('safe-log'))
  assert(!harness.events.includes('service-rpc:fail_commerce_asset_upload'))
  assert(harness.events.includes('service-rpc:release_commerce_asset_upload_validation'))
  assert(!/provider internals/i.test(publicBody))
})

test('a retry after removal failure converges to object absent and a failed row', async () => {
  const attempts = [ATTEMPT_ID, '55555555-5555-4555-8555-555555555555']
  let state = 'uploading'
  let activeAttempt: string | null = null
  let objectPresent = true
  let removeCalls = 0
  let failCalls = 0

  const userClient: CommerceUploadUserClient = {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID, is_anonymous: false } }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => ({ data: uploadingAsset({ state }), error: null }),
            }),
          }),
        }),
      }),
    }),
  }
  const serviceClient: CommerceUploadServiceClient = {
    rpc: async (name, parameters) => {
      const attempt = String(parameters.p_attempt_id ?? '')
      if (name === 'claim_commerce_asset_upload_validation') {
        if (state !== 'uploading') return { data: false, error: null }
        state = 'validating'
        activeAttempt = attempt
        return { data: true, error: null }
      }
      if (name === 'release_commerce_asset_upload_validation') {
        if (state !== 'validating' || activeAttempt !== attempt) return { data: false, error: null }
        state = 'uploading'
        activeAttempt = null
        return { data: true, error: null }
      }
      if (name === 'fail_commerce_asset_upload') {
        failCalls += 1
        assert(!objectPresent, 'row cannot become failed while the object exists')
        assertEquals(activeAttempt, attempt)
        state = 'failed'
        activeAttempt = null
        return { data: true, error: null }
      }
      return { data: null, error: new Error('unexpected RPC') }
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({ data: null, error: null }),
        download: async () => objectPresent
          ? { data: new Blob([JPEG.slice(0, -2)], { type: 'image/jpeg' }), error: null }
          : { data: null, error: new Error('not found') },
        remove: async () => {
          removeCalls += 1
          if (removeCalls === 1) return { data: null, error: new Error('transient removal failure') }
          objectPresent = false
          return { data: [], error: null }
        },
      }),
    },
  }
  const handler = createCommerceUploadHandler({
    allowedOrigins: new Set(['https://geniusli.cn']),
    createUserClient: () => userClient,
    serviceClient,
    createAttemptId: () => attempts.shift() ?? ATTEMPT_ID,
    logError: () => {},
    decodeImage: async () => ({ width: 1, height: 1 }),
  })

  assertEquals((await handler(request({ action: 'finalize', assetId: ASSET_ID }))).status, 503)
  assertEquals({ state, objectPresent, failCalls }, { state: 'uploading', objectPresent: true, failCalls: 0 })
  assertEquals((await handler(request({ action: 'finalize', assetId: ASSET_ID }))).status, 422)
  assertEquals({ state, objectPresent, failCalls }, { state: 'failed', objectPresent: false, failCalls: 1 })
})

const deferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

test('CAS claim serializes simultaneous valid and invalid finalize views so ready never loses its object', async () => {
  const attemptIds = [ATTEMPT_ID, '55555555-5555-4555-8555-555555555555']
  const bothSelected = deferred<void>()
  const validDownload = deferred<{ data: Blob; error: null }>()
  let selectCalls = 0
  let state = 'uploading'
  let activeAttempt: string | null = null
  let objectPresent = true
  let downloadCalls = 0
  let removeCalls = 0

  const userClient: CommerceUploadUserClient = {
    auth: { getUser: async () => ({ data: { user: { id: USER_ID, is_anonymous: false } }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: async () => {
                selectCalls += 1
                if (selectCalls === 2) bothSelected.resolve()
                await bothSelected.promise
                return { data: uploadingAsset({ state: 'uploading' }), error: null }
              },
            }),
          }),
        }),
      }),
    }),
  }
  const serviceClient: CommerceUploadServiceClient = {
    rpc: async (name, parameters) => {
      const attempt = String(parameters.p_attempt_id ?? '')
      if (name === 'claim_commerce_asset_upload_validation') {
        if (state !== 'uploading') return { data: false, error: null }
        state = 'validating'
        activeAttempt = attempt
        return { data: true, error: null }
      }
      if (name === 'finalize_commerce_asset_upload') {
        assertEquals(activeAttempt, attempt)
        assert(objectPresent)
        state = 'ready'
        activeAttempt = null
        return { data: [{ ...uploadingAsset(), state: 'ready' }], error: null }
      }
      return { data: false, error: null }
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({ data: null, error: null }),
        download: async () => {
          downloadCalls += 1
          if (downloadCalls === 1) return await validDownload.promise
          return { data: null, error: new Error('competing invalid view') }
        },
        remove: async () => {
          removeCalls += 1
          objectPresent = false
          return { data: [], error: null }
        },
      }),
    },
  }
  const handler = createCommerceUploadHandler({
    allowedOrigins: new Set(['https://geniusli.cn']),
    createUserClient: () => userClient,
    serviceClient,
    createAttemptId: () => attemptIds.shift() ?? ATTEMPT_ID,
    decodeImage: async () => ({ width: 1, height: 1 }),
  })

  const first = handler(request({ action: 'finalize', assetId: ASSET_ID }))
  const second = handler(request({ action: 'finalize', assetId: ASSET_ID }))
  await bothSelected.promise
  await Promise.resolve()
  validDownload.resolve({ data: new Blob([JPEG], { type: 'image/jpeg' }), error: null })
  const statuses = [(await first).status, (await second).status].sort()

  assertEquals(statuses, [200, 409])
  assertEquals({ state, objectPresent, downloadCalls, removeCalls }, {
    state: 'ready',
    objectPresent: true,
    downloadCalls: 1,
    removeCalls: 0,
  })
})

test('abandoned takeover recovers a crashed validation claim but never steals an active claim', async () => {
  const cleanupAttempt = '66666666-6666-4666-8666-666666666666'
  const cutoff = '2026-08-31T00:05:00.000Z'
  let state = 'validating'
  let activeAttempt = ATTEMPT_ID
  let validationStartedAt = '2026-08-31T00:00:00.000Z'
  let objectPresent = true
  let removeCalls = 0

  const serviceClient: CommerceUploadServiceClient = {
    rpc: async (name, parameters) => {
      if (name === 'takeover_abandoned_commerce_asset_upload') {
        if (state !== 'validating' || validationStartedAt >= String(parameters.p_cutoff)) {
          return { data: [], error: null }
        }
        const previousAttempt = activeAttempt
        activeAttempt = String(parameters.p_attempt_id)
        validationStartedAt = '2026-08-31T00:06:00.000Z'
        return {
          data: [{
            ...uploadingAsset({ state: 'validating' }),
            previous_state: 'validating',
            previous_attempt_id: previousAttempt,
            previous_validation_started_at: '2026-08-31T00:00:00.000Z',
            validation_attempt_id: activeAttempt,
            validation_started_at: validationStartedAt,
          }],
          error: null,
        }
      }
      if (name === 'fail_commerce_asset_upload') {
        assertEquals(parameters.p_attempt_id, activeAttempt)
        assert(!objectPresent, 'attempt-bound fail must follow successful removal')
        state = 'failed'
        activeAttempt = ''
        return { data: true, error: null }
      }
      return { data: false, error: null }
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async () => ({ data: null, error: null }),
        download: async () => ({ data: null, error: null }),
        remove: async () => {
          removeCalls += 1
          objectPresent = false
          return { data: [], error: null }
        },
      }),
    },
  }

  assertEquals(await cleanupAbandonedCommerceUpload({
    serviceClient,
    assetId: ASSET_ID,
    cutoff,
    attemptId: cleanupAttempt,
  }), 'cleaned')
  assertEquals({ state, objectPresent, removeCalls }, { state: 'failed', objectPresent: false, removeCalls: 1 })

  state = 'validating'
  activeAttempt = ATTEMPT_ID
  validationStartedAt = '2026-08-31T00:10:00.000Z'
  objectPresent = true
  assertEquals(await cleanupAbandonedCommerceUpload({
    serviceClient,
    assetId: ASSET_ID,
    cutoff,
    attemptId: cleanupAttempt,
  }), 'not_claimed')
  assertEquals({ state, activeAttempt, objectPresent, removeCalls }, {
    state: 'validating', activeAttempt: ATTEMPT_ID, objectPresent: true, removeCalls: 1,
  })
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
    decodeImage: async () => ({ width: 1, height: 1 }),
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
      decodeImage: async () => ({ width: 1, height: 1 }),
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
      decodeImage: async () => ({ width: 1, height: 1 }),
    })
  } catch {
    threw = true
  }
  assert(threw)
  assertEquals(factoryCalls, 0)
})
