import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../src/auth/AuthProvider'
import type { CommerceRepository } from '../src/commerce/commerceRepository'
import type { CommerceAdminDashboard } from '../src/commerce/types'

const authMock = vi.hoisted(() => ({ useAuth: vi.fn() }))

vi.mock('../src/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/AuthProvider')>()
  return { ...actual, useAuth: authMock.useAuth }
})

import { CommerceAdminPage } from '../src/commerce/CommerceAdminPage'
import { FloatingHeader } from '../src/components/FloatingHeader'

const auth = (overrides: Partial<AuthContextValue> = {}): AuthContextValue => ({
  configured: true,
  ready: true,
  user: { id: 'admin-1' } as AuthContextValue['user'],
  isAnonymous: false,
  isAdmin: true,
  provider: 'github',
  providers: { github: true, google: true },
  error: '',
  signIn: vi.fn(),
  signOut: vi.fn(),
  requireLogin: vi.fn(() => true),
  ...overrides,
})

const dashboard = (overrides: Partial<CommerceAdminDashboard> = {}): CommerceAdminDashboard => ({
  overview: {
    totalUsers: 27,
    todayGenerations: 10,
    todayFailures: 2,
    todayFailureRate: 20,
    creditsConsumed: 61,
    storageBytes: 7340032,
    latestCleanup: {
      status: 'completed', trigger_reason: 'soft_limit', assets_deleted: 3,
      bytes_deleted: 2048, started_at: '2026-08-27T08:00:00.000Z', completed_at: '2026-08-27T08:00:04.000Z',
    },
  },
  users: [{
    userId: 'user-1', email: 'friend@example.com', provider: 'github', createdAt: '2026-08-20T08:00:00.000Z',
    credits: 3, unlimited: false, disabled: false, dailyLimit: 10, generationCount: 5, creditsUsed: 4,
  }],
  generations: [{
    generationId: 'generation-1', projectId: 'project-1', projectName: '俄罗斯保温杯', userId: 'user-1',
    userEmail: 'friend@example.com', platform: 'ozon', status: 'failed', provider: 'openai', model: 'gpt-5.4-mini',
    errorCode: 'MODEL_TIMEOUT', errorMessage: 'model timeout', creditCharged: true,
    refundedAt: '2026-08-27T08:01:05.000Z', createdAt: '2026-08-27T08:00:00.000Z',
    startedAt: '2026-08-27T08:00:05.000Z', completedAt: '2026-08-27T08:01:05.000Z',
  }],
  settings: {
    newUserCredits: 3,
    defaultDailyLimit: 10,
    maxProjectImages: 6,
    storageSoftLimitBytes: 800000000,
    storageTargetBytes: 650000000,
  },
  ...overrides,
})

