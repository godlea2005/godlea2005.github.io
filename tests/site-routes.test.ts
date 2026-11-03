import { describe, expect, it } from 'vitest'
import { isRouteCurrent, isSiteSubpageRoute, parseSiteRoute } from '../src/lib/siteRoutes'

describe('site route parsing', () => {
  it.each([
    ['#writing', { kind: 'static', page: 'writing' }],
    ['#work', { kind: 'static', page: 'work' }],
    ['#music', { kind: 'static', page: 'music' }],
    ['#article/ai-speeds-up-judgment', { kind: 'article', slug: 'ai-speeds-up-judgment' }],
    ['#project/content-growth-lab', { kind: 'project', slug: 'content-growth-lab' }],
  ])('parses %s', (hash, expected) => {
    expect(parseSiteRoute(hash)).toEqual(expected)
  })

  it('keeps homepage anchors on the homepage', () => {
    expect(parseSiteRoute('#featured')).toEqual({ kind: 'home', anchor: 'featured' })
    expect(parseSiteRoute('')).toEqual({ kind: 'home', anchor: 'top' })
    expect(isSiteSubpageRoute(parseSiteRoute('#top'))).toBe(false)
  })

  it('groups detail routes under their parent destinations', () => {
    expect(isRouteCurrent(parseSiteRoute('#article/ai-speeds-up-judgment'), '#writing')).toBe(true)
    expect(isRouteCurrent(parseSiteRoute('#project/content-growth-lab'), '#work')).toBe(true)
    expect(isRouteCurrent(parseSiteRoute('#featured'), '#featured')).toBe(true)
    expect(isRouteCurrent(parseSiteRoute('#featured'), '#writing')).toBe(false)
  })

  it('requires exact valid detail route syntax', () => {
    for (const hash of ['#article/Bad', '#article/a/b', '#article/', '#project/slug/']) {
      expect(parseSiteRoute(hash)).toEqual({ kind: 'home', anchor: hash.slice(1) })
    }
  })
})
