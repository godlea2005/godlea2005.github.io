import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../src/auth/AuthProvider'
import type { CommerceRepository } from '../src/commerce/commerceRepository'
import { CommerceRepositoryError } from '../src/commerce/commerceErrors'
import type { CommerceGeneration, CommerceProject, CommerceResult } from '../src/commerce/types'

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }))

vi.mock('../src/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/AuthProvider')>()
  return { ...actual, useAuth: authMock.useAuth }
})

vi.mock('../src/music/GlobalMusicDock', () => ({ GlobalMusicDock: ({ commerceMode = false }: { commerceMode?: boolean }) => <div data-testid="music-dock-mode" data-mode={commerceMode ? 'commerce' : 'default'} /> }))
vi.mock('../src/components/StatusScene', () => ({ StatusScene: () => <section>HOME</section> }))
vi.mock('../src/components/StudioMap', () => ({ StudioMap: () => null }))
vi.mock('../src/components/ProjectArchive', () => ({ ProjectArchive: () => null }))

import App from '../src/App'
import { CommerceProjectForm } from '../src/commerce/CommerceProjectForm'
import { CommerceStudioPage } from '../src/commerce/CommerceStudioPage'
import { CommerceHistoryDrawer } from '../src/commerce/CommerceHistoryDrawer'
import { COMMERCE_AUTH_DRAFT_KEY, saveCommerceAuthDraft } from '../src/commerce/commerceAuthDraft'
import { FloatingHeader } from '../src/components/FloatingHeader'
import { useCommerceRun } from '../src/commerce/useCommerceRun'

const image = (name = 'cup.png', type = 'image/png', size = 1) =>
  new File([new Uint8Array(size)], name, { type })

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const project: CommerceProject = {
  id: 'project-1', userId: 'user-1', name: '保温杯', platform: 'ozon', mode: 'quick',
  inputData: {}, locked: false, createdAt: '2026-08-26T00:00:00.000Z',
  updatedAt: '2026-08-26T00:00:00.000Z', assets: [],
}

const generation = (status: CommerceGeneration['status']): CommerceGeneration => ({
  id: 'generation-1', projectId: 'project-1', userId: 'user-1', idempotencyKey: 'request-1',
  status, resultData: null, provider: null, model: null, usage: null, errorCode: null,
  errorMessage: status === 'failed' ? '模型暂时不可用' : null, creditCharged: true,
  refundedAt: status === 'failed' ? '2026-08-26T00:00:02.000Z' : null,
  createdAt: '2026-08-26T00:00:00.000Z', startedAt: null, completedAt: null,
})

const makeRepository = (overrides: Partial<CommerceRepository> = {}): CommerceRepository => ({
  getEntitlement: vi.fn().mockResolvedValue({
    userId: 'user-1', credits: 3, unlimited: false, disabled: false, dailyLimit: 10,
    updatedAt: '2026-08-26T00:00:00.000Z',
  }),
  createProject: vi.fn().mockResolvedValue(project),
  uploadAssets: vi.fn().mockImplementation(async (_projectId, files, onProgress) => {
    onProgress({ completedFiles: 0, totalFiles: files.length, currentFile: { name: files[0].name, state: 'uploading' } })
    onProgress({ completedFiles: files.length, totalFiles: files.length, currentFile: { name: files.at(-1).name, state: 'ready' } })
    return []
  }),
  startGeneration: vi.fn().mockResolvedValue({ generationId: 'generation-1', status: 'queued' }),
  getGeneration: vi.fn().mockResolvedValue(generation('completed')),
  listProjects: vi.fn().mockResolvedValue([]),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  setProjectLocked: vi.fn().mockResolvedValue(undefined),
  getAdminDashboard: vi.fn(), setUserEntitlement: vi.fn(), refundGeneration: vi.fn(), updateAdminSettings: vi.fn(),
  ...overrides,
})

const signedInAuth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  configured: true, ready: true, user: { id: 'user-1' } as AuthContextValue['user'],
  isAnonymous: false, isAdmin: false, provider: 'github', providers: { github: true, google: true },
  error: '', signIn: vi.fn(), signOut: vi.fn(), requireLogin: vi.fn(() => true), ...overrides,
})

async function completeQuickForm() {
  await userEvent.type(screen.getByLabelText('产品名称'), '保温杯')
  await userEvent.upload(screen.getByLabelText('上传产品图'), image())
  await userEvent.click(screen.getByRole('button', { name: '下一步' }))
  await userEvent.click(screen.getByRole('button', { name: '下一步' }))
  await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
}

function advanceToConfirmation() {
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
  fireEvent.click(screen.getByRole('button', { name: '下一步' }))
}