const makeRepository = (overrides: Partial<CommerceRepository> = {}): CommerceRepository => ({
  getEntitlement: vi.fn(), createProject: vi.fn(), uploadAssets: vi.fn(), startGeneration: vi.fn(),
  getGeneration: vi.fn(), listGenerations: vi.fn(), listProjects: vi.fn(), deleteProject: vi.fn(), setProjectLocked: vi.fn(),
  getAdminDashboard: vi.fn().mockResolvedValue(dashboard()),
  setUserEntitlement: vi.fn().mockResolvedValue(undefined),
  updateAdminSettings: vi.fn().mockResolvedValue(undefined),
  ...overrides,
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function openUsers() {
  await userEvent.click(await screen.findByRole('tab', { name: '用户' }))
}

async function openUserEditor() {
  await openUsers()
  await userEvent.click(await screen.findByRole('button', { name: /设置额度.*friend@example.com/ }))
}

describe('commerce administrator console authorization', () => {
  beforeEach(() => authMock.useAuth.mockReturnValue(auth()))
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders a neutral resolving state and calls no administrator RPC before auth is ready', () => {
    const repository = makeRepository()
    authMock.useAuth.mockReturnValue(auth({ ready: false, user: null, isAdmin: false }))
    render(<CommerceAdminPage repository={repository} />)
    expect(screen.getByRole('status')).toHaveTextContent('正在确认管理员身份')
    expect(repository.getAdminDashboard).not.toHaveBeenCalled()
  })

  it('does not render admin data or call the repository for a non-admin direct route', () => {
    const repository = makeRepository()
    authMock.useAuth.mockReturnValue(auth({ isAdmin: false }))
    render(<CommerceAdminPage repository={repository} />)
    expect(screen.getByText('无权访问此页面')).toBeInTheDocument()
    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument()
    expect(repository.getAdminDashboard).not.toHaveBeenCalled()
  })

  it('shows the administrator entry only to a verified administrator', async () => {
    const { rerender } = render(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /我的/ }))
    expect(screen.getByRole('link', { name: /管理后台/ })).toHaveAttribute('href', '#commerce-admin')
    authMock.useAuth.mockReturnValue(auth({ isAdmin: false }))
    rerender(<FloatingHeader theme="dark" pageHash="#top" onToggleTheme={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /我的/ }))
    expect(screen.queryByRole('link', { name: /管理后台/ })).not.toBeInTheDocument()
  })

  it('clears old data and ignores pending reads after an account switch', async () => {
    const first = deferred<CommerceAdminDashboard>()
    const second = deferred<CommerceAdminDashboard>()
    const repository = makeRepository({ getAdminDashboard: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise) })
    const { rerender } = render(<CommerceAdminPage repository={repository} />)
    authMock.useAuth.mockReturnValue(auth({ user: { id: 'admin-2' } as AuthContextValue['user'] }))
    rerender(<CommerceAdminPage repository={repository} />)
    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument()
    await act(async () => first.resolve(dashboard()))
    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument()
    await act(async () => second.resolve(dashboard({ users: [{ ...dashboard().users[0], userId: 'user-2', email: 'new@example.com' }] })))
    await openUsers()
    expect(screen.getByText('new@example.com')).toBeInTheDocument()
    expect(screen.queryByText('friend@example.com')).not.toBeInTheDocument()
  })
})

