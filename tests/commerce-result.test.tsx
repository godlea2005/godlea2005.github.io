import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../src/auth/AuthProvider'
import type { CommerceRepository } from '../src/commerce/commerceRepository'
import { CommerceHistory } from '../src/commerce/CommerceHistory'
import { CommerceProjectForm } from '../src/commerce/CommerceProjectForm'
import { CommerceResult } from '../src/commerce/CommerceResult'
import { CommerceStudioPage } from '../src/commerce/CommerceStudioPage'
import type { CommerceGeneration, CommerceProject, CommerceResult as CommerceResultData } from '../src/commerce/types'

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }))

vi.mock('../src/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/AuthProvider')>()
  return { ...actual, useAuth: authMock.useAuth }
})

const result: CommerceResultData = {
  productSummary: '适合俄罗斯通勤人群的保温杯',
  facts: [
    { label: '容量', value: '500ml', confidence: 'confirmed' },
    { label: '保温时长', value: '约 12 小时', confidence: 'inferred' },
    { label: '材质', value: '需补充', confidence: 'needs-confirmation' },
  ],
  audiences: [{ segment: '俄罗斯城市通勤者', motivation: '冬季长时间保温' }],
  sellingPoints: [{ rank: 1, point: '长效保温', reason: '匹配寒冷通勤场景', confidence: 'confirmed' }],
  platformStrategy: { overview: 'Ozon 搜索流量优先', contentDensity: '中高', tone: '可信、克制', complianceNotes: ['避免绝对化用语'] },
  heroDirections: [1, 2, 3].map((index) => ({
    title: `主图方向 ${index}`, rationale: `方向 ${index} 的策略`, composition: '产品居中', background: '冷灰渐变',
    palette: ['#111111', '#ffffff'], lighting: '柔和侧光', props: ['冰晶'], copyPlacement: '右上安全区',
    visualFocus: '杯盖与材质', imagePrompt: `image prompt ${index}`, negativePrompt: `negative prompt ${index}`,
  })) as CommerceResultData['heroDirections'],
  detailFrames: Array.from({ length: 8 }, (_, index) => ({
    order: index + 1, purpose: `分镜目的 ${index + 1}`, visual: `画面 ${index + 1}`,
    copy: index === 0 ? 'Тепло весь день' : `俄文文案 ${index + 1}`,
    copyTranslation: index === 0 ? '全天温暖' : `中文解释 ${index + 1}`,
    transition: '干净切换',
  })),
  recommendedCanvas: [{ usage: 'Ozon 主图', ratio: '1:1', pixels: '1600×1600', safeZone: '四周 8%' }],
  fidelityRules: ['不得改变杯盖结构'],
  pendingConfirmations: ['确认内胆材质'],
}

const project = (overrides: Partial<CommerceProject> = {}): CommerceProject => ({
  id: 'project-1', userId: 'user-1', name: '保温杯', platform: 'ozon', mode: 'quick', inputData: {}, locked: false,
  createdAt: '2026-08-20T08:00:00.000Z', updatedAt: '2026-08-20T08:00:00.000Z',
  assets: [{
    id: 'asset-1', projectId: 'project-1', userId: 'user-1', storagePath: 'private/path.png', mimeType: 'image/png',
    sizeBytes: 128, expiresAt: '2026-08-27T08:00:00.000Z', state: 'ready', deletedAt: null, createdAt: '2026-08-20T08:00:00.000Z',
  }],
  ...overrides,
})

const generation = (overrides: Partial<CommerceGeneration> = {}): CommerceGeneration => ({
  id: 'generation-1', projectId: 'project-1', userId: 'user-1', idempotencyKey: 'request-1', status: 'completed',
  resultData: result, provider: 'openai', model: 'gpt-5.4-mini', usage: { internal: 'hidden' }, errorCode: null,
  errorMessage: null, creditCharged: true, refundedAt: null, createdAt: '2026-08-20T08:00:00.000Z',
  startedAt: '2026-08-20T08:00:01.000Z', completedAt: '2026-08-20T08:00:02.000Z', ...overrides,
})

