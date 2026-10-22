import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { articleSummaries, projectSummaries } from '../src/editorial'
import { site } from '../src/content/site'
import { HomePage } from '../src/components/HomePage'

vi.mock('../src/components/GradientWaves/GradientWaves', () => ({
  default: () => <div data-testid="gradient-waves" />,
}))
vi.mock('../src/components/ParticleText/ParticleText', () => ({
  ParticleText: ({ text }: { text: string }) => <span>{text}</span>,
}))

afterEach(cleanup)

describe('WENHAO Field Notes homepage', () => {
  it('renders the approved landmark order with one about anchor and a separate footer', () => {
    const { container } = render(<HomePage theme="dark" />)
    const regions = screen.getAllByRole('region').map((region) => region.getAttribute('aria-labelledby'))

    expect(regions).toEqual([
      'home-title',
      'featured-title',
      'selected-work-title',
      'commerce-home-title',
      'visual-notes-title',
      'writing-preview-title',
      'about-title',
    ])
    expect(container.querySelectorAll('#about')).toHaveLength(1)
    expect(container.querySelector('footer#site-footer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /开始阅读/ })).toHaveAttribute('href', '#featured')
    expect(container.querySelector('section#featured')).toHaveAttribute('aria-labelledby', 'featured-title')
  })

  it('links three complete featured notes and all personal projects to real routes', () => {
    const { container } = render(<HomePage theme="light" />)
    const featured = container.querySelector('#featured') as HTMLElement
    const cards = featured.querySelectorAll('article')

    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveClass('featured-note-lead')
    for (const article of articleSummaries.filter((item) => item.featured)) {
      const card = within(featured).getByRole('link', { name: new RegExp(article.title) })
      expect(card).toHaveAttribute('href', `#article/${article.slug}`)
      expect(card).toHaveAttribute('data-target-cursor')
      expect(within(card).getByText(article.excerpt)).toBeInTheDocument()
      expect(within(card).getByText(`${article.readingMinutes} 分钟阅读`)).toBeInTheDocument()
      expect(within(card).getByText(article.tags[0])).toBeInTheDocument()
      expect(within(card).getByText(article.date, { selector: 'time' })).toHaveAttribute('datetime', article.date)
    }
    for (const project of projectSummaries) {
      expect(container.querySelector(`a[href="#project/${project.slug}"]`)).toBeInTheDocument()
    }
  })

  it('shows a compact commerce lab and a dated writing index without old demo copy', () => {
    const { container } = render(<HomePage theme="dark" />)
    const commerce = container.querySelector('.commerce-home') as HTMLElement
    const writing = container.querySelector('#writing-preview') as HTMLElement

    for (const verb of ['理解产品', '判断市场', '组织画面']) {
      expect(within(commerce).getByText(verb)).toBeInTheDocument()
    }
    for (const platform of ['Ozon', 'Wildberries', '抖音', '淘宝/天猫']) {
      expect(within(commerce).getByText(platform)).toBeInTheDocument()
    }
    expect(within(commerce).getAllByRole('link', { name: /进入 AI 电商实验室/ })).toHaveLength(1)
    expect(within(commerce).getByRole('link', { name: /进入 AI 电商实验室/ })).toHaveAttribute('href', '#ai-commerce')
    expect(within(commerce).queryByText('演示案例')).not.toBeInTheDocument()
    expect(within(commerce).queryByText('详情页分镜')).not.toBeInTheDocument()
    expect(within(commerce).queryByText('上传产品资料')).not.toBeInTheDocument()

    const recent = Array.from(writing.querySelectorAll('li[data-article-date]'))
    expect(recent).toHaveLength(3)
    const dates = recent.map((item) => item.getAttribute('data-article-date'))
    expect(dates).toEqual([...dates].sort().reverse())
    for (const article of articleSummaries) {
      expect(within(writing).getByRole('link', { name: article.title })).toHaveAttribute('href', `#article/${article.slug}`)
    }
    expect(within(writing).getByRole('link', { name: /查看全部文章/ })).toHaveAttribute('href', '#writing')
  })

  it('uses the supplied role, current status and real contact destinations', () => {
    const { container } = render(<HomePage theme="dark" />)
    const about = container.querySelector('#about') as HTMLElement

    expect(within(about).getByText(/AI 设计师/)).toBeInTheDocument()
    expect(within(about).getByText(/电商运营专员/)).toBeInTheDocument()
    expect(within(about).getByText(/前端开发设计师/)).toBeInTheDocument()
    expect(within(about).getByText(/整理一套用 AI 加速电商内容生产的轻量工作流/)).toBeInTheDocument()
    expect(within(about).getByRole('link', { name: /留言/ })).toHaveAttribute('href', '#guestbook')
    expect(within(about).getByRole('link', { name: site.contacts.email })).toHaveAttribute('href', `mailto:${site.contacts.email}`)
  })
})