describe('commerce administrator console operations', () => {
  beforeEach(() => authMock.useAuth.mockReturnValue(auth()))
  afterEach(() => { cleanup(); vi.clearAllMocks() })

  it('renders four keyboard-operable tabs and all four operator sections', async () => {
    render(<CommerceAdminPage repository={makeRepository()} />)
    expect(await screen.findByRole('tablist', { name: '管理后台分区' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['概览', '用户', '任务', '设置'])
    tabs[0].focus()
    fireEvent.keyDown(tabs[0], { key: 'End' })
    expect(tabs[3]).toHaveFocus()
    expect(tabs[3]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(tabs[3], { key: 'Home' })
    expect(tabs[0]).toHaveFocus()
    fireEvent.keyDown(tabs[0], { key: 'ArrowRight' })
    expect(tabs[1]).toHaveFocus()
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', tabs[1].id)
    expect(screen.getByText('friend@example.com')).toBeInTheDocument()
  })

  it('shows safe overview values and the latest cleanup summary', async () => {
    render(<CommerceAdminPage repository={makeRepository()} />)
    expect(await screen.findByText('80%')).toBeInTheDocument()
    expect(screen.getByText('27')).toBeInTheDocument()
    expect(screen.getByText('7 MB')).toBeInTheDocument()
    expect(screen.getByText(/删除 3 个资源/)).toBeInTheDocument()
  })

  it('searches users through the administrator RPC and does not allow stale searches to win', async () => {
    const first = deferred<CommerceAdminDashboard>()
    const second = deferred<CommerceAdminDashboard>()
    const repository = makeRepository({
      getAdminDashboard: vi.fn()
        .mockResolvedValueOnce(dashboard())
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise),
    })
    render(<CommerceAdminPage repository={repository} />)
    await openUsers()
    const search = screen.getByLabelText('搜索用户')
    await userEvent.type(search, 'first@example.com')
    await userEvent.click(screen.getByRole('button', { name: '搜索用户' }))
    await userEvent.clear(search)
    await userEvent.type(search, 'second@example.com')
    await userEvent.click(screen.getByRole('button', { name: '搜索用户' }))
    await act(async () => second.resolve(dashboard({ users: [{ ...dashboard().users[0], email: 'second@example.com' }] })))
    expect(await screen.findByText('second@example.com')).toBeInTheDocument()
    await act(async () => first.resolve(dashboard({ users: [{ ...dashboard().users[0], email: 'first@example.com' }] })))
    expect(screen.queryByText('first@example.com')).not.toBeInTheDocument()
    expect(repository.getAdminDashboard).toHaveBeenLastCalledWith(expect.objectContaining({ userSearch: 'second@example.com' }))
  })

  it('sets 999 credits and a daily limit with an audit reason, then refreshes authoritative data', async () => {
    const repository = makeRepository()
    render(<CommerceAdminPage repository={repository} />)
    await openUserEditor()
    await userEvent.clear(screen.getByLabelText('剩余次数'))
    await userEvent.type(screen.getByLabelText('剩余次数'), '999')
    await userEvent.clear(screen.getByLabelText('每日上限'))
    await userEvent.type(screen.getByLabelText('每日上限'), '25')
    await userEvent.type(screen.getByLabelText('调整原因'), '朋友体验账户')
    await userEvent.click(screen.getByRole('button', { name: '确认保存' }))
    expect(repository.setUserEntitlement).toHaveBeenCalledWith({
      userId: 'user-1', credits: 999, unlimited: false, disabled: false, dailyLimit: 25, reason: '朋友体验账户',
    })
    await waitFor(() => expect(repository.getAdminDashboard).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('status', { name: '保存结果' })).toHaveTextContent('已从服务器刷新')
  })

  it('requires an explicit high-impact confirmation for unlimited or disabled changes', async () => {
    const repository = makeRepository()
    render(<CommerceAdminPage repository={repository} />)
    await openUserEditor()
    await userEvent.click(screen.getByRole('checkbox', { name: '无限次数' }))
    await userEvent.click(screen.getByRole('checkbox', { name: '禁用账户' }))
    await userEvent.type(screen.getByLabelText('调整原因'), '临时冻结并免额复核')
    const submit = screen.getByRole('button', { name: '确认保存' })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/999 次仍会扣减；无限次数不会扣减/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('checkbox', { name: '确认无限次数与禁用账户变更' }))
    expect(submit).toBeEnabled()
    await userEvent.click(submit)
    expect(repository.setUserEntitlement).toHaveBeenCalledTimes(1)
  })

  it('retains form input and reason when a write fails and blocks duplicate submits', async () => {
    const pending = deferred<void>()
    const repository = makeRepository({ setUserEntitlement: vi.fn().mockReturnValue(pending.promise) })
    render(<CommerceAdminPage repository={repository} />)
    await openUserEditor()
    await userEvent.clear(screen.getByLabelText('剩余次数'))
    await userEvent.type(screen.getByLabelText('剩余次数'), '999')
    await userEvent.type(screen.getByLabelText('调整原因'), '保留这段原因')
    const submit = screen.getByRole('button', { name: '确认保存' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(repository.setUserEntitlement).toHaveBeenCalledTimes(1)
    await act(async () => pending.reject(new Error('额度保存失败，请稍后重试')))
    expect(await screen.findByRole('alert')).toHaveTextContent('额度保存失败，请稍后重试')
    expect(screen.getByLabelText('剩余次数')).toHaveValue(999)
    expect(screen.getByLabelText('调整原因')).toHaveValue('保留这段原因')
  })

  it('validates all setting ranges and target waterline before calling the RPC', async () => {
    const repository = makeRepository()
    render(<CommerceAdminPage repository={repository} />)
    await userEvent.click(await screen.findByRole('tab', { name: '设置' }))
    await userEvent.clear(screen.getByLabelText('新用户次数'))
    await userEvent.type(screen.getByLabelText('新用户次数'), '0')
    await userEvent.clear(screen.getByLabelText('最大项目图片数'))
    await userEvent.type(screen.getByLabelText('最大项目图片数'), '7')
    await userEvent.clear(screen.getByLabelText('Storage 目标水位（字节）'))
    await userEvent.type(screen.getByLabelText('Storage 目标水位（字节）'), '900000000')
    await userEvent.type(screen.getByLabelText('设置调整原因'), '容量调整')
    await userEvent.click(screen.getByRole('button', { name: '保存系统设置' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('新用户次数需为 1–1000000')
    expect(screen.getByRole('alert')).toHaveTextContent('最大项目图片数需为 1–6')
    expect(screen.getByRole('alert')).toHaveTextContent('目标水位必须小于软上限')
    expect(repository.updateAdminSettings).not.toHaveBeenCalled()
  })

  it('updates only the five approved settings with a reason and refreshes server state', async () => {
    const repository = makeRepository()
    render(<CommerceAdminPage repository={repository} />)
    await userEvent.click(await screen.findByRole('tab', { name: '设置' }))
    await userEvent.clear(screen.getByLabelText('新用户次数'))
    await userEvent.type(screen.getByLabelText('新用户次数'), '5')
    await userEvent.type(screen.getByLabelText('设置调整原因'), '试运行额度调整')
    await userEvent.click(screen.getByRole('button', { name: '保存系统设置' }))
    expect(repository.updateAdminSettings).toHaveBeenCalledWith({
      newUserCredits: 5,
      defaultDailyLimit: 10,
      maxProjectImages: 6,
      storageSoftLimitBytes: 800000000,
      storageTargetBytes: 650000000,
    }, '试运行额度调整')
    await waitFor(() => expect(repository.getAdminDashboard).toHaveBeenCalledTimes(2))
  })

  it('renders task duration, model, error and refund without NaN or negative values', async () => {
    const data = dashboard({ generations: [
      dashboard().generations[0],
      { ...dashboard().generations[0], generationId: 'generation-2', projectName: '缺失时间', startedAt: null, completedAt: null, refundedAt: null, errorCode: null, errorMessage: null },
      { ...dashboard().generations[0], generationId: 'generation-3', projectName: '倒序时间', startedAt: '2026-08-27T09:00:00.000Z', completedAt: '2026-08-27T08:00:00.000Z' },
    ] })
    render(<CommerceAdminPage repository={makeRepository({ getAdminDashboard: vi.fn().mockResolvedValue(data) })} />)
    await userEvent.click(await screen.findByRole('tab', { name: '任务' }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getByText('1分 0秒')).toBeInTheDocument()
    expect(within(panel).getAllByText('MODEL_TIMEOUT').length).toBeGreaterThan(0)
    expect(within(panel).getAllByText('已退款').length).toBeGreaterThan(0)
    expect(panel).not.toHaveTextContent(/NaN|负/)
    expect(within(panel).getAllByText('—').length).toBeGreaterThan(0)
  })

  it('marks stacked mobile rows with semantic labels instead of relying on column position', async () => {
    render(<CommerceAdminPage repository={makeRepository()} />)
    await openUsers()
    const row = screen.getByTestId('admin-user-row-user-1')
    expect(row).toHaveAttribute('data-mobile-row', 'user')
    expect(within(row).getByText('额度')).toHaveClass('commerce-admin-cell-label')
    expect(within(row).getByText('每日上限')).toHaveClass('commerce-admin-cell-label')
  })
})
