import { cleanup, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

const contrastRatio = (foreground: string, background: string) => {
  const luminance = (hex: string) => {
    const [red, green, blue] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue
  }
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

const cssToken = (block: string, name: string) => {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Missing ${name} color token`)
  return match[1]
}

describe('WENHAO Field Notes homepage', () => {
  it('keeps light-theme homepage metadata and action text at readable contrast', () => {
    const globalCss = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')
    const homeCss = readFileSync(resolve(process.cwd(), 'src/components/home-sections.css'), 'utf8')
    const lightRoot = globalCss.match(/:root\[data-theme="light"\]\s*\{([^}]+)\}/)?.[1]
    const lightHome = homeCss.match(/:root\[data-theme="light"\] \.site-shell\.is-home\s*\{([^}]+)\}/)?.[1]
    if (!lightRoot || !lightHome) throw new Error('Missing light-theme tokens')

    const surfaces = ['bg', 'bg2', 'panel'].map((name) => cssToken(lightRoot, name))
    const soft = lightRoot.match(/--soft:rgba\((\d+),(\d+),(\d+),([\d.]+)\)/)
    if (!soft) throw new Error('Missing light-theme mist overlay')
    const mist = soft.slice(1, 4).map(Number)
    const opacity = Number(soft[4])
    const commerceBase = cssToken(lightRoot, 'bg2')
    const commerceSurface = `#${[1, 3, 5].map((offset, index) => {
      const base = parseInt(commerceBase.slice(offset, offset + 2), 16)
      return Math.round(base * (1 - opacity) + mist[index] * opacity).toString(16).padStart(2, '0')
    }).join('')}`
    surfaces.push(commerceSurface)
    for (const token of ['home-meta', 'home-meta-accent']) {
      for (const surface of surfaces) {
        expect(contrastRatio(cssToken(lightHome, token), surface)).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(contrastRatio(cssToken(lightHome, 'home-action-ink'), cssToken(lightHome, 'home-action-bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(cssToken(lightHome, 'home-action-ink'), cssToken(lightHome, 'home-action-hover-bg'))).toBeGreaterThanOrEqual(4.5)
    expect(homeCss).not.toMatch(/color:\s*var\(--quiet\)/)
    expect(homeCss).toMatch(/\.featured-note-topline\s*\{\s*color:\s*var\(--home-meta\)/)
    expect(homeCss).toMatch(/\.commerce-home-intro > a,\s*\.about-links a:first-child\s*\{[^}]*background:\s*var\(--home-action-bg\);\s*color:\s*var\(--home-action-ink\)/s)
  })

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
