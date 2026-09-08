import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { commerceRepository, type CommerceRepository } from './commerceRepository'
import { CommerceHistoryDrawer } from './CommerceHistoryDrawer'
import { CommerceProjectForm } from './CommerceProjectForm'
import { CommerceResult } from './CommerceResult'
import { CommerceStudioHeader } from './CommerceStudioHeader'
import { useCommerceRun } from './useCommerceRun'
import './commerce.css'

export type CommerceStudioPageProps = {
  repository?: CommerceRepository
  pollIntervalMs?: number
  createIdempotencyKey?: () => string
}

const makeIdempotencyKey = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export function CommerceStudioPage({ repository = commerceRepository, pollIntervalMs = 2000, createIdempotencyKey = makeIdempotencyKey }: CommerceStudioPageProps) {
  const auth = useAuth()
  const [creditsLabel, setCreditsLabel] = useState('登录后查看')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyCount, setHistoryCount] = useState<number | null>(null)
  const entitlementRequestRef = useRef(0)
  const mountedRef = useRef(true)
  const authenticated = auth.ready && Boolean(auth.user) && !auth.isAnonymous
  const authenticatedUserId = authenticated ? auth.user!.id : null
  const authenticatedUserIdRef = useRef<string | null>(authenticatedUserId)
  authenticatedUserIdRef.current = authenticatedUserId

  const refreshEntitlement = useCallback(async () => {
    const requestId = ++entitlementRequestRef.current
    const requestedUserId = authenticatedUserId
    if (!requestedUserId) {
      if (mountedRef.current && requestId === entitlementRequestRef.current) setCreditsLabel('登录后查看')
      return
    }
    try {
      const entitlement = await repository.getEntitlement()
      if (mountedRef.current && requestId === entitlementRequestRef.current && requestedUserId === authenticatedUserIdRef.current) setCreditsLabel(entitlement.unlimited ? '不限次数' : `${entitlement.credits} 次`)
    } catch {
      if (mountedRef.current && requestId === entitlementRequestRef.current && requestedUserId === authenticatedUserIdRef.current) setCreditsLabel('读取失败')
    }
  }, [authenticatedUserId, repository])

  useEffect(() => { entitlementRequestRef.current += 1; setHistoryOpen(false); setHistoryCount(null) }, [authenticatedUserId])
  useEffect(() => { void refreshEntitlement() }, [refreshEntitlement])
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

  const run = useCommerceRun({ repository, auth, authenticatedUserId, pollIntervalMs, createIdempotencyKey, onRefreshEntitlement: refreshEntitlement })
  const draft = run.draftSeed?.ownerId === authenticatedUserId ? run.draftSeed : null
  const directionNote = draft ? run.directionNote : ''

  return <main className="commerce-page" id="ai-commerce">
    <div className="commerce-page-grid" aria-hidden="true" />
    <CommerceStudioHeader creditsLabel={creditsLabel} authenticated={authenticated} accountLabel={auth.provider ?? undefined} historyCount={historyCount} onOpenHistory={() => setHistoryOpen(true)} />
    {!auth.ready ? <section className="commerce-auth-gate" aria-live="polite"><span>正在确认会话</span><h2>工作台准备中</h2><p>很快就好。</p></section>
      : !authenticated ? <section className="commerce-auth-gate" aria-labelledby="commerce-login-title"><span>个人 AI 电商工作区</span><h2 id="commerce-login-title">登录后，开始分析你的产品</h2><p>一次整理产品事实、市场语境与视觉方向，最终获得可直接用于创作的完整方案。</p><ul><li>3 套主图方向</li><li>8–12 屏详情分镜</li><li>可执行作图提示词</li></ul><button type="button" onClick={() => auth.requireLogin('#ai-commerce')}>登录进入工作台 <i aria-hidden="true">↗</i></button></section>
        : <div className="commerce-studio-stage"><div className="commerce-studio-primary">
          {run.state.result ? <><div className="commerce-result-status commerce-print-hidden" role="status"><span>{run.state.resultNotice}</span><button type="button" onClick={run.closeResult}>返回工作台</button></div><CommerceResult result={run.state.result} onRerunDirection={run.rerunDirection} rerunDisabled={run.busy} rerunDisabledReason="当前方案仍在生成，请等待任务完成" /></>
            : <>{run.state.resultUnavailable ? <div className="commerce-result-unavailable" role="alert"><strong>{run.state.resultNotice}</strong><span>{run.state.resultUnavailable}</span></div> : null}{directionNote ? <div className="commerce-direction-note" role="status">{directionNote}</div> : null}<CommerceProjectForm key={`commerce-form-${authenticatedUserId}-${draft?.key ?? 0}`} onSubmitted={run.submit} runState={run.state} busy={run.busy} creditsLabel={creditsLabel} onRetry={run.retry} onRecoverAuthentication={run.recoverAuthentication} onMaterialChange={run.resetForMaterialChange} onDraftChange={run.captureDraft} initialDraft={draft?.input} initialFileNotice={draft?.fileNotice} draftKey={draft?.key ?? 0} /></>}
        </div></div>}
    {authenticated && <CommerceHistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} repository={repository} onSelectResult={run.selectHistoryResult} refreshKey={run.historyRefreshKey} liveGeneration={run.liveGeneration} excludedProjectIds={run.currentProjectId ? new Set([run.currentProjectId]) : undefined} onCountChange={setHistoryCount} />}
  </main>
}
