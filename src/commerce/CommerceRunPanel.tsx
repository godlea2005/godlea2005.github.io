import { deriveRunPresentation, commerceRunPhaseLabel, type CommerceRunState } from './commerceRunMachine'
import type { CommerceStep } from './CommerceStepRail'

type CommerceRunPanelProps = {
  step: CommerceStep
  productName: string
  platformName: string
  modeName: string
  imageCount: number
  creditsLabel: string
  state: CommerceRunState
  formValidity: boolean
  requirements: string[]
  onNext: () => void
  onRetry?: () => void
  onRecoverAuthentication?: () => void
  onRecovery: () => void
}

export function CommerceRunPanel({ step, productName, platformName, modeName, imageCount, creditsLabel, state, formValidity, requirements, onNext, onRetry, onRecoverAuthentication, onRecovery }: CommerceRunPanelProps) {
  const presentation = deriveRunPresentation(state, formValidity)
  const readyCopy = requirements.length === 0 ? '资料与授权已齐，可以提交分析。' : `提交前还需要：${requirements.join('、')}。`
  const error = state.error?.message ?? ''
  const action = presentation.primaryAction
  return <aside className="commerce-run-panel commerce-summary" aria-label="当前分析摘要">
    <div className="commerce-summary-status"><i data-status={state.phase} /><span>当前状态</span><strong>{commerceRunPhaseLabel(state.phase)}</strong></div>
    <dl>
      <div><dt>产品</dt><dd>{productName.trim() || '尚未命名'}</dd></div><div><dt>平台</dt><dd>{platformName}</dd></div><div><dt>模式</dt><dd>{modeName}</dd></div><div><dt>图片</dt><dd>{imageCount} / 6</dd></div><div><dt>剩余额度</dt><dd>{creditsLabel}</dd></div>
    </dl>
    <ul className="commerce-output-list" aria-label="本次输出"><li><i />3 套主图方向</li><li><i />8–12 屏详情分镜</li><li><i />可执行作图提示词</li></ul>
    {state.progress && <p className="commerce-progress" role="status">{state.progress.completedFiles} / {state.progress.totalFiles} 张 · {state.progress.currentFile.name} · {state.progress.currentFile.state === 'uploading' ? '正在上传' : state.progress.currentFile.state === 'ready' ? '上传完成' : '上传失败'}</p>}
    {state.pollWarning ? <p className="commerce-inline-notice" role="status">{state.pollWarning}</p> : null}
    {action === 'progress' ? <button className="commerce-submit" type="button" disabled><span>{presentation.primaryLabel}</span><i aria-hidden="true">•••</i></button>
      : action === 'retry' || action === 'reauthenticate' || action === 'restart' ? <div className="commerce-submit-error" role="alert"><strong>这一步没有完成</strong><p>{error}</p>{action === 'retry' ? <button type="button" onClick={onRetry}>重试本次生成</button> : action === 'reauthenticate' ? <button type="button" onClick={onRecoverAuthentication}>重新连接账号</button> : <button type="button" onClick={onRecovery}>返回修改资料</button>}</div>
        : action === 'view-result' ? <p className="commerce-complete-note" role="status">结果已安全写入，可进入方案页查看。</p>
          : <><p className="commerce-requirements" id="commerce-submit-requirements" role="status">{readyCopy}</p>{step < 3 ? <button className="commerce-submit" type="button" onClick={onNext}><span>下一步</span><i aria-hidden="true">→</i></button> : <button className="commerce-submit" type="submit" disabled={presentation.disabled} aria-describedby="commerce-submit-requirements commerce-submit-hint"><span>{presentation.primaryLabel}</span><i aria-hidden="true">↗</i></button>}<small id="commerce-submit-hint">确认提交后消耗 1 次；服务失败会自动退款。</small></>}
  </aside>
}
