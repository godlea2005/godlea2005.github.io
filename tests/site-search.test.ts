import { describe, expect, it } from 'vitest'
import { buildSiteSearchEntries, searchSite } from '../src/editorial/search'
import { toolCategories, toolEntries } from '../src/content/tools'
import { toolSearchContent } from '../src/content/navigation'

describe('site search', () => {
  it('indexes all primary tools once, including optional-note tools and approved categories', () => {
    expect(toolSearchContent).toBe(toolCategories)
    const entries = buildSiteSearchEntries()
    const tools = entries.filter(({ type }) => type === 'tool')
    expect(tools).toHaveLength(68)
    expect(new Set(tools.map(({ id }) => id)).size).toBe(68)
    expect(tools.every(({ terms }) => terms.every((term) => typeof term === 'string'))).toBe(true)
    expect(searchSite(entries, 'ChatGPT').flatMap(({ items }) => items).filter(({ type }) => type === 'tool')).toHaveLength(1)
    const optionalNoteTool = toolEntries.find(({ note }) => note === undefined)!
    expect(tools.find(({ id }) => id === optionalNoteTool.id)?.terms).toContain('')
    expect(searchSite(entries, 'BOT 开源框架').flatMap(({ items }) => items).filter(({ type }) => type === 'tool')).toHaveLength(5)
  })
  it('groups editorial and tool matches without duplicate routes', () => {
    const result = searchSite(buildSiteSearchEntries(), '设计')
    const items = result.flatMap((group) => group.items)

    expect(items.some((item) => item.href === '#article/ai-speeds-up-judgment')).toBe(true)
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length)
  })

  it('keeps the operator console out of public search', () => {
    expect(buildSiteSearchEntries().some((item) => item.href === '#commerce-admin')).toBe(false)
    expect(buildSiteSearchEntries({ includeAdmin: true }).some((item) => item.href === '#commerce-admin')).toBe(true)
  })

  it('returns public page shortcuts for an empty query and no groups for a miss', () => {
    const entries = buildSiteSearchEntries()
    expect(searchSite(entries, '').flatMap((group) => group.items)).toHaveLength(8)
    expect(searchSite(entries, '完全不存在的关键词')).toEqual([])
  })
})
