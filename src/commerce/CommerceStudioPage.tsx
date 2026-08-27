import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { commerceRepository, type CommerceRepository } from './commerceRepository'
import { CommerceProjectForm, type CommerceFormStatus } from './CommerceProjectForm'
import type { AssetUploadProgress, CommerceGeneration, CommerceGenerationStatus, CommerceProjectInput } from './types'
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
  const attemptRef = useRef<Attempt | null>(null)
  const mountedRef = useRef(true)
  const authenticated = auth.ready && Boolean(auth.user) && !auth.isAnonymous
  const authenticatedUserId = authenticated ? auth.user!.id : null

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refreshEntitlement = useCallback(async () => {
    if (!authenticatedUserId) {
      setCreditsLabel('登录后查看')
      return
    }
    try {
      const entitlement = await repository.getEntitlement()
      if (mountedRef.current) setCreditsLabel(entitlement.unlimited ? '不限次数' : `${entitlement.credits} 次`)
    } catch {
      if (mountedRef.current) setCreditsLabel('读取失败')
    }
  }, [authenticatedUserId, repository])

  useEffect(() => { void refreshEntitlement() }, [refreshEntitlement])

  const handleGenerationState = useCallback((generation: Pick<CommerceGeneration, 'status' | 'errorMessage'>) => {
    if (!mountedRef.current) return
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
    attemptRef.current = null
  }, [createIdempotencyKey, refreshEntitlement])

  useEffect(() => {
    if (!generationId || terminalStatuses.has(status as CommerceGenerationStatus)) return
    let polling = false
    const interval = window.setInterval(() => {
      if (polling) return
      polling = true
      void repository.getGeneration(generationId)
        .then((generation) => {
          if (!mountedRef.current) return
          handleGenerationState(generation)
          if (terminalStatuses.has(generation.status)) {
            window.clearInterval(interval)
          }
        })
        .catch((pollError) => {
          if (mountedRef.current) setError(`${messageForError(pollError)} 任务仍在后台，可继续等待。`)
        })
        .finally(() => { polling = false })
    }, pollIntervalMs)
    return () => window.clearInterval(interval)
  }, [generationId, handleGenerationState, pollIntervalMs, repository, status])

  const runAttempt = useCallback(async (input: CommerceProjectInput) => {
    if (!auth.requireLogin('#ai-commerce')) return

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
        attempt.projectId = project.id
      }
      if (!attempt.uploaded) {
        setStatus('uploading')
        try {
          await repository.uploadAssets(attempt.projectId, attempt.input.files, (nextProgress) => {
            if (mountedRef.current) setProgress(nextProgress)
          })
        } catch (uploadError) {
          if (!mountedRef.current) return
          const failedProjectId = attempt.projectId
          try {
            await repository.deleteProject(failedProjectId)
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
        attempt.generationId = started.generationId
        setGenerationId(started.generationId)
        handleGenerationState({ status: started.status, errorMessage: null })
        if (!terminalStatuses.has(started.status) || started.status === 'completed') void refreshEntitlement()
      }
    } catch (attemptError) {
      if (!mountedRef.current) return
      setError(messageForError(attemptError))
      setStatus('failed')
    }
  }, [auth, createIdempotencyKey, handleGenerationState, refreshEntitlement, repository])

  const retry = useCallback(() => {
    if (attemptRef.current) void runAttempt(attemptRef.current.input)
  }, [runAttempt])

  const busy = ['creating', 'uploading', 'starting', 'queued', 'processing'].includes(status)
  const resetAttemptForMaterialChange = useCallback(() => {
    if (busy) return
    attemptRef.current = null
    setGenerationId(null)
    setProgress(null)
    setError('')
    setStatus('idle')
  }, [busy])

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
      </section> : <CommerceProjectForm
        onSubmitted={runAttempt}
        busy={busy}
        status={status}
        progress={progress}
        error={error}
        creditsLabel={creditsLabel}
        onRetry={error && attemptRef.current && !attemptRef.current.retryBlocked ? retry : undefined}
        onMaterialChange={resetAttemptForMaterialChange}
      />}
    </main>
  )
}
