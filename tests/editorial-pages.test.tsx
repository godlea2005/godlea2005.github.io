import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { ArticlePage } from '../src/editorial/ArticlePage'
import { ProjectPage } from '../src/editorial/ProjectPage'
import { WorkIndexPage } from '../src/editorial/WorkIndexPage'
import { WritingIndexPage } from '../src/editorial/WritingIndexPage'
import { projectSummaries } from '../src/editorial/index'

describe('editorial pages', () => {
  afterEach(cleanup)

  it('filters the writing index and links to a real article route', async () => {
    render(<WritingIndexPage />)
    await userEvent.click(screen.getByRole('button', { name: '设计实践' }))
    expect(screen.getByRole('link', { name: /AI 不替代设计/ })).toHaveAttribute('href', '#article/ai-speeds-up-judgment')
    expect(screen.queryByRole('link', { name: /电商内容的关键/ })).not.toBeInTheDocument()
  })

  it('renders every article block variant and a recoverable missing state', () => {
    const view = render(<ArticlePage slug="ai-speeds-up-judgment" />)
    expect(screen.getByRole('heading', { level: 1, name: /AI 不替代设计/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '先定义问题' })).toBeInTheDocument()
    expect(screen.getAllByRole('list').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('blockquote')).toBeInTheDocument()
    expect(screen.getByText('2026-10-21')).toHaveAttribute('dateTime', '2026-10-21')

    view.rerender(<ArticlePage slug="missing" />)
    expect(screen.getByRole('heading', { name: '这篇文章还不存在' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回文章索引' })).toHaveAttribute('href', '#writing')
  })

  it('links every project card to its matching detail route', () => {
    render(<WorkIndexPage />)
    for (const project of projectSummaries) {
      expect(screen.getByRole('link', { name: new RegExp(project.title) })).toHaveAttribute('href', `#project/${project.slug}`)
    }
  })

  it('renders project cover, experiment disclosure and ordered detail sections', () => {
    render(<ProjectPage slug="content-growth-lab" />)
    expect(screen.getByRole('heading', { level: 1, name: '内容增长实验室' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /哑光黑桌面/ })).toBeInTheDocument()
    expect(screen.getByText('个人实验', { exact: true })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '挑战' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '过程' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '结果' })).toBeInTheDocument()
    expect(document.querySelectorAll('.project-body ol li')).toHaveLength(3)
  })

  it('shows a recoverable missing-project state', () => {
    render(<ProjectPage slug="missing" />)
    expect(screen.getByRole('heading', { name: '这个项目还不存在' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回作品索引' })).toHaveAttribute('href', '#work')
  })
})
