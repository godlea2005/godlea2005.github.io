import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  eq: ReturnType<typeof vi.fn>
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
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
    then: (onfulfilled?: ((value: SupabaseResult<unknown>) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) =>
      Promise.resolve(response).then(onfulfilled, onrejected),
  } as QueryBuilder

  builder.insert.mockReturnValue(builder)
  builder.select.mockReturnValue(builder)
  builder.update.mockReturnValue(builder)
  builder.eq.mockReturnValue(builder)
  builder.order.mockReturnValue(builder)
  builder.single.mockResolvedValue(response)
  builder.maybeSingle.mockResolvedValue(response)
  return builder
}

const rejectedQuery = (error: unknown): QueryBuilder => {
  const builder = query({ data: null, error: null })
  builder.then = (_onfulfilled, onrejected) => Promise.reject(error).then(undefined, onrejected)
  return builder
}

const makeClient = (options: {
  assetResponse?: SupabaseResult<unknown>
  projectResponse?: SupabaseResult<unknown>
  generationResponse?: SupabaseResult<unknown>
  rpcResponses?: Record<string, SupabaseResult<unknown>>
  storageUploadError?: unknown
  storageUploadReject?: unknown
  storageRemoveError?: unknown
  readyUpdateError?: unknown
  readyUpdateReject?: unknown
  failedUpdateError?: unknown
  authUser?: { id: string; is_anonymous?: boolean } | null
  authError?: unknown
  functionResponse?: SupabaseResult<unknown>
} = {}) => {
  const assetQuery = query(options.assetResponse ?? {
    data: {
      id: 'asset-1', project_id: 'project-1', user_id: 'user-1', storage_path: 'user-1/project-1/file.png',
      mime_type: 'image/png', size_bytes: 3, expires_at: '2026-08-30T00:00:00.000Z', state: 'uploading',
      deleted_at: null, created_at: '2026-08-23T00:00:00.000Z',
    },
    error: null,
  })
  const readyUpdateQuery = options.readyUpdateReject
    ? rejectedQuery(options.readyUpdateReject)
    : query({ data: null, error: options.readyUpdateError ?? null })
  const failedUpdateQuery = query({ data: null, error: options.failedUpdateError ?? null })
  assetQuery.update.mockImplementation((payload: { state?: string }) =>
    payload.state === 'failed' ? failedUpdateQuery : readyUpdateQuery,
  )
  const projectQuery = query(options.projectResponse ?? { data: [], error: null })
  const generationQuery = query(options.generationResponse ?? { data: null, error: null })
  const storageUpload = vi.fn().mockResolvedValue({ data: { path: 'uploaded' }, error: options.storageUploadError ?? null })
  if (options.storageUploadReject) storageUpload.mockRejectedValue(options.storageUploadReject)
  const storage = {
    upload: storageUpload,
    remove: vi.fn().mockResolvedValue({ data: [], error: options.storageRemoveError ?? null }),
  }
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
      invoke: vi.fn().mockResolvedValue(options.functionResponse ?? {
        data: { generationId: 'generation-1', status: 'queued' }, error: null,
      }),
    },
    rpc: vi.fn((name: string) => Promise.resolve(options.rpcResponses?.[name] ?? { data: null, error: null })),
  }
  return { client, assetQuery, readyUpdateQuery, failedUpdateQuery, projectQuery, generationQuery, storage }
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
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('123e4567-e89b-12d3-a456-426614174000')
  })

  afterEach(() => vi.restoreAllMocks())

  it('stores validated images under the authenticated user/project path and reports file states', async () => {
    const progress = vi.fn()
    const file = new File(['png'], '产品 图.png', { type: 'image/png' })

    await repository.uploadAssets('project-1', [file], progress)

    expect(assetQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      project_id: 'project-1', user_id: 'user-1', state: 'uploading',
      storage_path: 'user-1/project-1/123e4567-e89b-12d3-a456-426614174000.png',
    }))
    expect(storage.upload).toHaveBeenCalledWith(
      'user-1/project-1/123e4567-e89b-12d3-a456-426614174000.png',
      file,
      { contentType: 'image/png', upsert: false },
    )
    expect(assetQuery.update).toHaveBeenCalledWith({ state: 'ready' })
    expect(progress).toHaveBeenNthCalledWith(1, {
      completedFiles: 0, totalFiles: 1, currentFile: { name: '产品 图.png', state: 'uploading' },
    })
    expect(progress).toHaveBeenLastCalledWith({
      completedFiles: 1, totalFiles: 1, currentFile: { name: '产品 图.png', state: 'ready' },
    })
  })

  it('marks an asset failed and gives an actionable Chinese error when storage upload fails', async () => {
    const mock = makeClient({ storageUploadError: { message: 'bucket unavailable' } })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()))
      .rejects.toThrow('网络或服务暂时不可用')

    expect(mock.assetQuery.update).toHaveBeenCalledWith({ state: 'failed' })
    expect(mock.assetQuery.update.mock.invocationCallOrder[0]).toBeGreaterThan(mock.storage.upload.mock.invocationCallOrder[0])
  })

  it('surfaces a failed-state write error instead of silently leaving an uploading asset behind', async () => {
    const failedStateError = { message: 'database unavailable' }
    const mock = makeClient({ storageUploadError: { message: 'bucket unavailable' }, failedUpdateError: failedStateError })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()))
      .rejects.toMatchObject({ code: 'NETWORK', cause: failedStateError })

    expect(mock.assetQuery.update).toHaveBeenCalledWith({ state: 'failed' })
  })

  it('marks an asset failed when Storage rejects instead of returning an error result', async () => {
    const storageFailure = new TypeError('Failed to fetch')
    const mock = makeClient({ storageUploadReject: storageFailure })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()))
      .rejects.toMatchObject({ code: 'NETWORK', cause: storageFailure })

    expect(mock.assetQuery.update).toHaveBeenCalledWith({ state: 'failed' })
  })

  it('marks an asset failed when the ready-state update rejects', async () => {
    const readyFailure = new TypeError('Failed to fetch')
    const mock = makeClient({ readyUpdateReject: readyFailure })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()))
      .rejects.toMatchObject({ code: 'NETWORK', cause: readyFailure })

    expect(mock.assetQuery.update).toHaveBeenNthCalledWith(1, { state: 'ready' })
    expect(mock.assetQuery.update).toHaveBeenNthCalledWith(2, { state: 'failed' })
  })

  it('marks an asset failed when the ready-state update resolves with an error', async () => {
    const readyFailure = { message: 'ready update unavailable' }
    const mock = makeClient({ readyUpdateError: readyFailure })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.uploadAssets('project-1', [new File(['x'], 'a.png', { type: 'image/png' })], vi.fn()))
      .rejects.toMatchObject({ code: 'NETWORK', cause: readyFailure })

    expect(mock.assetQuery.update).toHaveBeenNthCalledWith(1, { state: 'ready' })
    expect(mock.assetQuery.update).toHaveBeenNthCalledWith(2, { state: 'failed' })
  })

  it('removes every owned storage object before deleting the project record', async () => {
    const mock = makeClient({
      assetResponse: { data: [{ storage_path: 'user-1/project-1/a.png' }, { storage_path: 'user-1/project-1/b.webp' }], error: null },
    })
    repository = createCommerceRepository(mock.client as never)

    await repository.deleteProject('project-1')

    expect(mock.assetQuery.eq).toHaveBeenCalledWith('project_id', 'project-1')
    expect(mock.assetQuery.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mock.storage.remove).toHaveBeenCalledWith(['user-1/project-1/a.png', 'user-1/project-1/b.webp'])
    expect(mock.client.rpc).toHaveBeenCalledWith('delete_commerce_project', { p_project_id: 'project-1' })
    expect(mock.client.rpc.mock.invocationCallOrder[0]).toBeGreaterThan(mock.storage.remove.mock.invocationCallOrder[0])
  })

  it('keeps the project for retry and never calls the delete RPC when storage removal fails', async () => {
    const mock = makeClient({
      assetResponse: { data: [{ storage_path: 'user-1/project-1/a.png' }], error: null },
      storageRemoveError: { message: 'permission denied' },
    })
    repository = createCommerceRepository(mock.client as never)

    await expect(repository.deleteProject('project-1')).rejects.toThrow('网络或服务暂时不可用')

    expect(mock.client.rpc).not.toHaveBeenCalled()
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
    [403, { code: 'FORBIDDEN', message: 'forbidden' }, 'AUTH_REQUIRED'],
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
    [{ code: '28000', message: 'commerce authentication required' }, '登录已失效'],
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

    const payload = mock.projectQuery.insert.mock.calls[0][0]
    expect(payload.input_data).toEqual({ category: '家居', notes: '无反光' })
    expect(JSON.stringify(payload.input_data)).not.toContain('blob:')
    expect(JSON.stringify(payload.input_data)).not.toContain('base64')
    expect(JSON.stringify(payload.input_data)).not.toContain('"files"')
  })

  it('rejects transient image URLs and Base64 data before persisting project input', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file],
      notes: 'data:image/png;base64,AAAA',
    })).rejects.toThrow('不支持保存图片 URL 或 Base64 数据')

    expect(projectQuery.insert).not.toHaveBeenCalled()
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

    expect(projectQuery.insert).not.toHaveBeenCalled()
  })

  it('rejects Base64 data URLs with media-type parameters before persisting project input', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file],
      notes: 'data:image/png;charset=utf-8;base64,AAAA',
    })).rejects.toThrow('不支持保存图片 URL 或 Base64 数据')

    expect(projectQuery.insert).not.toHaveBeenCalled()
  })

  it('rejects long raw Base64 payloads before persisting project input', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file],
      notes: 'A'.repeat(512),
    })).rejects.toThrow('不支持保存图片 URL 或 Base64 数据')

    expect(projectQuery.insert).not.toHaveBeenCalled()
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

    expect(projectQuery.insert).not.toHaveBeenCalled()
  })

  it('does not mistake ordinary long prose for raw Base64', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    const notes = 'This is a normal product description with many short words, punctuation, and useful details. '.repeat(12)

    await expect(repository.createProject({
      name: '保温杯', mode: 'professional', platform: 'ozon', files: [file], notes,
    })).resolves.toBeDefined()

    expect(projectQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      input_data: expect.objectContaining({ notes }),
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

    expect(projectQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      input_data: expect.objectContaining({ notes }),
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
        userId: 'user-2', credits: 999, unlimited: false, disabled: false, reason: 'friend',
      }),
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
    await repository.setUserEntitlement({ userId: 'user-2', credits: 9, unlimited: true, disabled: false, reason: 'campaign' })
    await repository.updateAdminSettings({
      newUserCredits: 3, defaultDailyLimit: 10, maxProjectImages: 6,
      storageSoftLimitBytes: 800000000, storageTargetBytes: 650000000,
    }, 'capacity review')

    expect(mock.client.rpc).toHaveBeenCalledWith('admin_list_users', { p_search: '', p_limit: 50, p_offset: 0 })
    expect(mock.client.rpc).toHaveBeenCalledWith('admin_list_generations', { p_search: '', p_limit: 50, p_offset: 0 })
    expect(mock.client.rpc).toHaveBeenCalledWith('admin_set_entitlement', {
      p_user_id: 'user-2', p_credits: 9, p_unlimited: true, p_disabled: false, p_reason: 'campaign',
    })
    expect(mock.client.rpc).toHaveBeenCalledWith('admin_update_settings', {
      p_settings: {
        new_user_credits: 3, default_daily_limit: 10, max_project_images: 6,
        storage_soft_limit_bytes: 800000000, storage_target_bytes: 650000000,
      },
      p_reason: 'capacity review',
    })
  })
})