describe('AI commerce project form', () => {
  let createObjectURL: ReturnType<typeof vi.fn>
  let revokeObjectURL: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectURL = vi.fn((file: File) => `blob:test/${file.name}`)
    revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    authMock.useAuth.mockReturnValue(signedInAuth())
    window.location.hash = ''
  })

  afterEach(() => {
    cleanup()
    window.sessionStorage.clear()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('keeps analysis disabled until quick fields and processing consent are complete', async () => {
    render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '生成视觉方案' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请先填写产品名称并上传至少 1 张产品图')
    await userEvent.type(screen.getByLabelText('产品名称'), '保温杯')
    await userEvent.upload(screen.getByLabelText('上传产品图'), image())
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    const submit = screen.getByRole('button', { name: '生成视觉方案' })
    expect(submit).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    expect(submit).toBeEnabled()
  })

  it('reveals every professional field without losing quick input', async () => {
    render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    await userEvent.type(screen.getByLabelText('产品名称'), '旅行杯')
    const professionalMode = screen.getByRole('button', { name: '专业模式' })
    await userEvent.click(professionalMode)
    expect(professionalMode).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByDisplayValue('旅行杯')).toBeInTheDocument()
    for (const label of ['产品类目', '规格参数', '价格区间', '核心卖点', '目标人群', '品牌语气', '竞品链接', '禁用词与禁改细节', '期望视觉风格', '补充说明']) {
      expect(screen.getByLabelText(label)).toBeInTheDocument()
    }
  })

  it('uses exact supported platform values and names Russian-market context explicitly', () => {
    render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: '保温杯' } })
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: [image()] } })
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByRole('radio', { name: /Ozon/ })).toHaveAttribute('value', 'ozon')
    expect(screen.getByRole('radio', { name: /Wildberries/ })).toHaveAttribute('value', 'wildberries')
    expect(screen.getByRole('radio', { name: /抖音电商/ })).toHaveAttribute('value', 'douyin')
    expect(screen.getByRole('radio', { name: /淘宝\/天猫/ })).toHaveAttribute('value', 'taobao-tmall')
    expect(screen.getAllByText(/俄罗斯市场/)).toHaveLength(2)
  })

  it('creates and revokes preview object URLs on remove and unmount', async () => {
    const view = render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    await userEvent.upload(screen.getByLabelText('上传产品图'), [image('a.png'), image('b.png')])
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    await userEvent.click(screen.getByRole('button', { name: '移除 a.png' }))
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/a.png')
    view.unmount()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test/b.png')
  })

  it('reports invalid files and enforces the six-image maximum', async () => {
    render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: [image('vector.svg', 'image/svg+xml')] } })
    expect(screen.getByRole('alert')).toHaveTextContent('仅支持 JPEG、PNG 或 WebP 图片')
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: Array.from({ length: 7 }, (_, index) => image(`${index}.png`)) } })
    expect(screen.getByRole('alert')).toHaveTextContent('最多上传 6 张')
    expect(screen.queryAllByRole('img', { name: /预览/ })).toHaveLength(0)
  })

  it('skips duplicate files by stable fingerprint and explains why', async () => {
    render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    const duplicate = image('same.png')
    const input = screen.getByLabelText('上传产品图')
    await userEvent.upload(input, duplicate)
    await userEvent.upload(input, duplicate)
    expect(screen.getAllByRole('img', { name: /预览/ })).toHaveLength(1)
    expect(screen.getByRole('status', { name: '文件提示' })).toHaveTextContent('已跳过重复图片：same.png')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('exposes required guidance and pressed-button mode semantics', () => {
    render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    expect(screen.getByText(/提交前还需要：产品名称、至少 1 张产品图、素材权利与 AI 处理确认/)).toBeInTheDocument()
    expect(screen.getByLabelText('产品名称')).toBeRequired()
    expect(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/, hidden: true })).toBeRequired()
    expect(screen.getByRole('button', { name: '快速模式' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('exposes product, market and confirmation step semantics with validated progression', async () => {
    const view = render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    const stepper = view.container.querySelector<HTMLElement>('.commerce-step-rail')
    const stepButtons = stepper?.querySelectorAll('button')
    expect(stepper).toHaveAttribute('aria-label', '填写步骤')
    expect(stepper).toHaveAttribute('data-current-step', '1')
    expect(stepButtons?.[0]).toHaveAttribute('aria-current', 'step')
    expect(stepButtons?.[1]).toBeDisabled()
    fireEvent.click(stepButtons![1])
    expect(stepper).toHaveAttribute('data-current-step', '1')
    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: '保温杯' } })
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: [image()] } })
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(stepper).toHaveAttribute('data-current-step', '2')
    expect(screen.getByTestId('market-step')).toHaveAttribute('data-step', '2')
    fireEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByTestId('confirm-step')).toHaveAttribute('data-step', '3')
  })

  it('keeps professional product and market fields grouped in their matching steps', async () => {
    const view = render(<CommerceProjectForm onSubmitted={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: '专业模式' }))
    const product = view.container.querySelector('[data-step="1"]')!
    const market = view.container.querySelector('[data-step="2"]')!
    expect(product.querySelector('[data-professional-step="1"]')).toBeInTheDocument()
    expect(market.querySelector('[data-professional-step="2"]')).toBeInTheDocument()
    expect(screen.getByText('01 / PRODUCT')).toBeInTheDocument()
  })

  it('normalizes legacy status, progress and error props when runState is omitted', () => {
    const progress = { completedFiles: 0, totalFiles: 1, currentFile: { name: 'cup.png', state: 'uploading' as const } }
    const { rerender } = render(<CommerceProjectForm onSubmitted={vi.fn()} status="uploading" progress={progress} />)
    expect(screen.getByRole('button', { name: '正在上传图片' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('0 / 1 张 · cup.png · 正在上传')

    rerender(<CommerceProjectForm onSubmitted={vi.fn()} status="failed" error="旧调用仍可显示错误" onRetry={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('旧调用仍可显示错误')
    expect(screen.getByRole('button', { name: '重试本次生成' })).toBeInTheDocument()
  })

  it('rejects a synthetic form submit while account recovery is the only action', async () => {
    const onSubmitted = vi.fn()
    const runState = {
      phase: 'auth-recovery' as const,
      progress: null,
      error: new CommerceRepositoryError('AUTH_REQUIRED', '请重新连接账号。'),
      result: null,
      resultNotice: '',
      resultUnavailable: '',
      generation: null,
      pollWarning: '',
    }
    const draft = { mode: 'quick' as const, name: '保温杯', platform: 'ozon' as const, files: [image()] }
    const onRecoverAuthentication = vi.fn()
    const view = render(<CommerceProjectForm onSubmitted={onSubmitted} initialDraft={draft} onRecoverAuthentication={onRecoverAuthentication} />)
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    view.rerender(<CommerceProjectForm onSubmitted={onSubmitted} runState={runState} initialDraft={draft} onRecoverAuthentication={onRecoverAuthentication} />)

    fireEvent.submit(view.container.querySelector('form')!)

    expect(onSubmitted).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '重新连接账号' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '生成视觉方案' })).not.toBeInTheDocument()
  })
})