const makeRepository = (overrides: Partial<CommerceRepository> = {}): CommerceRepository => ({
  getEntitlement: vi.fn().mockResolvedValue({ userId: 'user-1', credits: 3, unlimited: false, disabled: false, dailyLimit: 10, updatedAt: '2026-08-20T00:00:00.000Z' }),
  createProject: vi.fn().mockResolvedValue(project()), uploadAssets: vi.fn().mockResolvedValue([]),
  startGeneration: vi.fn().mockResolvedValue({ generationId: 'generation-1', status: 'queued' }),
  getGeneration: vi.fn().mockResolvedValue(generation()), listProjects: vi.fn().mockResolvedValue([project()]),
  listGenerations: vi.fn().mockResolvedValue([generation()]), deleteProject: vi.fn().mockResolvedValue(undefined),
  setProjectLocked: vi.fn().mockResolvedValue(undefined), getAdminDashboard: vi.fn(), setUserEntitlement: vi.fn(), updateAdminSettings: vi.fn(),
  ...overrides,
})

const auth = (userId = 'user-1'): AuthContextValue => ({
  configured: true, ready: true, user: { id: userId } as AuthContextValue['user'], isAnonymous: false, isAdmin: false,
  provider: 'github', providers: { github: true, google: true }, error: '', signIn: vi.fn(), signOut: vi.fn(), requireLogin: vi.fn(() => true),
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise })
  return { promise, resolve, reject }
}

