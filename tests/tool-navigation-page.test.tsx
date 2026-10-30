import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolNavigationPage } from '../src/components/ToolNavigationPage'

afterEach(cleanup)

const categories = () => screen.getAllByRole('button', { name: /个工具/ })
const category = (title: string) => screen.getByRole('button', { name: new RegExp(title) })

describe('ToolNavigationPage', () => {
  it('defines compact density, accessible controls, responsive grids, and motion safety', () => {
    const css = readFileSync('src/components/tool-navigation.css', 'utf8')
    expect(css).not.toMatch(/min-height:\s*(?:292|322)px/)
    expect(css).toMatch(/\.tool-navigation-heading h1\s*\{[^}]*font-size:\s*clamp\(48px,\s*5vw,\s*64px\)/s)
    expect(css).toMatch(/\.tool-card-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s)
    expect(css).toMatch(/@media \(max-width:\s*1080px\)[\s\S]*repeat\(2,/s)
    expect(css).toMatch(/@media \(max-width:\s*640px\)[\s\S]*grid-template-columns:\s*1fr/s)
    expect(css).toMatch(/\.tool-card\s*\{[^}]*min-height:\s*148px/s)
    expect(css).toMatch(/\.tool-search-field\s*\{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/\.tool-directory-actions button\s*\{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/\.tool-category-accordion h2 button\s*\{[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/\.tool-category-panel\s*\{[^}]*grid-template-rows:\s*0fr/s)
    expect(css).toMatch(/\.tool-category-panel\[data-open="true"\]\s*\{[^}]*grid-template-rows:\s*1fr/s)
    expect(css).toMatch(/-webkit-line-clamp:\s*2/)
    expect(css).not.toMatch(/\.tool-card:hover\s*\{[^}]*scale\(/s)
    expect(css).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)/)
    expect(css).not.toMatch(/^\s*\.editorial-[^{]*\{/m)
  })

  it('shows compact metadata, unique counts, and a recoverable empty state', async () => {
    const user = userEvent.setup()
    render(<ToolNavigationPage />)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('main')).toHaveClass('editorial-page')
    expect(document.querySelector('.editorial-page-intro')).not.toBeNull()
    expect(screen.getByText('WENHAO / TOOL COLLECTION')).toBeVisible()
    expect(screen.getByText('把真正好用的工具，放在离想法更近的地方。')).toBeVisible()
    const hint = screen.getByText('已收录 68 个工具', { exact: false })
    expect(hint).toHaveTextContent('最近核对 2026-10-30')
    expect(hint.querySelector('time')).toHaveAttribute('datetime', '2026-10-30')
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('匹配 68 个工具 / 10 个分类')
    const search = screen.getByRole('searchbox', { name: '搜索工具' })
    await user.type(search, 'Photopea')
    expect(screen.getAllByRole('link', { name: /Photopea/ })).toHaveLength(2)
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('匹配 1 个工具 / 2 个分类')
    await user.clear(search)
    await user.type(search, '不存在的工具')
    expect(screen.getByText('没有找到匹配的工具')).toBeVisible()
    expect(hint).toBeVisible()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: '清除搜索' }))
    expect(search).toHaveValue('')
    expect(category('工具箱')).toHaveAttribute('aria-expanded', 'true')
  })

  it('starts with exactly two expanded sections and linked inert closed panels', async () => {
    const user = userEvent.setup()
    render(<ToolNavigationPage />)
    expect(categories()).toHaveLength(10)
    for (const button of categories()) {
      const open = /我的常用|工具箱/.test(button.textContent ?? '')
      expect(button).toHaveAttribute('aria-expanded', String(open))
      const panel = document.getElementById(button.getAttribute('aria-controls')!)
      expect(panel).not.toBeNull()
      expect(panel).toHaveAttribute('aria-hidden', String(!open))
      if (!open) expect(panel).toHaveAttribute('inert')
    }
    await user.click(category('AI 聊天网站'))
    expect(category('AI 聊天网站')).toHaveAttribute('aria-expanded', 'true')
    expect(category('工具箱')).toHaveAttribute('aria-expanded', 'true')
    await user.click(category('AI 聊天网站'))
    const panel = document.getElementById(category('AI 聊天网站').getAttribute('aria-controls')!)!
    expect(panel).toHaveAttribute('inert')
    for (const link of panel.querySelectorAll('a')) expect(link).toHaveAttribute('tabindex', '-1')
  })

  it('auto-expands matches and restores the exact pre-search set after query changes and bulk actions', async () => {
    const user = userEvent.setup()
    render(<ToolNavigationPage />)
    await user.click(category('我的常用'))
    await user.click(category('AI 聊天网站'))
    const search = screen.getByRole('searchbox', { name: '搜索工具' })
    await user.type(search, '图片')
    expect(categories().every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true)
    await user.click(screen.getByRole('button', { name: '全部收起' }))
    expect(search).toHaveValue('图片')
    expect(categories().every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true)
    await user.click(screen.getByRole('button', { name: '全部展开' }))
    expect(search).toHaveValue('图片')
    expect(categories().every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true)
    await user.type(search, 'Ollama')
    expect(screen.getByText('没有找到匹配的工具')).toBeVisible()
    await user.clear(search)
    for (const button of categories()) {
      expect(button).toHaveAttribute('aria-expanded', String(/工具箱|AI 聊天网站/.test(button.textContent ?? '')))
    }
    await user.type(search, 'Ollama')
    expect(category('AI 工具网站')).toHaveAttribute('aria-expanded', 'true')
    await user.clear(search)
    expect(category('AI 工具网站')).toHaveAttribute('aria-expanded', 'false')
    expect(category('AI 聊天网站')).toHaveAttribute('aria-expanded', 'true')
  })

  it('handles whitespace as a non-search and supports bulk actions at rest', async () => {
    const user = userEvent.setup()
    render(<ToolNavigationPage />)
    const search = screen.getByRole('searchbox', { name: '搜索工具' })
    await user.type(search, '  ')
    expect(category('AI 工具网站')).toHaveAttribute('aria-expanded', 'false')
    await user.click(screen.getByRole('button', { name: '全部展开' }))
    expect(categories().every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true)
    await user.type(search, 'Ollama')
    await user.clear(search)
    expect(categories().every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true)
    await user.click(screen.getByRole('button', { name: '全部收起' }))
    expect(categories().every((button) => button.getAttribute('aria-expanded') === 'false')).toBe(true)
  })

  it('renders secure compact cards without legacy decoration', async () => {
    const user = userEvent.setup()
    render(<ToolNavigationPage />)
    await user.click(screen.getByRole('button', { name: '全部展开' }))
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
      expect(link).toHaveAttribute('data-target-cursor')
    }
    expect(document.querySelector('.tool-category-rail, .tool-card-mark, .tool-card-tags, .tool-card-number, .tool-card-bottom')).toBeNull()
    expect(screen.queryByText('EXTERNAL LINK')).not.toBeInTheDocument()
  })
})
