import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { commerceRepository, type CommerceRepository } from './commerceRepository'
import { CommerceHistory } from './CommerceHistory'
import { CommerceProjectForm, type CommerceFormStatus } from './CommerceProjectForm'
import { CommerceResult } from './CommerceResult'
import type { AssetUploadProgress, CommerceGeneration, CommerceGenerationStatus, CommerceProject, CommerceProjectInput, CommerceResult as CommerceResultData, HeroDirection } from './types'
import { isCommerceResult } from './validation'
import './commerce.css'

type Attempt = {
  signature: string
  idempotencyKey: string
  input: CommerceProjectInput
  projectId?: string
  uploaded?: boolean
  generationId?: string
  retryBlocked?: boolean
}

type GenerationGuard = { scope: number; userId: string; generationId: string; sequence: number }
type DraftSeed = { key: number; ownerId: string; input: Partial<CommerceProjectInput> }
type RerunBase = { sourceId: string; input: Partial<CommerceProjectInput> }

export type CommerceStudioPageProps = {
  repository?: CommerceRepository
  pollIntervalMs?: number
  createIdempotencyKey?: () => string
}

const terminalStatuses = new Set<CommerceGenerationStatus>(['completed', 'failed', 'cancelled'])
const makeIdempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const formSignature = (input: CommerceProjectInput) => JSON.stringify({
  ...input,
  files: input.files.map((file) => ({ name: file.name, size: file.size, type: file.type, lastModified: file.lastModified })),
})
const messageForError = (error: unknown) => error instanceof Error ? error.message : '服务暂时不可用，请稍后重试。'