describe('commerce result presentation', () => {
  beforeEach(() => {
    authMock.useAuth.mockReturnValue(auth())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks() })

  it('renders the exact hierarchy, confidence text, three directions and Russian/Chinese copy pairing', () => {
    const view = render(<CommerceResult result={result} />)
    expect(Array.from(view.container.querySelectorAll('[data-result-section]')).map((node) => node.getAttribute('data-result-section'))).toEqual([
      'confidence', 'audiences', 'selling-points', 'platform-strategy', 'hero-directions', 'detail-frames', 'canvas', 'fidelity', 'confirmations',
    ])
    expect(screen.getAllByRole('article', { name: /主图方向/ })).toHaveLength(3)
    expect(screen.getAllByRole('article', { name: /详情分镜/ })).toHaveLength(8)
    for (const label of ['已确认', 'AI 推测', '待确认']) expect(screen.getAllByText(label).length).toBeGreaterThan(0)
    expect(screen.getByText('Тепло весь день')).toBeInTheDocument()
    expect(screen.getByText('全天温暖')).toBeInTheDocument()
    expect(screen.getAllByText('俄文文案')).toHaveLength(8)
    expect(screen.getAllByText('中文解释')).toHaveLength(8)
  })

  it('copies prompts and a clean whole-result document without internal metadata', async () => {
    const tainted = { ...result, userId: 'secret-user', generationId: 'secret-generation', storagePath: 'private/path.png', signedUrl: 'https://secret' } as CommerceResultData
    render(<CommerceResult result={tainted} />)
    const copy = vi.mocked(navigator.clipboard.writeText)
    await userEvent.click(screen.getAllByRole('button', { name: '复制提示词' })[0])
    expect(copy).toHaveBeenLastCalledWith('image prompt 1')
    await userEvent.click(screen.getAllByRole('button', { name: '复制负面提示词' })[0])
    expect(copy).toHaveBeenLastCalledWith('negative prompt 1')
    await userEvent.click(screen.getByRole('button', { name: '复制整套方案' }))
    const whole = String(copy.mock.calls.at(-1)?.[0])
    expect(whole).toContain('# AI 电商视觉方案')
    expect(whole).toContain('## 三套主图方向')
    expect(whole).not.toMatch(/secret-user|secret-generation|private\/path|https:\/\/secret|confirmed|needs-confirmation/)
  })

  it('keeps clipboard feedback isolated and makes failure actionable', async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied')).mockResolvedValue(undefined)
    render(<CommerceResult result={result} />)
    const buttons = screen.getAllByRole('button', { name: '复制提示词' })
    await userEvent.click(buttons[0])
    expect(await screen.findByRole('alert')).toHaveTextContent('复制失败，请手动选择并复制')
    expect(within(buttons[1].parentElement!).queryByText('复制失败')).not.toBeInTheDocument()
    await userEvent.click(buttons[1])
    expect(within(buttons[1].parentElement!).getByRole('status')).toHaveTextContent('已复制')
  })

  it('ignores stale clipboard settlements when copy requests finish in reverse order', async () => {
    const first = deferred<void>()
    const second = deferred<void>()
    vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    render(<CommerceResult result={result} />)
    const buttons = screen.getAllByRole('button', { name: '复制提示词' })
    fireEvent.click(buttons[0])
    fireEvent.click(buttons[1])
    await act(async () => second.resolve())
    expect(within(buttons[1].parentElement!).getByRole('status')).toHaveTextContent('已复制')
    await act(async () => first.reject(new Error('late denial')))
    expect(within(buttons[1].parentElement!).getByRole('status')).toHaveTextContent('已复制')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('redacts signed urls and internal storage paths embedded in valid public fields', async () => {
    const secretResult: CommerceResultData = {
      ...result,
      productSummary: 'https://ujwww.supabase.co/storage/v1/object/sign/commerce-assets/a?token=secret',
      heroDirections: result.heroDirections.map((direction, index) => index === 0 ? { ...direction, imagePrompt: '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/private.png' } : direction) as CommerceResultData['heroDirections'],
      detailFrames: result.detailFrames.map((frame, index) => index === 0 ? { ...frame, visual: 'commerce-assets/private/file.webp' } : frame),
    }
    render(<CommerceResult result={secretResult} />)
    await userEvent.click(screen.getByRole('button', { name: '复制整套方案' }))
    const copied = String(vi.mocked(navigator.clipboard.writeText).mock.calls.at(-1)?.[0])
    expect(copied).toContain('[已隐藏可能包含内部资源地址的内容]')
    expect(copied).not.toMatch(/supabase|storage\/v1|commerce-assets|11111111|private\.png|secret/)
    expect(copied).toContain('俄罗斯城市通勤者')
  })

  it('delegates rerun direction without starting generation and exposes print semantics', async () => {
    const onRerunDirection = vi.fn()
    const onPrint = vi.fn()
    render(<CommerceResult result={result} onRerunDirection={onRerunDirection} onPrint={onPrint} />)
    await userEvent.click(screen.getAllByRole('button', { name: '基于此方向重做' })[1])
    expect(onRerunDirection).toHaveBeenCalledWith(result.heroDirections[1], 1)
    expect(onRerunDirection).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: '打印方案' }))
    expect(onPrint).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('article', { name: 'AI 电商视觉方案' })).toHaveClass('commerce-result-printable')
  })
})

