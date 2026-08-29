import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import {
  commerceRepository,
  type CommerceAdminDashboardQuery,
  type CommerceRepository,
} from './commerceRepository'
import type { CommerceAdminDashboard, CommerceAdminGeneration, CommerceAdminSettings, CommerceAdminUser } from './types'
import './commerce.css'

type AdminTab = 'overview' | 'users' | 'generations' | 'settings'
type UserEditor = {
  source: CommerceAdminUser
  credits: string
  dailyLimit: string
  unlimited: boolean
  disabled: boolean
  reason: string
  confirmed: boolean
}

const tabs: Array<{ id: AdminTab; label: string }> = [
  { id: 'overview', label: '概览' },
  { id: 'users', label: '用户' },
  { id: 'generations', label: '任务' },
  { id: 'settings', label: '设置' },
]
const pageSize = 50
const emptyQuery: Required<CommerceAdminDashboardQuery> = {
  userSearch: '', generationSearch: '', userOffset: 0, generationOffset: 0,
}

const messageForError = (error: unknown) => error instanceof Error ? error.message : '服务暂时不可用，请稍后重试。'
const validInteger = (value: number, minimum: number, maximum: number) => Number.isSafeInteger(value) && value >= minimum && value <= maximum
const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const amount = value / 1024 ** index
  return `${amount >= 10 || index === 0 ? Math.round(amount) : Number(amount.toFixed(1))} ${units[index]}`
}
const formatDate = (value: unknown) => {
  if (typeof value !== 'string') return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { hour12: false }) : '—'
}
const formatDuration = (generation: CommerceAdminGeneration) => {
  if (!generation.startedAt || !generation.completedAt) return '—'
  const started = new Date(generation.startedAt).getTime()
  const completed = new Date(generation.completedAt).getTime()
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return '—'
  const seconds = Math.floor((completed - started) / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return minutes > 0 ? `${minutes}分 ${remainder}秒` : `${remainder}秒`
}

const settingsFromDashboard = (dashboard: CommerceAdminDashboard | null): Record<keyof CommerceAdminSettings, string> => ({
  newUserCredits: String(dashboard?.settings.newUserCredits ?? ''),
  defaultDailyLimit: String(dashboard?.settings.defaultDailyLimit ?? ''),
  maxProjectImages: String(dashboard?.settings.maxProjectImages ?? ''),
  storageSoftLimitBytes: String(dashboard?.settings.storageSoftLimitBytes ?? ''),
  storageTargetBytes: String(dashboard?.settings.storageTargetBytes ?? ''),
})

export function CommerceAdminPage({ repository = commerceRepository }: { repository?: CommerceRepository }) {
  const auth = useAuth()
  const [activeTab, setActiveTab] = useState<AdminTab>('overview')
  const [dashboard, setDashboard] = useState<CommerceAdminDashboard | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [userSearchDraft, setUserSearchDraft] = useState('')
  const [generationSearchDraft, setGenerationSearchDraft] = useState('')
  const [query, setQuery] = useState<Required<CommerceAdminDashboardQuery>>(emptyQuery)
  const [editor, setEditor] = useState<UserEditor | null>(null)
  const [savingUser, setSavingUser] = useState(false)
  const [settingsDraft, setSettingsDraft] = useState(settingsFromDashboard(null))
  const [settingsReason, setSettingsReason] = useState('')
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const scopeRef = useRef(0)
  const fetchRef = useRef(0)
  const mutationRef = useRef(false)
  const queryRef = useRef(query)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const editorDialogRef = useRef<HTMLFormElement | null>(null)
  const editorReturnFocusRef = useRef<HTMLElement | null>(null)
  const savingUserRef = useRef(false)
  const settingsDirtyRef = useRef(false)
  const settingsRevisionRef = useRef(0)

  const userId = auth.user?.id ?? ''
  const authorized = auth.ready && Boolean(userId) && !auth.isAnonymous && auth.isAdmin
  const editorOpen = Boolean(editor)
  queryRef.current = query
  savingUserRef.current = savingUser
  settingsDirtyRef.current = settingsDirty

  const applyDashboard = useCallback((next: CommerceAdminDashboard, hydrateSettings: boolean) => {
    setDashboard(next)
    if (hydrateSettings) setSettingsDraft(settingsFromDashboard(next))
  }, [])

  const fetchDashboard = useCallback(async (
    nextQuery: Required<CommerceAdminDashboardQuery>,
    options: { announce?: boolean; scope?: number; owner?: string; forceSettingsHydration?: boolean } = {},
  ) => {
    const request = ++fetchRef.current
    const scope = options.scope ?? scopeRef.current
    const owner = options.owner ?? userId
    const settingsRevision = settingsRevisionRef.current
    setLoading(true)
    setError('')
    if (!options.announce) setSuccess('')
    try {
      const next = await repository.getAdminDashboard(nextQuery)
      if (scopeRef.current !== scope || fetchRef.current !== request || owner !== auth.user?.id) return false
      const hydrateSettings = options.forceSettingsHydration === true
        || (!settingsDirtyRef.current && settingsRevisionRef.current === settingsRevision)
      applyDashboard(next, hydrateSettings)
      if (options.forceSettingsHydration) {
        settingsDirtyRef.current = false
        setSettingsDirty(false)
      }
      if (options.announce) setSuccess('保存成功，已从服务器刷新最新数据。')
      return true
    } catch (fetchError) {
      if (scopeRef.current !== scope || fetchRef.current !== request || owner !== auth.user?.id) return false
      setError(messageForError(fetchError))
      return false
    } finally {
      if (scopeRef.current === scope && fetchRef.current === request && owner === auth.user?.id) setLoading(false)
    }
  }, [applyDashboard, auth.user?.id, repository, userId])

  useEffect(() => {
    const scope = ++scopeRef.current
    fetchRef.current += 1
    mutationRef.current = false
    setDashboard(null)
    setActiveTab('overview')
    setLoading(false)
    setError('')
    setSuccess('')
    setUserSearchDraft('')
    setGenerationSearchDraft('')
    setQuery(emptyQuery)
    queryRef.current = emptyQuery
    setEditor(null)
    setSavingUser(false)
    setSettingsDraft(settingsFromDashboard(null))
    setSettingsReason('')
    settingsRevisionRef.current += 1
    settingsDirtyRef.current = false
    setSettingsDirty(false)
    setSavingSettings(false)
    if (authorized) void fetchDashboard(emptyQuery, { scope, owner: userId })
    return () => {
      scopeRef.current += 1
      fetchRef.current += 1
      mutationRef.current = false
    }
  }, [authorized, fetchDashboard, userId])

  const selectTab = (tab: AdminTab, focus = false) => {
    setActiveTab(tab)
    setError('')
    setSuccess('')
    if (focus) tabRefs.current[tabs.findIndex((item) => item.id === tab)]?.focus()
  }

  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    else return
    event.preventDefault()
    selectTab(tabs[next].id, true)
  }

  const runQuery = (next: Required<CommerceAdminDashboardQuery>) => {
    queryRef.current = next
    setQuery(next)
    void fetchDashboard(next)
  }

  const submitUserSearch = (event: FormEvent) => {
    event.preventDefault()
    runQuery({ ...queryRef.current, userSearch: userSearchDraft.trim(), userOffset: 0 })
  }

  const submitGenerationSearch = (event: FormEvent) => {
    event.preventDefault()
    runQuery({ ...queryRef.current, generationSearch: generationSearchDraft.trim(), generationOffset: 0 })
  }

  const openEditor = (user: CommerceAdminUser) => {
    editorReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setEditor({
      source: user,
      credits: String(user.credits),
      dailyLimit: String(user.dailyLimit),
      unlimited: user.unlimited,
      disabled: user.disabled,
      reason: '',
      confirmed: false,
    })
    setError('')
    setSuccess('')
  }

  useEffect(() => {
    if (!editor || !editorDialogRef.current) return
    const dialog = editorDialogRef.current
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)'))
    focusable()[0]?.focus()
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !savingUserRef.current) {
        event.preventDefault()
        setEditor(null)
        return
      }
      if (event.key !== 'Tab') return
      const controls = focusable()
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      editorReturnFocusRef.current?.focus()
    }
  }, [editorOpen])

  const highImpactChange = editor
    ? editor.unlimited !== editor.source.unlimited || editor.disabled !== editor.source.disabled
    : false

  const saveUser = async (event: FormEvent) => {
    event.preventDefault()
    if (!editor || mutationRef.current) return
    const credits = Number(editor.credits)
    const dailyLimit = Number(editor.dailyLimit)
    const reason = editor.reason.trim()
    if (!validInteger(credits, 0, 1000000) || !validInteger(dailyLimit, 1, 1000) || reason.length < 1 || reason.length > 500) {
      setError('请填写有效次数（0–1000000）、每日上限（1–1000）和 1–500 字调整原因。')
      return
    }
    if (highImpactChange && !editor.confirmed) {
      setError('请确认无限次数或禁用账户的高影响变更。')
      return
    }
    const scope = scopeRef.current
    const owner = userId
    mutationRef.current = true
    setSavingUser(true)
    setError('')
    setSuccess('')
    try {
      await repository.setUserEntitlement({
        userId: editor.source.userId,
        credits,
        unlimited: editor.unlimited,
        disabled: editor.disabled,
        dailyLimit,
        reason,
      })
      if (scopeRef.current !== scope || auth.user?.id !== owner) return
      const refreshed = await fetchDashboard(queryRef.current, { announce: true, scope, owner })
      if (refreshed) setEditor(null)
    } catch (mutationError) {
      if (scopeRef.current === scope && auth.user?.id === owner) setError(messageForError(mutationError))
    } finally {
      if (scopeRef.current === scope && auth.user?.id === owner) {
        mutationRef.current = false
        setSavingUser(false)
      }
    }
  }

  const parsedSettings = useMemo<CommerceAdminSettings>(() => ({
    newUserCredits: Number(settingsDraft.newUserCredits),
    defaultDailyLimit: Number(settingsDraft.defaultDailyLimit),
    maxProjectImages: Number(settingsDraft.maxProjectImages),
    storageSoftLimitBytes: Number(settingsDraft.storageSoftLimitBytes),
    storageTargetBytes: Number(settingsDraft.storageTargetBytes),
  }), [settingsDraft])

  const settingsErrors = useMemo(() => {
    const messages: string[] = []
    if (!validInteger(parsedSettings.newUserCredits, 1, 1000000)) messages.push('新用户次数需为 1–1000000。')
    if (!validInteger(parsedSettings.defaultDailyLimit, 1, 1000)) messages.push('默认每日上限需为 1–1000。')
    if (!validInteger(parsedSettings.maxProjectImages, 1, 6)) messages.push('最大项目图片数需为 1–6。')
    if (!Number.isSafeInteger(parsedSettings.storageSoftLimitBytes) || parsedSettings.storageSoftLimitBytes < 1) messages.push('Storage 软上限需为正整数。')
    if (!Number.isSafeInteger(parsedSettings.storageTargetBytes) || parsedSettings.storageTargetBytes < 1) messages.push('Storage 目标水位需为正整数。')
    if (Number.isFinite(parsedSettings.storageSoftLimitBytes) && Number.isFinite(parsedSettings.storageTargetBytes)
      && parsedSettings.storageTargetBytes >= parsedSettings.storageSoftLimitBytes) messages.push('Storage 目标水位必须小于软上限。')
    return messages
  }, [parsedSettings])

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault()
    if (mutationRef.current) return
    const reason = settingsReason.trim()
    if (settingsErrors.length > 0) {
      setError(settingsErrors.join(' '))
      return
    }
    if (reason.length < 1 || reason.length > 500) {
      setError('请填写 1–500 字设置调整原因。')
      return
    }
    const scope = scopeRef.current
    const owner = userId
    mutationRef.current = true
    setSavingSettings(true)
    setError('')
    setSuccess('')
    try {
      await repository.updateAdminSettings(parsedSettings, reason)
      if (scopeRef.current !== scope || auth.user?.id !== owner) return
      const refreshed = await fetchDashboard(queryRef.current, { announce: true, scope, owner, forceSettingsHydration: true })
      if (refreshed) setSettingsReason('')
    } catch (mutationError) {
      if (scopeRef.current === scope && auth.user?.id === owner) setError(messageForError(mutationError))
    } finally {
      if (scopeRef.current === scope && auth.user?.id === owner) {
        mutationRef.current = false
        setSavingSettings(false)
      }
    }
  }

  const changeSetting = (key: keyof CommerceAdminSettings, value: string) => {
    settingsRevisionRef.current += 1
    settingsDirtyRef.current = true
    setSettingsDirty(true)
    setSettingsDraft((current) => ({ ...current, [key]: value }))
  }

  if (!auth.ready) return <main className="commerce-page commerce-admin-page"><p className="commerce-admin-gate" role="status">正在确认管理员身份…</p></main>
  if (!authorized) return <main className="commerce-page commerce-admin-page"><section className="commerce-admin-gate"><span>403 / OPERATOR ONLY</span><h1>无权访问此页面</h1><p>此页面只向当前验证通过的站长账户开放。</p><a href="#ai-commerce">返回 AI 电商设计</a></section></main>

  return <main className="commerce-page commerce-admin-page">
    <div className="commerce-page-grid" aria-hidden="true" />
    <header className="commerce-admin-header">
      <p><span>008</span><i />COMMERCE OPERATIONS</p>
      <div><h1>站长控制台</h1><p>额度、任务与存储策略只采用服务器权威状态，不在浏览器里模拟权限。</p></div>
    </header>

    <div className="commerce-admin-tabs" role="tablist" aria-label="管理后台分区">
      {tabs.map((tab, index) => <button
        key={tab.id}
        ref={(element) => { tabRefs.current[index] = element }}
        id={`commerce-admin-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-selected={activeTab === tab.id}
        aria-controls={`commerce-admin-panel-${tab.id}`}
        tabIndex={activeTab === tab.id ? 0 : -1}
        disabled={savingUser || savingSettings}
        onClick={() => selectTab(tab.id)}
        onKeyDown={(event) => handleTabKey(event, index)}
      >{tab.label}</button>)}
    </div>

    {loading && !dashboard ? <p className="commerce-admin-loading" role="status">读取服务器数据…</p> : null}
    {error ? <p className="commerce-admin-message is-error" role="alert">{error}</p> : null}
    {success ? <p className="commerce-admin-message is-success" role="status" aria-label="保存结果">{success}</p> : null}
    {dashboard ? <section
      className="commerce-admin-panel"
      id={`commerce-admin-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`commerce-admin-tab-${activeTab}`}
      tabIndex={0}
    >
      {activeTab === 'overview' ? <Overview dashboard={dashboard} loading={loading} onRefresh={() => void fetchDashboard(queryRef.current)} /> : null}
      {activeTab === 'users' ? <UsersSection
        users={dashboard.users}
        loading={loading}
        search={userSearchDraft}
        offset={query.userOffset}
        onSearchChange={setUserSearchDraft}
        onSearch={submitUserSearch}
        onPage={(offset) => runQuery({ ...queryRef.current, userOffset: offset })}
        onEdit={openEditor}
      /> : null}
      {activeTab === 'generations' ? <GenerationsSection
        generations={dashboard.generations}
        loading={loading}
        search={generationSearchDraft}
        offset={query.generationOffset}
        onSearchChange={setGenerationSearchDraft}
        onSearch={submitGenerationSearch}
        onPage={(offset) => runQuery({ ...queryRef.current, generationOffset: offset })}
      /> : null}
      {activeTab === 'settings' ? <SettingsSection
        draft={settingsDraft}
        reason={settingsReason}
        errors={settingsErrors}
        saving={savingSettings}
        onChange={changeSetting}
        onReason={setSettingsReason}
        onSubmit={saveSettings}
      /> : null}
    </section> : null}

    {editor ? <div className="commerce-admin-dialog-backdrop">
      <form ref={editorDialogRef} className="commerce-admin-dialog" role="dialog" aria-modal="true" aria-labelledby="commerce-user-editor-title" onSubmit={saveUser}>
        <button className="commerce-admin-dialog-close" type="button" aria-label="关闭用户设置" disabled={savingUser} onClick={() => setEditor(null)}>×</button>
        <span>ENTITLEMENT / {editor.source.userId.slice(0, 8)}</span>
        <h2 id="commerce-user-editor-title">设置额度</h2>
        <p>{editor.source.email ?? editor.source.userId}</p>
        <label><span>剩余次数</span><input disabled={savingUser} type="number" min="0" max="1000000" step="1" value={editor.credits} onChange={(event) => setEditor({ ...editor, credits: event.target.value })} /></label>
        <label><span>每日上限</span><input disabled={savingUser} type="number" min="1" max="1000" step="1" value={editor.dailyLimit} onChange={(event) => setEditor({ ...editor, dailyLimit: event.target.value })} /></label>
        <div className="commerce-admin-checks">
          <label><input disabled={savingUser} type="checkbox" checked={editor.unlimited} onChange={(event) => setEditor({ ...editor, unlimited: event.target.checked, confirmed: false })} />无限次数</label>
          <label><input disabled={savingUser} type="checkbox" checked={editor.disabled} onChange={(event) => setEditor({ ...editor, disabled: event.target.checked, confirmed: false })} />禁用账户</label>
        </div>
        <small>999 次仍会扣减；无限次数不会扣减。禁用账户将阻止新的生成任务。</small>
        <label><span>调整原因</span><textarea disabled={savingUser} maxLength={500} value={editor.reason} onChange={(event) => setEditor({ ...editor, reason: event.target.value })} /></label>
        {highImpactChange ? <label className="commerce-admin-confirm"><input disabled={savingUser} type="checkbox" checked={editor.confirmed} onChange={(event) => setEditor({ ...editor, confirmed: event.target.checked })} />确认无限次数与禁用账户变更</label> : null}
        <div className="commerce-admin-dialog-actions"><button type="button" disabled={savingUser} onClick={() => setEditor(null)}>取消</button><button type="submit" disabled={savingUser || (highImpactChange && !editor.confirmed)}>{savingUser ? '保存中…' : '确认保存'}</button></div>
      </form>
    </div> : null}
  </main>
}

