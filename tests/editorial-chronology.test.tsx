import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

const { articles } = vi.hoisted(() => ({
  articles: [2, 6, 1, 7, 3, 5, 4].map((day) => ({
    slug: `note-${day}`, title: `Note ${day}`, date: `2026-10-0${day}`,
    tags: [day % 2 ? '设计实践' : '电商内容'], excerpt: 'An observation', readingMinutes: 3, featured: false,
  })),
}))
vi.mock('../src/editorial', () => ({ articleSummaries: articles }))
vi.mock('../src/editorial/index', () => ({ articleSummaries: articles }))
import { WritingPreview } from '../src/components/WritingPreview'
import { WritingIndexPage } from '../src/editorial/WritingIndexPage'

afterEach(cleanup)
const titles = (list: HTMLElement) => within(list).getAllByRole('link').map((link) => link.textContent)

it('sorts the complete index before filtering without mutating shared content', async () => {
  const original = articles.map((article) => article.slug)
  render(<WritingIndexPage />)
  const list = screen.getByRole('list', { name: '文章列表' })
  expect(titles(list)).toEqual([7, 6, 5, 4, 3, 2, 1].map((day) => `Note ${day}`))
  await userEvent.click(screen.getByRole('button', { name: '设计实践' }))
  expect(titles(list)).toEqual([7, 5, 3, 1].map((day) => `Note ${day}`))
  await userEvent.click(screen.getByRole('button', { name: '电商内容' }))
  expect(titles(list)).toEqual([6, 4, 2].map((day) => `Note ${day}`))
  expect(articles.map((article) => article.slug)).toEqual(original)
})

it('shows only the latest six from seven unsorted articles without mutating shared content', () => {
  const original = articles.map((article) => article.slug)
  render(<WritingPreview />)
  expect(titles(screen.getByRole('list'))).toEqual([7, 6, 5, 4, 3, 2].map((day) => `Note ${day}`))
  expect(screen.queryByRole('link', { name: 'Note 1' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: /查看全部文章/ })).toHaveAttribute('href', '#writing')
  expect(articles.map((article) => article.slug)).toEqual(original)
})