describe('commerce history', () => {
  beforeEach(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn() } }))
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('handles loading, empty, error and retry states', async () => {
    let resolveProjects!: (projects: CommerceProject[]) => void
    const repository = makeRepository({ listProjects: vi.fn(() => new Promise((resolve) => { resolveProjects = resolve })), listGenerations: vi.fn().mockResolvedValue([]) })
    const view = render(<CommerceHistory repository={repository} onSelectResult={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('正在读取历史项目')
    await act(async () => resolveProjects([]))
    expect(await screen.findByText('还没有历史项目')).toBeInTheDocument()
    view.unmount()

    const retryRepository = makeRepository({ listProjects: vi.fn().mockRejectedValueOnce(new Error('断网')).mockResolvedValueOnce([]), listGenerations: vi.fn().mockResolvedValue([]) })
    render(<CommerceHistory repository={retryRepository} onSelectResult={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('断网')
    await userEvent.click(screen.getByRole('button', { name: '重试历史记录' }))
    expect(await screen.findByText('还没有历史项目')).toBeInTheDocument()
    expect(retryRepository.listProjects).toHaveBeenCalledTimes(2)
  })

  it('shows persisted status, remaining assets, earliest expiry and cleaned copy without phantom detached generations', async () => {
    const projects = [project(), project({ id: 'project-clean', name: '已清理商品', assets: [{ ...project().assets[0], id: 'asset-clean', projectId: 'project-clean', state: 'deleted', deletedAt: '2026-08-25T00:00:00.000Z' }] })]
    const repository = makeRepository({
      listProjects: vi.fn().mockResolvedValue(projects),
      listGenerations: vi.fn().mockResolvedValue([generation(), generation({ id: 'detached', projectId: null })]),
    })
    render(<CommerceHistory repository={repository} onSelectResult={vi.fn()} />)
    expect(await screen.findByText('保温杯')).toBeInTheDocument()
    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('剩余图片 1 张')).toBeInTheDocument()
    expect(screen.getByText('图片将在 2026-08-27 清理')).toBeInTheDocument()
    expect(screen.getByText('原始图片已自动清理，文字方案仍可使用')).toBeInTheDocument()
    expect(screen.queryByText('detached')).not.toBeInTheDocument()
    expect(screen.getAllByText('锁定仅避免软上限提前清理，仍按 7 天到期')).not.toHaveLength(0)
  })

  it('rolls back a failed lock and reports the failure', async () => {
    const repository = makeRepository({ setProjectLocked: vi.fn().mockRejectedValue(new Error('锁定失败')) })
    render(<CommerceHistory repository={repository} onSelectResult={vi.fn()} />)
    const toggle = await screen.findByRole('checkbox', { name: '锁定 保温杯' })
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).not.toBeChecked())
    expect(screen.getByRole('alert')).toHaveTextContent('锁定失败')
  })

  it('persists a successful lock toggle and keeps the explanatory copy visible', async () => {
    const repository = makeRepository()
    render(<CommerceHistory repository={repository} onSelectResult={vi.fn()} />)
    const toggle = await screen.findByRole('checkbox', { name: '锁定 保温杯' })
    await userEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())
    expect(repository.setProjectLocked).toHaveBeenCalledWith('project-1', true)
    expect(screen.getByText('锁定仅避免软上限提前清理，仍按 7 天到期')).toBeInTheDocument()
  })

  it('confirms or cancels deletion, calls once, and retains failures', async () => {
    const repository = makeRepository()
    render(<CommerceHistory repository={repository} onSelectResult={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: '删除 保温杯' }))
    await userEvent.click(screen.getByRole('button', { name: '取消删除 保温杯' }))
    expect(repository.deleteProject).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '删除 保温杯' }))
    const confirm = screen.getByRole('button', { name: '确认删除 保温杯' })
    await userEvent.dblClick(confirm)
    await waitFor(() => expect(repository.deleteProject).toHaveBeenCalledTimes(1))
    expect(screen.queryByText('保温杯')).not.toBeInTheDocument()

    cleanup()
    const failed = makeRepository({ deleteProject: vi.fn().mockRejectedValue(new Error('删除失败，请重试')) })
    render(<CommerceHistory repository={failed} onSelectResult={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: '删除 保温杯' }))
    await userEvent.click(screen.getByRole('button', { name: '确认删除 保温杯' }))
    expect(await screen.findByText('保温杯')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('删除失败，请重试')
  })

  it('validates result_data before selecting a completed project', async () => {
    const onSelectResult = vi.fn()
    const repository = makeRepository({ listGenerations: vi.fn().mockResolvedValue([generation({ resultData: { productSummary: 'unsafe' } as CommerceResultData })]) })
    render(<CommerceHistory repository={repository} onSelectResult={onSelectResult} />)
    await userEvent.click(await screen.findByRole('button', { name: '查看 保温杯 方案' }))
    expect(onSelectResult).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('方案数据不可用')
  })
})

