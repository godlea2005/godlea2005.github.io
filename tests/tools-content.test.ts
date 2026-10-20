import { describe, expect, it } from 'vitest'
import { filterToolCategories, toolCategories } from '../src/content/tools'

describe('tool directory content', () => {
  it('keeps only matching tools while preserving category metadata', () => {
    const result = filterToolCategories(toolCategories, { query: '图片', category: 'all' })

    expect(result.flatMap((category) => category.tools).map((tool) => tool.name)).toContain('Photopea')
    expect(result.every((category) => category.tools.length > 0)).toBe(true)
    expect(result.find((category) => category.id === 'image-assets')).toMatchObject({
      number: '03',
      title: expect.any(String),
      description: expect.any(String),
    })
  })

  it('finds Ozon and its display category through the public matcher', () => {
    const result = filterToolCategories(toolCategories, { query: ' Ozon ', category: 'all' })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('cross-border')
    expect(result[0].title).toBe('跨境电商')
    expect(result[0].tools.map((tool) => tool.name)).toEqual(['Ozon'])
  })

  it('filters a named category and keeps official HTTPS destinations', () => {
    const result = filterToolCategories(toolCategories, { query: '', category: 'cross-border' })

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('cross-border')
    expect(result[0].tools.map((tool) => tool.name)).toEqual(['Ozon', 'Wildberries'])
  })

  it('keeps HTTPS destinations and personal notes for every curated tool', () => {
    const tools = toolCategories.flatMap((category) => category.tools)

    expect(tools.length).toBeGreaterThan(0)
    expect(tools.every((tool) => tool.href.startsWith('https://'))).toBe(true)
    expect(tools.every((tool) => tool.note.trim().length > 0)).toBe(true)
  })
})
