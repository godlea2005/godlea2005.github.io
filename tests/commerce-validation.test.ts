import { describe, expect, it } from 'vitest'
import { isCommerceResult, validateProductFile, validateProjectInput } from '../src/commerce/validation'

describe('commerce validation', () => {
  it('requires one to six images and a product name', () => {
    expect(validateProjectInput({ mode: 'quick', name: '', platform: 'ozon', files: [] }).ok).toBe(false)
  })

  it('rejects unsupported and oversized files', () => {
    expect(validateProductFile(new File(['x'], 'a.svg', { type: 'image/svg+xml' })).ok).toBe(false)
    const large = new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' })
    expect(validateProductFile(large).ok).toBe(false)
  })

  it('rejects incomplete AI results', () => {
    expect(isCommerceResult({ productSummary: '杯子' })).toBe(false)
  })
})
