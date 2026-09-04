import { describe, expect, it } from 'vitest'
import { CommerceRepositoryError, mapCommerceError } from '../src/commerce/commerceErrors'

describe('commerce error taxonomy', () => {
  it('does not describe an origin rejection as an expired login', () => {
    const error = mapCommerceError({ status: 403, code: 'ORIGIN_FORBIDDEN', message: 'origin rejected' })

    expect(error).toMatchObject({ code: 'ORIGIN_FORBIDDEN' })
    expect(error.message).toContain('站点来源配置')
    expect(error.message).not.toContain('登录已失效')
  })

  it('maps a real 401 to an actionable authentication error', () => {
    expect(mapCommerceError({ status: 401, code: 'AUTH_REQUIRED' })).toMatchObject({
      code: 'AUTH_REQUIRED',
      message: '登录状态需要恢复，请重新连接账户后继续。',
    })
  })

  it('preserves known backend codes before considering the HTTP status', () => {
    expect(mapCommerceError({ status: 403, code: 'UPLOAD_INVALID' })).toMatchObject({
      code: 'UPLOAD_INVALID',
    })
  })

  it('keeps the original error as a non-rendered cause', () => {
    const source = { status: 429, code: 'RATE_LIMITED' }

    expect(new CommerceRepositoryError('RATE_LIMITED', '请求过于频繁。', source).cause).toBe(source)
  })
})
