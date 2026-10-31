import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { HomeGuide } from '../src/components/home-guide/HomeGuide'
import { articleSummaries } from '../src/editorial'
import { guideCategories, writingFilterHref } from '../src/components/home-guide/model'
import { parseSiteRoute } from '../src/lib/siteRoutes'

afterEach(() => { cleanup(); vi.useRealTimers(); window.location.hash = '' })
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
  expect(view.container.querySelector('.guide-post-cover:not([hidden]) strong')?.textContent).toBe(articleSummaries[1].title)
  fireEvent.pointerEnter(view.container.querySelector('.guide-post-stage')!)
  act(() => vi.advanceTimersByTime(8600))
  expect(view.container.querySelector('.guide-post-cover:not([hidden]) strong')?.textContent).toBe(articleSummaries[1].title)
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
