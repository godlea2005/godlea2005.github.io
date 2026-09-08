import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { AuthContextValue } from '../auth/AuthProvider'
import { CommerceRepositoryError, mapCommerceError } from './commerceErrors'
import type { CommerceRepository } from './commerceRepository'
import { commerceRunReducer, initialCommerceRunState, isCommerceRunBusy } from './commerceRunMachine'
import type { CommerceGeneration, CommerceGenerationStatus, CommerceProject, CommerceProjectInput, CommerceResult, HeroDirection } from './types'
import { isCommerceResult } from './validation'
import { consumeCommerceAuthDraft, saveCommerceAuthDraft } from './commerceAuthDraft'

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
type RerunBase = { sourceId: string; input: Partial<CommerceProjectInput> }
export type CommerceDraftSeed = { key: number; ownerId: string; input: Partial<CommerceProjectInput>; fileNotice?: string }

type UseCommerceRunOptions = {
  repository: CommerceRepository
  auth: AuthContextValue
  authenticatedUserId: string | null
  pollIntervalMs: number
  createIdempotencyKey: () => string
  onRefreshEntitlement: () => void | Promise<void>
}

const terminalStatuses = new Set<CommerceGenerationStatus>(['completed', 'failed', 'cancelled'])
const signatureFor = (input: CommerceProjectInput) => JSON.stringify({
  ...input,
  files: input.files.map((file) => ({ name: file.name, size: file.size, type: file.type, lastModified: file.lastModified })),
})
const errorFor = (error: unknown) => {
  if (error instanceof CommerceRepositoryError) return error
  const mapped = mapCommerceError(error)
  return new CommerceRepositoryError(mapped.code, error instanceof Error && error.message ? error.message : mapped.message, error)
}
const failureRecovery = (error: CommerceRepositoryError, retryBlocked = false) =>
  error.code === 'AUTH_REQUIRED' ? 'reauthenticate' as const : retryBlocked ? 'restart' as const : 'retry' as const

