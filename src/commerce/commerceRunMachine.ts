import type { CommerceRepositoryError } from './commerceErrors'
import type { AssetUploadProgress, CommerceGeneration, CommerceResult } from './types'

export type CommerceRunPhase = 'editing' | 'validating-session' | 'creating-project' | 'uploading' | 'starting-generation' | 'generating' | 'recoverable-error' | 'auth-recovery' | 'terminal-error' | 'completed'
export type CommerceRunState = {
  phase: CommerceRunPhase
  progress: AssetUploadProgress | null
  error: CommerceRepositoryError | null
  result: CommerceResult | null
  resultNotice: string
  resultUnavailable: string
  generation: CommerceGeneration | null
  pollWarning: string
}
export const initialCommerceRunState: CommerceRunState = { phase: 'editing', progress: null, error: null, result: null, resultNotice: '', resultUnavailable: '', generation: null, pollWarning: '' }
const progressLabels = {
  'validating-session': '正在确认登录状态', 'creating-project': '正在建立项目',
  uploading: '正在上传图片', 'starting-generation': '正在启动分析', generating: 'AI 正在生成方案',
} as const
export const isCommerceRunBusy = (phase: CommerceRunPhase) => phase in progressLabels
export const commerceRunPhaseLabel = (phase: CommerceRunPhase): string => progressLabels[phase as keyof typeof progressLabels] ?? ({
  editing: '等待输入',
  'recoverable-error': '本次生成失败',
  'auth-recovery': '需要重新连接账号',
  'terminal-error': '本次生成已停止',
  completed: '方案生成完成',
} as Record<Exclude<CommerceRunPhase, keyof typeof progressLabels>, string>)[phase as Exclude<CommerceRunPhase, keyof typeof progressLabels>]

type PresentationFields = Pick<CommerceRunState, 'result' | 'resultNotice' | 'resultUnavailable' | 'pollWarning'>
export type CommerceRunEvent =
  | { type: 'begin' }
  | { type: 'stage'; phase: keyof typeof progressLabels }
  | { type: 'project-created' }
  | { type: 'upload-progress'; progress: AssetUploadProgress }
  | { type: 'upload-complete' }
  | { type: 'generation-started' }
  | { type: 'generation-update'; generation: CommerceGeneration }
  | { type: 'failed'; error: CommerceRepositoryError; recovery: 'retry' | 'reauthenticate' | 'restart' }
  | { type: 'completed'; result: CommerceResult | null; unavailable?: string; generation?: CommerceGeneration }
  | { type: 'presentation'; value: Partial<PresentationFields> }
  | { type: 'history-result-selected'; result: CommerceResult }
  | { type: 'reset' }

const legalStageTransitions: Partial<Record<CommerceRunPhase, ReadonlyArray<keyof typeof progressLabels>>> = {
  'validating-session': ['creating-project', 'uploading', 'starting-generation'],
  'creating-project': ['uploading'],
  uploading: ['starting-generation'],
}

export function commerceRunReducer(state: CommerceRunState, event: CommerceRunEvent): CommerceRunState {
  switch (event.type) {
    case 'begin': return isCommerceRunBusy(state.phase) ? state : { ...initialCommerceRunState, phase: 'validating-session' }
    case 'stage': return legalStageTransitions[state.phase]?.includes(event.phase) ? { ...state, phase: event.phase } : state
    case 'project-created': return state.phase === 'creating-project' ? { ...state, phase: 'uploading' } : state
    case 'upload-progress': return state.phase === 'uploading' ? { ...state, progress: event.progress } : state
    case 'upload-complete': return state.phase === 'uploading' ? { ...state, phase: 'starting-generation' } : state
    case 'generation-started': return state.phase === 'starting-generation' ? { ...state, phase: 'generating', pollWarning: '' } : state
    case 'generation-update': return state.phase === 'generating' ? { ...state, generation: event.generation, pollWarning: '' } : state
    // A failure is deliberately terminal for the current phase. Later async callbacks
    // therefore cannot turn an error screen back into an uploading/generating screen.
    case 'failed': return { ...state, phase: event.recovery === 'reauthenticate' ? 'auth-recovery' : event.recovery === 'retry' ? 'recoverable-error' : 'terminal-error', error: event.error, pollWarning: '' }
    case 'completed': return isCommerceRunBusy(state.phase) ? { ...state, phase: 'completed', error: null, result: event.result, resultNotice: '方案生成完成', resultUnavailable: event.unavailable ?? '', generation: event.generation ?? state.generation, pollWarning: '' } : state
    case 'history-result-selected': return { ...state, result: event.result, resultNotice: '已打开历史方案', resultUnavailable: '' }
    case 'presentation': return { ...state, ...event.value }
    case 'reset': return initialCommerceRunState
  }
}

/** Test helper: production ignores stale async events; tests can make them explicit. */
export function assertCommerceRunTransition(state: CommerceRunState, event: CommerceRunEvent) {
  const next = commerceRunReducer(state, event)
  if (next === state) throw new Error(`Illegal commerce run transition: ${state.phase} + ${event.type}`)
  return next
}

export function deriveRunPresentation(state: CommerceRunState, formValidity: boolean) {
  const progressLabel = progressLabels[state.phase as keyof typeof progressLabels]
  const action = progressLabel ? 'progress' : state.phase === 'recoverable-error' ? 'retry'
    : state.phase === 'auth-recovery' ? 'reauthenticate' : state.phase === 'terminal-error' ? 'restart'
      : state.phase === 'completed' ? 'view-result' : 'submit'
  const label = progressLabel ?? { retry: '重试本次生成', reauthenticate: '重新连接账号', restart: '新建一次分析', 'view-result': '查看方案', submit: '生成视觉方案' }[action as 'retry' | 'reauthenticate' | 'restart' | 'view-result' | 'submit']
  return { primaryAction: action, primaryLabel: label, disabled: Boolean(progressLabel) || (action === 'submit' && !formValidity), showReadyCopy: state.phase === 'editing' && formValidity, showSubmit: state.phase === 'editing' }
}