describe('AI commerce submission workflow', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test/cup') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('requires OAuth before exposing fields or local file selection', async () => {
    const auth = signedInAuth({ user: null, isAnonymous: true, requireLogin: vi.fn(() => false) })
    authMock.useAuth.mockReturnValue(auth)
    const repository = makeRepository()
    render(<CommerceStudioPage repository={repository} />)
    expect(screen.queryByLabelText('上传产品图')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('产品名称')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /登录进入工作台/ }))
    expect(auth.requireLogin).toHaveBeenCalledWith('#ai-commerce')
    expect(repository.createProject).not.toHaveBeenCalled()
    expect(repository.uploadAssets).not.toHaveBeenCalled()
    expect(repository.startGeneration).not.toHaveBeenCalled()
  })

  it('keeps the submit-time auth defense before every repository mutation', async () => {
    const auth = signedInAuth({ requireLogin: vi.fn(() => false) })
    authMock.useAuth.mockReturnValue(auth)
    const repository = makeRepository()
    render(<CommerceStudioPage repository={repository} />)
    await completeQuickForm()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(auth.requireLogin).toHaveBeenCalledWith('#ai-commerce')
    expect(repository.createProject).not.toHaveBeenCalled()
    expect(repository.uploadAssets).not.toHaveBeenCalled()
    expect(repository.startGeneration).not.toHaveBeenCalled()
  })

  it('offers forced account recovery, and never a normal submit, after AUTH_REQUIRED', async () => {
    const auth = signedInAuth()
    authMock.useAuth.mockReturnValue(auth)
    const repository = makeRepository({ createProject: vi.fn().mockRejectedValue(new CommerceRepositoryError('AUTH_REQUIRED', '登录状态需要恢复。')) })
    render(<CommerceStudioPage repository={repository} />)
    await completeQuickForm()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('登录状态需要恢复')
    expect(screen.getByRole('button', { name: '重新连接账号' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '重试本次生成' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '生成视觉方案' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('上传产品图')).toBeDisabled()
    await userEvent.type(screen.getByLabelText('产品名称'), ' Pro')
    expect(screen.getByRole('button', { name: '重新连接账号' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '生成视觉方案' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重新连接账号' }))
    expect(auth.requireLogin).toHaveBeenLastCalledWith('#ai-commerce', { force: true })
    const saved = window.sessionStorage.getItem(COMMERCE_AUTH_DRAFT_KEY)
    expect(JSON.parse(saved!)).toMatchObject({ ownerId: 'user-1', input: { name: '保温杯 Pro' } })
    expect(saved).not.toMatch(/files|cup\.png|base64|token/i)
  })

  it('rejects direct hook submission while auth recovery remains unresolved', async () => {
    const auth = signedInAuth()
    const repository = makeRepository({ createProject: vi.fn().mockRejectedValue(new CommerceRepositoryError('AUTH_REQUIRED', '登录状态需要恢复。')) })
    const input = { mode: 'quick' as const, name: '保温杯', platform: 'ozon' as const, files: [image()] }
    const createIdempotencyKey = () => 'request-1'
    const onRefreshEntitlement = vi.fn()
    const { result } = renderHook(() => useCommerceRun({
      repository,
      auth,
      authenticatedUserId: 'user-1',
      pollIntervalMs: 2_000,
      createIdempotencyKey,
      onRefreshEntitlement,
    }))
    await act(async () => { await result.current.submit(input) })
    expect(result.current.state.phase).toBe('auth-recovery')

    await act(async () => { await result.current.submit(input) })

    expect(repository.createProject).toHaveBeenCalledTimes(1)
    expect(repository.uploadAssets).not.toHaveBeenCalled()
    expect(repository.startGeneration).not.toHaveBeenCalled()
    expect(result.current.state.phase).toBe('auth-recovery')
  })

  it('restores a same-user OAuth text draft once with no files and a clear reselection notice', async () => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    saveCommerceAuthDraft({ ownerId: 'user-1', input: { mode: 'quick', name: '回站草稿', platform: 'ozon', files: [image()] } })

    render(<CommerceStudioPage repository={makeRepository()} />)

    expect(await screen.findByDisplayValue('回站草稿')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '文件提示' })).toHaveTextContent('文字资料已恢复，请重新选择本地图片')
    expect(screen.queryAllByRole('img', { name: /预览/ })).toHaveLength(0)
    expect(window.sessionStorage.getItem(COMMERCE_AUTH_DRAFT_KEY)).toBeNull()
  })

  it('retries AUTH_REQUIRED cleanup after OAuth before allowing another upload and refreshes history', async () => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    const order: string[] = []
    const restoredCleanup = deferred<void>()
    const repository = makeRepository({
      createProject: vi.fn(async () => { order.push('create'); return project }),
      uploadAssets: vi.fn()
        .mockImplementationOnce(async () => { order.push('upload:first'); throw new Error('上传中断') })
        .mockImplementationOnce(async () => { order.push('upload:second'); return [] }),
      deleteProject: vi.fn()
        .mockImplementationOnce(async () => { order.push('delete:auth'); throw new CommerceRepositoryError('AUTH_REQUIRED', '登录状态需要恢复。') })
        .mockImplementationOnce(() => { order.push('delete:restored'); return restoredCleanup.promise }),
      listProjects: vi.fn(async () => { order.push('history'); return [] }),
      startGeneration: vi.fn(async () => { order.push('start'); return { generationId: 'generation-1', status: 'queued' } }),
    })
    const first = render(<CommerceStudioPage repository={repository} />)
    await completeQuickForm()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('清理未完成项目需要重新连接账号')
    expect(screen.getByRole('button', { name: '重新连接账号' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重新连接账号' }))
    first.unmount()

    render(<CommerceStudioPage repository={repository} />)
    await waitFor(() => expect(repository.deleteProject).toHaveBeenCalledTimes(2))
    expect(await screen.findByDisplayValue('保温杯')).toBeInTheDocument()
    expect(screen.getByLabelText('上传产品图')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: /历史项目/ }))
    await waitFor(() => expect(repository.listProjects).toHaveBeenCalledTimes(1))
    await act(async () => { restoredCleanup.resolve(); await restoredCleanup.promise })
    expect(screen.getByRole('status', { name: '文件提示' })).toHaveTextContent('文字资料已恢复，请重新选择本地图片')
    await waitFor(() => expect(repository.listProjects).toHaveBeenCalledTimes(2))
    fireEvent.keyDown(document, { key: 'Escape' })

    await userEvent.upload(screen.getByLabelText('上传产品图'), image('again.png'))
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    await waitFor(() => expect(repository.uploadAssets).toHaveBeenCalledTimes(2))
    expect(order.indexOf('delete:restored')).toBeLessThan(order.indexOf('upload:second'))
    expect(repository.startGeneration).toHaveBeenCalledTimes(1)
  })

  it('coalesces synchronous double submission before the first project request settles', async () => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    const creating = deferred<CommerceProject>()
    const repository = makeRepository({ createProject: vi.fn(() => creating.promise) })
    render(<CommerceStudioPage repository={repository} />)
    await completeQuickForm()
    const submit = screen.getByRole('button', { name: '生成视觉方案' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(repository.createProject).toHaveBeenCalledTimes(1))
    expect(repository.startGeneration).not.toHaveBeenCalled()
  })

  it('runs create, upload and generation in order and reuses one key after a recoverable failure', async () => {
    const auth = signedInAuth()
    authMock.useAuth.mockReturnValue(auth)
    const order: string[] = []
    const repository = makeRepository({
      createProject: vi.fn(async () => { order.push('create'); return project }),
      uploadAssets: vi.fn(async () => { order.push('upload'); return [] }),
      startGeneration: vi.fn()
        .mockImplementationOnce(async (_id, key) => { order.push(`start:${key}`); throw new Error('网络中断') })
        .mockImplementationOnce(async (_id, key) => { order.push(`start:${key}`); return { generationId: 'generation-1', status: 'queued' } }),
    })
    render(<CommerceStudioPage repository={repository} />)
    await completeQuickForm()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('网络中断')
    await userEvent.click(screen.getByRole('button', { name: '重试本次生成' }))
    await waitFor(() => expect(repository.startGeneration).toHaveBeenCalledTimes(2))
    const firstKey = vi.mocked(repository.startGeneration).mock.calls[0][1]
    const secondKey = vi.mocked(repository.startGeneration).mock.calls[1][1]
    expect(firstKey).toBeTruthy()
    expect(secondKey).toBe(firstKey)
    expect(repository.createProject).toHaveBeenCalledTimes(1)
    expect(repository.uploadAssets).toHaveBeenCalledTimes(1)
    expect(order.map((item) => item.split(':')[0])).toEqual(['create', 'upload', 'start', 'start'])
  })

  it('starts a new attempt key after a material form change', async () => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    const repository = makeRepository({
      startGeneration: vi.fn()
        .mockRejectedValueOnce(new Error('网络中断'))
        .mockResolvedValueOnce({ generationId: 'generation-2', status: 'queued' }),
    })
    render(<CommerceStudioPage repository={repository} />)
    await completeQuickForm()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('网络中断')

    await userEvent.type(screen.getByLabelText('产品名称'), ' Pro')
    expect(screen.queryByRole('button', { name: '重试本次生成' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    await waitFor(() => expect(repository.startGeneration).toHaveBeenCalledTimes(2))

    const keys = vi.mocked(repository.startGeneration).mock.calls.map((call) => call[1])
    expect(keys[1]).not.toBe(keys[0])
    expect(repository.createProject).toHaveBeenCalledTimes(2)
  })

  it('shows truthful file-count progress and a retry action after upload failure', async () => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    const repository = makeRepository({
      uploadAssets: vi.fn()
        .mockImplementationOnce(async (_id, files, onProgress) => {
          onProgress({ completedFiles: 0, totalFiles: files.length, currentFile: { name: 'cup.png', state: 'uploading' } })
          onProgress({ completedFiles: 0, totalFiles: files.length, currentFile: { name: 'cup.png', state: 'failed' } })
          throw new Error('上传失败，请检查网络后重试')
        })
        .mockResolvedValueOnce([]),
    })
    render(<CommerceStudioPage repository={repository} />)
    await completeQuickForm()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByText('0 / 1 张 · cup.png · 上传失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试本次生成' })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/%/)
  })

  it('cleans a partially uploaded project before retrying without changing the idempotency key', async () => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    const firstProject = { ...project, id: 'project-partial' }
    const retryProject = { ...project, id: 'project-retry' }
    const order: string[] = []
    const repository = makeRepository({
      createProject: vi.fn()
        .mockImplementationOnce(async () => { order.push('create:project-partial'); return firstProject })
        .mockImplementationOnce(async () => { order.push('create:project-retry'); return retryProject }),
      uploadAssets: vi.fn()
        .mockImplementationOnce(async (projectId, files, onProgress) => {
          order.push(`upload:${projectId}`)
          onProgress({ completedFiles: 1, totalFiles: files.length, currentFile: { name: files[0].name, state: 'ready' } })
          onProgress({ completedFiles: 1, totalFiles: files.length, currentFile: { name: files[1].name, state: 'failed' } })
          throw new Error('第二张上传失败')
        })
        .mockImplementationOnce(async (projectId) => { order.push(`upload:${projectId}`); return [] }),
      deleteProject: vi.fn(async (projectId) => { order.push(`delete:${projectId}`) }),
      startGeneration: vi.fn(async (projectId, key) => {
        order.push(`start:${projectId}:${key}`)
        return { generationId: 'generation-retry', status: 'queued' }
      }),
    })
    const createKey = vi.fn(() => 'stable-key')
    render(<CommerceStudioPage repository={repository} createIdempotencyKey={createKey} />)
    await userEvent.type(screen.getByLabelText('产品名称'), '保温杯')
    await userEvent.upload(screen.getByLabelText('上传产品图'), [image('first.png'), image('second.png')])
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('临时项目已安全清理')
    await userEvent.click(screen.getByRole('button', { name: '重试本次生成' }))
    await waitFor(() => expect(repository.startGeneration).toHaveBeenCalledWith('project-retry', 'stable-key'))
    expect(createKey).toHaveBeenCalledTimes(1)
    expect(repository.uploadAssets).toHaveBeenCalledTimes(2)
    expect(vi.mocked(repository.uploadAssets).mock.calls.map((call) => call[0])).toEqual(['project-partial', 'project-retry'])
    expect(order).toEqual([
      'create:project-partial', 'upload:project-partial', 'delete:project-partial',
      'create:project-retry', 'upload:project-retry', 'start:project-retry:stable-key',
    ])
  })

  it('blocks blind retransmission when partial-project cleanup fails', async () => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    const repository = makeRepository({
      uploadAssets: vi.fn().mockRejectedValue(new Error('第二张上传失败')),
      deleteProject: vi.fn().mockRejectedValue(new Error('清理接口不可用')),
    })
    render(<CommerceStudioPage repository={repository} />)
    await completeQuickForm()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('为避免重复图片已停止重传')
    expect(screen.queryByRole('button', { name: '重试本次生成' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '返回修改资料' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '生成视觉方案' })).not.toBeInTheDocument()
    expect(repository.uploadAssets).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['completed', '方案生成完成'],
    ['failed', 'AI 服务未能完成分析'],
    ['cancelled', '任务已取消'],
  ] as const)('handles a direct %s response from startGeneration as terminal', async (terminalStatus, expectedCopy) => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    const repository = makeRepository({
      startGeneration: vi.fn().mockResolvedValue({ generationId: 'generation-direct', status: terminalStatus }),
    })
    render(<CommerceStudioPage repository={repository} pollIntervalMs={5} />)
    await completeQuickForm()
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    if (terminalStatus === 'completed') {
      expect((await screen.findAllByText(expectedCopy)).length).toBeGreaterThan(0)
    } else {
      expect(await screen.findByRole('alert')).toHaveTextContent(expectedCopy)
    }
    await new Promise((resolve) => window.setTimeout(resolve, 20))
    expect(repository.getGeneration).toHaveBeenCalledTimes(terminalStatus === 'completed' ? 1 : 0)
    if (terminalStatus === 'completed') {
      expect(screen.queryByRole('button', { name: '重试本次生成' })).not.toBeInTheDocument()
    } else {
      expect(screen.getByRole('button', { name: '重试本次生成' })).toBeInTheDocument()
    }
  })

  it('refreshes authoritative credits after generation acceptance and after a failed refund', async () => {
    vi.useFakeTimers()
    authMock.useAuth.mockReturnValue(signedInAuth())
    const entitlement = (credits: number) => ({
      userId: 'user-1', credits, unlimited: false, disabled: false, dailyLimit: 10,
      updatedAt: '2026-08-26T00:00:00.000Z',
    })
    const repository = makeRepository({
      getEntitlement: vi.fn()
        .mockResolvedValueOnce(entitlement(3))
        .mockResolvedValueOnce(entitlement(2))
        .mockResolvedValueOnce(entitlement(3)),
      getGeneration: vi.fn().mockResolvedValue(generation('failed')),
    })
    render(<CommerceStudioPage repository={repository} />)
    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: '保温杯' } })
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: [image()] } })
    advanceToConfirmation()
    fireEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
      for (let index = 0; index < 10; index += 1) await Promise.resolve()
    })
    expect(screen.getAllByText('2 次').length).toBeGreaterThan(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByRole('alert')).toHaveTextContent('模型暂时不可用')
    await act(async () => { for (let index = 0; index < 5; index += 1) await Promise.resolve() })
    expect(screen.getAllByText('3 次').length).toBeGreaterThan(0)
    expect(repository.getEntitlement).toHaveBeenCalledTimes(3)
  })

  it('ignores stale entitlement responses across initial, charged and refunded refreshes', async () => {
    vi.useFakeTimers()
    authMock.useAuth.mockReturnValue(signedInAuth())
    const initial = deferred<Awaited<ReturnType<CommerceRepository['getEntitlement']>>>()
    const charged = deferred<Awaited<ReturnType<CommerceRepository['getEntitlement']>>>()
    const refunded = deferred<Awaited<ReturnType<CommerceRepository['getEntitlement']>>>()
    const entitlement = (credits: number) => ({
      userId: 'user-1', credits, unlimited: false, disabled: false, dailyLimit: 10,
      updatedAt: '2026-08-26T00:00:00.000Z',
    })
    const repository = makeRepository({
      getEntitlement: vi.fn()
        .mockReturnValueOnce(initial.promise)
        .mockReturnValueOnce(charged.promise)
        .mockReturnValueOnce(refunded.promise),
      getGeneration: vi.fn().mockResolvedValue(generation('failed')),
    })
    render(<CommerceStudioPage repository={repository} />)
    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: '保温杯' } })
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: [image()] } })
    advanceToConfirmation()
    fireEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
      for (let index = 0; index < 10; index += 1) await Promise.resolve()
    })
    expect(repository.getEntitlement).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(repository.getEntitlement).toHaveBeenCalledTimes(3)

    await act(async () => { refunded.resolve(entitlement(3)); await Promise.resolve() })
    expect(screen.getAllByText('3 次').length).toBeGreaterThan(0)
    await act(async () => {
      charged.resolve(entitlement(2))
      initial.resolve(entitlement(4))
      await Promise.resolve()
    })
    expect(screen.getAllByText('3 次').length).toBeGreaterThan(0)
  })

  it('polls every two seconds, stops at a terminal status and clears the timer on unmount', async () => {
    vi.useFakeTimers()
    authMock.useAuth.mockReturnValue(signedInAuth())
    const repository = makeRepository({
      getGeneration: vi.fn()
        .mockResolvedValueOnce(generation('processing'))
        .mockResolvedValueOnce(generation('completed')),
    })
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const view = render(<CommerceStudioPage repository={repository} />)

    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: '保温杯' } })
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: [image()] } })
    advanceToConfirmation()
    fireEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
      for (let index = 0; index < 10; index += 1) await Promise.resolve()
    })
    expect(repository.startGeneration).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(repository.getGeneration).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(repository.getGeneration).toHaveBeenCalledTimes(2)
    expect(screen.getAllByText('方案生成完成').length).toBeGreaterThan(0)
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(repository.getGeneration).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('clears an active queued poll timer when unmounted', async () => {
    vi.useFakeTimers()
    authMock.useAuth.mockReturnValue(signedInAuth())
    const repository = makeRepository({ getGeneration: vi.fn().mockResolvedValue(generation('processing')) })
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval')
    const view = render(<CommerceStudioPage repository={repository} />)
    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: '保温杯' } })
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: [image()] } })
    advanceToConfirmation()
    fireEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
      for (let index = 0; index < 10; index += 1) await Promise.resolve()
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(repository.getGeneration).toHaveBeenCalledTimes(1)
    view.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(4000) })
    expect(repository.getGeneration).toHaveBeenCalledTimes(1)
    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})