function Overview({ dashboard, loading, onRefresh }: { dashboard: CommerceAdminDashboard; loading: boolean; onRefresh: () => void }) {
  const { overview } = dashboard
  const successRate = Math.max(0, Math.min(100, 100 - (Number.isFinite(overview.todayFailureRate) ? overview.todayFailureRate : 0)))
  const cleanup = overview.latestCleanup ?? {}
  const deleted = typeof cleanup.assets_deleted === 'number' ? cleanup.assets_deleted : 0
  const deletedBytes = typeof cleanup.bytes_deleted === 'number' ? cleanup.bytes_deleted : 0
  return <div className="commerce-admin-overview">
    <header><div><span>LIVE OVERVIEW</span><h2>运行概览</h2></div><button type="button" disabled={loading} onClick={onRefresh}>刷新数据</button></header>
    <div className="commerce-admin-metrics">
      {[['总用户', overview.totalUsers], ['今日任务', overview.todayGenerations], ['成功率', `${successRate}%`], ['已消耗额度', overview.creditsConsumed], ['有效 Storage', formatBytes(overview.storageBytes)]].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </div>
    <article className="commerce-admin-cleanup"><span>LATEST CLEANUP</span><div><strong>{cleanup.status === 'completed' ? '清理已完成' : cleanup.status ? String(cleanup.status) : '尚无清理记录'}</strong><p>{overview.latestCleanup ? `删除 ${deleted} 个资源 / ${formatBytes(deletedBytes)} · ${formatDate(cleanup.completed_at ?? cleanup.started_at)}` : '系统尚未记录存储清理。'}</p></div></article>
  </div>
}

function UsersSection(props: {
  users: CommerceAdminUser[]; loading: boolean; search: string; offset: number
  onSearchChange: (value: string) => void; onSearch: (event: FormEvent) => void
  onPage: (offset: number) => void; onEdit: (user: CommerceAdminUser) => void
}) {
  return <div className="commerce-admin-section">
    <SectionHeader eyebrow="ACCOUNT CONTROL" title="用户与额度" count={props.users.length} />
    <form className="commerce-admin-search" role="search" onSubmit={props.onSearch}><label htmlFor="commerce-admin-user-search">搜索用户</label><input id="commerce-admin-user-search" value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="邮箱或 UUID" /><button type="submit">搜索用户</button></form>
    <div className="commerce-admin-table" role="table" aria-label="用户列表">
      <div className="commerce-admin-table-head" role="row"><span role="columnheader">账户</span><span role="columnheader">额度</span><span role="columnheader">每日上限</span><span role="columnheader">任务 / 消耗</span><span role="columnheader">状态</span><span role="columnheader">操作</span></div>
      {props.users.map((user) => <div className="commerce-admin-table-row" role="row" data-mobile-row="user" data-testid={`admin-user-row-${user.userId}`} key={user.userId}>
        <div role="cell" data-label="账户"><span className="commerce-admin-cell-label">账户</span><strong>{user.email ?? '无邮箱'}</strong><small>{user.userId}<br />{user.provider}</small></div>
        <div role="cell" data-label="额度"><span className="commerce-admin-cell-label">额度</span><strong>{user.unlimited ? '无限' : user.credits}</strong></div>
        <div role="cell" data-label="每日上限"><span className="commerce-admin-cell-label">每日上限</span><strong>{user.dailyLimit}</strong></div>
        <div role="cell" data-label="任务 / 消耗"><span className="commerce-admin-cell-label">任务 / 消耗</span><strong>{user.generationCount} / {user.creditsUsed}</strong></div>
        <div role="cell" data-label="状态"><span className="commerce-admin-cell-label">状态</span><span className={user.disabled ? 'is-danger' : user.unlimited ? 'is-accent' : ''}>{user.disabled ? '已禁用' : user.unlimited ? '无限次数' : '正常'}</span></div>
        <div role="cell" data-label="操作"><span className="commerce-admin-cell-label">操作</span><button type="button" onClick={() => props.onEdit(user)} aria-label={`设置额度 ${user.email ?? user.userId}`}>设置额度</button></div>
      </div>)}
      {props.users.length === 0 ? <p className="commerce-admin-empty">没有匹配用户。</p> : null}
    </div>
    <Pagination offset={props.offset} count={props.users.length} disabled={props.loading} onPage={props.onPage} label="用户" />
  </div>
}

function GenerationsSection(props: {
  generations: CommerceAdminGeneration[]; loading: boolean; search: string; offset: number
  onSearchChange: (value: string) => void; onSearch: (event: FormEvent) => void; onPage: (offset: number) => void
}) {
  return <div className="commerce-admin-section">
    <SectionHeader eyebrow="GENERATION TRACE" title="生成任务" count={props.generations.length} />
    <form className="commerce-admin-search" role="search" onSubmit={props.onSearch}><label htmlFor="commerce-admin-task-search">搜索任务</label><input id="commerce-admin-task-search" value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} placeholder="邮箱、任务、项目、平台或状态" /><button type="submit">搜索任务</button></form>
    <div className="commerce-admin-table is-generations" role="table" aria-label="任务列表">
      <div className="commerce-admin-table-head" role="row"><span role="columnheader">任务 / 用户</span><span role="columnheader">状态 / 平台</span><span role="columnheader">耗时</span><span role="columnheader">模型</span><span role="columnheader">错误</span><span role="columnheader">退款</span></div>
      {props.generations.map((generation) => <div className="commerce-admin-table-row" role="row" data-mobile-row="generation" key={generation.generationId}>
        <div role="cell" data-label="任务 / 用户"><span className="commerce-admin-cell-label">任务 / 用户</span><strong>{generation.projectName}</strong><small>{generation.userEmail ?? generation.userId}<br />{generation.generationId}</small></div>
        <div role="cell" data-label="状态 / 平台"><span className="commerce-admin-cell-label">状态 / 平台</span><strong>{generation.status}</strong><small>{generation.platform ?? '已删除项目'}</small></div>
        <div role="cell" data-label="耗时"><span className="commerce-admin-cell-label">耗时</span><strong>{formatDuration(generation)}</strong><small>{formatDate(generation.createdAt)}</small></div>
        <div role="cell" data-label="模型"><span className="commerce-admin-cell-label">模型</span><strong>{generation.model ?? '—'}</strong><small>{generation.provider ?? '—'}</small></div>
        <div role="cell" data-label="错误"><span className="commerce-admin-cell-label">错误</span><strong className={generation.errorCode ? 'is-danger' : ''}>{generation.errorCode ?? '—'}</strong><small>{generation.errorMessage ?? '—'}</small></div>
        <div role="cell" data-label="退款"><span className="commerce-admin-cell-label">退款</span><strong>{generation.refundedAt ? '已退款' : generation.creditCharged ? '已扣次' : '未扣次'}</strong><small>{formatDate(generation.refundedAt)}</small></div>
      </div>)}
      {props.generations.length === 0 ? <p className="commerce-admin-empty">没有匹配任务。</p> : null}
    </div>
    <Pagination offset={props.offset} count={props.generations.length} disabled={props.loading} onPage={props.onPage} label="任务" />
  </div>
}