/** Owns exactly one submission attempt so UI components can only render reducer state. */
export function useCommerceRun({ repository, auth, authenticatedUserId, pollIntervalMs, createIdempotencyKey, onRefreshEntitlement }: UseCommerceRunOptions) {
  const [state, dispatch] = useReducer(commerceRunReducer, initialCommerceRunState)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null)
  const [liveGeneration, setLiveGeneration] = useState<CommerceGeneration | null>(null)
  const [draftSeed, setDraftSeed] = useState<CommerceDraftSeed | null>(null)
  const [directionNote, setDirectionNote] = useState('')
  const phaseRef = useRef(state.phase)
  phaseRef.current = state.phase
  const attemptRef = useRef<Attempt | null>(null)
  const latestInputRef = useRef<CommerceProjectInput | null>(null)
  const pendingCleanupProjectIdRef = useRef<string | null>(null)
  const rerunBaseRef = useRef<RerunBase | null>(null)
  const mountedRef = useRef(true)
  const runningRef = useRef<symbol | null>(null)
  const generationIdRef = useRef<string | null>(null)
  const generationSequenceRef = useRef(0)
  const scopeVersionRef = useRef(0)
  const authenticatedUserIdRef = useRef<string | null>(authenticatedUserId)
  const scopedUserRef = useRef<string | null>(authenticatedUserId)
  const stateOwnerRef = useRef<string | null>(authenticatedUserId)
  if (scopedUserRef.current !== authenticatedUserId) {
    scopedUserRef.current = authenticatedUserId
    scopeVersionRef.current += 1
    stateOwnerRef.current = null
  }
  authenticatedUserIdRef.current = authenticatedUserId

  const fail = useCallback((error: CommerceRepositoryError, recovery: 'retry' | 'reauthenticate' | 'restart') => {
    phaseRef.current = recovery === 'reauthenticate' ? 'auth-recovery' : recovery === 'retry' ? 'recoverable-error' : 'terminal-error'
    dispatch({ type: 'failed', error, recovery })
  }, [])

  const setActiveGenerationId = useCallback((id: string | null) => { generationIdRef.current = id }, [])
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
    latestInputRef.current = null
    pendingCleanupProjectIdRef.current = null
    rerunBaseRef.current = null
    runningRef.current = null
    setCurrentProjectId(null)
    setLiveGeneration(null)
    const restored = authenticatedUserId ? consumeCommerceAuthDraft(authenticatedUserId) : null
    if (restored) {
      latestInputRef.current = restored.input
      setDraftSeed((current) => ({ key: (current?.key ?? 0) + 1, ownerId: authenticatedUserId!, input: restored.input, fileNotice: '文字资料已恢复，请重新选择本地图片。' }))
    } else {
      setDraftSeed(null)
    }
    setDirectionNote('')
    dispatch({ type: 'reset' })
    setHistoryRefreshKey((value) => value + 1)
    if (!restored?.pendingCleanupProjectId || !authenticatedUserId) return

    const cleanupProjectId = restored.pendingCleanupProjectId
    const scope = scopeVersionRef.current
    let cancelled = false
    pendingCleanupProjectIdRef.current = cleanupProjectId
    setCurrentProjectId(cleanupProjectId)
    stateOwnerRef.current = authenticatedUserId
    attemptRef.current = {
      signature: signatureFor(restored.input),
      idempotencyKey: createIdempotencyKey(),
      input: restored.input,
      projectId: cleanupProjectId,
      retryBlocked: true,
    }
    dispatch({ type: 'begin' })
    void repository.deleteProject(cleanupProjectId)
      .then(() => {
        if (cancelled || !mountedRef.current || scopeVersionRef.current !== scope || authenticatedUserIdRef.current !== authenticatedUserId) return
        pendingCleanupProjectIdRef.current = null
        attemptRef.current = null
        setCurrentProjectId(null)
        setHistoryRefreshKey((value) => value + 1)
        dispatch({ type: 'reset' })
      })
      .catch((failure) => {
        if (cancelled || !mountedRef.current || scopeVersionRef.current !== scope || authenticatedUserIdRef.current !== authenticatedUserId) return
        const error = errorFor(failure)
        fail(
          error.code === 'AUTH_REQUIRED'
            ? new CommerceRepositoryError('AUTH_REQUIRED', '清理未完成项目需要重新连接账号。文字资料仍会保留。', error)
            : new CommerceRepositoryError(error.code, `未完成项目仍未清理，为避免重复图片已停止重传。${error.message}`, error),
          error.code === 'AUTH_REQUIRED' ? 'reauthenticate' : 'restart',
        )
      })
    return () => { cancelled = true }
  }, [authenticatedUserId, createIdempotencyKey, fail, repository])

  const complete = useCallback((generation: CommerceGeneration, guard?: GenerationGuard) => {
    if (!mountedRef.current || (guard && !guardIsCurrent(guard))) return
    if (generation.status === 'failed' || generation.status === 'cancelled') {
      const error = new CommerceRepositoryError('SERVICE_ERROR', generation.status === 'failed'
        ? generation.errorMessage || 'AI 服务未能完成分析，额度已按服务结果处理。请调整资料后再试。'
        : '任务已取消，请调整资料后重新生成。')
      attemptRef.current = attemptRef.current ? { ...attemptRef.current, idempotencyKey: createIdempotencyKey(), generationId: undefined } : null
      fail(error, 'retry')
      void onRefreshEntitlement()
      return
    }
    if (generation.status !== 'completed') {
      dispatch({ type: 'generation-update', generation })
      return
    }
    setLiveGeneration(generation)
    setCurrentProjectId(null)
    setHistoryRefreshKey((value) => value + 1)
    if (isCommerceResult(generation.resultData)) {
      dispatch({ type: 'completed', result: generation.resultData, generation })
      if (attemptRef.current) rerunBaseRef.current = { sourceId: generation.id || generation.projectId || 'current-generation', input: attemptRef.current.input }
    } else {
      dispatch({ type: 'completed', result: null, unavailable: '返回的方案数据不可用。请保留项目并稍后重试。', generation })
    }
    attemptRef.current = null
  }, [createIdempotencyKey, fail, guardIsCurrent, onRefreshEntitlement])

  useEffect(() => {
    const generation = state.generation
    if (state.phase !== 'generating' || !generationIdRef.current || !authenticatedUserId || terminalStatuses.has(generation?.status ?? 'queued')) return
    const guard = { scope: scopeVersionRef.current, userId: authenticatedUserId, generationId: generationIdRef.current, sequence: generationSequenceRef.current }
    let polling = false
    const interval = window.setInterval(() => {
      if (polling) return
      polling = true
      void repository.getGeneration(guard.generationId)
        .then((next) => {
          if (!guardIsCurrent(guard)) return
          complete(next, guard)
          if (terminalStatuses.has(next.status)) window.clearInterval(interval)
        })
        .catch((error) => {
          // Poll failure does not make re-submitting safe: the accepted job may still run.
          if (guardIsCurrent(guard)) dispatch({ type: 'presentation', value: { pollWarning: `${errorFor(error).message} 任务仍在后台，可继续等待。` } })
        })
        .finally(() => { polling = false })
    }, pollIntervalMs)
    return () => window.clearInterval(interval)
  }, [authenticatedUserId, complete, guardIsCurrent, pollIntervalMs, repository, state.generation, state.phase])

  const submit = useCallback(async (input: CommerceProjectInput) => {
    if (runningRef.current || isCommerceRunBusy(phaseRef.current) || phaseRef.current === 'auth-recovery') return
    const runToken = Symbol('commerce-run')
    runningRef.current = runToken
    let scopeIsCurrent = () => false
    dispatch({ type: 'begin' })
    try {
      if (!auth.requireLogin('#ai-commerce')) { dispatch({ type: 'reset' }); return }
      const userId = authenticatedUserId
      const scope = scopeVersionRef.current
      if (!userId) { dispatch({ type: 'reset' }); return }
      stateOwnerRef.current = userId
      scopeIsCurrent = () => mountedRef.current && scopeVersionRef.current === scope && authenticatedUserIdRef.current === userId
      const signature = signatureFor(input)
      let attempt = attemptRef.current
      if (!attempt || attempt.signature !== signature) {
        attempt = { signature, idempotencyKey: createIdempotencyKey(), input }
        attemptRef.current = attempt
      }

      dispatch({ type: 'stage', phase: 'creating-project' })
      if (!attempt.projectId) {
        const project = await repository.createProject(attempt.input)
        if (!scopeIsCurrent()) return
        attempt.projectId = project.id
        setCurrentProjectId(project.id)
        setHistoryRefreshKey((value) => value + 1)
        dispatch({ type: 'project-created' })
      } else {
        dispatch({ type: 'stage', phase: 'uploading' })
      }

      if (!attempt.uploaded) {
        try {
          await repository.uploadAssets(attempt.projectId!, attempt.input.files, (progress) => {
            if (scopeIsCurrent()) dispatch({ type: 'upload-progress', progress })
          })
          if (!scopeIsCurrent()) return
        } catch (uploadFailure) {
          if (!scopeIsCurrent()) return
          const failedProjectId = attempt.projectId
          const uploadError = errorFor(uploadFailure)
          try {
            await repository.deleteProject(failedProjectId!)
            if (!scopeIsCurrent()) return
            attempt.projectId = undefined
            attempt.uploaded = false
            attempt.retryBlocked = false
            setCurrentProjectId(null)
            setHistoryRefreshKey((value) => value + 1)
            fail(new CommerceRepositoryError(uploadError.code, `${uploadError.message} 临时项目已安全清理，可重试上传。`, uploadError), failureRecovery(uploadError))
          } catch (cleanupFailure) {
            if (!scopeIsCurrent()) return
            attempt.retryBlocked = true
            const cleanupError = errorFor(cleanupFailure)
            if (cleanupError.code === 'AUTH_REQUIRED') {
              pendingCleanupProjectIdRef.current = failedProjectId ?? null
              fail(new CommerceRepositoryError('AUTH_REQUIRED', '清理未完成项目需要重新连接账号。重新连接后会先完成清理，再允许重新上传。', cleanupError), 'reauthenticate')
            } else {
              fail(new CommerceRepositoryError(uploadError.code, `${uploadError.message} 临时项目清理失败，为避免重复图片已停止重传。请刷新页面后重试。${cleanupError.message}`, uploadError), failureRecovery(uploadError, true))
            }
          }
          return
        }
        attempt.uploaded = true
        dispatch({ type: 'upload-complete' })
      } else {
        dispatch({ type: 'upload-complete' })
      }

      if (!attempt.generationId) {
        const started = await repository.startGeneration(attempt.projectId!, attempt.idempotencyKey)
        if (!scopeIsCurrent()) return
        attempt.generationId = started.generationId
        rerunBaseRef.current = null
        const sequence = ++generationSequenceRef.current
        setActiveGenerationId(started.generationId)
        const guard = { scope, userId, generationId: started.generationId, sequence }
        dispatch({ type: 'generation-started' })
        if (started.status === 'completed') {
          try {
            const completed = await repository.getGeneration(started.generationId)
            complete(completed, guard)
          } catch (readFailure) {
            if (!guardIsCurrent(guard)) return
            dispatch({ type: 'completed', result: null, unavailable: `${errorFor(readFailure).message} 暂时无法读取方案，请从历史记录重试。` })
          }
        } else {
          complete({ id: started.generationId, projectId: attempt.projectId, userId, idempotencyKey: attempt.idempotencyKey, status: started.status, resultData: null, provider: null, model: null, usage: null, errorCode: null, errorMessage: null, creditCharged: false, refundedAt: null, createdAt: '', startedAt: null, completedAt: null }, guard)
        }
        if (!terminalStatuses.has(started.status) || started.status === 'completed') void onRefreshEntitlement()
      }
    } catch (failure) {
      const error = errorFor(failure)
      if (scopeIsCurrent()) fail(error, failureRecovery(error, attemptRef.current?.retryBlocked))
    } finally {
      if (runningRef.current === runToken) runningRef.current = null
    }
  }, [auth, authenticatedUserId, createIdempotencyKey, complete, fail, onRefreshEntitlement, repository, setActiveGenerationId, state.phase])

  const retry = useCallback(() => { if (attemptRef.current && !attemptRef.current.retryBlocked) void submit(attemptRef.current.input) }, [submit])
  const captureDraft = useCallback((input: CommerceProjectInput) => {
    latestInputRef.current = input
    if (attemptRef.current && state.phase === 'auth-recovery') attemptRef.current.input = input
  }, [state.phase])
  const recoverAuthentication = useCallback(() => {
    const ownerId = authenticatedUserIdRef.current
    const input = latestInputRef.current ?? attemptRef.current?.input
    if (ownerId && input) {
      try {
        saveCommerceAuthDraft({ ownerId, input, pendingCleanupProjectId: pendingCleanupProjectIdRef.current ?? undefined })
      } catch {
        // Login remains available when browser storage is unavailable; files are never serialized as a fallback.
      }
    }
    auth.requireLogin('#ai-commerce', { force: true })
  }, [auth])
  const resetForMaterialChange = useCallback(() => {
    if (isCommerceRunBusy(state.phase) || state.phase === 'auth-recovery') return
    attemptRef.current = null
    generationSequenceRef.current += 1
    setActiveGenerationId(null)
    dispatch({ type: 'reset' })
    setDirectionNote('')
  }, [setActiveGenerationId, state.phase])
  const closeResult = useCallback(() => {
    if (isCommerceRunBusy(state.phase)) dispatch({ type: 'presentation', value: { result: null, resultNotice: '', resultUnavailable: '' } })
    else dispatch({ type: 'reset' })
  }, [state.phase])
  const selectHistoryResult = useCallback((result: CommerceResult, project: CommerceProject, generation: CommerceGeneration) => {
    rerunBaseRef.current = { sourceId: generation.id, input: { mode: project.mode, name: project.name, platform: project.platform, ...project.inputData, files: [] } }
    dispatch({ type: 'history-result-selected', result })
    stateOwnerRef.current = authenticatedUserIdRef.current
    setDirectionNote('')
  }, [])
  const rerunDirection = useCallback((direction: HeroDirection, index: number) => {
    if (isCommerceRunBusy(state.phase)) { setDirectionNote('当前方案仍在生成，请等待任务完成后再基于方向重做。'); return }
    const source = rerunBaseRef.current
    if (!source || !authenticatedUserIdRef.current) { setDirectionNote('暂时无法恢复原产品资料，请从历史项目重新打开方案。'); return }
    const base = source.input
    const directionSeed = `重做方向：${direction.title}\n构图：${direction.composition}`
    const promptSeed = `图片提示词：${direction.imagePrompt}\n负面提示词：${direction.negativePrompt}`
    setDraftSeed((current) => ({ key: (current?.key ?? 0) + 1, ownerId: authenticatedUserIdRef.current!, input: { ...base, mode: 'professional', desiredStyle: [base.desiredStyle, directionSeed].filter(Boolean).join('\n\n'), notes: [base.notes, promptSeed].filter(Boolean).join('\n\n'), files: base.files ?? [] } }))
    dispatch({ type: 'reset' })
    setDirectionNote(`已选择“${direction.title}”作为第 ${index + 1} 个重做方向。请核对产品资料后手动提交；此操作尚未生成，也不会扣除次数。`)
    generationSequenceRef.current += 1
    setActiveGenerationId(null)
    attemptRef.current = null
  }, [setActiveGenerationId, state.phase])

  const visibleState = stateOwnerRef.current === authenticatedUserId ? state : initialCommerceRunState
  return { state: visibleState, busy: isCommerceRunBusy(visibleState.phase), submit, retry, recoverAuthentication, resetForMaterialChange, captureDraft, closeResult, selectHistoryResult, rerunDirection, historyRefreshKey, currentProjectId, liveGeneration, draftSeed, directionNote }
}
