import { describe, expect, it } from 'vitest'
import { CommerceRepositoryError } from '../src/commerce/commerceErrors'
import { assertCommerceRunTransition, commerceRunReducer, deriveRunPresentation, initialCommerceRunState, type CommerceRunPhase } from '../src/commerce/commerceRunMachine'

describe('commerce run presentation', () => {
  it('replaces submit and ready copy with retry after a recoverable failure', () => {
    const state = commerceRunReducer(initialCommerceRunState, { type: 'failed', error: new CommerceRepositoryError('NETWORK', '网络暂时不可用。'), recovery: 'retry' })
    expect(deriveRunPresentation(state, true)).toMatchObject({ primaryAction: 'retry', showReadyCopy: false, showSubmit: false })
  })
  it('makes account recovery the only action after authentication fails', () => {
    const state = commerceRunReducer(initialCommerceRunState, { type: 'failed', error: new CommerceRepositoryError('AUTH_REQUIRED', '请重新连接账号。'), recovery: 'reauthenticate' })
    expect(deriveRunPresentation(state, true)).toMatchObject({ primaryAction: 'reauthenticate', showReadyCopy: false, showSubmit: false })
  })
  it.each([
    ['validating-session', '正在确认登录状态'], ['creating-project', '正在建立项目'],
    ['uploading', '正在上传图片'], ['starting-generation', '正在启动分析'], ['generating', 'AI 正在生成方案'],
  ] as const)('has a non-clickable progress action during %s', (phase: CommerceRunPhase, primaryLabel) => {
    expect(deriveRunPresentation({ ...initialCommerceRunState, phase }, true)).toMatchObject({ primaryAction: 'progress', primaryLabel, disabled: true, showReadyCopy: false })
  })
  it('does not allow a late upload to overwrite a terminal error', () => {
    const state = commerceRunReducer(initialCommerceRunState, { type: 'failed', error: new CommerceRepositoryError('SERVICE_ERROR', '清理失败'), recovery: 'restart' })
    expect(commerceRunReducer(state, { type: 'upload-complete' })).toBe(state)
  })
  it('lets tests assert illegal stale transitions while production ignores them', () => {
    const state = { ...initialCommerceRunState, phase: 'uploading' as const }
    expect(commerceRunReducer(state, { type: 'stage', phase: 'creating-project' })).toBe(state)
    expect(() => assertCommerceRunTransition(state, { type: 'stage', phase: 'creating-project' })).toThrow('Illegal commerce run transition')
  })
  it('resets progress and failure metadata for a new run', () => {
    const failed = commerceRunReducer(initialCommerceRunState, { type: 'failed', error: new CommerceRepositoryError('NETWORK', '网络暂时不可用。'), recovery: 'retry' })
    const next = commerceRunReducer(failed, { type: 'begin' })
    expect(next).toMatchObject({ phase: 'validating-session', error: null, progress: null })
    expect(deriveRunPresentation(next, true).primaryAction).toBe('progress')
  })
  it('offers a real recovery action instead of a view action when completed data is unavailable', () => {
    const generating = { ...initialCommerceRunState, phase: 'generating' as const }
    const completed = commerceRunReducer(generating, {
      type: 'completed',
      result: null,
      unavailable: '返回的方案数据不可用。',
    })

    expect(deriveRunPresentation(completed, true)).toMatchObject({
      primaryAction: 'recover-result',
      primaryLabel: '返回修改资料',
      showReadyCopy: false,
      showSubmit: false,
    })
    expect(completed.resultNotice).toBe('方案暂时不可用')
    expect(completed.resultNotice).not.toBe('方案生成完成')
  })
})