function SettingsSection(props: {
  draft: Record<keyof CommerceAdminSettings, string>; reason: string; errors: string[]; saving: boolean
  onChange: (key: keyof CommerceAdminSettings, value: string) => void; onReason: (value: string) => void; onSubmit: (event: FormEvent) => void
}) {
  const fields: Array<{ key: keyof CommerceAdminSettings; label: string; min: number; max?: number }> = [
    { key: 'newUserCredits', label: '新用户次数', min: 1, max: 1000000 },
    { key: 'defaultDailyLimit', label: '默认每日上限', min: 1, max: 1000 },
    { key: 'maxProjectImages', label: '最大项目图片数', min: 1, max: 6 },
    { key: 'storageSoftLimitBytes', label: 'Storage 软上限（字节）', min: 1 },
    { key: 'storageTargetBytes', label: 'Storage 目标水位（字节）', min: 1 },
  ]
  return <div className="commerce-admin-section">
    <SectionHeader eyebrow="SYSTEM POLICY" title="系统设置" />
    <form className="commerce-admin-settings" onSubmit={props.onSubmit} noValidate>
      <div>{fields.map((field) => <label key={field.key}><span>{field.label}</span><input disabled={props.saving} type="number" step="1" min={field.min} max={field.max} value={props.draft[field.key]} onChange={(event) => props.onChange(field.key, event.target.value)} /></label>)}</div>
      <label><span>设置调整原因</span><textarea disabled={props.saving} maxLength={500} value={props.reason} onChange={(event) => props.onReason(event.target.value)} /></label>
      {props.errors.length > 0 ? <ul className="commerce-admin-validation" aria-label="设置约束">{props.errors.map((item) => <li key={item}>{item}</li>)}</ul> : null}
      <button type="submit" disabled={props.saving}>{props.saving ? '保存中…' : '保存系统设置'}</button>
    </form>
  </div>
}

function SectionHeader({ eyebrow, title, count }: { eyebrow: string; title: string; count?: number }) {
  return <header className="commerce-admin-section-header"><div><span>{eyebrow}</span><h2>{title}</h2></div>{typeof count === 'number' ? <p>本页返回 <strong>{count}</strong> 条</p> : null}</header>
}

function Pagination({ offset, count, disabled, onPage, label }: { offset: number; count: number; disabled: boolean; onPage: (offset: number) => void; label: string }) {
  return <nav className="commerce-admin-pagination" aria-label={`${label}分页`}><button type="button" disabled={disabled || offset === 0} onClick={() => onPage(Math.max(0, offset - pageSize))}>上一页</button><span>第 {Math.floor(offset / pageSize) + 1} 页</span><button type="button" disabled={disabled || count < pageSize} onClick={() => onPage(offset + pageSize)}>下一页</button></nav>
}