describe('AI commerce route and navigation', () => {
  beforeEach(() => {
    authMock.useAuth.mockReturnValue(signedInAuth())
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test/cup') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })

  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('marks the first-level AI commerce navigation entry as current', () => {
    render(<FloatingHeader theme="dark" pageHash="#ai-commerce" onToggleTheme={vi.fn()} />)
    const link = screen.getByRole('link', { name: 'AI 电商' })
    expect(link).toHaveAttribute('href', '#ai-commerce')
    expect(link).toHaveClass('is-current')
  })

  it('keeps an accepted generation busy when a transient poll fails', async () => {
    vi.useFakeTimers()
    authMock.useAuth.mockReturnValue(signedInAuth())
    const repository = makeRepository({ getGeneration: vi.fn().mockRejectedValue(new Error('轮询暂断')) })
    render(<CommerceStudioPage repository={repository} />)
    fireEvent.change(screen.getByLabelText('产品名称'), { target: { value: '保温杯' } })
    fireEvent.change(screen.getByLabelText('上传产品图'), { target: { files: [image()] } })
    advanceToConfirmation()
    fireEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '生成视觉方案' })); for (let index = 0; index < 8; index += 1) await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(2000) })
    expect(screen.getByText(/轮询暂断.*任务仍在后台/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AI 正在生成方案' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '重试本次生成' })).not.toBeInTheDocument()
    expect(repository.startGeneration).toHaveBeenCalledTimes(1)
  })

  it('opens useful local search from the keyboard and restores focus on close', async () => {
    render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    const search = screen.getByRole('button', { name: '打开搜索' })
    search.focus()
    await userEvent.keyboard('{Control>}k{/Control}')
    const input = screen.getByRole('textbox', { name: '搜索作品、笔记或标签' })
    expect(input).toHaveFocus()
    await userEvent.type(input, '音乐')
    expect(screen.getByRole('link', { name: /音乐/ })).toHaveAttribute('href', '#music')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '搜索本站' })).not.toBeInTheDocument()
    expect(search).toHaveFocus()
  })

  it('keeps a pointer-opened dropdown open through the first click and closes it with Escape', () => {
    const view = render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    const group = view.container.querySelectorAll<HTMLElement>('.floating-nav-group')[0]
    const trigger = screen.getByRole('button', { name: '文章' })
    fireEvent.pointerEnter(group, { pointerType: 'mouse' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('resolves the ai-commerce hash to the lazy workspace instead of the homepage', async () => {
    window.location.hash = '#ai-commerce'
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'AI 电商视觉工作台' })).toBeInTheDocument()
    expect(screen.queryByText('HOME')).not.toBeInTheDocument()
    expect(screen.getByTestId('music-dock-mode')).toHaveAttribute('data-mode', 'commerce')
  })
})

