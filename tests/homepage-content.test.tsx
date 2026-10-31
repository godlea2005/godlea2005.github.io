import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const gradientWavesSpy = vi.hoisted(() => vi.fn())
const particleTextSpy = vi.hoisted(() => vi.fn())

vi.mock('../src/components/GradientWaves/GradientWaves', () => ({
  default: (props: Record<string, unknown>) => {
    gradientWavesSpy(props)
    return <div data-testid="gradient-waves" />
  },
}))

vi.mock('../src/components/ParticleText/ParticleText', () => ({
  ParticleText: (props: { text: string; interaction?: string }) => {
    particleTextSpy(props)
    return <span data-testid="particle-text">{props.text}</span>
  },
}))

import { CommerceHomeSection } from '../src/components/CommerceHomeSection'
import { StatusScene } from '../src/components/StatusScene'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const defaultMatchMedia = window.matchMedia

afterEach(() => {
  cleanup()
  gradientWavesSpy.mockClear()
  particleTextSpy.mockClear()
  window.matchMedia = defaultMatchMedia
})

describe('AI commerce homepage positioning', () => {
  it.each([
    { fine: true, reduced: false, interaction: 'repel-and-burst' },
    { fine: false, reduced: false, interaction: 'tap-burst' },
    { fine: false, reduced: true, interaction: 'tap-burst' },
  ])('delegates title interaction and reduced-motion fallback for $fine/$reduced', ({ fine, reduced, interaction }) => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)' ? reduced : fine,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    })) as typeof window.matchMedia
    render(<StatusScene theme="dark" />)
    expect(screen.getByTestId('particle-text')).toBeInTheDocument()
    expect(particleTextSpy).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'WENHAO', interaction }))
  })

  it('uses the compact approved hero without legacy calls to action', () => {
    render(<StatusScene theme="dark" />)

    expect(screen.getByRole('heading', { level: 1, name: 'WENHAO' })).toBeInTheDocument()
    expect(screen.getByText('记录设计与技术的现场', { selector: '.text-type-accessible' })).toBeInTheDocument()
    expect(screen.getByText('AI 工程师')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '开始阅读' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '查看作品' })).not.toBeInTheDocument()
    expect(screen.getByText('WENHAO')).toBeInTheDocument()
    expect(screen.getByTestId('gradient-waves')).toBeInTheDocument()
  })

  it('keeps commerce as one compact laboratory entry', () => {
    render(<CommerceHomeSection />)

    for (const platform of ['Ozon', 'Wildberries', '抖音', '淘宝/天猫']) {
      expect(screen.getByText(platform)).toBeInTheDocument()
    }
    for (const verb of ['理解产品', '判断市场', '组织画面']) {
      expect(screen.getByText(verb)).toBeInTheDocument()
    }
    expect(screen.queryByText('演示案例')).not.toBeInTheDocument()
    expect(screen.queryByText('主图方向')).not.toBeInTheDocument()
    expect(screen.queryByText('详情页分镜')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '进入 AI 电商实验室' })).toHaveAttribute('href', '#ai-commerce')

    const demoSource = readSource('src/content/site.ts') + readSource('src/components/CommerceHomeSection.tsx')
    expect(demoSource).not.toMatch(/20\s*(?:秒|s)|双电压/i)
  })

  it('freezes waves, pointer parallax and animated grain for reduced-motion users', async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })

    render(<StatusScene theme="dark" />)

    await waitFor(() => expect(gradientWavesSpy).toHaveBeenLastCalledWith(expect.objectContaining({
      speed: 0,
      mouseInteraction: false,
      grain: false,
    })))
  })

  it('keeps subpage routes, theme ownership and hero effects in source', () => {
    const app = readSource('src/App.tsx')
    expect(app).toContain('<HomePage theme={theme} />')
    expect(app).toContain("route.page === 'music'")
    expect(app).toContain("route.page === 'guestbook'")
    expect(app).toContain('<GlobalMusicDock')
    expect(app).toContain('useThemePreference()')
    const themeHook = readSource('src/lib/useThemePreference.ts')
    expect(themeHook).toContain('applyTheme(theme, false)')
    expect(app).not.toContain('id="about"')

    const homepage = readSource('src/components/HomePage.tsx')
    expect(homepage).toContain('<StatusScene theme={theme} />')
    expect(homepage).toContain('<HomeGuide />')
    expect(homepage).toContain('<SiteFooter />')

    const scene = readSource('src/components/StatusScene.tsx')
    expect(scene).toContain('GradientWaves')
    expect(scene).toContain('ParticleText')
    expect(scene).toContain('aria-hidden="true"')
    expect(scene).toContain('useMotionProfile')
    expect(scene).toContain('在商业与创作之间持续实践')
    expect(scene).toContain('<TextType texts={heroStatements} loop />')

    const content = readSource('src/content/site.ts')
    const styles = readSource('src/styles.css')
    expect(content).not.toContain('export const notices')
    expect(styles).not.toMatch(/\.(?:notice-bar|notice-flow|scene-link|scene-roles|scene-greeting|moon|desk|person(?:-head|-body|-arm)?|screen)(?:[\s,{:.])/)
    expect(styles).not.toContain('@keyframes roll')
  })
})
