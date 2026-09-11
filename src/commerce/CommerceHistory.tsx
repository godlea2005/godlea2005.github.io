import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CommerceRepository } from './commerceRepository'
import type { CommerceGeneration, CommercePlatform, CommerceProject, CommerceResult } from './types'
import { isCommerceResult } from './validation'

type LoadState = 'loading' | 'ready' | 'error'

export type CommerceHistoryProps = {
  repository: CommerceRepository
  onSelectResult: (result: CommerceResult, project: CommerceProject, generation: CommerceGeneration) => void
  refreshKey?: number
  liveGeneration?: CommerceGeneration | null
  excludedProjectIds?: ReadonlySet<string>
  onCountChange?: (count: number) => void
}

type HistoryFilter = 'all' | 'completed' | 'processing' | 'incomplete'

const platformLabels: Record<CommercePlatform, string> = {
  ozon: 'Ozon',
  wildberries: 'Wildberries',
  douyin: '抖音电商',
  'taobao-tmall': '淘宝 / 天猫',
}

const statusLabels: Record<CommerceGeneration['status'], string> = {
  queued: '排队中', processing: '生成中', completed: '已完成', failed: '生成失败', cancelled: '已取消',
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : '历史记录暂时无法读取，请重试。'
const dateLabel = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date)
}
const expiryLabel = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function CommerceHistory({ repository, onSelectResult, refreshKey = 0, liveGeneration = null, excludedProjectIds, onCountChange }: CommerceHistoryProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [projects, setProjects] = useState<CommerceProject[]>([])
  const [generations, setGenerations] = useState<CommerceGeneration[]>([])
  const [loadError, setLoadError] = useState('')
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [locking, setLocking] = useState<Set<string>>(() => new Set())
  const [confirmingDelete, setConfirmingDelete] = useState<Set<string>>(() => new Set())
  const [deleting, setDeleting] = useState<Set<string>>(() => new Set())
  const deletingRef = useRef(new Set<string>())
  const requestRef = useRef(0)
  const [filter, setFilter] = useState<HistoryFilter>('all')

  const load = useCallback(async () => {
    const requestId = ++requestRef.current
    setLoadState('loading')
    setLoadError('')
    try {
      const listGenerations = repository.listGenerations?.bind(repository)
      const [nextProjects, nextGenerations] = await Promise.all([
        repository.listProjects(),
        listGenerations ? listGenerations() : Promise.resolve([]),
      ])
      if (requestId !== requestRef.current) return
      setProjects(nextProjects)
      setGenerations(nextGenerations)
      setLoadState('ready')
    } catch (error) {
      if (requestId !== requestRef.current) return
      setLoadError(errorMessage(error))
      setLoadState('error')
    }
  }, [repository])

  useEffect(() => {
    void load()
    return () => { requestRef.current += 1 }
  }, [load, refreshKey])

  const latestByProject = useMemo(() => {
    const map = new Map<string, CommerceGeneration>()
    const candidates = liveGeneration ? [liveGeneration, ...generations.filter((item) => item.id !== liveGeneration.id)] : generations
    candidates.forEach((generation) => {
      if (!generation.projectId || map.has(generation.projectId)) return
      map.set(generation.projectId, generation)
    })
    return map
  }, [generations, liveGeneration])

  const visibleProjects = useMemo(() => projects.filter((project) => {
    if (excludedProjectIds?.has(project.id)) return false
    const status = latestByProject.get(project.id)?.status
    if (filter === 'completed') return status === 'completed'
    if (filter === 'processing') return status === 'queued' || status === 'processing'
    if (filter === 'incomplete') return !status || status === 'failed' || status === 'cancelled'
    return true
  }), [excludedProjectIds, filter, latestByProject, projects])

  const projectCount = useMemo(() => projects.filter((project) => !excludedProjectIds?.has(project.id)).length, [excludedProjectIds, projects])
  useEffect(() => { onCountChange?.(projectCount) }, [onCountChange, projectCount])

  const setCardError = (id: string, message: string) => setCardErrors((current) => ({ ...current, [id]: message }))
  const clearCardError = (id: string) => setCardErrors((current) => {
    const next = { ...current }
    delete next[id]
    return next
  })

  const toggleLocked = async (project: CommerceProject) => {
    if (locking.has(project.id)) return
    const nextLocked = !project.locked
    clearCardError(project.id)
    setLocking((current) => new Set(current).add(project.id))
    setProjects((current) => current.map((item) => item.id === project.id ? { ...item, locked: nextLocked } : item))
    try {
      await repository.setProjectLocked(project.id, nextLocked)
    } catch (error) {
      setProjects((current) => current.map((item) => item.id === project.id ? { ...item, locked: project.locked } : item))
      setCardError(project.id, `${errorMessage(error)} 锁定状态已恢复，请重试。`)
    } finally {
      setLocking((current) => { const next = new Set(current); next.delete(project.id); return next })
    }
  }

  const isActive = (generation?: CommerceGeneration) => generation?.status === 'queued' || generation?.status === 'processing'
  const requestDelete = (id: string) => {
    if (isActive(latestByProject.get(id))) return
    clearCardError(id)
    setConfirmingDelete((current) => new Set(current).add(id))
  }
  const cancelDelete = (id: string) => setConfirmingDelete((current) => { const next = new Set(current); next.delete(id); return next })
  const confirmDelete = async (id: string) => {
    if (isActive(latestByProject.get(id))) return
    if (deletingRef.current.has(id)) return
    deletingRef.current.add(id)
    setDeleting((current) => new Set(current).add(id))
    clearCardError(id)
    try {
      await repository.deleteProject(id)
      setProjects((current) => current.filter((project) => project.id !== id))
      setGenerations((current) => current.filter((generation) => generation.projectId !== id))
      cancelDelete(id)
    } catch (error) {
      setCardError(id, `${errorMessage(error)} 项目仍保留在历史中，请重试。`)
    } finally {
      deletingRef.current.delete(id)
      setDeleting((current) => { const next = new Set(current); next.delete(id); return next })
    }
  }

  const selectResult = (project: CommerceProject, generation: CommerceGeneration | undefined) => {
    clearCardError(project.id)
    if (!generation || generation.status !== 'completed' || !isCommerceResult(generation.resultData)) {
      setCardError(project.id, '方案数据不可用。可保留项目并重新生成，或稍后重试。')
      return
    }
    onSelectResult(generation.resultData, project, generation)
  }

  return <aside className="commerce-history commerce-print-hidden" aria-label="历史项目列表">
    <div className="commerce-history-toolbar"><div className="commerce-history-filters" role="group" aria-label="筛选历史项目">
      {([['all', '全部'], ['completed', '已完成'], ['processing', '进行中'], ['incomplete', '未完成']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
    </div><button type="button" onClick={() => void load()} disabled={loadState === 'loading'} aria-label="刷新历史记录">↻</button></div>
    {loadState === 'loading' ? <p className="commerce-history-state" role="status">正在读取历史项目…</p> : null}
    {loadState === 'error' ? <div className="commerce-history-state" role="alert"><strong>读取失败</strong><p>{loadError}</p><button type="button" onClick={() => void load()}>重试历史记录</button></div> : null}
    {loadState === 'ready' && projectCount === 0 ? <div className="commerce-history-state"><strong>还没有历史项目</strong><p>完成第一份视觉方案后，它会在这里保留文字结果。</p></div> : null}
    {loadState === 'ready' && projectCount > 0 && visibleProjects.length === 0 ? <div className="commerce-history-state"><strong>当前筛选没有项目</strong><p>换一个状态看看。</p></div> : null}
    {loadState === 'ready' && visibleProjects.length > 0 ? <ol className="commerce-history-list">{visibleProjects.map((project, index) => {
      const generation = latestByProject.get(project.id)
      const readyAssets = project.assets.filter((asset) => asset.state === 'ready' && !asset.deletedAt)
      const earliestExpiry = readyAssets.map((asset) => asset.expiresAt).filter(Boolean).sort()[0]
      const isDeleting = deleting.has(project.id)
      const isLocking = locking.has(project.id)
      const activeGeneration = isActive(generation)
      return <li key={project.id}>
        <article className="commerce-history-card" aria-label={`${project.name} 历史项目`}>
          <div className="commerce-history-index"><span>{String(index + 1).padStart(2, '0')}</span><i data-status={generation?.status ?? 'none'} /></div>
          <div className="commerce-history-copy">
            <p><span>{platformLabels[project.platform] ?? project.platform}</span><time dateTime={project.createdAt}>{dateLabel(project.createdAt)}</time></p>
            <h3>{project.name}</h3>
            <div className="commerce-history-meta"><span>{generation ? statusLabels[generation.status] : '未完成草稿'}</span><span>剩余图片 {readyAssets.length} 张</span></div>
            {earliestExpiry ? <p className="commerce-history-expiry">图片将在 {expiryLabel(earliestExpiry)} 清理</p> : project.assets.length > 0 && readyAssets.length === 0 ? <p className="commerce-history-cleaned">原始图片已自动清理，文字方案仍可使用</p> : null}
            <label className="commerce-history-lock"><input type="checkbox" checked={project.locked} disabled={isLocking || isDeleting} onChange={() => void toggleLocked(project)} aria-label={`锁定 ${project.name}`} /><span>{project.locked ? '已锁定' : '锁定项目'}</span></label>
            <small>锁定仅避免软上限提前清理，仍按 7 天到期</small>
            {cardErrors[project.id] ? <p className="commerce-history-card-error" role="alert">{cardErrors[project.id]}</p> : null}
          </div>
          <div className="commerce-history-actions">
            {generation?.status === 'completed' ? <button type="button" onClick={() => selectResult(project, generation)} disabled={isDeleting} aria-label={`查看 ${project.name} 方案`}>查看方案</button> : null}
            {!confirmingDelete.has(project.id) ? <button type="button" onClick={() => requestDelete(project.id)} disabled={isDeleting || activeGeneration} title={activeGeneration ? '任务生成中，完成或终止后才能删除' : undefined} aria-label={`删除 ${project.name}`}>删除</button> : <div className="commerce-delete-confirm" role="group" aria-label={`确认删除 ${project.name}`}>
              <span>确认删除项目？</span><button type="button" onClick={() => void confirmDelete(project.id)} disabled={isDeleting} aria-label={`确认删除 ${project.name}`}>{isDeleting ? '删除中…' : '确认删除'}</button><button type="button" onClick={() => cancelDelete(project.id)} disabled={isDeleting} aria-label={`取消删除 ${project.name}`}>取消</button>
            </div>}
          </div>
        </article>
      </li>
    })}</ol> : null}
  </aside>
}
