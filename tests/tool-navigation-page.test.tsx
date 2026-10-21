import userEvent from '@testing-library/user-event'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ToolNavigationPage } from '../src/components/ToolNavigationPage'

afterEach(cleanup)

describe('ToolNavigationPage', () => {
  it('searches tool names and shows a recoverable empty state', async () => {
    const user = userEvent.setup()
    render(<ToolNavigationPage />)

    const search = screen.getByRole('searchbox', { name: '搜索工具' })
    await user.type(search, 'Photopea')
    expect(screen.getByRole('link', { name: /Photopea/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /GitHub/ })).not.toBeInTheDocument()
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('搜索“Photopea”')

    await user.clear(search)
    await user.click(screen.getByRole('button', { name: '跨境电商' }))
    await user.type(search, '不存在的工具')
    expect(screen.getByText(/没有找到/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(search).toHaveValue('')
    expect(screen.getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('link', { name: /Photopea/ })).toBeInTheDocument()
  })

  it('uses a pressed category button and secure external links', async () => {
    const user = userEvent.setup()
    render(<ToolNavigationPage />)

    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
      expect(link).toHaveAttribute('data-target-cursor')
      expect(link).toHaveAttribute('data-cursor-label', '打开工具')
    }

    const categoryButton = screen.getByRole('button', { name: '跨境电商' })
    await user.click(categoryButton)
    expect(categoryButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('link', { name: /Photopea/ })).not.toBeInTheDocument()

    const link = screen.getByRole('link', { name: /Ozon/ })
    expect(link).toHaveAttribute('href', 'https://seller.ozon.ru/')
    expect(screen.getByRole('link', { name: /Wildberries/ })).toBeInTheDocument()

    const section = screen.getByRole('region', { name: /跨境电商/ })
    expect(within(section).getByText('2 个工具')).toBeInTheDocument()
  })

  it('announces the selected category when equal-count categories change', async () => {
    const user = userEvent.setup()
    render(<ToolNavigationPage />)

    const status = document.querySelector('[aria-live="polite"]')
    expect(status).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'AI 创作' }))
    const firstAnnouncement = status?.textContent
    expect(firstAnnouncement).toContain('AI 创作')
    expect(firstAnnouncement).toContain('2 个工具')

    await user.click(screen.getByRole('button', { name: '跨境电商' }))
    expect(status).toHaveTextContent('跨境电商')
    expect(status).toHaveTextContent('2 个工具')
    expect(status?.textContent).not.toBe(firstAnnouncement)
  })
})
