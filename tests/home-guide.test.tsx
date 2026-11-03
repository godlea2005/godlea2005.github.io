import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HomeGuide } from '../src/components/home-guide/HomeGuide'
import { articleSummaries } from '../src/editorial'
import { guideCategories, writingFilterHref } from '../src/components/home-guide/model'
import { parseSiteRoute } from '../src/lib/siteRoutes'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); window.location.hash = '' })
it('expands one guide at a time and closes the active guide', () => {
  render(<HomeGuide />)
  const stats = screen.getByRole('button', { name: '展开站点数据' })
  expect(stats).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(stats)
  expect(stats).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByText(`${articleSummaries.length} 篇`, { selector: 'dd' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '展开内容索引' }))
  expect(stats).toHaveAttribute('aria-expanded', 'false')
  const index = screen.getByRole('button', { name: '收起内容索引' })
  expect(index).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(index)
  expect(index).toHaveAttribute('aria-expanded', 'false')
})
it('derives all categories from actual articles and routes encoded filters', () => {
  expect(guideCategories.reduce((n, c) => n + c.articles.length, 0)).toBe(articleSummaries.length)
  const href = writingFilterHref('tag', 'AI 设计')
  expect(parseSiteRoute(href)).toEqual({ kind: 'static', page: 'writing' })
  expect(new URLSearchParams(href.split('?')[1]).get('tag')).toBe('AI 设计')
})
it('shows only verified contact routes and no fabricated visitor count', () => {
  render(<HomeGuide />)
  fireEvent.click(screen.getByRole('button', { name: '展开订阅与联系' }))
  expect(screen.getByRole('link', { name: /站内留言/ })).toHaveAttribute('href', '#guestbook')
  expect(screen.queryByText(/2\.7k|hello@wenhao/)).not.toBeInTheDocument()
})
it('cycles articles only while unpaused and cleans the timer on unmount', () => {
  vi.useFakeTimers()
  const view = render(<HomeGuide />)
  act(() => vi.advanceTimersByTime(4300))
  expect(view.container.querySelector('.guide-post-cover.is-front strong')?.textContent).toBe(articleSummaries[1].title)
  fireEvent.pointerEnter(view.container.querySelector('.guide-post-stage')!)
  act(() => vi.advanceTimersByTime(8600))
  expect(view.container.querySelector('.guide-post-cover.is-front strong')?.textContent).toBe(articleSummaries[1].title)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
it('opens contact on a direct about anchor and exposes genuine tag filters', () => {
  window.location.hash = '#about'
  render(<HomeGuide />)
  expect(screen.getByRole('button', { name: '收起订阅与联系' })).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(screen.getByRole('button', { name: '展开内容索引' }))
  expect(screen.getByRole('link', { name: /设计实践/ })).toHaveAttribute('href', writingFilterHref('category','设计实践'))
})
it('keeps carousel paused when hover leaves but keyboard focus remains', () => {
  vi.useFakeTimers()
  const view = render(<HomeGuide />)
  const stage = view.container.querySelector('.guide-post-stage')!
  fireEvent.pointerEnter(stage)
  fireEvent.focus(screen.getByRole('button',{name:'下一篇预览'}))
  fireEvent.pointerLeave(stage)
  act(() => vi.advanceTimersByTime(8600))
  expect(view.container.querySelector('.guide-post-cover.is-front strong')?.textContent).toBe(articleSummaries[0].title)
})
it('uses a static carousel for reduced motion while keeping manual controls', () => {
  vi.useFakeTimers()
  vi.spyOn(window,'matchMedia').mockImplementation(query => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList)
  const view = render(<HomeGuide />)
  act(() => vi.advanceTimersByTime(8600))
  expect(view.container.querySelector('.guide-post-cover.is-front strong')?.textContent).toBe(articleSummaries[0].title)
  fireEvent.click(screen.getByRole('button',{name:'下一篇预览'}))
  expect(view.container.querySelector('.guide-post-cover.is-front strong')?.textContent).toBe(articleSummaries[1].title)
  expect(view.container.querySelector('.guide-post-cover.is-leaving')).not.toBeInTheDocument()
})

it('keeps a painted article deck and links metric focus to its matching layer', () => {
  const view = render(<HomeGuide />)
  expect(view.container.querySelectorAll('.guide-post-cover')).toHaveLength(articleSummaries.length)
  expect(view.container.querySelectorAll('.guide-post-cover[hidden]')).toHaveLength(0)
  expect(view.container.querySelectorAll('.guide-post-cover.is-front')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '展开站点数据' }))
  fireEvent.focus(screen.getByRole('button', { name: /突出标签/ }))
  expect(view.container.querySelector('.archive-sheet[data-selected="true"]')).toHaveAttribute('data-layer', '2')
  expect(screen.getByRole('button', { name: /突出标签/ })).toHaveAttribute('aria-pressed', 'true')
})

it('switches exclusive index panels and keeps closed guide content inert', () => {
  const view = render(<HomeGuide />)
  expect(view.container.querySelector('#guide-panel-index')).toHaveAttribute('inert')
  fireEvent.click(screen.getByRole('button', { name: '展开内容索引' }))
  const category = screen.getByRole('button', { name: /分类索引/ })
  const tag = screen.getByRole('button', { name: /标签索引/ })
  expect(category).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(tag)
  expect(category).toHaveAttribute('aria-expanded', 'false')
  expect(tag).toHaveAttribute('aria-expanded', 'true')
  expect(screen.queryByRole('link', { name: /设计实践/ })).not.toBeInTheDocument()
})

it('clears an in-flight article departure when reduced motion is enabled', () => {
  let reduced = false
  const listeners = new Set<() => void>()
  vi.spyOn(window,'matchMedia').mockImplementation(query => ({ get matches() { return query === '(prefers-reduced-motion: reduce)' && reduced }, addEventListener: (_event: string, callback: () => void) => { if (query === '(prefers-reduced-motion: reduce)') listeners.add(callback) }, removeEventListener: (_event: string, callback: () => void) => listeners.delete(callback) }) as MediaQueryList)
  const view = render(<HomeGuide />)
  fireEvent.click(screen.getByRole('button', { name: '下一篇预览' }))
  expect(view.container.querySelector('.guide-post-cover.is-leaving')).toBeInTheDocument()
  act(() => { reduced = true; listeners.forEach(callback => callback()) })
  expect(view.container.querySelector('.guide-post-cover.is-leaving')).not.toBeInTheDocument()
  act(() => { reduced = false; listeners.forEach(callback => callback()) })
  expect(view.container.querySelector('.guide-post-cover.is-leaving')).not.toBeInTheDocument()
  view.unmount()
  expect(listeners.size).toBe(0)
})
