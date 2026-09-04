import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  createCommerceRepository,
  mapCommerceError,
  type CommerceRepository,
} from '../src/commerce/commerceRepository'

type SupabaseResult<T> = { data: T | null; error: unknown }

type QueryBuilder = {
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  eq: ReturnType<typeof vi.fn>
  in: ReturnType<typeof vi.fn>
  order: ReturnType<typeof vi.fn>
  single: ReturnType<typeof vi.fn>
  maybeSingle: ReturnType<typeof vi.fn>
  then: PromiseLike<SupabaseResult<unknown>>['then']
}

const query = (response: SupabaseResult<unknown>): QueryBuilder => {
  const builder = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onfulfilled?: ((value: SupabaseResult<unknown>) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) =>
      Promise.resolve(response).then(onfulfilled, onrejected),
  } as QueryBuilder

  builder.insert.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.delete.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.in.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.single.mockResolvedValue(response)
  builder.maybeSingle.mockResolvedValue(response)
  return builder
}

const makeClient = (options: {
  assetResponse?: SupabaseResult<unknown>
  projectResponse?: SupabaseResult<unknown>
  generationResponse?: SupabaseResult<unknown>
  rpcResponses?: Record<string, SupabaseResult<unknown>>
  signedUploadResponses?: Array<SupabaseResult<unknown> | Error>
  storageRemoveError?: unknown
  authUser?: { id: string; is_anonymous?: boolean } | null
  authError?: unknown
  functionResponse?: SupabaseResult<unknown>
  functionResponses?: Array<SupabaseResult<unknown> | Error>
} = {}) => {
  const assetQuery = query(options.assetResponse ?? {
    data: {
      id: 'asset-1', project_id: 'project-1', user_id: 'user-1', storage_path: 'user-1/project-1/file.png',
      mime_type: 'image/png', size_bytes: 3, expires_at: '2026-08-30T00:00:00.000Z', state: 'uploading',
      deleted_at: null, created_at: '2026-08-23T00:00:00.000Z',
    },
    error: null,
  })
  const projectQuery = query(options.projectResponse ?? { data: [], error: null })
  const generationQuery = query(options.generationResponse ?? { data: null, error: null })
  const storageUpload = vi.fn().mockResolvedValue({ data: { path: 'legacy-uploaded' }, error: null })
  const signedUploadResponses = [...(options.signedUploadResponses ?? [])]
  const uploadToSignedUrl = vi.fn().mockImplementation(() => {
    const response = signedUploadResponses.shift() ?? { data: { path: 'signed-uploaded' }, error: null }
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
  })
  const storage = {
    upload: storageUpload,
    uploadToSignedUrl,
    remove: vi.fn().mockResolvedValue({ data: [], error: options.storageRemoveError ?? null }),
  }
  const functionResponses = [...(options.functionResponses ?? [])]
  let reservationIndex = 0
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.authUser === undefined ? { id: 'user-1' } : options.authUser },
        error: options.authError ?? null,
      }),
    },
    from: vi.fn((table: string) => {
      if (table === 'commerce_project_assets') return assetQuery
      if (table === 'commerce_generations') return generationQuery
      return projectQuery
    }),
    storage: { from: vi.fn(() => storage) },
    functions: {
      invoke: vi.fn().mockImplementation((name: string, request: { body?: Record<string, unknown> }) => {
        const queuedResponse = functionResponses.shift()
        if (queuedResponse) return queuedResponse instanceof Error ? Promise.reject(queuedResponse) : Promise.resolve(queuedResponse)
        if (options.functionResponse) return Promise.resolve(options.functionResponse)
        if (name === 'commerce-upload' && request.body?.action === 'reserve') {
          reservationIndex += 1
          const id = `asset-${reservationIndex}`
          const path = `user-1/project-1/${id}.png`
          return Promise.resolve({
            data: {
              asset: {
                id, project_id: 'project-1', user_id: 'user-1', storage_path: path,
                mime_type: request.body.mimeType, size_bytes: request.body.sizeBytes,
                expires_at: '2026-09-07T00:00:00.000Z', state: 'uploading', deleted_at: null,
                created_at: '2026-08-31T00:00:00.000Z',
              },
              path,
              token: `token-${reservationIndex}`,
            },
            error: null,
          })
        }
        if (name === 'commerce-upload' && request.body?.action === 'finalize') {
          const id = String(request.body.assetId)
          return Promise.resolve({
            data: {
              asset: {
                id, project_id: 'project-1', user_id: 'user-1', storage_path: `user-1/project-1/${id}.png`,
                mime_type: 'image/png', size_bytes: 3, expires_at: '2026-09-07T00:00:00.000Z',
                state: 'ready', deleted_at: null, created_at: '2026-08-31T00:00:00.000Z',
              },
            },
            error: null,
          })
        }
        return Promise.resolve({ data: { generationId: 'generation-1', status: 'queued' }, error: null })
      }),
    },
    rpc: vi.fn((name: string, parameters?: Record<string, unknown>) => {
      if (options.rpcResponses?.[name]) return Promise.resolve(options.rpcResponses[name])
      if (name === 'create_commerce_project') {
        if (options.projectResponse) return Promise.resolve(options.projectResponse)
        return Promise.resolve({
          data: [{
            id: 'project-1', user_id: 'user-1', name: parameters?.p_name,
            platform: parameters?.p_platform, mode: parameters?.p_mode,
            input_data: parameters?.p_input_data, locked: false,
            created_at: '2026-08-23T00:00:00.000Z', updated_at: '2026-08-23T00:00:00.000Z',
          }],
          error: null,
        })
      }
      if (name === 'admin_refund_commerce_generation') {
        return Promise.resolve({ data: { status: 'refunded', credits: 4, refundedAt: '2026-08-27T08:02:00.000Z' }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }),
  }
  return { client, assetQuery, projectQuery, generationQuery, storage }
}

describe('commerce repository', () => {
  let repository: CommerceRepository
  let client: ReturnType<typeof makeClient>['client']
  let assetQuery: QueryBuilder
  let projectQuery: QueryBuilder
  let storage: ReturnType<typeof makeClient>['storage']

  beforeEach(() => {
    const mock = makeClient()
    client = mock.client
    assetQuery = mock.assetQuery
    projectQuery = mock.projectQuery
    storage = mock.storage
    repository = createCommerceRepository(client as never)
  })

  afterEach(() => vi.restoreAllMocks())

  it('uploads each validated image through reserve, signed upload, and finalize in order', async () => {
    const progress = vi.fn()
    const file = new File(['png'], '产品 图.png', { type: 'image/png' })

    const result = await repository.uploadAssets('project-1', [file], progress)

    expect(client.functions.invoke).toHaveBeenNthCalledWith(1, 'commerce-upload', {
      body: {
        action: 'reserve', projectId: 'project-1', fileName: '产品 图.png', mimeType: 'image/png', sizeBytes: 3,
      },
    })
    expect(storage.uploadToSignedUrl).toHaveBeenCalledWith(
      'user-1/project-1/asset-1.png',
      'token-1',
      file,
      { contentType: 'image/png' },
    )
    expect(client.functions.invoke).toHaveBeenNthCalledWith(2, 'commerce-upload', {
      body: { action: 'finalize', assetId: 'asset-1' },
    })
    expect(client.functions.invoke.mock.invocationCallOrder[0]).toBeLessThan(storage.uploadToSignedUrl.mock.invocationCallOrder[0])
    expect(storage.uploadToSignedUrl.mock.invocationCallOrder[0]).toBeLessThan(client.functions.invoke.mock.invocationCallOrder[1])
    expect(result).toEqual([expect.objectContaining({ id: 'asset-1', storagePath: 'user-1/project-1/asset-1.png', state: 'ready' })])
    expect(client.from).not.toHaveBeenCalledWith('commerce_project_assets')
    expect(assetQuery.insert).not.toHaveBeenCalled()
    expect(assetQuery.update).not.toHaveBeenCalled()
    expect(assetQuery.delete).not.toHaveBeenCalled()
    expect(storage.upload).not.toHaveBeenCalled()
    expect(progress).toHaveBeenNthCalledWith(1, {
      completedFiles: 0, totalFiles: 1, currentFile: { name: '产品 图.png', state: 'uploading' },
    })
    expect(progress).toHaveBeenLastCalledWith({
      completedFiles: 1, totalFiles: 1, currentFile: { name: '产品 图.png', state: 'ready' },
    })
  })

  it('reports a failed state and does not finalize when signed Storage returns a definite API error', async () => {
    const mock = makeClient({
      signedUploadResponses: [{
        data: null,
        error: { name: 'StorageApiError', message: 'bucket unavailable', status: 503, statusCode: 'InternalError' },
      }],
    })
    repository = createCommerceRepository(mock.client as never)
    const progress = vi.fn()

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], progress))
      .rejects.toThrow('服务权限或配置异常')

    expect(mock.client.functions.invoke).toHaveBeenCalledTimes(1)
    expect(progress).toHaveBeenLastCalledWith({
      completedFiles: 0, totalFiles: 1, currentFile: { name: 'a.png', state: 'failed' },
    })
    expect(mock.assetQuery.update).not.toHaveBeenCalled()
  })

  it('reconciles a realistic StorageUnknownError result by finalizing the same reservation', async () => {
    const storageFailure = {
      name: 'StorageUnknownError',
      message: 'Failed to fetch',
      originalError: new TypeError('Failed to fetch'),
    }
    const mock = makeClient({ signedUploadResponses: [{ data: null, error: storageFailure }] })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['png'], 'a.png', { type: 'image/png' })], vi.fn()))
      .resolves.toEqual([expect.objectContaining({ id: 'asset-1', state: 'ready' })])

    expect(mock.client.functions.invoke).toHaveBeenCalledTimes(2)
    expect(mock.client.functions.invoke).toHaveBeenLastCalledWith('commerce-upload', {
      body: { action: 'finalize', assetId: 'asset-1' },
    })
    expect(mock.storage.uploadToSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('retries finalize with the same reserved asset without reserving or uploading again', async () => {
    const finalizeFailure = { name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' }
    const fallback = makeClient()
    const reserveResponse = await fallback.client.functions.invoke('commerce-upload', {
      body: { action: 'reserve', projectId: 'project-1', fileName: 'a.png', mimeType: 'image/png', sizeBytes: 3 },
    })
    const readyResponse = await fallback.client.functions.invoke('commerce-upload', {
      body: { action: 'finalize', assetId: 'asset-1' },
    })
    const retryMock = makeClient({ functionResponses: [reserveResponse, { data: null, error: finalizeFailure }, readyResponse] })
    repository = createCommerceRepository(retryMock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['png'], 'a.png', { type: 'image/png' })], vi.fn()))
      .resolves.toEqual([expect.objectContaining({ id: 'asset-1', state: 'ready' })])

    expect(retryMock.client.functions.invoke).toHaveBeenCalledTimes(3)
    expect(retryMock.client.functions.invoke).toHaveBeenNthCalledWith(2, 'commerce-upload', {
      body: { action: 'finalize', assetId: 'asset-1' },
    })
    expect(retryMock.client.functions.invoke).toHaveBeenNthCalledWith(3, 'commerce-upload', {
      body: { action: 'finalize', assetId: 'asset-1' },
    })
    expect(retryMock.storage.uploadToSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('decodes reserve FunctionsHttpError bodies and stops before Storage', async () => {
    const reserveFailure = {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ code: 'AUTH_REQUIRED', message: 'login required' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      }),
    }
    const mock = makeClient({ functionResponses: [{ data: null, error: reserveFailure }] })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()))
      .rejects.toMatchObject({ code: 'AUTH_REQUIRED', cause: reserveFailure })

    expect(mock.storage.uploadToSignedUrl).not.toHaveBeenCalled()
  })

  it.each([
    [{ asset: null, path: 'server/path.png', token: 'token' }, 'asset'],
    [{ asset: { id: 'asset-1' }, path: '', token: 'token' }, 'path'],
    [{ asset: { id: 'asset-1' }, path: 'server/path.png', token: '' }, 'token'],
  ])('fails safely when a reserve response is missing %s', async (data) => {
    const mock = makeClient({ functionResponses: [{ data, error: null }] })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()))
      .rejects.toThrow('服务权限或配置异常')

    expect(mock.storage.uploadToSignedUrl).not.toHaveBeenCalled()
  })

  it('fails safely without retrying when finalize omits its snake_case asset response', async () => {
    const fallback = makeClient()
    const reserveResponse = await fallback.client.functions.invoke('commerce-upload', {
      body: { action: 'reserve', projectId: 'project-1', fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1 },
    })
    const mock = makeClient({
      functionResponses: [reserveResponse, { data: {}, error: null }],
    })
    repository = createCommerceRepository(mock.client as never)
    const progress = vi.fn()

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], progress))
      .rejects.toThrow('服务权限或配置异常')

    expect(progress).toHaveBeenLastCalledWith({
      completedFiles: 0, totalFiles: 1, currentFile: { name: 'a.png', state: 'failed' },
    })
    expect(mock.client.functions.invoke).toHaveBeenCalledTimes(2)
  })

  it('decodes deterministic finalize FunctionsHttpError bodies without retrying', async () => {
    const finalizeFailure = {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ code: 'RATE_LIMITED', message: 'too many requests' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    }
    const fallback = makeClient()
    const reserveResponse = await fallback.client.functions.invoke('commerce-upload', {
      body: { action: 'reserve', projectId: 'project-1', fileName: 'a.png', mimeType: 'image/png', sizeBytes: 1 },
    })
    const mock = makeClient({
      functionResponses: [
        reserveResponse,
        { data: null, error: finalizeFailure },
      ],
    })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()))
      .rejects.toMatchObject({ code: 'RATE_LIMITED', cause: finalizeFailure })

    expect(mock.client.functions.invoke).toHaveBeenNthCalledWith(2, 'commerce-upload', {
      body: { action: 'finalize', assetId: 'asset-1' },
    })
    expect(mock.client.functions.invoke).toHaveBeenCalledTimes(2)
  })

  it('keeps completed progress when a later file fails and never starts later files', async () => {
    const mock = makeClient({
      signedUploadResponses: [
        { data: { path: 'asset-1.png' }, error: null },
        { data: null, error: { message: 'bucket unavailable' } },
      ],
    })
    repository = createCommerceRepository(mock.client as never)
    const progress = vi.fn()
    const files = [
      new File(['png'], 'a.png', { type: 'image/png' }),
      new File(['png'], 'b.png', { type: 'image/png' }),
      new File(['png'], 'c.png', { type: 'image/png' }),
    ]

    await expect(repository.uploadAssets('project-1', files, progress)).rejects.toThrow('服务权限或配置异常')

    expect(progress).toHaveBeenNthCalledWith(2, {
      completedFiles: 1, totalFiles: 3, currentFile: { name: 'a.png', state: 'ready' },
    })
    expect(progress).toHaveBeenLastCalledWith({
      completedFiles: 1, totalFiles: 3, currentFile: { name: 'b.png', state: 'failed' },
    })
    expect(mock.storage.uploadToSignedUrl).toHaveBeenCalledTimes(2)
    expect(mock.client.functions.invoke).toHaveBeenCalledTimes(3)
  })

  it('accepts at most six local files and rejects a seventh before account or upload calls', async () => {
    const sixFiles = Array.from(
      { length: 6 },
      (_, index) => new File(['x'], `${index + 1}.png`, { type: 'image/png' }),
    )
    const sixMock = makeClient()
    repository = createCommerceRepository(sixMock.client as never)

    await expect(repository.uploadAssets('project-1', sixFiles, vi.fn())).resolves.toHaveLength(6)
    expect(sixMock.client.auth.getUser).toHaveBeenCalledTimes(1)
    expect(sixMock.storage.uploadToSignedUrl).toHaveBeenCalledTimes(6)
    expect(sixMock.client.functions.invoke).toHaveBeenCalledTimes(12)

    const sevenMock = makeClient()
    repository = createCommerceRepository(sevenMock.client as never)
    await expect(repository.uploadAssets('project-1', [
      ...sixFiles,
      new File(['x'], '7.png', { type: 'image/png' }),
    ], vi.fn())).rejects.toThrow('图片数量必须为 1–6 张')
    expect(sevenMock.client.auth.getUser).not.toHaveBeenCalled()
    expect(sevenMock.client.functions.invoke).not.toHaveBeenCalled()
    expect(sevenMock.client.storage.from).not.toHaveBeenCalled()
  })

  it('deletes the project transaction before removing owned Storage objects', async () => {
    const mock = makeClient({
      assetResponse: { data: [{ storage_path: 'user-1/project-1/a.png' }, { storage_path: 'user-1/project-1/b.webp' }], error: null },
    })
    repository = createCommerceRepository(mock.client as never)

    await repository.deleteProject('project-1')

    expect(mock.assetQuery.eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(mock.assetQuery.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mock.storage.remove).toHaveBeenCalledWith(['user-1/project-1/a.png', 'user-1/project-1/b.webp'])
    expect(mock.client.rpc).toHaveBeenCalledWith('delete_commerce_project', { p_project_id: 'project-1' })
    expect(mock.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(mock.storage.remove.mock.invocationCallOrder[0])
  })

  it('returns deletion success after the database commit when orphan cleanup must retry Storage removal', async () => {
    const mock = makeClient({
      assetResponse: { data: [{ storage_path: 'user-1/project-1/a.png' }], error: null },
      storageRemoveError: { message: 'permission denied' },
    })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.deleteProject('project-1')).resolves.toBeUndefined()

    expect(mock.client.rpc).toHaveBeenCalledWith('delete_commerce_project', { p_project_id: 'project-1' })
    expect(mock.client.rpc.mock.invocationCallOrder[0]).toBeLessThan(mock.storage.remove.mock.invocationCallOrder[0])
  })

  it('models generation winning the fence: delete RPC rejects before Storage removal', async () => {
    const mock = makeClient({
      assetResponse: { data: [{ storage_path: 'user-1/project-1/a.png' }], error: null },
      rpcResponses: {
        delete_commerce_project: { data: null, error: { code: '55000', message: 'project has an active generation' } },
      },
    })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.deleteProject('project-1')).rejects.toThrow('生成中')

    expect(mock.storage.remove).not.toHaveBeenCalled()
    expect(mock.client.rpc).toHaveBeenCalledWith('delete_commerce_project', { p_project_id: 'project-1' })
  })

  it('validates every asset before creating rows or calling Storage', async () => {
    await expect(repository.uploadAssets('project-1', [
      new File(['x'], 'a.png', { type: 'image/png' }),
      new File(['x'], 'b.svg', { type: 'image/svg+xml' }),
    ], vi.fn())).rejects.toThrow('仅支持 JPEG、PNG 或 WebP 图片')

    expect(assetQuery.insert).not.toHaveBeenCalled()
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('invokes the generation Edge Function with only the project and idempotency identifiers', async () => {
    await expect(repository.startGeneration('project-1', 'request-1')).resolves.toEqual({ generationId: 'generation-1', status: 'queued' })

    expect(client.functions.invoke).toHaveBeenCalledWith('analyze-commerce', {
      body: { projectId: 'project-1', idempotencyKey: 'request-1' },
    })
  })

  it.each([
    [402, { code: 'INSUFFICIENT_CREDITS', message: 'insufficient credits' }, 'CREDITS_EXHAUSTED'],
    [410, { code: 'ASSETS_EXPIRED', message: 'assets expired' }, 'ASSETS_EXPIRED'],
    [429, { code: 'RATE_LIMITED', message: 'too many requests' }, 'RATE_LIMITED'],
    [401, { code: 'AUTH_REQUIRED', message: 'login required' }, 'AUTH_REQUIRED'],
    [403, { code: 'FORBIDDEN', message: 'forbidden' }, 'SERVICE_ERROR'],
  ])('decodes FunctionsHttpError Response bodies for HTTP %s', async (status, body, expectedCode) => {
    const error = {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    }
    const mock = makeClient({ functionResponse: { data: null, error } })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.startGeneration('project-1', 'request-1'))
      .rejects.toMatchObject({ code: expectedCode, cause: error })
  })

  it.each([
    [{ code: '28000', message: 'commerce authentication required' }, '登录状态需要恢复'],
    [{ code: 'P0001', message: 'insufficient credits' }, '可用次数不足'],
    [{ code: 'P0001', message: 'daily generation limit reached' }, '请求过于频繁'],
    [{ message: 'asset expired' }, '图片已过期'],
    [new TypeError('Failed to fetch'), '网络或服务暂时不可用'],
  ])('maps Supabase errors to an actionable message', (error, message) => {
    expect(mapCommerceError(error).message).toContain(message)
  })

  it('persists only explicit professional text fields when creating a project', async () => {
    const mock = makeClient({
      projectResponse: {
        data: {
          id: 'project-1', user_id: 'user-1', name: '保温杯', platform: 'ozon', mode: 'professional',
          input_data: { category: '家居', notes: '无反光' }, locked: false,
          created_at: '2026-08-23T00:00:00.000Z', updated_at: '2026-08-23T00:00:00.000Z',
        }, error: null,
      },
    })
    repository = createCommerceRepository(mock.client as never)
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file], category: '家居', notes: '无反光',
      ...( { previewUrl: 'blob:https://example.test/preview', encoded: 'data:image/png;base64,AAAA' } as object),
    })

    expect(mock.client.rpc).toHaveBeenCalledWith('create_commerce_project', {
      p_name: '保温杯',
      p_platform: 'ozon',
      p_mode: 'professional',
      p_input_data: { category: '家居', notes: '无反光' },
    })
    const payload = mock.client.rpc.mock.calls.find(([name]) => name === 'create_commerce_project')?.[1]
    expect(JSON.stringify(payload)).not.toContain('blob:')
    expect(JSON.stringify(payload)).not.toContain('base64')
    expect(JSON.stringify(payload)).not.toContain('"files"')
  })

  it('rejects transient image URLs and Base64 data before persisting project input', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file],
      notes: 'data:image/png;base64,AAAA',
    })).rejects.toThrow('不支持保存图片 URL 或 Base64 数据')

    expect(client.rpc).not.toHaveBeenCalledWith('create_commerce_project', expect.anything())
  })

  it.each((() => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const unpadded = png.replace(/=+$/, '')
    return [
      ['continuous padded PNG', png],
      ['folded unpadded PNG', Array.from(
        { length: Math.ceil(unpadded.length / 16) },
        (_, index) => unpadded.slice(index * 16, (index + 1) * 16),
      ).join('\r\n')],
    ]
  })())('rejects a real short %s raw Base64 image', async (_label, notes) => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file], notes,
    })).rejects.toThrow('不支持保存图片 URL 或 Base64 数据')

    expect(client.rpc).not.toHaveBeenCalledWith('create_commerce_project', expect.anything())
  })

  it('rejects Base64 data URLs with media-type parameters before persisting project input', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file],
      notes: 'data:image/png;charset=utf-8;base64,AAAA',
    })).rejects.toThrow('不支持保存图片 URL 或 Base64 数据')

    expect(client.rpc).not.toHaveBeenCalledWith('create_commerce_project', expect.anything())
  })

  it('rejects long raw Base64 payloads before persisting project input', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file],
      notes: 'A'.repeat(512),
    })).rejects.toThrow('不支持保存图片 URL 或 Base64 数据')

    expect(client.rpc).not.toHaveBeenCalledWith('create_commerce_project', expect.anything())
  })

  it.each([
    ['CRLF', ('A'.repeat(76) + '\r\n').repeat(4)],
    ['spaces', Array.from({ length: 4 }, () => 'A'.repeat(76)).join(' ')],
    ['16-character space groups', Array.from({ length: 17 }, () => 'A'.repeat(16)).join(' ')],
    ['31-character CRLF groups', Array.from({ length: 12 }, () => 'A'.repeat(31)).join('\r\n')],
    ['unpadded mod-2 Tab groups', Array.from(
      { length: Math.ceil(258 / 16) },
      (_, index) => 'A'.repeat(258).slice(index * 16, (index + 1) * 16),
    ).join('\t')],
    ['unpadded mod-3 mixed ASCII whitespace', Array.from(
      { length: Math.ceil(259 / 31) },
      (_, index) => 'A'.repeat(259).slice(index * 31, (index + 1) * 31),
    ).map((chunk, index) => `${chunk}${['\t', '\r\n', '\v', '\f', ' '][index % 5]}`).join('')],
  ])('rejects long raw Base64 folded with %s before persisting project input', async (_label, notes) => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file], notes,
    })).rejects.toThrow('不支持保存图片 URL 或 Base64 数据')

    expect(client.rpc).not.toHaveBeenCalledWith('create_commerce_project', expect.anything())
  })

  it('does not mistake ordinary long prose for raw Base64', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const notes = 'This is a normal product description with many short words, punctuation, and useful details. '.repeat(12)

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file], notes,
    })).resolves.toBeDefined()

    expect(client.rpc).toHaveBeenCalledWith('create_commerce_project', expect.objectContaining({
      p_input_data: expect.objectContaining({ notes }),
    }))
  })

  it.each([
    ['Chinese prose', '这是一段普通的中文产品说明，包含材质感受、适用场景和用户关注点。'.repeat(30)],
    ['unpunctuated English prose', (() => {
      let prose = Array.from(
        { length: 80 },
        (_, index) => ['This', 'ordinary', 'product', 'description', 'uses', 'natural', 'words'][index % 7],
      ).join(' ')
      while (prose.replace(/[ \t\r\n]/g, '').length % 4 !== 0) prose += ' a'
      return prose
    })()],
    ['uniform-width English keywords', (() => {
      let prose = 'This coat will feel soft when worn with warm wool that will keep your body cozy each cold day '.repeat(5).trim()
      while (prose.replace(/[ \t\r\n]/g, '').length % 4 !== 0) prose += ' a'
      return prose
    })()],
    ['uppercase English keywords', 'SOFT WARM WOOL COAT CALM FEEL WORN BODY COZY MILD EACH COLD DAYS TIME '.repeat(8).trim()],
  ])('allows ordinary %s even when it is long', async (_label, notes) => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file], notes,
    })).resolves.toBeDefined()

    expect(client.rpc).toHaveBeenCalledWith('create_commerce_project', expect.objectContaining({
      p_input_data: expect.objectContaining({ notes }),
    }))
  })

  it('uses the actual composite foreign-key hint when embedding project assets', async () => {
    await repository.listProjects()

    expect(projectQuery.select).toHaveBeenCalledWith(expect.stringContaining(
      'commerce_project_assets!commerce_project_assets_project_owner_fkey(',
    ))
  })

  it('treats a repeated delete RPC P0002 as an idempotent success', async () => {
    const mock = makeClient({
      assetResponse: { data: [], error: null },
      rpcResponses: {
        delete_commerce_project: { data: null, error: { code: 'P0002', message: 'project not found' } },
      },
    })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.deleteProject('project-1')).resolves.toBeUndefined()
  })

  it('changes project retention only through the locked-state RPC after direct updates are revoked', async () => {
    await repository.setProjectLocked('project-1', true)

    expect(client.rpc).toHaveBeenCalledWith('set_commerce_project_locked', {
      p_project_id: 'project-1', p_locked: true,
    })
    expect(projectQuery.update).not.toHaveBeenCalled()
  })

  it('requires a non-anonymous authenticated user before every user and administrator call', async () => {
    const settings = {
      newUserCredits: 3, defaultDailyLimit: 10, maxProjectImages: 6,
      storageSoftLimitBytes: 800000000, storageTargetBytes: 650000000,
    }
    const operations = [
      (repo: CommerceRepository) => repo.getEntitlement(),
      (repo: CommerceRepository) => repo.createProject({
        name: '杯子', mode: 'quick', platform: 'ozon',
        files: [new File(['x'], 'a.png', { type: 'image/png' })],
      }),
      (repo: CommerceRepository) => repo.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()),
      (repo: CommerceRepository) => repo.startGeneration('project-1', 'request-1'),
      (repo: CommerceRepository) => repo.getGeneration('generation-1'),
      (repo: CommerceRepository) => repo.listProjects(),
      (repo: CommerceRepository) => repo.deleteProject('project-1'),
      (repo: CommerceRepository) => repo.setProjectLocked('project-1', true),
      (repo: CommerceRepository) => repo.getAdminDashboard(),
      (repo: CommerceRepository) => repo.setUserEntitlement({
        userId: 'user-2', credits: 999, unlimited: false, disabled: false, dailyLimit: 10, reason: 'friend',
      }),
      (repo: CommerceRepository) => repo.refundGeneration('generation-1', 'manual review'),
      (repo: CommerceRepository) => repo.updateAdminSettings(settings, 'capacity review'),
    ]

    for (const operation of operations) {
      const mock = makeClient({ authUser: { id: 'anonymous-1', is_anonymous: true } })
      const anonymousRepository = createCommerceRepository(mock.client as never)
      await expect(operation(anonymousRepository)).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
      expect(mock.client.from).not.toHaveBeenCalled()
      expect(mock.client.rpc).not.toHaveBeenCalled()
      expect(mock.client.functions.invoke).not.toHaveBeenCalled()
      expect(mock.client.storage.from).not.toHaveBeenCalled()
    }
  })

  it('maps deleted-project generations with a nullable project id', async () => {
    const mock = makeClient({
      generationResponse: {
        data: {
          id: 'generation-1', project_id: null, user_id: 'user-1', idempotency_key: 'request-1', status: 'completed',
          result_data: { productSummary: 'ok' }, provider: 'openai', model: 'gpt', usage: {}, error_code: null,
          error_message: null, credit_charged: true, refunded_at: null, created_at: '2026-08-23T00:00:00.000Z',
          started_at: '2026-08-23T00:00:01.000Z', completed_at: '2026-08-23T00:00:02.000Z',
        }, error: null,
      },
    })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.getGeneration('generation-1')).resolves.toMatchObject({ projectId: null, status: 'completed' })
  })

  it('lists the authenticated user generation history newest first', async () => {
    const rows = [{
      id: 'generation-2', project_id: 'project-1', user_id: 'user-1', idempotency_key: 'request-2', status: 'completed',
      result_data: { productSummary: '方案' }, provider: 'openai', model: 'gpt', usage: null, error_code: null,
      error_message: null, credit_charged: true, refunded_at: null, created_at: '2026-08-27T00:00:00.000Z',
      started_at: '2026-08-27T00:00:01.000Z', completed_at: '2026-08-27T00:00:02.000Z',
    }]
    const mock = makeClient({ generationResponse: { data: rows, error: null } })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.listGenerations()).resolves.toEqual([
      expect.objectContaining({ id: 'generation-2', projectId: 'project-1', status: 'completed' }),
    ])
    expect(mock.client.auth.getUser).toHaveBeenCalledTimes(1)
    expect(mock.generationQuery.select).toHaveBeenCalledWith(expect.stringContaining('result_data'))
    expect(mock.generationQuery.order).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('uses only the administrator RPC contract, including exact mutation parameters', async () => {
    const mock = makeClient({
      rpcResponses: {
        admin_commerce_overview: { data: { total_users: 2 }, error: null },
        admin_list_users: { data: [], error: null },
        admin_list_generations: { data: [], error: null },
        admin_get_settings: { data: { new_user_credits: 3 }, error: null },
      },
    })
    repository = createCommerceRepository(mock.client as never)

    await repository.getAdminDashboard()
    await repository.setUserEntitlement({ userId: 'user-2', credits: 9, unlimited: true, disabled: false, dailyLimit: 25, reason: 'campaign' })
    await repository.refundGeneration('generation-1', '人工复核后退款')
    await repository.updateAdminSettings({
      newUserCredits: 3, defaultDailyLimit: 10, maxProjectImages: 6,
      storageSoftLimitBytes: 800000000, storageTargetBytes: 650000000,
    }, 'capacity review')

    expect(mock.client.rpc).toHaveBeenCalledWith('admin_list_users', { p_search: '', p_limit: 50, p_offset: 0 })
    expect(mock.client.rpc).toHaveBeenCalledWith('admin_list_generations', { p_search: '', p_limit: 50, p_offset: 0 })
    expect(mock.client.rpc).toHaveBeenCalledWith('admin_set_entitlement', {
      p_user_id: 'user-2', p_credits: 9, p_unlimited: true, p_disabled: false, p_daily_limit: 25, p_reason: 'campaign',
    })
    expect(mock.client.rpc).toHaveBeenCalledWith('admin_update_settings', {
      p_settings: {
        new_user_credits: 3, default_daily_limit: 10, max_project_images: 6,
        storage_soft_limit_bytes: 800000000, storage_target_bytes: 650000000,
      },
      p_reason: 'capacity review',
    })
    expect(mock.client.rpc).toHaveBeenCalledWith('admin_refund_commerce_generation', {
      p_generation_id: 'generation-1', p_reason: '人工复核后退款',
    })
  })

  it('passes independent administrator search and paging state to the RPCs', async () => {
    const mock = makeClient({
      rpcResponses: {
        admin_commerce_overview: { data: {}, error: null },
        admin_list_users: { data: [], error: null },
        admin_list_generations: { data: [], error: null },
        admin_get_settings: { data: {}, error: null },
      },
    })
    repository = createCommerceRepository(mock.client as never)

    await repository.getAdminDashboard({
      userSearch: ' friend@example.com ', generationSearch: 'failed', userOffset: 50, generationOffset: 100,
    })

    expect(mock.client.rpc).toHaveBeenCalledWith('admin_list_users', { p_search: 'friend@example.com', p_limit: 50, p_offset: 50 })
    expect(mock.client.rpc).toHaveBeenCalledWith('admin_list_generations', { p_search: 'failed', p_limit: 50, p_offset: 100 })
  })

  it('keeps daily-limit entitlement changes inside the secured administrator RPC contract', () => {
    const migration = readFileSync('supabase/migrations/202608210001_ai_commerce.sql', 'utf8')
    expect(migration).toMatch(/admin_set_entitlement\([\s\S]*p_daily_limit integer[\s\S]*security definer[\s\S]*set search_path = ''/)
    expect(migration).toContain("p_daily_limit not between 1 and 1000")
    expect(migration).toMatch(/set credits = p_credits,[\s\S]*daily_limit = p_daily_limit/)
    expect(migration).toContain("'daily_limit', old_entitlement.daily_limit")
    expect(migration).toContain("'daily_limit', p_daily_limit")
    expect(migration).toContain('grant execute on function public.admin_set_entitlement(uuid, integer, boolean, boolean, integer, text) to authenticated;')
  })

  it('ships a rerunnable compatibility migration for the legacy five-argument entitlement RPC', () => {
    const migration = readFileSync('supabase/migrations/202608290001_admin_entitlement_daily_limit.sql', 'utf8')
    expect(migration).toContain("to_regprocedure('public.admin_set_entitlement(uuid,integer,boolean,boolean,text)')")
    expect(migration).toContain('revoke all on function public.admin_set_entitlement(uuid, integer, boolean, boolean, text)')
    expect(migration).toContain('drop function public.admin_set_entitlement(uuid, integer, boolean, boolean, text)')
    expect(migration).toMatch(/create or replace function public\.admin_set_entitlement\([\s\S]*p_daily_limit integer[\s\S]*security definer[\s\S]*set search_path = ''/)
    expect(migration).toContain('if not public.site_is_admin()')
    expect(migration).toContain('p_daily_limit not between 1 and 1000')
    expect(migration).toContain("'daily_limit', old_entitlement.daily_limit")
    expect(migration).toContain("'daily_limit', p_daily_limit")
    expect(migration).toContain('revoke all on function public.admin_set_entitlement(uuid, integer, boolean, boolean, integer, text)')
    expect(migration).toContain('grant execute on function public.admin_set_entitlement(uuid, integer, boolean, boolean, integer, text) to authenticated;')
  })

  it('publishes only the bounded reservation RPC to authenticated upload callers', () => {
    const migration = readFileSync('supabase/migrations/202608310001_commerce_upload_security.sql', 'utf8')
    expect(migration).toMatch(/create or replace function public\.reserve_commerce_asset\(\s*p_project_id uuid,\s*p_extension text,\s*p_mime_type text,\s*p_size_bytes bigint\s*\)[\s\S]*security definer[\s\S]*set search_path = ''/)
    expect(migration).toMatch(/revoke all on function public\.reserve_commerce_asset\(uuid, text, text, bigint\)\s+from public, anon, authenticated, service_role;/)
    expect(migration).toContain('grant execute on function public.reserve_commerce_asset(uuid, text, text, bigint) to authenticated;')
    expect(migration).not.toMatch(/grant execute on function public\.(?:finalize_commerce_asset_upload|fail_commerce_asset_upload|reconcile_terminal_commerce_assets|list_abandoned_commerce_uploads|list_orphan_commerce_storage_objects)[^;]+to authenticated/i)
  })
})