const result = (): CommerceResult => ({
  productSummary: '历史保温杯方案', facts: [], audiences: [], sellingPoints: [],
  platformStrategy: { overview: '', contentDensity: '', tone: '', complianceNotes: [] },
  heroDirections: Array.from({ length: 3 }, (_, index) => ({ title: `方向 ${index + 1}`, rationale: '', composition: '', background: '', palette: [], lighting: '', props: [], copyPlacement: '', visualFocus: '', imagePrompt: '', negativePrompt: '' })) as CommerceResult['heroDirections'],
  detailFrames: Array.from({ length: 8 }, (_, index) => ({ order: index + 1, purpose: '', visual: '', copy: '', copyTranslation: null, transition: '' })),
  recommendedCanvas: [], fidelityRules: [], pendingConfirmations: [],
})

describe('commerce history drawer', () => {
  beforeEach(() => authMock.useAuth.mockReturnValue(signedInAuth()))
  afterEach(() => { cleanup(); vi.useRealTimers() })

  it('focuses its title, filters project states and preserves confirmed deletion', async () => {
    const completedProject = { ...project, id: 'completed-project', name: '完成项目' }
    const processingProject = { ...project, id: 'processing-project', name: '进行项目' }
    const draftProject = { ...project, id: 'draft-project', name: '草稿项目', assets: [] }
    const completedGeneration = { ...generation('completed'), id: 'completed-generation', projectId: completedProject.id }
    const processingGeneration = { ...generation('processing'), id: 'processing-generation', projectId: processingProject.id }
    const repository = makeRepository({
      listProjects: vi.fn().mockResolvedValue([completedProject, processingProject, draftProject]),
      listGenerations: vi.fn().mockResolvedValue([completedGeneration, processingGeneration]),
    })
    const onClose = vi.fn()
    const onCountChange = vi.fn()
    render(<CommerceHistoryDrawer open onClose={onClose} repository={repository} onSelectResult={vi.fn()} onCountChange={onCountChange} />)

    const title = screen.getByRole('heading', { name: '历史项目' })
    expect(title).toHaveFocus()
    expect(await screen.findByLabelText('草稿项目 历史项目')).toHaveTextContent('未完成草稿')
    expect(screen.getByLabelText('草稿项目 历史项目')).not.toHaveTextContent('原始图片已自动清理')
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(3))

    await userEvent.click(screen.getByRole('button', { name: '已完成' }))
    expect(screen.getByLabelText('完成项目 历史项目')).toBeInTheDocument()
    expect(screen.queryByLabelText('进行项目 历史项目')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '未完成' }))
    await userEvent.click(screen.getByRole('button', { name: '删除 草稿项目' }))
    await userEvent.click(screen.getByRole('button', { name: '确认删除 草稿项目' }))
    await waitFor(() => expect(repository.deleteProject).toHaveBeenCalledWith('draft-project'))

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
