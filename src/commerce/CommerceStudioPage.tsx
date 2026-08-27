import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { commerceRepository, type CommerceRepository } from './commerceRepository'
import { CommerceProjectForm, type CommerceFormStatus } from './CommerceProjectForm'
import type { AssetUploadProgress, CommerceGenerationStatus, CommerceProjectInput } from './types'
import './commerce.css'

type Attempt = {
  signature: string
  idempotencyKey: string
  input: CommerceProjectInput
  projectId?: string
  uploaded?: boolean
  generationId?: string
}

export type CommerceStudioPageProps = {
  repository?: CommerceRepository
  pollIntervalMs?: number
}

const terminalStatuses = new Set<CommerceGenerationStatus>(['completed', 'failed', 'cancelled'])
const makeIdempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
const formSignature = (input: CommerceProjectInput) => JSON.stringify({
  ...input,
  files: input.files.map((file) => ({ name: file.name, size: file.size, type: file.type, lastModified: file.lastModified })),
})
const messageForError = (error: unknown) => error instanceof Error ? error.message : '服务暂时不可用，请稍后重试。'

export function CommerceStudioPage({ repository = commerceRepository, pollIntervalMs = 2000 }: CommerceStudioPageProps) {
  const auth = useAuth()
  const [creditsLabel, setCreditsLabel] = useState('登录后查看')
  const [status, setStatus] = useState<CommerceFormStatus>('idle')
  const [progress, setProgress] = useState<AssetUploadProgress | null>(null)
  const [error, setError] = useState('')
  const [generationId, setGenerationId] = useState<string | null>(null)
  const attemptRef = useRef<Attempt | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    if (!auth.ready || !auth.user || auth.isAnonymous) {
      setCreditsLabel('登录后查看')
      return
    }
    let active = true
    void repository.getEntitlement()
      .then((entitlement) => {
        if (!active) return
        setCreditsLabel(entitlement.unlimited ? '不限次数' : `${entitlement.credits} 次`)
      })
      .catch(() => { if (active) setCreditsLabel('读取失败') })
    return () => { active = false }
  }, [auth.isAnonymous, auth.ready, auth.user, repository])

  useEffect(() => {
    if (!generationId || terminalStatuses.has(status as CommerceGenerationStatus)) return
    let polling = false
    const interval = window.setInterval(() => {
      if (polling) return
      polling = true
      void repository.getGeneration(generationId)
        .then((generation) => {
          if (!mountedRef.current) return
          setStatus(generation.status)
          if (terminalStatuses.has(generation.status)) {
            window.clearInterval(interval)
            if (generation.status === 'failed') {
              setError(generation.errorMessage || 'AI 服务未能完成分析，额度已按服务结果处理。请调整资料后再试。')
              if (attemptRef.current) {
                attemptRef.current = { ...attemptRef.current, idempotencyKey: makeIdempotencyKey(), generationId: undefined }
              }
            } else if (generation.status === 'cancelled') {
              setError('任务已取消，请调整资料后重新生成。')
              if (attemptRef.current) {
                attemptRef.current = { ...attemptRef.current, idempotencyKey: makeIdempotencyKey(), generationId: undefined }
              }
            } else {
              setError('')
              attemptRef.current = null
            }
          }
        })
        .catch((pollError) => {
          if (mountedRef.current) setError(`${messageForError(pollError)} 任务仍在后台，可继续等待。`)
        })
        .finally(() => { polling = false })
    }, pollIntervalMs)
    return () => window.clearInterval(interval)
  }, [generationId, pollIntervalMs, repository, status])

  const runAttempt = useCallback(async (input: CommerceProjectInput) => {
    if (!auth.requireLogin('#ai-commerce')) return

    const signature = formSignature(input)
    let attempt = attemptRef.current
    if (!attempt || attempt.signature !== signature) {
      attempt = { signature, idempotencyKey: makeIdempotencyKey(), input }
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
        await repository.uploadAssets(attempt.projectId, attempt.input.files, (nextProgress) => {
          if (mountedRef.current) setProgress(nextProgress)
        })
        attempt.uploaded = true
      }
      if (!attempt.generationId) {
        setStatus('starting')
        const started = await repository.startGeneration(attempt.projectId, attempt.idempotencyKey)
        attempt.generationId = started.generationId
        setGenerationId(started.generationId)
        setStatus(started.status)
      }
    } catch (attemptError) {
      if (!mountedRef.current) return
      setError(messageForError(attemptError))
      setStatus('failed')
    }
  }, [auth, repository])

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
      <CommerceProjectForm
        onSubmitted={runAttempt}
        busy={busy}
        status={status}
        progress={progress}
        error={error}
        creditsLabel={creditsLabel}
        onRetry={error && attemptRef.current ? retry : undefined}
        onMaterialChange={resetAttemptForMaterialChange}
      />
    </main>
  )
}