describe('completed generation integration', () => {
  beforeEach(() => {
    authMock.useAuth.mockReturnValue(auth())
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:test/cup') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  })
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('moves a completed polling response into the result view without a reload', async () => {
    const repository = makeRepository({ listProjects: vi.fn().mockResolvedValue([]), listGenerations: vi.fn().mockResolvedValue([]) })
    render(<CommerceStudioPage repository={repository} pollIntervalMs={5} />)
    await userEvent.type(screen.getByLabelText('产品名称'), '保温杯')
    await userEvent.upload(screen.getByLabelText('上传产品图'), new File(['x'], 'cup.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByRole('article', { name: 'AI 电商视觉方案' })).toBeInTheDocument()
    expect(repository.getGeneration).toHaveBeenCalled()
  })

  it('loads the persisted result when startGeneration returns completed immediately', async () => {
    const repository = makeRepository({
      startGeneration: vi.fn().mockResolvedValue({ generationId: 'generation-1', status: 'completed' }),
      listProjects: vi.fn().mockResolvedValue([]), listGenerations: vi.fn().mockResolvedValue([]),
    })
    render(<CommerceStudioPage repository={repository} pollIntervalMs={5} />)
    await userEvent.type(screen.getByLabelText('产品名称'), '保温杯')
    await userEvent.upload(screen.getByLabelText('上传产品图'), new File(['x'], 'cup.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    expect(await screen.findByRole('article', { name: 'AI 电商视觉方案' })).toBeInTheDocument()
    expect(repository.getGeneration).toHaveBeenCalledWith('generation-1')
    expect(repository.getGeneration).toHaveBeenCalledTimes(1)
  })

  it('keeps the 390px result structure single-column-ready and marks actions/history as print-hidden', async () => {
    const view = render(<CommerceResult result={result} />)
    expect(view.container.querySelector('.commerce-hero-directions')).toBeInTheDocument()
    expect(view.container.querySelector('.commerce-detail-frames')).toBeInTheDocument()
    expect(view.container.querySelector('.commerce-result-actions')).toHaveClass('commerce-print-hidden')
    const history = render(<CommerceHistory repository={makeRepository()} onSelectResult={vi.fn()} />)
    expect(history.container.querySelector('.commerce-history')).toHaveClass('commerce-print-hidden')
  })

  it('does not reveal an old direct-completed read after account A logs out and account B signs in', async () => {
    const pending = deferred<CommerceGeneration>()
    const repository = makeRepository({
      startGeneration: vi.fn().mockResolvedValue({ generationId: 'generation-a', status: 'completed' }),
      getGeneration: vi.fn(() => pending.promise), listProjects: vi.fn().mockResolvedValue([]), listGenerations: vi.fn().mockResolvedValue([]),
    })
    const view = render(<CommerceStudioPage repository={repository} />)
    await userEvent.type(screen.getByLabelText('产品名称'), 'A 的商品')
    await userEvent.upload(screen.getByLabelText('上传产品图'), new File(['x'], 'a.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    authMock.useAuth.mockReturnValue({ ...auth('anonymous'), user: null, isAnonymous: true })
    view.rerender(<CommerceStudioPage repository={repository} />)
    expect(screen.getByRole('heading', { name: '请先登录，再选择产品素材' })).toBeInTheDocument()
    authMock.useAuth.mockReturnValue(auth('user-b'))
    view.rerender(<CommerceStudioPage repository={repository} />)
    await act(async () => pending.resolve(generation({ id: 'generation-a', resultData: { ...result, productSummary: 'A 的秘密方案' } })))
    expect(screen.queryByText('A 的秘密方案')).not.toBeInTheDocument()
    expect(screen.getByLabelText('产品名称')).toHaveValue('')
  })

  it('invalidates an in-flight poll when the authenticated identity changes', async () => {
    const pending = deferred<CommerceGeneration>()
    const repository = makeRepository({
      getGeneration: vi.fn(() => pending.promise), listProjects: vi.fn().mockResolvedValue([]), listGenerations: vi.fn().mockResolvedValue([]),
    })
    const view = render(<CommerceStudioPage repository={repository} pollIntervalMs={5} />)
    await userEvent.type(screen.getByLabelText('产品名称'), 'A 的轮询商品')
    await userEvent.upload(screen.getByLabelText('上传产品图'), new File(['x'], 'a.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    await waitFor(() => expect(repository.getGeneration).toHaveBeenCalledTimes(1))
    authMock.useAuth.mockReturnValue(auth('user-b'))
    view.rerender(<CommerceStudioPage repository={repository} pollIntervalMs={5} />)
    await act(async () => pending.resolve(generation({ resultData: { ...result, productSummary: 'A 的旧轮询结果' } })))
    expect(screen.queryByText('A 的旧轮询结果')).not.toBeInTheDocument()
    expect(screen.getByLabelText('产品名称')).toHaveValue('')
  })

  it('keeps rerun disabled while another accepted generation is active', async () => {
    const oldProject = project({ id: 'old-project', name: '旧商品' })
    const oldGeneration = generation({ id: 'old-generation', projectId: 'old-project' })
    const repository = makeRepository({
      createProject: vi.fn().mockResolvedValue(project({ id: 'active-project' })),
      getGeneration: vi.fn().mockResolvedValue(generation({ id: 'active-generation', projectId: 'active-project', status: 'processing', resultData: null })),
      listProjects: vi.fn().mockResolvedValue([oldProject]), listGenerations: vi.fn().mockResolvedValue([oldGeneration]),
    })
    render(<CommerceStudioPage repository={repository} pollIntervalMs={1000} />)
    await userEvent.type(screen.getByLabelText('产品名称'), '新商品')
    await userEvent.upload(screen.getByLabelText('上传产品图'), new File(['x'], 'new.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    await userEvent.click(await screen.findByRole('button', { name: '查看 旧商品 方案' }))
    expect(screen.getAllByRole('button', { name: '基于此方向重做' })[0]).toBeDisabled()
    expect(repository.startGeneration).toHaveBeenCalledTimes(1)
  })

  it('seeds a manual rerun draft with direction details and never starts automatically', async () => {
    const repository = makeRepository()
    render(<CommerceStudioPage repository={repository} />)
    await userEvent.click(await screen.findByRole('button', { name: '查看 保温杯 方案' }))
    await userEvent.click(screen.getAllByRole('button', { name: '基于此方向重做' })[0])
    expect(await screen.findByDisplayValue(/主图方向 1/)).toBeInTheDocument()
    expect(screen.getByDisplayValue(/image prompt 1/)).toBeInTheDocument()
    expect(repository.startGeneration).not.toHaveBeenCalled()
    await userEvent.upload(screen.getByLabelText('上传产品图'), new File(['x'], 'rerun.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /确认拥有这些素材的使用权/ }))
    await userEvent.click(screen.getByRole('button', { name: '生成视觉方案' }))
    await waitFor(() => expect(repository.createProject).toHaveBeenCalledTimes(1))
    expect(repository.createProject).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'professional', name: '保温杯', desiredStyle: expect.stringContaining('主图方向 1'), notes: expect.stringContaining('image prompt 1'),
    }))
  })

  it('applies an explicit draft seed to the controlled project form', async () => {
    render(<CommerceProjectForm onSubmitted={vi.fn()} draftKey="seed-1" initialDraft={{ mode: 'professional', name: 'Seed 商品', platform: 'wildberries', desiredStyle: 'Seed 方向', notes: 'Seed prompt', files: [] }} />)
    expect(await screen.findByDisplayValue('Seed 商品')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Seed 方向')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Seed prompt')).toBeInTheDocument()
  })
})
