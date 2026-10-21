import { describe, expect, it } from 'vitest'
import { buildSiteSearchEntries, searchSite } from '../src/editorial/search'

describe('site search', () => {
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
