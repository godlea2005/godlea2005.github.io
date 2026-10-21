import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const gradientWavesSpy = vi.hoisted(() => vi.fn())

vi.mock('../src/components/GradientWaves/GradientWaves', () => ({
  default: (props: Record<string, unknown>) => {
    gradientWavesSpy(props)
    return <div data-testid="gradient-waves" />
  },
}))

vi.mock('../src/components/ParticleText/ParticleText', () => ({
  ParticleText: ({ text }: { text: string }) => <span data-testid="particle-text">{text}</span>,
}))

import { CommerceHomeSection } from '../src/components/CommerceHomeSection'
import { StatusScene } from '../src/components/StatusScene'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')
const defaultMatchMedia = window.matchMedia

afterEach(() => {
  cleanup()
  gradientWavesSpy.mockClear()
  window.matchMedia = defaultMatchMedia
})

describe('AI commerce homepage positioning', () => {
  it('uses the approved hero copy and routes both calls to action', () => {
    render(<StatusScene theme="dark" />)

    expect(screen.getByRole('heading', { level: 1, name: 'WENHAO 博客' })).toBeInTheDocument()
    expect(screen.getByLabelText('记录设计与技术的现场')).toBeInTheDocument()
    expect(screen.getByText(/AI 设计师/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '开始阅读' })).toHaveAttribute('href', '#featured')
    expect(screen.getByRole('link', { name: '查看作品' })).toHaveAttribute('href', '#work')
    expect(screen.getByText('WENHAO')).toBeInTheDocument()
    expect(screen.getByTestId('gradient-waves')).toBeInTheDocument()
  })

  it('makes the four markets, three-step workflow and demo result tangible', () => {
    render(<CommerceHomeSection />)

    for (const platform of ['Ozon', 'Wildberries', '抖音', '淘宝/天猫']) {
      expect(screen.getByText(platform)).toBeInTheDocument()
    }
    for (const step of ['上传产品资料', '选择市场平台', '获得主图与详情页方案']) {
      expect(screen.getByText(step)).toBeInTheDocument()
    }
    expect(screen.getByText('演示案例')).toBeInTheDocument()
    expect(screen.getByText('主图方向')).toBeInTheDocument()
    expect(screen.getByText('详情页分镜')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '作图提示词' })).toBeInTheDocument()
    expect(screen.getByText('快速出汽场景')).toBeInTheDocument()
    expect(screen.getByText('折叠收纳展示')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '进入 AI 电商工作台' })).toHaveAttribute('href', '#ai-commerce')

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

  it('keeps the approved homepage order, routes and decorative effects in source', () => {
    const app = readSource('src/App.tsx')
    const hero = app.indexOf('<StatusScene')
    const commerce = app.indexOf('<CommerceHomeSection')
    const cases = app.indexOf('<StudioMap')
    const archive = app.indexOf('<ProjectArchive')
    const notes = app.indexOf('notes-section')

    expect(hero).toBeGreaterThan(-1)
    expect(commerce).toBeGreaterThan(hero)
    expect(cases).toBeGreaterThan(commerce)
    expect(archive).toBeGreaterThan(cases)
    expect(notes).toBeGreaterThan(archive)
    expect(app).toContain("route.page === 'music'")
    expect(app).toContain("route.page === 'guestbook'")
    expect(app).toContain('<GlobalMusicDock')
    expect(app).toContain('useState<Theme>(() => getInitialTheme())')
    expect(app).toContain('useLayoutEffect(() => applyTheme(theme), [theme])')
    expect(app).toContain('<StatusScene theme={theme} />')

    const scene = readSource('src/components/StatusScene.tsx')
    expect(scene).toContain('GradientWaves')
    expect(scene).toContain('ParticleText')
    expect(scene).toContain('aria-hidden="true"')
    expect(scene).toContain('useMotionProfile')
    expect(scene).toContain('在商业与创作之间持续实践')

    const content = readSource('src/content/site.ts')
    const styles = readSource('src/styles.css')
    expect(content).not.toContain('export const notices')
    expect(styles).not.toMatch(/\.(?:notice-bar|notice-flow|scene-link|scene-roles|scene-greeting|moon|desk|person(?:-head|-body|-arm)?|screen)(?:[\s,{:.])/)
    expect(styles).not.toContain('@keyframes roll')
  })
})