export function CommerceStudioPage({ repository = commerceRepository, pollIntervalMs = 2000, createIdempotencyKey = makeIdempotencyKey }: CommerceStudioPageProps) {
  const auth = useAuth()
  const [creditsLabel, setCreditsLabel] = useState('登录后查看')
  const [status, setStatus] = useState<CommerceFormStatus>('idle')
  const [progress, setProgress] = useState<AssetUploadProgress | null>(null)
  const [error, setError] = useState('')
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [result, setResult] = useState<CommerceResultData | null>(null)
  const [resultOwnerId, setResultOwnerId] = useState<string | null>(null)
  const [resultNotice, setResultNotice] = useState('')
  const [resultUnavailable, setResultUnavailable] = useState('')
  const [directionNote, setDirectionNote] = useState('')
  const [liveGeneration, setLiveGeneration] = useState<CommerceGeneration | null>(null)
  const [liveGenerationOwnerId, setLiveGenerationOwnerId] = useState<string | null>(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [draftSeed, setDraftSeed] = useState<DraftSeed | null>(null)
  const [presentationOwnerId, setPresentationOwnerId] = useState<string | null>(null)
  const attemptRef = useRef<Attempt | null>(null)
  const lastSuccessfulInputRef = useRef<CommerceProjectInput | null>(null)
  const rerunBaseRef = useRef<RerunBase | null>(null)
  const mountedRef = useRef(true)
  const entitlementRequestRef = useRef(0)
  const generationIdRef = useRef<string | null>(null)
  const generationSequenceRef = useRef(0)
  const scopeVersionRef = useRef(0)
  const authenticated = auth.ready && Boolean(auth.user) && !auth.isAnonymous
  const authenticatedUserId = authenticated ? auth.user!.id : null
  const authenticatedUserIdRef = useRef<string | null>(authenticatedUserId)
  const scopedUserRef = useRef<string | null>(authenticatedUserId)
  if (scopedUserRef.current !== authenticatedUserId) {
    scopedUserRef.current = authenticatedUserId
    scopeVersionRef.current += 1
  }
  authenticatedUserIdRef.current = authenticatedUserId

  const setActiveGenerationId = useCallback((id: string | null) => {
    generationIdRef.current = id
    setGenerationId(id)
  }, [])

  const guardIsCurrent = useCallback((guard: GenerationGuard) => mountedRef.current
    && scopeVersionRef.current === guard.scope
    && authenticatedUserIdRef.current === guard.userId
    && generationIdRef.current === guard.generationId
    && generationSequenceRef.current === guard.sequence, [])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; scopeVersionRef.current += 1; generationSequenceRef.current += 1 }
  }, [])

  useEffect(() => {
    generationSequenceRef.current += 1
    generationIdRef.current = null
    attemptRef.current = null
    lastSuccessfulInputRef.current = null
    rerunBaseRef.current = null
    entitlementRequestRef.current += 1
    setGenerationId(null)
    setStatus('idle')
    setProgress(null)
    setError('')
    setResult(null)
    setResultOwnerId(null)
    setResultNotice('')
    setResultUnavailable('')
    setDirectionNote('')
    setLiveGeneration(null)
    setLiveGenerationOwnerId(null)
    setDraftSeed(null)
    setPresentationOwnerId(null)
    setHistoryRefreshKey((current) => current + 1)
  }, [authenticatedUserId])

  const refreshEntitlement = useCallback(async () => {
    const requestId = ++entitlementRequestRef.current
    const requestedUserId = authenticatedUserId
    if (!authenticatedUserId) {
      if (mountedRef.current && requestId === entitlementRequestRef.current) setCreditsLabel('登录后查看')
      return
    }
    try {
      const entitlement = await repository.getEntitlement()
      if (mountedRef.current && requestId === entitlementRequestRef.current && requestedUserId === authenticatedUserIdRef.current) {
        setCreditsLabel(entitlement.unlimited ? '不限次数' : `${entitlement.credits} 次`)
      }
    } catch {
      if (mountedRef.current && requestId === entitlementRequestRef.current && requestedUserId === authenticatedUserIdRef.current) setCreditsLabel('读取失败')
    }
  }, [authenticatedUserId, repository])

  useEffect(() => { void refreshEntitlement() }, [refreshEntitlement])

  const handleGenerationState = useCallback((generation: Pick<CommerceGeneration, 'status' | 'errorMessage'> & Partial<Pick<CommerceGeneration, 'resultData' | 'projectId' | 'id'>>, guard?: GenerationGuard) => {
    if (!mountedRef.current || (guard && !guardIsCurrent(guard))) return
    setStatus(generation.status)
    if (!terminalStatuses.has(generation.status)) return

    if (generation.status === 'failed' || generation.status === 'cancelled') {
      setError(generation.status === 'failed'
        ? generation.errorMessage || 'AI 服务未能完成分析，额度已按服务结果处理。请调整资料后再试。'
        : '任务已取消，请调整资料后重新生成。')
      if (attemptRef.current) {
        attemptRef.current = { ...attemptRef.current, idempotencyKey: createIdempotencyKey(), generationId: undefined }
      }
      void refreshEntitlement()
      return
    }

    setError('')
    if ('resultData' in generation) {
      if (isCommerceResult(generation.resultData)) {
        setResult(generation.resultData)
        setResultOwnerId(authenticatedUserIdRef.current)
        setResultNotice('方案生成完成')
        setResultUnavailable('')
        if (attemptRef.current?.input) {
          lastSuccessfulInputRef.current = attemptRef.current.input
          rerunBaseRef.current = { sourceId: generation.id ?? generation.projectId ?? 'current-generation', input: attemptRef.current.input }
        }
      } else {
        setResult(null)
        setResultNotice('方案生成完成')
        setResultUnavailable('返回的方案数据不可用。请保留项目并稍后重试。')
        setPresentationOwnerId(authenticatedUserIdRef.current)
      }
    }
    if ('id' in generation && generation.id) {
      setLiveGeneration(generation as CommerceGeneration)
      setLiveGenerationOwnerId(authenticatedUserIdRef.current)
    }
    setHistoryRefreshKey((current) => current + 1)
    attemptRef.current = null
  }, [createIdempotencyKey, guardIsCurrent, refreshEntitlement])

  useEffect(() => {
    if (!generationId || terminalStatuses.has(status as CommerceGenerationStatus)) return
    const scope = scopeVersionRef.current
    const userId = authenticatedUserId
    const sequence = generationSequenceRef.current
    if (!userId) return
    const guard = { scope, userId, generationId, sequence }
    let polling = false
    const interval = window.setInterval(() => {
      if (polling) return
      polling = true
      void repository.getGeneration(generationId)
        .then((generation) => {
          if (!guardIsCurrent(guard)) return
          handleGenerationState(generation, guard)
          if (terminalStatuses.has(generation.status)) {
            window.clearInterval(interval)
          }
        })
        .catch((pollError) => {
          if (guardIsCurrent(guard)) setError(`${messageForError(pollError)} 任务仍在后台，可继续等待。`)
        })
        .finally(() => { polling = false })
    }, pollIntervalMs)
    return () => window.clearInterval(interval)
  }, [authenticatedUserId, generationId, guardIsCurrent, handleGenerationState, pollIntervalMs, repository, status])

  const runAttempt = useCallback(async (input: CommerceProjectInput) => {
    if (!auth.requireLogin('#ai-commerce')) return
    const userId = authenticatedUserId
    const scope = scopeVersionRef.current
    if (!userId) return
    const scopeIsCurrent = () => mountedRef.current && scopeVersionRef.current === scope && authenticatedUserIdRef.current === userId

    const signature = formSignature(input)
    let attempt = attemptRef.current
    if (!attempt || attempt.signature !== signature) {
      attempt = { signature, idempotencyKey: createIdempotencyKey(), input }
      attemptRef.current = attempt
    }

    setError('')
    setProgress(null)
    try {
      if (!attempt.projectId) {
        setStatus('creating')
        const project = await repository.createProject(attempt.input)
        if (!scopeIsCurrent()) return
        attempt.projectId = project.id
        setHistoryRefreshKey((current) => current + 1)
      }
      if (!attempt.uploaded) {
        setStatus('uploading')
        try {
          await repository.uploadAssets(attempt.projectId, attempt.input.files, (nextProgress) => {
            if (scopeIsCurrent()) setProgress(nextProgress)
          })
          if (!scopeIsCurrent()) return
        } catch (uploadError) {
          if (!scopeIsCurrent()) return
          const failedProjectId = attempt.projectId
          try {
            await repository.deleteProject(failedProjectId)
            if (!scopeIsCurrent()) return
            attempt.projectId = undefined
            attempt.uploaded = false
            attempt.retryBlocked = false
            setError(`${messageForError(uploadError)} 临时项目已安全清理，可重试上传。`)
          } catch (cleanupError) {
            attempt.retryBlocked = true
            setError(`${messageForError(uploadError)} 临时项目清理失败，为避免重复图片已停止重传。请刷新页面后重试。${messageForError(cleanupError)}`)
          }
          setStatus('failed')
          return
        }
        attempt.uploaded = true
      }
      if (!attempt.generationId) {
        setStatus('starting')
        const started = await repository.startGeneration(attempt.projectId, attempt.idempotencyKey)
        if (!scopeIsCurrent()) return
        attempt.generationId = started.generationId
        rerunBaseRef.current = null
        const sequence = ++generationSequenceRef.current
        setActiveGenerationId(started.generationId)
        const guard = { scope, userId, generationId: started.generationId, sequence }
        if (started.status === 'completed') {
          setStatus('processing')
          try {
            const completed = await repository.getGeneration(started.generationId)
            if (!guardIsCurrent(guard)) return
            handleGenerationState(completed, guard)
          } catch (completedError) {
            if (!guardIsCurrent(guard)) return
            setStatus('completed')
            setResultNotice('方案生成完成')
            setResultUnavailable(`${messageForError(completedError)} 暂时无法读取方案，请从历史记录重试。`)
            setPresentationOwnerId(userId)
          }
        } else {
          handleGenerationState({ status: started.status, errorMessage: null }, guard)
        }
        if (!terminalStatuses.has(started.status) || started.status === 'completed') void refreshEntitlement()
      }
    } catch (attemptError) {
      if (!scopeIsCurrent()) return
      setError(messageForError(attemptError))
      setStatus('failed')
    }
  }, [auth, authenticatedUserId, createIdempotencyKey, guardIsCurrent, handleGenerationState, refreshEntitlement, repository, setActiveGenerationId])

  const retry = useCallback(() => {
    if (attemptRef.current) void runAttempt(attemptRef.current.input)
  }, [runAttempt])

  const busy = ['creating', 'uploading', 'starting', 'queued', 'processing'].includes(status)
  const resetAttemptForMaterialChange = useCallback(() => {
    if (busy) return
    attemptRef.current = null
    generationSequenceRef.current += 1
    setActiveGenerationId(null)
    setProgress(null)
    setError('')
    setResult(null)
    setResultOwnerId(null)
    setResultNotice('')
    setResultUnavailable('')
    setDirectionNote('')
    setStatus('idle')
  }, [busy, setActiveGenerationId])

  const selectHistoryResult = useCallback((nextResult: CommerceResultData, project: CommerceProject, generation: CommerceGeneration) => {
    setResult(nextResult)
    setResultOwnerId(authenticatedUserIdRef.current)
    rerunBaseRef.current = { sourceId: generation.id, input: { mode: project.mode, name: project.name, platform: project.platform, ...project.inputData, files: [] } }
    setResultNotice('已打开历史方案')
    setResultUnavailable('')
    setError('')
  }, [])

  const rerunDirection = useCallback((direction: HeroDirection, index: number) => {
    if (busy) {
      setDirectionNote('当前方案仍在生成，请等待任务完成后再基于方向重做。')
      return
    }
    const source = rerunBaseRef.current
    if (!source) {
      setDirectionNote('暂时无法恢复原产品资料，请从历史项目重新打开方案。')
      return
    }
    const base = source.input
    const directionSeed = `重做方向：${direction.title}\n构图：${direction.composition}`
    const promptSeed = `图片提示词：${direction.imagePrompt}\n负面提示词：${direction.negativePrompt}`
    const input: Partial<CommerceProjectInput> = {
      ...base,
      mode: 'professional',
      desiredStyle: [base.desiredStyle, directionSeed].filter(Boolean).join('\n\n'),
      notes: [base.notes, promptSeed].filter(Boolean).join('\n\n'),
      files: base.files ?? [],
    }
    const ownerId = authenticatedUserIdRef.current
    if (!ownerId) return
    setDraftSeed((current) => ({ key: (current?.key ?? 0) + 1, ownerId, input }))
    setPresentationOwnerId(ownerId)
    setResult(null)
    setResultOwnerId(null)
    setResultUnavailable('')
    setDirectionNote(`已选择“${direction.title}”作为第 ${index + 1} 个重做方向。请核对产品资料后手动提交；此操作尚未生成，也不会扣除次数。`)
    setStatus('idle')
    generationSequenceRef.current += 1
    setActiveGenerationId(null)
    attemptRef.current = null
  }, [busy, setActiveGenerationId])

  const visibleResult = resultOwnerId === authenticatedUserId ? result : null
  const visibleLiveGeneration = liveGenerationOwnerId === authenticatedUserId ? liveGeneration : null
  const visibleDraftSeed = draftSeed?.ownerId === authenticatedUserId ? draftSeed : null
  const visibleDirectionNote = presentationOwnerId === authenticatedUserId ? directionNote : ''
  const visibleResultUnavailable = presentationOwnerId === authenticatedUserId ? resultUnavailable : ''

  return (
    <main className="commerce-page" id="ai-commerce">
      <div className="commerce-page-grid" aria-hidden="true" />
      <header className="commerce-page-intro">
        <p><span>AI / COMMERCE LAB</span><i />PRIVATE WORKSPACE</p>
        <div><h1>AI 电商视觉工作台</h1><p>上传产品资料，先获得适合目标市场的视觉策略，再把每一张主图与详情页变成可执行的作图提示词。</p></div>
      </header>
      {!auth.ready ? <section className="commerce-auth-gate" aria-live="polite">
        <span>VERIFYING SESSION</span><h2>正在确认安全会话</h2><p>工作台将在身份状态确认后开放。</p>
      </section> : !authenticated ? <section className="commerce-auth-gate" aria-labelledby="commerce-login-title">
        <span>LOGIN REQUIRED</span><h2 id="commerce-login-title">请先登录，再选择产品素材</h2><p>OAuth 登录会离开当前页面。先完成登录可以避免已经填写的资料和本地图片在跳转时丢失；图片不会被写入本地存储。</p>
        <button type="button" onClick={() => auth.requireLogin('#ai-commerce')}>登录并进入工作台 <i aria-hidden="true">↗</i></button>
      </section> : <div className="commerce-studio-stage">
        <div className="commerce-studio-primary">
          {visibleResult ? <>
            <div className="commerce-result-status commerce-print-hidden" role="status"><span>{resultNotice}</span><button type="button" onClick={() => { setResult(null); setResultNotice(''); setResultUnavailable('') }}>返回工作台</button></div>
            <CommerceResult result={visibleResult} onRerunDirection={rerunDirection} rerunDisabled={busy} rerunDisabledReason="当前方案仍在生成，请等待任务完成" />
          </> : <>
            {visibleResultUnavailable ? <div className="commerce-result-unavailable" role="alert"><strong>{resultNotice}</strong><span>{visibleResultUnavailable}</span></div> : null}
            {visibleDirectionNote ? <div className="commerce-direction-note" role="status">{visibleDirectionNote}</div> : null}
            <CommerceProjectForm
              key={`commerce-form-${authenticatedUserId}-${visibleDraftSeed?.key ?? 0}`}
              onSubmitted={runAttempt}
              busy={busy}
              status={status}
              progress={progress}
              error={error}
              creditsLabel={creditsLabel}
              onRetry={error && attemptRef.current && !attemptRef.current.retryBlocked ? retry : undefined}
              onMaterialChange={resetAttemptForMaterialChange}
              initialDraft={visibleDraftSeed?.input}
              draftKey={visibleDraftSeed?.key ?? 0}
            />
          </>}
        </div>
        <CommerceHistory key={`commerce-history-${authenticatedUserId}`} repository={repository} onSelectResult={selectHistoryResult} refreshKey={historyRefreshKey} liveGeneration={visibleLiveGeneration} />
      </div>}
    </main>
  )
}
