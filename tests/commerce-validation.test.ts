import { describe, expect, it } from 'vitest'
import { isCommerceResult, validateProductFile, validateProjectInput } from '../src/commerce/validation'

describe('commerce validation', () => {
  const validFile = () => new File(['x'], 'a.png', { type: 'image/png' })

  it('requires one to six images and a product name', () => {
    expect(validateProjectInput({ mode: 'quick', name: '', platform: 'ozon', files: [] }).ok).toBe(false)
  })

  it('treats names made only of mixed whitespace as empty', () => {
    expect(
      validateProjectInput({
        mode: 'quick',
        name: ' \t\n\r\u00a0 ',
        platform: 'ozon',
        files: [validFile()],
      }).ok,
    ).toBe(false)
  })

  it('counts name length after removing all whitespace at the 80 character boundary', () => {
    const exactlyEighty = `${'a'.repeat(40)} ${'b'.repeat(40)}`
    const eightyOne = `${'a'.repeat(40)} ${'b'.repeat(41)}`

    expect(
      validateProjectInput({ mode: 'quick', name: exactlyEighty, platform: 'ozon', files: [validFile()] }).ok,
    ).toBe(true)
    expect(
      validateProjectInput({ mode: 'quick', name: eightyOne, platform: 'ozon', files: [validFile()] }).ok,
    ).toBe(false)
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
