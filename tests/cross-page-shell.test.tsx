import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthContextValue } from '../src/auth/AuthProvider'
import type { CommerceRepository } from '../src/commerce/commerceRepository'

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  list: vi.fn(),
  getProfile: vi.fn(),
  requireLogin: vi.fn(),
}))

vi.mock('../src/auth/AuthProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/AuthProvider')>()
  return { ...actual, useAuth: mocks.useAuth }
})

vi.mock('../src/guestbook/guestbookRepository', () => ({
  guestbookRepository: {
    mode: 'local', list: mocks.list, getProfile: mocks.getProfile,
    refresh: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn(),
    remove: vi.fn(), moderate: vi.fn(), saveProfile: vi.fn().mockResolvedValue(undefined),
  },
  detectClientMeta: () => ({ browser: 'Test', platform: 'Test' }),
}))

vi.mock('../src/commerce/commerceRepository', () => ({ commerceRepository: {} }))

import { ToolNavigationPage } from '../src/components/ToolNavigationPage'
import { GuestbookPage } from '../src/components/GuestbookPage'
import { CommerceStudioPage } from '../src/commerce/CommerceStudioPage'
import { GuestbookComposer } from '../src/guestbook/GuestbookComposer'

const authState = (signedIn = false): AuthContextValue => ({
  configured: true, ready: true,
  user: signedIn ? { id: 'shell-test-user' } as AuthContextValue['user'] : null,
  isAnonymous: !signedIn, isAdmin: false, provider: signedIn ? 'github' : null,
  providers: { github: true, google: true }, error: '',
  signIn: vi.fn(), signOut: vi.fn(), requireLogin: mocks.requireLogin,
})

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  window.sessionStorage.setItem('wenhao-guestbook:rules-seen', 'true')
  mocks.useAuth.mockReturnValue(authState())
  mocks.list.mockResolvedValue([])
  mocks.getProfile.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('shared editorial page shells', () => {
  it('keeps the tools index searchable, labeled and arranged as a shared editorial page', () => {
    const { container } = render(<ToolNavigationPage />)
    const main = container.querySelector('main')!
    expect(main).toHaveClass('editorial-page')
    const intro = main.querySelector('.editorial-page-intro')!
    expect(within(intro as HTMLElement).getByText('FIELD NOTES / TOOL INDEX')).toHaveClass('editorial-index')
    expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('searchbox', { name: '搜索工具' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '工具分类' })).toBeInTheDocument()
    expect(main.querySelectorAll('.tool-card.editorial-surface').length).toBeGreaterThan(0)
  })

  it('keeps OPEN CHANNEL visible while 留言 is the only screen-reader-only H1', async () => {
    vi.useFakeTimers()
    const { container } = render(<GuestbookPage />)
    await act(async () => { await vi.runAllTimersAsync() })
    const main = container.querySelector('main')!
    expect(main).toHaveClass('editorial-page')
    expect(within(main).getAllByRole('heading', { level: 1, hidden: true })).toHaveLength(1)
    expect(within(main).getByRole('heading', { name: '留言', level: 1, hidden: true })).toHaveClass('sr-only')
    expect(main.querySelector('.guestbook-title-row')).toHaveClass('editorial-page-intro')
    expect(screen.getByText('OPEN CHANNEL')).toBeVisible()
    expect(screen.getByRole('region', { name: '留言板' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '留言内容' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即刷新消息' })).toBeInTheDocument()
    expect(mocks.list).toHaveBeenCalledOnce()
    expect(mocks.getProfile).not.toHaveBeenCalled()
  })

  it('retains Enter-to-send and Shift+Enter drafting without repository access', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    render(<GuestbookComposer identity={{ nickname: '访客', email: '', website: '' }} replyTo={null} sending={false} onOpenIdentity={vi.fn()} onCancelReply={vi.fn()} onSend={onSend} onNotice={vi.fn()} />)
    const composer = screen.getByRole('textbox', { name: '留言内容' })
    fireEvent.change(composer, { target: { value: '编辑中的留言' } })
    fireEvent.keyDown(composer, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
    fireEvent.keyDown(composer, { key: 'Enter' })
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('编辑中的留言', undefined))
    expect(mocks.list).not.toHaveBeenCalled()
  })

  it('keeps one visible commerce H1 and its authenticated workbench controls', async () => {
    mocks.useAuth.mockReturnValue(authState(true))
    const repository = {
      getEntitlement: vi.fn().mockResolvedValue({ credits: 3, unlimited: false }),
      listProjects: vi.fn().mockResolvedValue([]),
    } as unknown as CommerceRepository
    const { container } = render(<CommerceStudioPage repository={repository} />)
    const main = container.querySelector('main')!
    expect(main).toHaveClass('editorial-page')
    const intro = main.querySelector('.editorial-page-intro')!
    expect(within(intro as HTMLElement).getByText('AI COMMERCE STUDIO')).toBeVisible()
    expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('button', { name: /历史项目/ })).toBeInTheDocument()
    expect(screen.getByLabelText('产品名称')).toBeInTheDocument()
    expect(screen.getByLabelText('上传产品图')).toBeInTheDocument()
    await waitFor(() => expect(repository.getEntitlement).toHaveBeenCalledOnce())
    expect(mocks.list).not.toHaveBeenCalled()
  })
})
